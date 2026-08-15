import fs from "fs";
import {
  clearScriptCache,
  inspectScriptSource,
  instantiateScriptSource,
} from "../../script-sandbox.js";
import * as fsStore from "../../fs-store.js";
import { createDryRunLogger, safeSerialize } from "./dry-run-logger.js";

/**
 * @param {{ referencedScripts: () => Set<string> }} registry
 */
export default function scriptsPluginFactory(registry) {
  /**
   * @param {import("fastify").FastifyInstance} fastify
   */
  return async function scriptsPlugin(fastify) {
    fastify.get("/scripts", async () => {
      const scripts = fsStore.listScriptFiles().map((name) => {
        const content = fsStore.readScript(name);
        const inspected =
          content == null
            ? { meta: null, metaError: "script not found" }
            : inspectScriptSource(name, content);
        return { name, hasIcon: fsStore.scriptHasIcon(name), ...inspected };
      });
      return { scripts };
    });

    fastify.get("/scripts/:name/icon", async (req, reply) => {
      const { name } = /** @type {{ name: string }} */ (req.params);
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
      const { name } = /** @type {{ name: string }} */ (req.params);
      try {
        fsStore.assertScriptName(name);
      } catch (err) {
        return reply.code(err.statusCode ?? 400).send({ error: err.message });
      }
      const content = fsStore.readScript(name);
      if (content == null) return reply.code(404).send({ error: "script not found" });
      return { name, content, hasIcon: fsStore.scriptHasIcon(name), ...inspectScriptSource(name, content) };
    });

    fastify.put("/scripts/:name", async (req, reply) => {
      const { name } = /** @type {{ name: string }} */ (req.params);
      try {
        fsStore.assertScriptName(name);
      } catch (err) {
        return reply.code(err.statusCode ?? 400).send({ error: err.message });
      }
      const body = /** @type {{ content?: string }} */ (req.body ?? {});
      if (typeof body.content !== "string") {
        return reply.code(400).send({ error: "content is required" });
      }
      const existed = fsStore.readScript(name) != null;
      fsStore.writeScript(name, body.content);
      clearScriptCache();
      return reply.code(existed ? 200 : 201).send({
        name,
        ...inspectScriptSource(name, body.content),
      });
    });

    fastify.delete("/scripts/:name", async (req, reply) => {
      const { name } = /** @type {{ name: string }} */ (req.params);
      try {
        fsStore.assertScriptName(name);
      } catch (err) {
        return reply.code(err.statusCode ?? 400).send({ error: err.message });
      }
      if (registry.referencedScripts().has(name)) {
        return reply
          .code(409)
          .send({ error: "script is referenced by a workflow" });
      }
      if (!fsStore.deleteScript(name)) {
        return reply.code(404).send({ error: "script not found" });
      }
      clearScriptCache();
      return { ok: true };
    });

    fastify.post("/scripts/:name/dry-run", async (req, reply) => {
      const { name } = /** @type {{ name: string }} */ (req.params);
      try {
        fsStore.assertScriptName(name);
      } catch (err) {
        return reply.code(err.statusCode ?? 400).send({ error: err.message });
      }

      const body = /** @type {{ content?: string, data?: unknown, config?: unknown, owner?: string }} */ (
        req.body ?? {}
      );
      if (typeof body.content !== "string") {
        return reply.code(400).send({ error: "content is required" });
      }

      let owner = "default";
      if (body.owner != null && body.owner !== "") {
        try {
          owner = fsStore.assertOwner(String(body.owner));
        } catch (err) {
          return reply.code(err.statusCode ?? 400).send({ error: err.message });
        }
      }

      const ctx = {
        data: body.data ?? null,
        config: body.config ?? null,
      };

      const { log, logs } = createDryRunLogger();
      const started = Date.now();

      try {
        const { fn, meta, metaError } = instantiateScriptSource(name, body.content, {
          log,
          workflowName: "dry-run",
          owner,
        });
        const output = await fn(ctx);
        return {
          status: "success",
          output: safeSerialize(output),
          error: null,
          logs,
          durationMs: Date.now() - started,
          meta,
          metaError,
        };
      } catch (err) {
        const inspected = inspectScriptSource(name, body.content);
        return {
          status: "failed",
          output: null,
          error: err instanceof Error ? err.message : String(err),
          logs,
          durationMs: Date.now() - started,
          ...inspected,
        };
      }
    });
  };
}
