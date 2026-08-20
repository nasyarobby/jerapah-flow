import * as store from "../../store.js";
import { queryRunsFromRequest } from "./run-query.js";

/**
 * @param {import("fastify").FastifyInstance} fastify
 */
export default async function runsPlugin(fastify) {
  fastify.get("/runs", async (req) => {
    return queryRunsFromRequest(/** @type {Record<string, string | undefined>} */ (req.query ?? {}));
  });

  fastify.get("/consecutive-failures", async (req) => {
    const q = /** @type {Record<string, string | undefined>} */ (req.query ?? {});
    const limit = q.limit ? Number(q.limit) : undefined;
    return store.listConsecutiveFailureStreaks({
      minCount: 4,
      limit: Number.isFinite(limit) ? limit : 200,
    });
  });

  fastify.get("/runs/:id", async (req, reply) => {
    const { id } = /** @type {{ id: string }} */ (req.params);
    const run = await store.getRun(id);
    if (!run) return reply.code(404).send({ error: "run not found" });
    return run;
  });
}
