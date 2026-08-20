import {
  assertAuthId,
  assertAuthName,
  assertAuthType,
  listHttpAuths,
  getHttpAuthById,
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

  fastify.get("/http-auths/:id/reveal", async (req, reply) => {
    const { id } = /** @type {{ id: string }} */ (req.params);
    try {
      assertAuthId(id);
    } catch (err) {
      return reply.code(err.statusCode ?? 400).send({ error: err.message });
    }
    const revealed = await revealHttpAuthLiterals(id);
    if (!revealed) {
      return reply.code(404).send({ error: "auth not found" });
    }
    return revealed;
  });

  fastify.get("/http-auths/:id", async (req, reply) => {
    const { id } = /** @type {{ id: string }} */ (req.params);
    try {
      assertAuthId(id);
    } catch (err) {
      return reply.code(err.statusCode ?? 400).send({ error: err.message });
    }
    const auth = await getHttpAuthById(id);
    if (!auth) {
      return reply.code(404).send({ error: "auth not found" });
    }
    return { auth };
  });

  fastify.put("/http-auths", async (req, reply) => {
    const body = /** @type {{
      id?: string | null,
      name?: string,
      type?: string,
      config?: unknown,
      unauthorized_status?: number | null,
      unauthorized_response?: string | null,
    }} */ (req.body ?? {});
    try {
      assertAuthName(String(body.name ?? ""));
      assertAuthType(body.type);
      if (body.id != null && String(body.id).length > 0) {
        assertAuthId(String(body.id));
      }
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
        id: body.id != null && String(body.id).length > 0 ? String(body.id) : null,
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
    try {
      assertAuthId(id);
    } catch (err) {
      return reply.code(err.statusCode ?? 400).send({ error: err.message });
    }
    const existing = await getHttpAuthById(id);
    if (!existing) {
      return reply.code(404).send({ error: "auth not found" });
    }
    await deleteHttpAuth(id);
    return { ok: true };
  });
}
