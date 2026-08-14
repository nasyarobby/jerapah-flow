import bcrypt from "bcryptjs";
import * as store from "../../store.js";
import { validateCredentials } from "./auth.js";

/**
 * @param {import("fastify").FastifyInstance} fastify
 */
export default async function usersPlugin(fastify) {
  fastify.addHook("onRequest", fastify.requireAdmin);

  fastify.get("/users", async () => {
    const users = await store.listUsers();
    return { users };
  });

  fastify.post("/users", async (req, reply) => {
    const body = /** @type {{ username?: string, password?: string, role?: string }} */ (
      req.body ?? {}
    );
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    const role = body.role === "admin" ? "admin" : "operator";
    const err = validateCredentials(username, password);
    if (err) return reply.code(400).send({ error: err });

    const existing = await store.getUserAuthByUsername(username);
    if (existing) {
      return reply.code(409).send({ error: "username taken" });
    }

    const user = await store.createUser({
      username,
      passwordHash: await bcrypt.hash(password, 10),
      role,
    });
    return reply.code(201).send({ user });
  });

  fastify.patch("/users/:id", async (req, reply) => {
    const { id } = /** @type {{ id: string }} */ (req.params);
    const existing = await store.getUserAuthById(id);
    if (!existing) return reply.code(404).send({ error: "user not found" });

    const body = /** @type {{ password?: string, role?: string }} */ (req.body ?? {});
    /** @type {{ passwordHash?: string, role?: string }} */
    const patch = {};

    if (body.role) {
      if (body.role !== "admin" && body.role !== "operator") {
        return reply.code(400).send({ error: "invalid role" });
      }
      if (existing.role === "admin" && body.role !== "admin") {
        const admins = await store.countAdmins();
        if (admins <= 1) {
          return reply.code(400).send({ error: "cannot demote last admin" });
        }
      }
      patch.role = body.role;
    }

    if (body.password) {
      if (body.password.length < 8) {
        return reply.code(400).send({ error: "password must be at least 8 characters" });
      }
      patch.passwordHash = await bcrypt.hash(body.password, 10);
    }

    const user = await store.updateUser(id, patch);
    return { user };
  });

  fastify.delete("/users/:id", async (req, reply) => {
    const { id } = /** @type {{ id: string }} */ (req.params);
    const existing = await store.getUserAuthById(id);
    if (!existing) return reply.code(404).send({ error: "user not found" });
    if (existing.role === "admin") {
      const admins = await store.countAdmins();
      if (admins <= 1) {
        return reply.code(400).send({ error: "cannot delete last admin" });
      }
    }
    await store.deleteUser(id);
    return { ok: true };
  });
}
