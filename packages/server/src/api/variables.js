import * as fsStore from "../../fs-store.js";
import {
  assertVariableName,
  assertVariableType,
  deleteVariable,
  getVariableById,
  listVariables,
  upsertVariable,
} from "../../variables-store.js";

/**
 * @param {import("fastify").FastifyInstance} fastify
 */
export default async function variablesPlugin(fastify) {
  fastify.get("/variables", async (req, reply) => {
    const q = /** @type {{ owner?: string }} */ (req.query ?? {});
    try {
      const owner = q.owner ? fsStore.assertOwner(q.owner) : undefined;
      const variables = await listVariables({ owner });
      return { variables };
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  fastify.put("/variables", async (req, reply) => {
    const body = /** @type {{ owner?: string, name?: string, type?: unknown, value?: unknown }} */ (
      req.body ?? {}
    );
    try {
      fsStore.assertOwner(String(body.owner ?? ""));
      assertVariableName(String(body.name ?? ""));
      assertVariableType(body.type);
      const variable = await upsertVariable({
        owner: String(body.owner),
        name: String(body.name),
        type: body.type,
        value: body.value,
      });
      return reply.send({ variable });
    } catch (err) {
      return reply.code(err.statusCode ?? 400).send({ error: err.message });
    }
  });

  fastify.delete("/variables/:id", async (req, reply) => {
    const { id } = /** @type {{ id: string }} */ (req.params);
    const existing = await getVariableById(id);
    if (!existing) {
      return reply.code(404).send({ error: "variable not found" });
    }
    await deleteVariable(id);
    return { ok: true };
  });
}
