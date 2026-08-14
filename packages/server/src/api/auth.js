import bcrypt from "bcryptjs";
import * as store from "../../store.js";

export const COOKIE = "scrunner_token";
export const OPEN_API_ROUTES = new Set([
  "GET /auth/bootstrap",
  "POST /auth/register",
  "POST /auth/login",
]);

export function cookieOpts() {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60,
  };
}

export function validateCredentials(username, password) {
  if (!/^[A-Za-z0-9_]{3,32}$/.test(username)) {
    return "username must be 3-32 letters, numbers, or underscore";
  }
  if (password.length < 8) {
    return "password must be at least 8 characters";
  }
  return null;
}

/**
 * @param {import("fastify").FastifyInstance} fastify
 */
export default async function authPlugin(fastify) {
  fastify.get("/auth/bootstrap", async () => {
    const count = await store.countUsers();
    return { needsSetup: count === 0 };
  });

  fastify.post("/auth/register", async (req, reply) => {
    const count = await store.countUsers();
    if (count > 0) {
      return reply.code(403).send({ error: "setup already complete" });
    }
    const body = /** @type {{ username?: string, password?: string }} */ (req.body ?? {});
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    const err = validateCredentials(username, password);
    if (err) return reply.code(400).send({ error: err });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await store.createUser({
      username,
      passwordHash,
      role: "admin",
    });
    const token = await reply.jwtSign({
      id: user.id,
      username: user.username,
      role: user.role,
    });
    reply.setCookie(COOKIE, token, cookieOpts());
    return { user };
  });

  fastify.post("/auth/login", async (req, reply) => {
    const body = /** @type {{ username?: string, password?: string }} */ (req.body ?? {});
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    const row = await store.getUserAuthByUsername(username);
    if (!row || !(await bcrypt.compare(password, row.password_hash))) {
      return reply.code(401).send({ error: "invalid credentials" });
    }
    const token = await reply.jwtSign({
      id: row.id,
      username: row.username,
      role: row.role,
    });
    reply.setCookie(COOKIE, token, cookieOpts());
    return {
      user: {
        id: row.id,
        username: row.username,
        role: row.role,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    };
  });

  fastify.post("/auth/logout", async (_req, reply) => {
    reply.clearCookie(COOKIE, { path: "/" });
    return { ok: true };
  });

  fastify.get("/auth/me", async (req, reply) => {
    const user = await store.getUserById(req.user.id);
    if (!user) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    return { user };
  });
}
