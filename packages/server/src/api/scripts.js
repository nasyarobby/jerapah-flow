import fs from "fs";
import path from "path";
import {
  clearScriptCache,
  inspectScriptSource,
  instantiateScriptSource,
} from "../../script-sandbox.js";
import * as fsStore from "../../fs-store.js";
import {
  forkCoreScript,
  listCoreScriptNames,
  listInstalledPlugins,
  resolveScriptRef,
  uninstallPlugin,
  createBlankPlugin,
  installPluginFromDirectory,
} from "../../plugin-store.js";
import {
  installExamplePlugin,
  installPluginFromGit,
  installPluginFromZipBuffer,
} from "../../plugin-install.js";
import { createDryRunLogger, safeSerialize } from "./dry-run-logger.js";
import {
  encodeBinaryForWire,
  reviveBinaryFromWire,
} from "../../json-preview.js";
import { normalizeStepResult } from "../../step-result.js";
import { resolveConfigRefs } from "../../config-refs.js";
import { getAppVersion } from "../../app-version.js";
import { EXAMPLE_PLUGINS_DIR } from "../../paths.js";
import { pluginScriptRef } from "../../plugin-manifest.js";
import { evaluateJsonata, SET_STEP_SCRIPT } from "../../workflow-parse.js";
import { DEFAULT_OWNER } from "@jerapah-flow/shared";

/**
 * @param {{ referencedScripts: () => Set<string> }} registry
 */
