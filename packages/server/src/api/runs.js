import * as store from "../../store.js";

/**
 * @param {import("fastify").FastifyInstance} fastify
 */
export default async function runsPlugin(fastify) {
  fastify.get("/runs", async (req) => {
    const q = /** @type {Record<string, string | undefined>} */ (req.query ?? {});
    const limit = q.limit ? Number(q.limit) : undefined;
    const runs = await store.listRuns({
      owner: q.owner,
      workflow: q.workflow,
      status: q.status,
      limit: Number.isFinite(limit) ? limit : undefined,
      before: q.before,
    });
    return { runs };
  });

  fastify.get("/runs/:id", async (req, reply) => {
    const { id } = /** @type {{ id: string }} */ (req.params);
    const run = await store.getRun(id);
    if (!run) return reply.code(404).send({ error: "run not found" });
    return run;
  });
}
