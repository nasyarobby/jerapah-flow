import yaml from "yaml";
import * as store from "../../store.js";
import * as fsStore from "../../fs-store.js";
import {
  compileWorkflowScripts,
  namespacedPath,
  parseScriptStep,
} from "../../workflow-parse.js";
import {
  authLabel,
  validateWorkflowHttpTriggers,
} from "../../workflow-http-validate.js";
import { listHttpAuths } from "../../http-auths-store.js";
import { validateWorkflowFailureTriggers } from "../../trigger-failure.js";
import {
  duplicateWorkflowYaml,
  ensureWorkflowFilename,
  suggestDuplicateFilename,
} from "../../workflow-duplicate.js";
import { publishReload } from "../../control-bus.js";
import {
  workflowIdFromFile,
  newWorkflowFilename,
} from "../../workflow-normalize.js";
import {
  collectWorkflowWarnings,
  parseWorkflowDocument,
} from "../../workflow-validate-warnings.js";
import { getProfilePlain } from "../../profiles-store.js";
import { resolveScriptRef } from "../../plugin-store.js";
import {
  recordRevision,
  listRevisions,
  getRevision,
  ensureInitialRevision,
} from "../../workflow-history.js";
import {
  moveWorkflowToTrash,
  listTrash,
  restoreFromTrash,
  purgeTrashItem,
  isInTrash,
} from "../../workflow-trash.js";
import {
  createWorkflowBackupBuffer,
  restoreWorkflowBackup,
} from "../../workflow-backup.js";

/**
 * Reload this process and notify other HTTP/worker processes via Redis.
 * @param {{ reregister: () => void }} registry
 */
async function reregisterAll(registry) {
  registry.reregister();
  try {
    await publishReload({ type: "workflows" });
  } catch {
    // Redis may be briefly unavailable; local reload already applied.
  }
}

function triggerSummary(owner, workflow, nameById) {
  if (!workflow || typeof workflow !== "object") return [];
  return (workflow.triggers ?? []).map((t) => {
    const type = t?.type ?? "unknown";
    const isHttp = String(type).toLowerCase() === "http";
    return {
      type,
      method: isHttp ? String(t?.method ?? "POST").toUpperCase() : t?.method ?? null,
      path: isHttp && t?.path != null ? namespacedPath(owner, t.path) : t?.path ?? null,
      schedule: t?.schedule ?? null,
      onConsecutiveFailures: t?.onConsecutiveFailures ?? null,
      onFailureWorkflow: t?.onFailureWorkflow ?? null,
      auth: isHttp ? authLabel(t?.auth, nameById) : null,
    };
  });
}

function scriptNames(workflow) {
  if (!workflow || typeof workflow !== "object") return [];
  const names = [];
  for (const raw of workflow.scripts ?? []) {
    try {
      const parsed = parseScriptStep(raw);
      if (parsed.kind === "set") names.push("set");
      else if (parsed.profile) names.push(`profile:${parsed.profile}`);
      else names.push(parsed.script);
    } catch {
      names.push(null);
    }
  }
  return names;
}

/**
 * @param {unknown} parsed
 * @param {string} owner
 */
async function collectProfileWarnings(parsed, owner) {
  /** @type {Array<{ code: string, message: string, path?: string }>} */
  const warnings = [];
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !owner) {
    return warnings;
  }
  for (const [i, raw] of (parsed.scripts ?? []).entries()) {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) continue;
    const profileName = raw.profile;
    if (typeof profileName !== "string" || !profileName) continue;
    const pathKey = `scripts[${i}]`;
    let profile;
    try {
      profile = await getProfilePlain(owner, profileName);
    } catch {
      warnings.push({
        code: "unknown_profile",
        message: `Profile "${profileName}" is not a valid name`,
        path: pathKey,
      });
      continue;
    }
    if (!profile) {
      warnings.push({
        code: "unknown_profile",
        message: `Profile "${profileName}" not found`,
        path: pathKey,
      });
      continue;
    }
    if (typeof raw.script === "string" && raw.script && raw.script !== profile.script) {
      warnings.push({
        code: "profile_script_mismatch",
        message: `Step script "${raw.script}" does not match profile "${profileName}" (${profile.script})`,
        path: pathKey,
      });
    }
    const resolved = resolveScriptRef(profile.script);
    if (resolved.error) {
      warnings.push({
        code: "unknown_script",
        message: resolved.error,
        path: `${pathKey}.profile`,
      });
    }
  }
  return warnings;
}

