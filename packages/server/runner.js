import fs from "fs";
import fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import fastifyStatic from "@fastify/static";
import { migrate, db } from "./db.js";
import { log, enableLogPersistence, flushLogs } from "./logger.js";
import * as store from "./store.js";
import { createRegistry } from "./registry.js";
import { COOKIE, OPEN_API_ROUTES } from "./src/api/auth.js";
import authPlugin from "./src/api/auth.js";
import usersPlugin from "./src/api/users.js";
import scriptsPluginFactory from "./src/api/scripts.js";
import workflowsPluginFactory from "./src/api/workflows.js";
import runsPlugin from "./src/api/runs.js";
import dashboardPluginFactory from "./src/api/dashboard.js";
import secretsPlugin from "./src/api/secrets.js";
import kvPlugin from "./src/api/kv.js";
import variablesPlugin from "./src/api/variables.js";
import httpPagesPlugin from "./src/api/http-pages.js";
import httpAuthsPlugin from "./src/api/http-auths.js";
import { WEB_DIST } from "./paths.js";
import { resolveSecretsKeyMaterial } from "./secrets.js";
import {
  closeRedis,
  createWorkflowQueue,
  createWorkflowWorker,
  getRedisUrl,
} from "./workflow-queue.js";

await migrate();
enableLogPersistence();

const jwtSecret =
  process.env.JFLOW_JWT_SECRET ??
  (process.env.NODE_ENV === "production" ? "" : "jflow-dev-secret");

if (!jwtSecret) {
  log.error("JFLOW_JWT_SECRET is required in production");
  process.exit(1);
}

try {
  resolveSecretsKeyMaterial();
} catch (err) {
  log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const role = (process.env.JFLOW_ROLE || "all").toLowerCase();
const runApi = role === "all" || role === "api";
const runWorker = role === "all" || role === "worker";

log.info({ redis: getRedisUrl(), role }, "starting jerapah-flow");

const workflowQueue = createWorkflowQueue();
try {
  await workflowQueue.waitUntilReady();
} catch (err) {
  log.error({ err, redis: getRedisUrl() }, "failed to connect to Redis");
  process.exit(1);
}

const server = fastify({ loggerInstance: log });

await server.register(cookie);
await server.register(jwt, {
  secret: jwtSecret,
  cookie: {
    cookieName: COOKIE,
    signed: false,
  },
});
await server.register(cors, {
  origin: process.env.JFLOW_CORS_ORIGIN ?? "http://localhost:5173",
  credentials: true,
});

server.decorate("authenticate", async function authenticate(req, reply) {
  try {
    await req.jwtVerify();
  } catch {
    return reply.code(401).send({ error: "unauthorized" });
  }
});

server.decorate("requireAdmin", async function requireAdmin(req, reply) {
  if (req.user?.role !== "admin") {
    return reply.code(403).send({ error: "forbidden" });
  }
});

const registry = createRegistry(server, { queue: workflowQueue });
registry.registerWorkflows();
if (runApi) {
  registry.registerHttpTriggers();
  registry.registerCronTriggers();
  registry.registerPruneJob();
}

/** @type {import("bullmq").Worker | null} */
let workflowWorker = null;
if (runWorker) {
  workflowWorker = createWorkflowWorker(async (job) => {
    const data = /** @type {{ runId?: string, key?: string, depth?: number }} */ (
      job.data ?? {}
    );
    if (typeof data.runId !== "string" || typeof data.key !== "string") {
      throw new Error("invalid workflow job payload");
    }
    const result = await registry.executeQueuedRun({
      runId: data.runId,
      key: data.key,
      depth: data.depth ?? 0,
    });
    if (result.status === "failed") {
      throw new Error(result.error || "workflow failed");
    }
    return result;
  });
}

if (runApi) {
  await server.register(
    async (api) => {
      api.addHook("onRequest", async (req, reply) => {
        const raw = (req.url || "").split("?")[0];
        const stripped = raw.replace(/^\/api/, "") || "/";
        const routeUrl = req.routeOptions?.url || stripped;
        const open =
          OPEN_API_ROUTES.has(`${req.method} ${routeUrl}`) ||
          OPEN_API_ROUTES.has(`${req.method} ${stripped}`);
        if (open) return;
        await server.authenticate(req, reply);
      });
      await api.register(authPlugin);
      await api.register(usersPlugin);
      await api.register(secretsPlugin);
      await api.register(variablesPlugin);
      await api.register(kvPlugin);
      await api.register(httpPagesPlugin);
      await api.register(httpAuthsPlugin);
      await api.register(scriptsPluginFactory(registry));
      await api.register(workflowsPluginFactory(registry));
      await api.register(runsPlugin);
      await api.register(dashboardPluginFactory(registry));
    },
    { prefix: "/api" },
  );

  server.post(
    "/admin/workflows/reregister",
    { onRequest: [server.authenticate] },
    async (_req, reply) => {
      registry.reregister();
      return reply.send({ message: "Workflows refreshed" });
    },
  );

  server.get(
    "/admin/runs",
    { onRequest: [server.authenticate] },
    async (req, reply) => {
      const q = /** @type {Record<string, string | undefined>} */ (req.query);
      const limit = q.limit ? Number(q.limit) : undefined;
      const runs = await store.listRuns({
        owner: q.owner,
        workflow: q.workflow,
        status: q.status,
        limit: Number.isFinite(limit) ? limit : undefined,
        before: q.before,
      });
      return reply.send({ runs });
    },
  );

  server.get(
    "/admin/runs/:id",
    { onRequest: [server.authenticate] },
    async (req, reply) => {
      const { id } = /** @type {{ id: string }} */ (req.params);
      const run = await store.getRun(id);
      if (!run) {
        return reply.code(404).send({ error: "run not found" });
      }
      return reply.send(run);
    },
  );

  if (fs.existsSync(WEB_DIST)) {
    await server.register(fastifyStatic, {
      root: WEB_DIST,
      wildcard: false,
    });
    server.setNotFoundHandler((req, reply) => {
      const url = req.raw.url ?? "";
      if (
        url.startsWith("/api") ||
        url.startsWith("/u/") ||
        url.startsWith("/admin")
      ) {
        return reply.code(404).send({ error: "not found" });
      }
      return reply.sendFile("index.html");
    });
  }
}

async function shutdown() {
  try {
    if (workflowWorker) {
      await workflowWorker.close();
    }
    await workflowQueue.close();
    await closeRedis();
    await flushLogs();
    await db.destroy();
  } catch (err) {
    log.error({ err }, "shutdown error");
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const port = Number(process.env.PORT ?? 8700);

if (runApi) {
  server
    .listen({
      host: "0.0.0.0",
      port,
    })
    .then(() => {
      log.info(`Server is running on port ${port}`);
    })
    .catch((err) => {
      log.error({ err }, "failed to start server");
      process.exit(1);
    });
} else {
  log.info("worker-only mode; HTTP server not started");
}