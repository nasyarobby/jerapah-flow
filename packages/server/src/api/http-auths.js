import {
  assertAuthName,
  assertAuthType,
  listHttpAuths,
  getHttpAuthById,
  getHttpAuthByName,
  upsertHttpAuth,
  deleteHttpAuth,
  revealHttpAuthLiterals,
} from "../../http-auths-store.js";
import { getHttpPageByName, assertHttpResponsePage } from "../../http-pages-store.js";

/**
 * @param {import("fastify").FastifyInstance} fastify
 */
export default async function httpAuthsPlugin(fastify) {
  fastify.get("/http-auths", async () => {
    return { auths: await listHttpAuths() };
  });

  fastify.get("/http-auths/:name/reveal", async (req, reply) => {
    const { name } = /** @type {{ name: string }} */ (req.params);
    try {
      assertAuthName(name);
    } catch (err) {
      return reply.code(err.statusCode ?? 400).send({ error: err.message });
    }
    const revealed = await revealHttpAuthLiterals(name);
    if (!revealed) {
      return reply.code(404).send({ error: "auth not found" });
    }
    return revealed;
  });

  fastify.get("/http-auths/:name", async (req, reply) => {
    const { name } = /** @type {{ name: string }} */ (req.params);
    try {
      assertAuthName(name);
    } catch (err) {
      return reply.code(err.statusCode ?? 400).send({ error: err.message });
    }
    const auth = await getHttpAuthByName(name);
    if (!auth) {
      return reply.code(404).send({ error: "auth not found" });
    }
    return { auth };
  });

  fastify.put("/http-auths", async (req, reply) => {
    const body = /** @type {{
      name?: string,
      type?: string,
      config?: unknown,
      unauthorized_status?: number | null,
      unauthorized_response?: string | null,
    }} */ (req.body ?? {});
    try {
      assertAuthName(String(body.name ?? ""));
      assertAuthType(body.type);
      if (
        body.unauthorized_response != null &&
        String(body.unauthorized_response).length > 0
      ) {
        const page = await getHttpPageByName(String(body.unauthorized_response));
        assertHttpResponsePage(
          page,
          String(body.unauthorized_response),
          "unauthorized_response",
        );
      }
      const auth = await upsertHttpAuth({
        name: String(body.name),
        type: String(body.type),
        config: body.config,
        unauthorized_status: body.unauthorized_status,
        unauthorized_response: body.unauthorized_response,
      });
      return reply.send({ auth });
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  fastify.delete("/http-auths/:id", async (req, reply) => {
    const { id } = /** @type {{ id: string }} */ (req.params);
    const existing = await getHttpAuthById(id);
    if (!existing) {
      return reply.code(404).send({ error: "auth not found" });
    }
    await deleteHttpAuth(id);
    return { ok: true };
  });
}