/**
 * @param {unknown} parsed
 */
async function validateStrictWorkflow(parsed) {
  compileWorkflowScripts(parsed?.scripts);
  await validateWorkflowHttpTriggers(parsed);
  await validateWorkflowFailureTriggers(parsed);
}

/**
 * @param {{
 *   owner: string,
 *   file: string,
 *   content: string,
 *   saveAnyway?: boolean,
 *   reason?: string | null,
 *   meta?: Record<string, unknown> | null,
 *   forceRevision?: boolean,
 * }} opts
 */
async function saveWorkflowContent(opts) {
    const { warnings, parsed, parseError } = collectWorkflowWarnings(opts.content);
    if (parsed) {
      warnings.push(...(await collectProfileWarnings(parsed, opts.owner)));
    }
    const saveAnyway = Boolean(opts.saveAnyway);

  if (!saveAnyway) {
    if (parseError) {
      const err = new Error("workflow has validation warnings");
      err.statusCode = 422;
      err.warnings = warnings;
      throw err;
    }
    try {
      await validateStrictWorkflow(parsed);
    } catch (validationErr) {
      const err = new Error("workflow has validation warnings");
      err.statusCode = 422;
      err.warnings = [
        ...warnings,
        {
          code: "validation_error",
          message:
            validationErr instanceof Error
              ? validationErr.message
              : String(validationErr),
        },
      ];
      throw err;
    }
    if (warnings.length) {
      const err = new Error("workflow has validation warnings");
      err.statusCode = 422;
      err.warnings = warnings;
      throw err;
    }
  }

  const workflowId = workflowIdFromFile(opts.file);
  const existed = fsStore.readWorkflowYaml(opts.owner, opts.file) != null;
  fsStore.writeWorkflowYaml(opts.owner, opts.file, opts.content);

  const registered = fsStore.readRegisters(opts.owner);
  if (!registered.includes(opts.file)) {
    registered.push(opts.file);
    fsStore.writeRegisters(opts.owner, registered);
  }

  const revision = await recordRevision({
    workflowId,
    owner: opts.owner,
    file: opts.file,
    content: opts.content,
    reason: opts.reason ?? "save",
    meta: opts.meta ?? null,
    force: opts.forceRevision,
  });

  return {
    owner: opts.owner,
    file: opts.file,
    workflow_id: workflowId,
    existed,
    warnings,
    revision,
  };
}

/**
 * @param {{ workflows: Map<string, any>, loadErrors: Map<string, string>, reregister: () => void }} registry
 */
