import {
  assertPageName,
  assertMime,
  assertHttpStatus,
  listHttpPages,
  getHttpPageById,
  getHttpPageByName,
  upsertHttpPage,
  deleteHttpPage,
} from "../../http-pages-store.js";

/**
 * @param {import("fastify").FastifyInstance} fastify
 */
export default async function httpPagesPlugin(fastify) {
  fastify.get("/http-pages", async () => {
    return { pages: await listHttpPages() };
  });

  fastify.get("/http-pages/:name", async (req, reply) => {
    const { name } = /** @type {{ name: string }} */ (req.params);
    try {
      assertPageName(name);
    } catch (err) {
      return reply.code(err.statusCode ?? 400).send({ error: err.message });
    }
    const page = await getHttpPageByName(name);
    if (!page) {
      return reply.code(404).send({ error: "page not found" });
    }
    return { page };
  });

  fastify.put("/http-pages", async (req, reply) => {
    const body = /** @type {{
      name?: string,
      content?: string,
      mime?: string,
      status?: number,
    }} */ (req.body ?? {});
    try {
      assertPageName(String(body.name ?? ""));
      assertMime(body.mime);
      assertHttpStatus(body.status, 200);
      if (typeof body.content !== "string") {
        return reply.code(400).send({ error: "content must be a string" });
      }
      const page = await upsertHttpPage({
        name: String(body.name),
        content: body.content,
        mime: String(body.mime),
        status: body.status,
      });
      return reply.send({ page });
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  fastify.delete("/http-pages/:id", async (req, reply) => {
    const { id } = /** @type {{ id: string }} */ (req.params);
    const existing = await getHttpPageById(id);
    if (!existing) {
      return reply.code(404).send({ error: "page not found" });
    }
    await deleteHttpPage(id);
    return { ok: true };
  });
}
