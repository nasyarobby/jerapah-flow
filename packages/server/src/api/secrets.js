import * as fsStore from "../../fs-store.js";
import {
  assertSecretName,
  deleteSecret,
  getSecretById,
  listSecrets,
  upsertSecret,
} from "../../secrets-store.js";

/**
 * @param {import("fastify").FastifyInstance} fastify
 */
export default async function secretsPlugin(fastify) {
  fastify.addHook("onRequest", fastify.requireAdmin);

  fastify.get("/secrets", async (req, reply) => {
    const q = /** @type {{ owner?: string }} */ (req.query ?? {});
    try {
      const owner = q.owner ? fsStore.assertOwner(q.owner) : undefined;
      const secrets = await listSecrets({ owner });
      return { secrets };
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  fastify.put("/secrets", async (req, reply) => {
    const body = /** @type {{ owner?: string, name?: string, value?: string }} */ (
      req.body ?? {}
    );
    try {
      fsStore.assertOwner(String(body.owner ?? ""));
      assertSecretName(String(body.name ?? ""));
    } catch (err) {
      return reply.code(err.statusCode ?? 400).send({ error: err.message });
    }

    const value = String(body.value ?? "");
    if (value.length === 0) {
      return reply.code(400).send({ error: "value is required" });
    }

    try {
      const secret = await upsertSecret({
        owner: String(body.owner),
        name: String(body.name),
        value,
      });
      return reply.send({ secret });
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  fastify.delete("/secrets/:id", async (req, reply) => {
    const { id } = /** @type {{ id: string }} */ (req.params);
    const existing = await getSecretById(id);
    if (!existing) {
      return reply.code(404).send({ error: "secret not found" });
    }
    await deleteSecret(id);
    return { ok: true };
  });
}
