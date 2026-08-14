import { kvNamespaces, kvQuery } from "../../kv-store.js";

/**
 * @param {import("fastify").FastifyInstance} fastify
 */
export default async function kvPlugin(fastify) {
  fastify.get("/kv/namespaces", async () => {
    return { namespaces: await kvNamespaces() };
  });

  fastify.get("/kv", async (req) => {
    const q = /** @type {Record<string, string | undefined>} */ (req.query ?? {});
    const limit = q.limit != null ? Number(q.limit) : undefined;
    const offset = q.offset != null ? Number(q.offset) : undefined;
    return kvQuery({
      namespace: q.namespace || undefined,
      q: q.q || undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
      offset: Number.isFinite(offset) ? offset : undefined,
    });
  });
}
