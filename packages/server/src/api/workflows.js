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

function triggerSummary(owner, workflow) {
  if (!workflow || typeof workflow !== "object") return [];
  return (workflow.triggers ?? []).map((t) => {
    const type = t?.type ?? "unknown";
    const isHttp = String(type).toLowerCase() === "http";
    return {
      type,
      method: isHttp ? String(t?.method ?? "POST").toUpperCase() : t?.method ?? null,
      path: isHttp && t?.path != null ? namespacedPath(owner, t.path) : t?.path ?? null,
      schedule: t?.schedule ?? null,
      auth: isHttp ? authLabel(t?.auth) : null,
    };
  });
}

function scriptNames(workflow) {
  if (!workflow || typeof workflow !== "object") return [];
  const names = [];
  for (const raw of workflow.scripts ?? []) {
    try {
      const parsed = parseScriptStep(raw);
      names.push(parsed.kind === "set" ? `set:${parsed.as}` : parsed.script);
    } catch {
      names.push(null);
    }
  }
  return names;
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

    fastify.get("/workflows", async (req) => {
      const q = /** @type {{ owner?: string }} */ (req.query ?? {});
      const stats = await store.workflowStats();
      const owners = q.owner
        ? [fsStore.assertOwner(q.owner)]
        : fsStore.listOwners();

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
          const key = `${owner}/${file}`;
          const loaded = registry.workflows.get(key);
          const loadError = registry.loadErrors.get(key) ?? null;
          let parsed = loaded?.workflow ?? null;
          if (!parsed) {
            const raw = fsStore.readWorkflowYaml(owner, file);
            if (raw != null) {
              try {
                parsed = yaml.parse(raw);
              } catch (err) {
                // keep loadError
                if (!loadError) {
                  // file on disk but unparseable and not in registers
                }
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
            key,
            name: parsed?.name ?? file,
            description: parsed?.description ?? null,
            enabled: parsed ? parsed.enabled !== false : false,
            registered: registered.includes(file),
            loadError:
              loadError ??
              (parsed ? null : "unreadable"),
            lastInvokedAt: st.lastInvokedAt,
            lastStatus: st.lastStatus ?? null,
            invocationCount: st.invocationCount,
            triggers: triggerSummary(owner, parsed),
            scripts: scriptNames(parsed),
          });
        }
      }
      return { workflows: items };
    });

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
      const body = /** @type {{ content?: string }} */ (req.body ?? {});
      if (typeof body.content !== "string") {
        return reply.code(400).send({ error: "content is required" });
      }
      let parsed;
      try {
        parsed = yaml.parse(body.content);
      } catch (err) {
        return reply.code(400).send({
          error: `invalid yaml: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
      try {
        compileWorkflowScripts(parsed?.scripts);
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : String(err),
        });
      }
      try {
        await validateWorkflowHttpTriggers(parsed);
      } catch (err) {
        return reply.code(err.statusCode ?? 400).send({
          error: err instanceof Error ? err.message : String(err),
        });
      }
      const existed = fsStore.readWorkflowYaml(owner, file) != null;
      fsStore.writeWorkflowYaml(owner, file, body.content);
      const registered = fsStore.readRegisters(owner);
      if (!registered.includes(file)) {
        registered.push(file);
        fsStore.writeRegisters(owner, registered);
      }
      registry.reregister();
      return reply.code(existed ? 200 : 201).send({ owner, file });
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
      const doc = yaml.parseDocument(content);
      if (doc.errors?.length) {
        const msg = doc.errors[0]?.message ?? "invalid yaml";
        return reply.code(400).send({ error: msg });
      }
      const parsed = doc.toJSON();
      if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return reply.code(400).send({ error: "workflow yaml must be an object" });
      }
      if (body.enabled) {
        doc.delete("enabled");
      } else {
        doc.set("enabled", false);
      }
      fsStore.writeWorkflowYaml(owner, file, String(doc));
      registry.reregister();
      return { owner, file, enabled: body.enabled };
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
      if (!fsStore.deleteWorkflowYaml(owner, file)) {
        return reply.code(404).send({ error: "workflow not found" });
      }
      const registered = fsStore.readRegisters(owner).filter((f) => f !== file);
      fsStore.writeRegisters(owner, registered);
      registry.reregister();
      return { ok: true };
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
        registry.reregister();
      } else if (!registry.workflows.has(key) && !registry.loadErrors.has(key)) {
        registry.reregister();
      }
      if (!registry.workflows.has(key)) {
        return reply.code(404).send({
          error: registry.loadErrors.get(key) ?? "workflow not loaded",
        });
      }
      const body = /** @type {{ data?: unknown }} */ (req.body ?? {});
      const result = await registry.runWorkflow(
        key,
        { data: body.data ?? null },
        { type: "manual", detail: "ui" },
      );
      if (result.status === "failed") {
        return reply.code(result.runId ? 500 : 404).send({
          runId: result.runId,
          error: result.error,
        });
      }
      return {
        runId: result.runId,
        status: result.status,
        result: result.result,
      };
    });

    fastify.post("/workflows/reregister", async () => {
      registry.reregister();
      return { message: "Workflows refreshed" };
    });
  };
}