export default function scriptsPluginFactory(registry) {
  /**
   * @param {import("fastify").FastifyInstance} fastify
   */
  return async function scriptsPlugin(fastify) {
    fastify.get("/scripts", async () => {
      const core = listCoreScriptNames().map((name) => {
        const content = fsStore.readScript(name);
        const inspected =
          content == null
            ? { meta: null, metaError: "script not found" }
            : inspectScriptSource(name, content);
        return {
          name,
          kind: "core",
          editable: false,
          hasIcon: fsStore.scriptHasIcon(name),
          ...inspected,
        };
      });

      const plugins = listInstalledPlugins().map((p) => {
        let inspected = { meta: null, metaError: null };
        if (!p.disabled && p.manifest) {
          try {
            const mainPath = path.join(p.dir, p.manifest.main);
            const content = fs.readFileSync(mainPath, "utf8");
            inspected = inspectScriptSource(p.scriptRef, content);
          } catch (err) {
            inspected = {
              meta: null,
              metaError: err instanceof Error ? err.message : String(err),
            };
          }
        } else if (p.compatError) {
          inspected = { meta: null, metaError: p.compatError };
        }
        return {
          name: p.scriptRef,
          kind: "plugin",
          editable: true,
          pluginId: p.id,
          disabled: p.disabled,
          version: p.manifest?.version ?? null,
          hasIcon: false,
          ...inspected,
        };
      });

      return {
        scripts: [...core, ...plugins],
        appVersion: getAppVersion(),
      };
    });

    fastify.get("/scripts/:name/icon", async (req, reply) => {
      const { name } = /** @type {{ name: string }} */ (req.params);
      // Icons only for core scripts today
      try {
        fsStore.assertScriptName(name);
      } catch (err) {
        return reply.code(err.statusCode ?? 400).send({ error: err.message });
      }
      const icon = fsStore.resolveScriptIcon(name);
      if (icon == null) return reply.code(404).send({ error: "icon not found" });
      const body = fs.readFileSync(icon.filePath);
      return reply
        .type(icon.contentType)
        .header("Cache-Control", "private, max-age=60")
        .send(body);
    });

    fastify.get("/scripts/:name", async (req, reply) => {
      const rawName = decodeURIComponent(
        /** @type {{ name: string }} */ (req.params).name,
      );
      const resolved = resolveScriptRef(rawName);
      if (resolved.error || !resolved.filePath) {
        return reply
          .code(404)
          .send({ error: resolved.error || "script not found" });
      }
      const content = fs.readFileSync(resolved.filePath, "utf8");
      const inspected = inspectScriptSource(resolved.scriptRef, content);
      return {
        name: resolved.scriptRef,
        kind: resolved.kind,
        editable: resolved.kind === "plugin",
        pluginId: resolved.pluginId ?? null,
        content,
        hasIcon:
          resolved.kind === "core"
            ? fsStore.scriptHasIcon(resolved.scriptRef)
            : false,
        ...inspected,
      };
    });

    // Core scripts are read-only. Creating/editing bare *.js writes is disabled.
    // New user scripts must be plugins (fork / zip / git).
    fastify.put("/scripts/:name", async (req, reply) => {
      const rawName = decodeURIComponent(
        /** @type {{ name: string }} */ (req.params).name,
      );
      const pluginRef = resolveScriptRef(rawName);
      if (pluginRef.kind === "core" || !rawName.startsWith("plugin/")) {
        // Attempt to treat as core name
        try {
          fsStore.assertScriptName(
            rawName.endsWith(".js") ? rawName : `${rawName}.js`,
          );
        } catch {
          // continue
        }
        if (!rawName.startsWith("plugin/")) {
          return reply.code(403).send({
            error:
              "core scripts are read-only; fork to a plugin or install a plugin",
          });
        }
      }

      const body = /** @type {{ content?: string }} */ (req.body ?? {});
      if (typeof body.content !== "string") {
        return reply.code(400).send({ error: "content is required" });
      }

      const resolved = resolveScriptRef(rawName);
      if (resolved.kind !== "plugin" || !resolved.filePath || !resolved.pluginDir) {
        return reply.code(404).send({
          error: resolved.error || "plugin not found (install or fork first)",
        });
      }
      if (resolved.disabled) {
        return reply.code(409).send({ error: resolved.error || "plugin disabled" });
      }

      fs.writeFileSync(resolved.filePath, body.content, "utf8");
      clearScriptCache();
      return reply.send({
        name: resolved.scriptRef,
        kind: "plugin",
        editable: true,
        ...inspectScriptSource(resolved.scriptRef, body.content),
      });
    });

    fastify.delete("/scripts/:name", async (req, reply) => {
      const rawName = decodeURIComponent(
        /** @type {{ name: string }} */ (req.params).name,
      );
      if (!rawName.startsWith("plugin/")) {
        return reply.code(403).send({
          error: "core scripts cannot be deleted",
        });
      }
      const resolved = resolveScriptRef(rawName);
      const id = resolved.pluginId;
      if (!id) {
        // may be installed but disabled — still allow uninstall via plugin id parse
        const installed = listInstalledPlugins().find(
          (p) => p.scriptRef === rawName || `plugin/${p.id}` === rawName,
        );
        if (!installed) {
          return reply.code(404).send({ error: "plugin not found" });
        }
        if (registry.referencedScripts().has(installed.scriptRef)) {
          return reply
            .code(409)
            .send({ error: "plugin is referenced by a workflow" });
        }
        uninstallPlugin(installed.id);
        clearScriptCache();
        return { ok: true, restartNeeded: true };
      }
      if (registry.referencedScripts().has(resolved.scriptRef)) {
        return reply
          .code(409)
          .send({ error: "plugin is referenced by a workflow" });
      }
      uninstallPlugin(id);
      clearScriptCache();
      return { ok: true, restartNeeded: true };
    });

    fastify.post("/scripts/:name/fork", async (req, reply) => {
      const rawName = decodeURIComponent(
        /** @type {{ name: string }} */ (req.params).name,
      );
      const body = /** @type {{ id?: string, description?: string }} */ (
        req.body ?? {}
      );
      if (typeof body.id !== "string" || !body.id.trim()) {
        return reply.code(400).send({ error: "id is required" });
      }
      try {
        const coreName = rawName.endsWith(".js") ? rawName : `${rawName}.js`;
        fsStore.assertScriptName(coreName);
        const installed = forkCoreScript(coreName, body.id.trim(), {
          description: body.description,
        });
        clearScriptCache();
        return reply.code(201).send({
          ...installed,
          restartNeeded: true,
          warning:
            "Plugins run as the JerapahFlow process user. Review code before install.",
        });
      } catch (err) {
        return reply
          .code(/** @type {any} */ (err).statusCode ?? 500)
          .send({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    fastify.post("/scripts/:name/dry-run", async (req, reply) => {
      const rawName = decodeURIComponent(
        /** @type {{ name: string }} */ (req.params).name,
      );
      const body = /** @type {{ content?: string, expression?: string, data?: unknown, context?: unknown, config?: unknown, owner?: string }} */ (
        req.body ?? {}
      );

      let owner = DEFAULT_OWNER;
      if (body.owner != null && body.owner !== "") {
        try {
          owner = fsStore.assertOwner(String(body.owner));
        } catch (err) {
          return reply.code(err.statusCode ?? 400).send({ error: err.message });
        }
      }

      const incomingContext = reviveBinaryFromWire(
        body.context != null &&
          typeof body.context === "object" &&
          !Array.isArray(body.context)
          ? body.context
          : {},
      );
      const incomingData = reviveBinaryFromWire(body.data ?? null);

      const { log, logs } = createDryRunLogger();
      const started = Date.now();

      // Set steps are inline JSONata (no script file). Match registry runCompiledStep.
      if (rawName === SET_STEP_SCRIPT || rawName === `${SET_STEP_SCRIPT}.js`) {
        const configObj =
          body.config != null &&
          typeof body.config === "object" &&
          !Array.isArray(body.config)
            ? /** @type {Record<string, unknown>} */ (body.config)
            : null;
        const expression =
          typeof body.expression === "string"
            ? body.expression
            : typeof configObj?.expression === "string"
              ? configObj.expression
              : null;
        if (expression == null || !expression.trim()) {
          return reply.code(400).send({ error: "expression is required" });
        }

        try {
          const config = await resolveConfigRefs(
            { ...(configObj ?? {}), expression },
            {
              owner,
              workflowKey: "dry-run",
              context: incomingContext,
              data: incomingData,
            },
          );
          const ctx = {
            data: incomingData,
            context: incomingContext,
            config,
          };
          const value = await evaluateJsonata(expression, ctx);
          const result = normalizeStepResult(
            {
              output: value,
              context: incomingContext,
              skipRemaining: false,
            },
            incomingContext,
            SET_STEP_SCRIPT,
          );
          log.info({ expression }, "set: dry-run evaluated");
          return {
            status: "success",
            output: safeSerialize(result.output),
            context: safeSerialize(result.context),
            wireOutput: encodeBinaryForWire(result.output),
            wireContext: encodeBinaryForWire(result.context),
            skipRemaining: result.skipRemaining,
            error: null,
            logs,
            durationMs: Date.now() - started,
            meta: null,
            metaError: null,
          };
        } catch (err) {
          return {
            status: "failed",
            output: null,
            context: null,
            skipRemaining: false,
            error: err instanceof Error ? err.message : String(err),
            logs,
            durationMs: Date.now() - started,
            meta: null,
            metaError: null,
          };
        }
      }

      if (typeof body.content !== "string") {
        return reply.code(400).send({ error: "content is required" });
      }

      const resolved = resolveScriptRef(rawName);
      const pluginDir =
        resolved.kind === "plugin" && !resolved.error
          ? resolved.pluginDir ?? null
          : null;

      try {
        const config = await resolveConfigRefs(body.config ?? null, {
          owner,
          workflowKey: "dry-run",
          context: incomingContext,
          data: incomingData,
        });
        const ctx = {
          data: incomingData,
          context: incomingContext,
          config,
        };
        const { fn, meta, metaError } = instantiateScriptSource(
          resolved.scriptRef || rawName,
          body.content,
          {
            log,
            workflowName: "dry-run",
            owner,
            pluginDir,
          },
        );
        const raw = await fn(ctx);
        const result = normalizeStepResult(
          raw,
          incomingContext,
          resolved.scriptRef || rawName,
        );
        return {
          status: "success",
          output: safeSerialize(result.output),
          context: safeSerialize(result.context),
          wireOutput: encodeBinaryForWire(result.output),
          wireContext: encodeBinaryForWire(result.context),
          skipRemaining: result.skipRemaining,
          error: null,
          logs,
          durationMs: Date.now() - started,
          meta,
          metaError,
        };
      } catch (err) {
        const inspected = inspectScriptSource(rawName, body.content);
        return {
          status: "failed",
          output: null,
          context: null,
          skipRemaining: false,
          error: err instanceof Error ? err.message : String(err),
          logs,
          durationMs: Date.now() - started,
          ...inspected,
        };
      }
    });

    // --- Plugins ---

    fastify.get("/plugins", async () => {
      return {
        appVersion: getAppVersion(),
        plugins: listInstalledPlugins(),
        warning:
          "Installing plugins runs third-party code as the JerapahFlow OS user.",
      };
    });

    fastify.post(
      "/plugins/create",
      { onRequest: [fastify.requireAdmin] },
      async (req, reply) => {
        const body = /** @type {{ id?: string, content?: string, description?: string }} */ (
          req.body ?? {}
        );
        if (typeof body.id !== "string" || !body.id.trim()) {
          return reply.code(400).send({ error: "id is required" });
        }
        if (typeof body.content !== "string") {
          return reply.code(400).send({ error: "content is required" });
        }
        try {
          const installed = createBlankPlugin(body.id.trim(), body.content, {
            description: body.description,
          });
          clearScriptCache();
          return reply.code(201).send({
            ...installed,
            restartNeeded: true,
            warning:
              "Plugins run as the JerapahFlow process user. Review code before install.",
          });
        } catch (err) {
          return reply
            .code(/** @type {any} */ (err).statusCode ?? 500)
            .send({ error: err instanceof Error ? err.message : String(err) });
        }
      },
    );

    fastify.post(
      "/plugins/install",
      { onRequest: [fastify.requireAdmin] },
      async (req, reply) => {
        const body = /** @type {{
          source?: string,
          url?: string,
          ref?: string,
          path?: string,
          exampleId?: string,
          zipBase64?: string,
          overwrite?: boolean,
        }} */ (req.body ?? {});

        try {
          let installed;
          if (body.source === "git") {
            if (!body.url) {
              return reply.code(400).send({ error: "url is required" });
            }
            installed = await installPluginFromGit(body.url, {
              ref: body.ref,
              overwrite: Boolean(body.overwrite),
            });
          } else if (body.source === "example") {
            const id = body.exampleId || "get-current-time";
            installed = await installExamplePlugin(id, {
              overwrite: Boolean(body.overwrite),
            });
          } else if (body.source === "dir") {
            if (!body.path) {
              return reply.code(400).send({ error: "path is required" });
            }
            // Only allow examples/ or existing staging under plugins for safety
            const abs = path.resolve(body.path);
            const allowed =
              abs.startsWith(EXAMPLE_PLUGINS_DIR + path.sep) ||
              abs.startsWith(EXAMPLE_PLUGINS_DIR);
            if (!allowed) {
              return reply.code(403).send({
                error: "dir install only allowed under examples/plugins",
              });
            }
            installed = installPluginFromDirectory(abs, {
              overwrite: Boolean(body.overwrite),
            });
          } else if (body.source === "zip") {
            if (!body.zipBase64) {
              return reply.code(400).send({ error: "zipBase64 is required" });
            }
            const buf = Buffer.from(body.zipBase64, "base64");
            installed = await installPluginFromZipBuffer(buf, {
              overwrite: Boolean(body.overwrite),
            });
          } else {
            return reply.code(400).send({
              error: "source must be git | zip | example | dir",
            });
          }
          clearScriptCache();
          return reply.code(201).send({
            ...installed,
            scriptRef: pluginScriptRef(installed.id),
            restartNeeded: true,
            warning:
              "Plugins run as the JerapahFlow process user. Review code before install. Drain-restart workers to load new dependencies.",
          });
        } catch (err) {
          return reply
            .code(/** @type {any} */ (err).statusCode ?? 500)
            .send({ error: err instanceof Error ? err.message : String(err) });
        }
      },
    );

    fastify.delete(
      "/plugins/:id",
      { onRequest: [fastify.requireAdmin] },
      async (req, reply) => {
        const { id } = /** @type {{ id: string }} */ (req.params);
        try {
          const scriptRef = pluginScriptRef(id);
          if (registry.referencedScripts().has(scriptRef)) {
            return reply
              .code(409)
              .send({ error: "plugin is referenced by a workflow" });
          }
          uninstallPlugin(id);
          clearScriptCache();
          return { ok: true, restartNeeded: true };
        } catch (err) {
          return reply
            .code(/** @type {any} */ (err).statusCode ?? 500)
            .send({ error: err instanceof Error ? err.message : String(err) });
        }
      },
    );
  };
}
