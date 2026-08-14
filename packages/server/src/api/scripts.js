import { clearScriptCache } from "../../script-sandbox.js";
import * as fsStore from "../../fs-store.js";

/**
 * @param {{ referencedScripts: () => Set<string> }} registry
 */
export default function scriptsPluginFactory(registry) {
  /**
   * @param {import("fastify").FastifyInstance} fastify
   */
  return async function scriptsPlugin(fastify) {
    fastify.get("/scripts", async () => {
      return { scripts: fsStore.listScriptFiles() };
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
      return { name, content };
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
      return reply.code(existed ? 200 : 201).send({ name });
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
  };
}
