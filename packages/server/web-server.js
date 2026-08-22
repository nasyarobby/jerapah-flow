/**
 * Production UI server (:8500).
 * Serves packages/web/dist and proxies /api, /ops, /admin, /u like Vite in dev.
 * Always-on — survives Ops stop of jflow-http.
 */
import fs from "fs";
import fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { log } from "./logger.js";
import { WEB_DIST } from "./paths.js";
import {
  controlOrigin,
  httpOrigin,
  proxyToOrigin,
} from "./ops-proxy.js";

if (!fs.existsSync(WEB_DIST)) {
  log.error(
    { WEB_DIST },
    "web dist missing — run `pnpm build` before starting the UI server",
  );
  process.exit(1);
}

const port = Number(process.env.JFLOW_UI_PORT ?? 8500);
const control = controlOrigin();
const http = httpOrigin();

const server = fastify({ loggerInstance: log });

/**
 * @param {import("fastify").FastifyRequest} req
 * @param {import("fastify").FastifyReply} reply
 */
async function proxyApi(req, reply) {
  const url = req.raw.url ?? "";
  // Match Vite: /api/auth → control (login works when HTTP is stopped).
  if (url === "/api/auth" || url.startsWith("/api/auth/") || url.startsWith("/api/auth?")) {
    return proxyToOrigin(req, reply, control, {
      unreachableMessage: "control plane unreachable",
    });
  }
  return proxyToOrigin(req, reply, http, {
    unreachableMessage: "HTTP API unreachable",
  });
}

/**
 * @param {import("fastify").FastifyRequest} req
 * @param {import("fastify").FastifyReply} reply
 */
async function proxyOps(req, reply) {
  return proxyToOrigin(req, reply, control, {
    unreachableMessage: "control plane unreachable",
  });
}

/**
 * @param {import("fastify").FastifyRequest} req
 * @param {import("fastify").FastifyReply} reply
 */
async function proxyHttp(req, reply) {
  return proxyToOrigin(req, reply, http, {
    unreachableMessage: "HTTP API unreachable",
  });
}

server.all("/api", proxyApi);
server.all("/api/*", proxyApi);
server.all("/ops", proxyOps);
server.all("/ops/*", proxyOps);
server.all("/admin", proxyHttp);
server.all("/admin/*", proxyHttp);
server.all("/u", proxyHttp);
server.all("/u/*", proxyHttp);

await server.register(fastifyStatic, {
  root: WEB_DIST,
  wildcard: false,
});

server.setNotFoundHandler((req, reply) => {
  const url = req.raw.url ?? "";
  if (
    url.startsWith("/api") ||
    url.startsWith("/u/") ||
    url.startsWith("/admin") ||
    url.startsWith("/ops")
  ) {
    return reply.code(404).send({ error: "not found" });
  }
  return reply.sendFile("index.html");
});

async function shutdown() {
  try {
    await server.close();
  } catch (err) {
    log.error({ err }, "web-server shutdown error");
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

try {
  await server.listen({ host: "0.0.0.0", port });
  log.info(
    { port, WEB_DIST, control, http },
    "UI server listening (static + proxy)",
  );
} catch (err) {
  log.error({ err }, "failed to start UI server");
  process.exit(1);
}