export default function workflowsPluginFactory(registry) {
  /**
   * @param {import("fastify").FastifyInstance} fastify
   */
  return async function workflowsPlugin(fastify) {
    fastify.get("/owners", async () => {
      return { owners: fsStore.listOwners() };
    });

    fastify.get("/workflows/trash", async () => {
      return { items: await listTrash() };
    });

    fastify.post("/workflows/trash/:id/restore", async (req, reply) => {
      const { id } = /** @type {{ id: string }} */ (req.params);
      try {
        const restored = await restoreFromTrash(id);
        await recordRevision({
          workflowId: restored.workflow_id,
          owner: restored.owner,
          file: restored.file,
          content: restored.content,
          reason: "restored-from-trash",
          force: true,
        });
        await reregisterAll(registry);
        return { owner: restored.owner, file: restored.file };
      } catch (err) {
        return reply.code(err.statusCode ?? 500).send({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    fastify.delete("/workflows/trash/:id", async (req, reply) => {
      const { id } = /** @type {{ id: string }} */ (req.params);
      try {
        return await purgeTrashItem(id);
      } catch (err) {
        return reply.code(err.statusCode ?? 500).send({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    fastify.get("/workflows/backup", async (_req, reply) => {
      const buffer = await createWorkflowBackupBuffer();
      const stamp = new Date().toISOString().slice(0, 10);
      return reply
        .header("Content-Type", "application/zip")
        .header(
          "Content-Disposition",
          `attachment; filename="jerapah-flow-backup-${stamp}.zip"`,
        )
        .send(buffer);
    });

    fastify.post("/workflows/backup/restore", async (req, reply) => {
      const body = /** @type {{ zipBase64?: string, mode?: string }} */ (
        req.body ?? {}
      );
      if (typeof body.zipBase64 !== "string" || !body.zipBase64.trim()) {
        return reply.code(400).send({ error: "zipBase64 is required" });
      }
      const mode = body.mode === "replace" ? "replace" : "merge";
      try {
        const buffer = Buffer.from(body.zipBase64, "base64");
        const result = await restoreWorkflowBackup(buffer, { mode });
        await reregisterAll(registry);
        return result;
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    fastify.get("/workflows", async (req) => {
      const q = /** @type {{ owner?: string }} */ (req.query ?? {});
      const stats = await store.workflowStats();
      const owners = q.owner
        ? [fsStore.assertOwner(q.owner)]
        : fsStore.listOwners();
      const authNameById = Object.fromEntries(
        (await listHttpAuths()).map((a) => [a.id, a.name]),
      );

      const items = [];
      for (const owner of owners) {
        let registered = [];
        try {
          registered = fsStore.readRegisters(owner);
        } catch {
          registered = [];
        }
        const onDisk = fsStore.listOwnerYamlFiles(owner);
        const files = [...new Set([...registered, ...onDisk])];

        for (const file of files) {
          if (await isInTrash(owner, file)) continue;
          const key = `${owner}/${file}`;
          const loaded = registry.workflows.get(key);
          const loadError = registry.loadErrors.get(key) ?? null;
          let parsed = loaded?.workflow ?? null;
          if (!parsed) {
            const raw = fsStore.readWorkflowYaml(owner, file);
            if (raw != null) {
              try {
                parsed = yaml.parse(raw);
              } catch {
                // keep loadError
              }
            }
          }
          const st = stats[key] ?? {
            invocationCount: 0,
            lastInvokedAt: null,
            lastStatus: null,
          };
          items.push({
            owner,
            file,
            workflow_id: workflowIdFromFile(file),
            key,
            name: parsed?.name ?? file,
            description: parsed?.description ?? null,
            enabled: parsed ? parsed.enabled !== false : false,
            registered: registered.includes(file),
            loadError: loadError ?? (parsed ? null : "unreadable"),
            lastModifiedAt: fsStore.workflowLastModifiedAt(owner, file),
            lastInvokedAt: st.lastInvokedAt,
            lastStatus: st.lastStatus ?? null,
            invocationCount: st.invocationCount,
            triggers: triggerSummary(owner, parsed, authNameById),
            scripts: scriptNames(parsed),
          });
        }
      }
      items.sort((a, b) => {
        const byName = String(a.name ?? "").localeCompare(String(b.name ?? ""), undefined, {
          sensitivity: "base",
        });
        if (byName !== 0) return byName;
        return String(a.key ?? "").localeCompare(String(b.key ?? ""));
      });
      return { workflows: items };
    });

    fastify.get("/workflows/:owner/:file/revisions", async (req, reply) => {
      const { owner, file } = /** @type {{ owner: string, file: string }} */ (
        req.params
      );
      try {
        fsStore.assertOwner(owner);
        fsStore.assertWorkflowFile(file);
      } catch (err) {
        return reply.code(err.statusCode ?? 400).send({ error: err.message });
      }
      if (fsStore.readWorkflowYaml(owner, file) == null) {
        return reply.code(404).send({ error: "workflow not found" });
      }
      await ensureInitialRevision({ owner, file });
      const workflowId = workflowIdFromFile(file);
      return { workflow_id: workflowId, revisions: await listRevisions(workflowId) };
    });

    fastify.get(
      "/workflows/:owner/:file/revisions/:revision",
      async (req, reply) => {
        const { owner, file, revision } = /** @type {{ owner: string, file: string, revision: string }} */ (
          req.params
        );
        try {
          fsStore.assertOwner(owner);
          fsStore.assertWorkflowFile(file);
        } catch (err) {
          return reply.code(err.statusCode ?? 400).send({ error: err.message });
        }
        const workflowId = workflowIdFromFile(file);
        const rev = await getRevision(workflowId, Number(revision));
        if (!rev) {
          return reply.code(404).send({ error: "revision not found" });
        }
        return {
          workflow_id: workflowId,
          revision: rev.revision,
          content: rev.content,
          reason: rev.reason,
          meta: rev.meta,
          created_at: rev.created_at,
        };
      },
    );

    fastify.post(
      "/workflows/:owner/:file/revisions/:revision/revert",
      async (req, reply) => {
        const { owner, file, revision } = /** @type {{ owner: string, file: string, revision: string }} */ (
          req.params
        );
        try {
          fsStore.assertOwner(owner);
          fsStore.assertWorkflowFile(file);
        } catch (err) {
          return reply.code(err.statusCode ?? 400).send({ error: err.message });
        }
        if (fsStore.readWorkflowYaml(owner, file) == null) {
          return reply.code(404).send({ error: "workflow not found" });
        }
        const workflowId = workflowIdFromFile(file);
        const rev = await getRevision(workflowId, Number(revision));
        if (!rev) {
          return reply.code(404).send({ error: "revision not found" });
        }
        const body = /** @type {{ saveAnyway?: boolean }} */ (req.body ?? {});
        try {
          const saved = await saveWorkflowContent({
            owner,
            file,
            content: rev.content,
            saveAnyway: body.saveAnyway,
            reason: "revert",
            meta: { fromRevision: rev.revision },
          });
          await reregisterAll(registry);
          return saved;
        } catch (err) {
          if (err.statusCode === 422) {
            return reply.code(422).send({
              error: err.message,
              warnings: err.warnings ?? [],
            });
          }
          return reply.code(err.statusCode ?? 500).send({
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },
    );

    fastify.get("/workflows/:owner/:file", async (req, reply) => {
      const { owner, file } = /** @type {{ owner: string, file: string }} */ (
        req.params
      );
      try {
        fsStore.assertOwner(owner);
        fsStore.assertWorkflowFile(file);
      } catch (err) {
        return reply.code(err.statusCode ?? 400).send({ error: err.message });
      }
      const content = fsStore.readWorkflowYaml(owner, file);
      if (content == null) {
        return reply.code(404).send({ error: "workflow not found" });
      }
      const key = `${owner}/${file}`;
      let parsed = null;
      let parseError = null;
      try {
        parsed = yaml.parse(content);
      } catch (err) {
        parseError = err instanceof Error ? err.message : String(err);
      }
      const stats = (await store.workflowStats())[key] ?? {
        invocationCount: 0,
        lastInvokedAt: null,
        lastStatus: null,
      };
      return {
        owner,
        file,
        workflow_id: workflowIdFromFile(file),
        key,
        content,
        parsed,
        parseError,
        loadError: registry.loadErrors.get(key) ?? parseError,
        lastInvokedAt: stats.lastInvokedAt,
        lastStatus: stats.lastStatus ?? null,
        invocationCount: stats.invocationCount,
      };
    });

    fastify.put("/workflows/:owner/:file", async (req, reply) => {
      const { owner, file } = /** @type {{ owner: string, file: string }} */ (
        req.params
      );
      try {
        fsStore.assertOwner(owner);
        fsStore.assertWorkflowFile(file);
      } catch (err) {
        return reply.code(err.statusCode ?? 400).send({ error: err.message });
      }
      const body = /** @type {{ content?: string, saveAnyway?: boolean }} */ (
        req.body ?? {}
      );
      if (typeof body.content !== "string") {
        return reply.code(400).send({ error: "content is required" });
      }
      try {
        const saved = await saveWorkflowContent({
          owner,
          file,
          content: body.content,
          saveAnyway: body.saveAnyway,
          reason: "save",
        });
        await reregisterAll(registry);
        return reply.code(saved.existed ? 200 : 201).send({
          owner: saved.owner,
          file: saved.file,
          workflow_id: saved.workflow_id,
          warnings: saved.warnings,
          revision: saved.revision,
        });
      } catch (err) {
        if (err.statusCode === 422) {
          return reply.code(422).send({
            error: err.message,
            warnings: err.warnings ?? [],
          });
        }
        return reply.code(err.statusCode ?? 500).send({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    fastify.post("/workflows/:owner", async (req, reply) => {
      const { owner } = /** @type {{ owner: string }} */ (req.params);
      try {
        fsStore.assertOwner(owner);
      } catch (err) {
        return reply.code(err.statusCode ?? 400).send({ error: err.message });
      }
      const body = /** @type {{ content?: string, file?: string, saveAnyway?: boolean }} */ (
        req.body ?? {}
      );
      if (typeof body.content !== "string") {
        return reply.code(400).send({ error: "content is required" });
      }
      let file = body.file?.trim() ? ensureWorkflowFilename(body.file) : "";
      if (!file) {
        const existing = fsStore.listOwnerYamlFiles(owner);
        file = suggestDuplicateFilename(existing);
      }
      try {
        fsStore.assertWorkflowFile(file);
      } catch (err) {
        return reply.code(err.statusCode ?? 400).send({ error: err.message });
      }
      if (fsStore.readWorkflowYaml(owner, file) != null) {
        return reply.code(409).send({ error: "workflow already exists" });
      }
      try {
        const saved = await saveWorkflowContent({
          owner,
          file,
          content: body.content,
          saveAnyway: body.saveAnyway,
          reason: "create",
          forceRevision: true,
        });
        await reregisterAll(registry);
        return reply.code(201).send({
          owner: saved.owner,
          file: saved.file,
          workflow_id: saved.workflow_id,
          warnings: saved.warnings,
          revision: saved.revision,
        });
      } catch (err) {
        if (err.statusCode === 422) {
          return reply.code(422).send({
            error: err.message,
            warnings: err.warnings ?? [],
          });
        }
        return reply.code(err.statusCode ?? 500).send({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    fastify.patch("/workflows/:owner/:file", async (req, reply) => {
      const { owner, file } = /** @type {{ owner: string, file: string }} */ (
        req.params
      );
      try {
        fsStore.assertOwner(owner);
        fsStore.assertWorkflowFile(file);
      } catch (err) {
        return reply.code(err.statusCode ?? 400).send({ error: err.message });
      }
      const body = /** @type {{ enabled?: unknown }} */ (req.body ?? {});
      if (typeof body.enabled !== "boolean") {
        return reply.code(400).send({ error: "enabled boolean is required" });
      }
      const content = fsStore.readWorkflowYaml(owner, file);
      if (content == null) {
        return reply.code(404).send({ error: "workflow not found" });
      }
      let doc;
      try {
        ({ doc } = parseWorkflowDocument(content));
      } catch (err) {
        return reply.code(err.statusCode ?? 400).send({
          error: err instanceof Error ? err.message : String(err),
        });
      }
      if (body.enabled) {
        doc.delete("enabled");
      } else {
        doc.set("enabled", false);
      }
      const nextContent = String(doc);
      try {
        const saved = await saveWorkflowContent({
          owner,
          file,
          content: nextContent,
          reason: body.enabled ? "enable" : "disable",
        });
        await reregisterAll(registry);
        return {
          owner,
          file,
          enabled: body.enabled,
          revision: saved.revision,
        };
      } catch (err) {
        return reply.code(err.statusCode ?? 500).send({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    fastify.delete("/workflows/:owner/:file", async (req, reply) => {
      const { owner, file } = /** @type {{ owner: string, file: string }} */ (
        req.params
      );
      try {
        fsStore.assertOwner(owner);
        fsStore.assertWorkflowFile(file);
      } catch (err) {
        return reply.code(err.statusCode ?? 400).send({ error: err.message });
      }
      const raw = fsStore.readWorkflowYaml(owner, file);
      if (raw == null) {
        return reply.code(404).send({ error: "workflow not found" });
      }
      let name = null;
      try {
        const parsed = yaml.parse(raw);
        name = parsed?.name ?? null;
      } catch {
        // ignore
      }
      try {
        const item = await moveWorkflowToTrash({
          workflowId: workflowIdFromFile(file),
          owner,
          file,
          name,
        });
        await reregisterAll(registry);
        return { ok: true, trash: item };
      } catch (err) {
        return reply.code(err.statusCode ?? 500).send({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    fastify.post("/workflows/:owner/:file/duplicate", async (req, reply) => {
      const { owner, file } = /** @type {{ owner: string, file: string }} */ (
        req.params
      );
      try {
        fsStore.assertOwner(owner);
        fsStore.assertWorkflowFile(file);
      } catch (err) {
        return reply.code(err.statusCode ?? 400).send({ error: err.message });
      }
      const source = fsStore.readWorkflowYaml(owner, file);
      if (source == null) {
        return reply.code(404).send({ error: "workflow not found" });
      }

      const body = /** @type {{ file?: unknown, owner?: unknown, saveAnyway?: boolean }} */ (
        req.body ?? {}
      );
      let destOwner = owner;
      if (body.owner != null && body.owner !== "") {
        if (typeof body.owner !== "string") {
          return reply.code(400).send({ error: "owner must be a string" });
        }
        try {
          destOwner = fsStore.assertOwner(body.owner);
        } catch (err) {
          return reply.code(err.statusCode ?? 400).send({ error: err.message });
        }
      }

      let destFile;
      try {
        if (body.file == null || body.file === "") {
          destFile = suggestDuplicateFilename(
            fsStore.listOwnerYamlFiles(destOwner),
          );
        } else if (typeof body.file !== "string") {
          return reply.code(400).send({ error: "file must be a string" });
        } else {
          destFile = ensureWorkflowFilename(body.file);
        }
        fsStore.assertWorkflowFile(destFile);
      } catch (err) {
        return reply.code(err.statusCode ?? 400).send({ error: err.message });
      }

      if (destOwner === owner && destFile === file) {
        return reply.code(400).send({ error: "cannot duplicate onto itself" });
      }
      if (fsStore.readWorkflowYaml(destOwner, destFile) != null) {
        return reply.code(409).send({ error: "workflow already exists" });
      }

      let content;
      try {
        content = duplicateWorkflowYaml(source, {
          sourceFile: file,
          destFile,
          rewriteHttpPaths: destOwner === owner,
        });
      } catch (err) {
        return reply.code(err.statusCode ?? 400).send({
          error: err instanceof Error ? err.message : String(err),
        });
      }

      try {
        const saved = await saveWorkflowContent({
          owner: destOwner,
          file: destFile,
          content,
          saveAnyway: body.saveAnyway,
          reason: "duplicated",
          meta: { from: `${owner}/${file}` },
          forceRevision: true,
        });
        await reregisterAll(registry);
        return reply.code(201).send({
          owner: destOwner,
          file: destFile,
          workflow_id: saved.workflow_id,
          revision: saved.revision,
        });
      } catch (err) {
        if (err.statusCode === 422) {
          return reply.code(422).send({
            error: err.message,
            warnings: err.warnings ?? [],
          });
        }
        return reply.code(err.statusCode ?? 500).send({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    fastify.post("/workflows/:owner/:file/run", async (req, reply) => {
      const { owner, file } = /** @type {{ owner: string, file: string }} */ (
        req.params
      );
      try {
        fsStore.assertOwner(owner);
        fsStore.assertWorkflowFile(file);
      } catch (err) {
        return reply.code(err.statusCode ?? 400).send({ error: err.message });
      }
      const key = `${owner}/${file}`;
      if (fsStore.readWorkflowYaml(owner, file) == null) {
        return reply.code(404).send({ error: "workflow not found" });
      }
      const registered = fsStore.readRegisters(owner);
      if (!registered.includes(file)) {
        registered.push(file);
        fsStore.writeRegisters(owner, registered);
        await reregisterAll(registry);
      } else if (!registry.workflows.has(key) && !registry.loadErrors.has(key)) {
        await reregisterAll(registry);
      }
      if (!registry.workflows.has(key)) {
        return reply.code(404).send({
          error: registry.loadErrors.get(key) ?? "workflow not loaded",
        });
      }
      const body = /** @type {{ data?: unknown }} */ (req.body ?? {});
      const result = await registry.enqueueWorkflow(
        key,
        { data: body.data ?? null },
        { type: "manual", detail: "ui" },
      );
      if (result.status === "failed") {
        return reply.code(result.runId ? 500 : 404).send({
          runId: result.runId,
          status: result.status,
          error: result.error,
        });
      }
      return reply.code(202).send({
        runId: result.runId,
        status: result.status,
        jobId: result.jobId ?? null,
      });
    });

    fastify.post("/workflows/reregister", async () => {
      await reregisterAll(registry);
      return { message: "Workflows refreshed" };
    });
  };
}

export { newWorkflowFilename };
