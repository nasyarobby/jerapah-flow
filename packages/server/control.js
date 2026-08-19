import fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { migrate, db } from "./db.js";
import { log, enableLogPersistence, flushLogs } from "./logger.js";
import { COOKIE } from "./src/api/auth.js";
import {
  clearRestartNeeded,
  bumpGeneration,
  patchControlState,
  readControlState,
  refreshOpsLock,
  releaseOpsLock,
  tryAcquireOpsLock,
} from "./control-state.js";
import {
  getConfigGeneration,
  publishReload,
  readHeartbeats,
} from "./control-bus.js";
import {
  closeRedis,
  createWorkflowQueue,
  getRedisUrlForLog,
} from "./workflow-queue.js";
import { reconcileOrphanRuns } from "./orphan-runs.js";
import {
  connectPm2,
  deletePm2App,
  describeChildren,
  disconnectPm2,
  ensureHttp,
  ensureWorkers,
  PM2_HTTP_NAME,
  PM2_WORKER_NAME,
  recreateChildren,
  stopPm2App,
} from "./pm2-bridge.js";

const DRAIN_DEFAULT_MS = 60_000;
const DRAIN_POLL_MS = 500;

const jwtSecret =
  process.env.JFLOW_JWT_SECRET ??
  (process.env.NODE_ENV === "production" ? "" : "jflow-dev-secret");

if (!jwtSecret) {
  log.error("JFLOW_JWT_SECRET is required in production");
  process.exit(1);
}

await migrate();
enableLogPersistence();

log.info({ redis: getRedisUrlForLog() }, "starting jerapah-flow control");

const workflowQueue = createWorkflowQueue();
try {
  await workflowQueue.waitUntilReady();
} catch (err) {
  log.error({ err, redis: getRedisUrlForLog() }, "failed to connect to Redis");
  process.exit(1);
}

try {
  await connectPm2();
} catch (err) {
  log.error({ err }, "failed to connect to PM2 — is pm2 installed?");
  process.exit(1);
}

async function applyDesiredState() {
  const state = readControlState();
  await ensureHttp({
    generation: state.generation,
    running: state.http === "running",
  });
  await ensureWorkers({
    generation: state.generation,
    count: state.workers,
  });
  if (state.queuePaused) {
    await workflowQueue.pause();
  } else {
    const paused = await workflowQueue.isPaused();
    if (paused) await workflowQueue.resume();
  }
  log.info(
    {
      http: state.http,
      workers: state.workers,
      generation: state.generation,
      queuePaused: state.queuePaused,
    },
    "applied desired state",
  );
}

await applyDesiredState();

const server = fastify({ loggerInstance: log });
await server.register(cookie);
await server.register(jwt, {
  secret: jwtSecret,
  cookie: { cookieName: COOKIE, signed: false },
});
await server.register(cors, {
  origin: process.env.JFLOW_CORS_ORIGIN ?? "http://localhost:8500",
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

/**
 * @param {number} timeoutMs
 * @param {string} lockToken
 */
async function waitUntilIdle(timeoutMs, lockToken) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    refreshOpsLock(lockToken);
    await reconcileOrphanRuns(workflowQueue);
    const active = await workflowQueue.getActiveCount();
    if (active === 0) return { ok: true, active: 0 };
    await new Promise((r) => setTimeout(r, DRAIN_POLL_MS));
  }
  const active = await workflowQueue.getActiveCount();
  return { ok: active === 0, active };
}

async function buildStatus() {
  const state = readControlState();
  const children = await describeChildren();
  const heartbeats = await readHeartbeats();
  const live = heartbeats.filter((h) => !h.stale);
  const queuePaused = await workflowQueue.isPaused();
  const counts = await workflowQueue.getJobCounts(
    "active",
    "waiting",
    "delayed",
    "paused",
    "failed",
    "completed",
  );
  const orphans = await reconcileOrphanRuns(workflowQueue);

  const expectedGen = state.generation;
  const mismatched = live.filter((h) => h.generation !== expectedGen);

  return {
    control: {
      pid: process.pid,
      generation: getConfigGeneration(),
    },
    desired: state,
    children,
    heartbeats: live,
    generationMismatch: mismatched.length > 0 || state.restartNeeded,
    mismatched,
    queue: {
      paused: queuePaused,
      counts,
    },
    orphans,
  };
}

server.get(
  "/ops/status",
  { onRequest: [server.authenticate] },
  async () => buildStatus(),
);

server.get("/ops/health", async () => ({ ok: true, role: "control" }));

server.post(
  "/ops/pause",
  { onRequest: [server.authenticate, server.requireAdmin] },
  async (_req, reply) => {
    await workflowQueue.pause();
    patchControlState({ queuePaused: true });
    return reply.send({ ok: true, queuePaused: true });
  },
);

server.post(
  "/ops/resume",
  { onRequest: [server.authenticate, server.requireAdmin] },
  async (_req, reply) => {
    await workflowQueue.resume();
    patchControlState({ queuePaused: false });
    return reply.send({ ok: true, queuePaused: false });
  },
);

server.post(
  "/ops/reload",
  { onRequest: [server.authenticate, server.requireAdmin] },
  async (_req, reply) => {
    await publishReload({ type: "workflows" });
    return reply.send({ ok: true, published: true });
  },
);

server.post(
  "/ops/generation/bump",
  { onRequest: [server.authenticate, server.requireAdmin] },
  async (req, reply) => {
    const body = /** @type {{ reason?: string }} */ (req.body ?? {});
    const reason = String(body.reason ?? "manual bump").slice(0, 200);
    const state = bumpGeneration(reason);
    return reply.send({ ok: true, desired: state });
  },
);

server.post(
  "/ops/http/start",
  { onRequest: [server.authenticate, server.requireAdmin] },
  async (_req, reply) => {
    const state = patchControlState({ http: "running" });
    await ensureHttp({ generation: state.generation, running: true });
    return reply.send({ ok: true, desired: state });
  },
);

server.post(
  "/ops/http/stop",
  { onRequest: [server.authenticate, server.requireAdmin] },
  async (_req, reply) => {
    const state = patchControlState({ http: "stopped" });
    await stopPm2App(PM2_HTTP_NAME);
    return reply.send({ ok: true, desired: state });
  },
);

server.post(
  "/ops/restart",
  { onRequest: [server.authenticate, server.requireAdmin] },
  async (req, reply) => {
    const body = /** @type {{ force?: boolean, timeoutMs?: number }} */ (
      req.body ?? {}
    );
    const force = Boolean(body.force);
    const timeoutMs = Math.min(
      Math.max(Number(body.timeoutMs) || DRAIN_DEFAULT_MS, 1_000),
      10 * 60_000,
    );

    const lock = tryAcquireOpsLock(`restart:${process.pid}`);
    if (!lock.ok) {
      return reply.code(409).send({ error: lock.error, holder: lock.holder });
    }

    const stateBefore = readControlState();
    const wantPaused = stateBefore.queuePaused;
    try {
      await workflowQueue.pause();

      if (!force) {
        const drained = await waitUntilIdle(timeoutMs, lock.token);
        if (!drained.ok) {
          if (!wantPaused) {
            await workflowQueue.resume();
          }
          return reply.code(409).send({
            error: "active jobs still running",
            active: drained.active,
            hint: "wait or retry with force=true",
          });
        }
      }

      const desired = readControlState();
      await stopPm2App(PM2_HTTP_NAME);
      await deletePm2App(PM2_HTTP_NAME);
      await stopPm2App(PM2_WORKER_NAME);
      await deletePm2App(PM2_WORKER_NAME);

      await reconcileOrphanRuns(workflowQueue);
      // Drop stale heartbeats from killed PIDs
      try {
        const { HEARTBEAT_KEY } = await import("./control-bus.js");
        const { getSharedConnection } = await import("./workflow-queue.js");
        await getSharedConnection().del(HEARTBEAT_KEY);
      } catch {
        // ignore
      }
      await migrate();

      await recreateChildren({
        generation: desired.generation,
        http: desired.http === "running",
        workers: desired.workers,
      });

      if (wantPaused) {
        await workflowQueue.pause();
        patchControlState({ queuePaused: true });
      } else {
        await workflowQueue.resume();
        patchControlState({ queuePaused: false });
      }

      await new Promise((r) => setTimeout(r, 1500));
      clearRestartNeeded();

      return reply.send({
        ok: true,
        forced: force,
        desired: readControlState(),
        status: await buildStatus(),
      });
    } catch (err) {
      log.error({ err }, "restart failed");
      return reply.code(500).send({
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      releaseOpsLock(lock.token);
    }
  },
);

server.post(
  "/ops/scale",
  { onRequest: [server.authenticate, server.requireAdmin] },
  async (req, reply) => {
    const body = /** @type {{ workers?: number, force?: boolean, timeoutMs?: number }} */ (
      req.body ?? {}
    );
    const workers = Math.floor(Number(body.workers));
    if (!Number.isFinite(workers) || workers < 0 || workers > 32) {
      return reply.code(400).send({ error: "workers must be 0..32" });
    }
    const force = Boolean(body.force);
    const timeoutMs = Math.min(
      Math.max(Number(body.timeoutMs) || DRAIN_DEFAULT_MS, 1_000),
      10 * 60_000,
    );

    const current = readControlState();
    const scalingDown = workers < current.workers;

    const lock = tryAcquireOpsLock(`scale:${process.pid}`);
    if (!lock.ok) {
      return reply.code(409).send({ error: lock.error, holder: lock.holder });
    }

    const wasPaused = await workflowQueue.isPaused();
    try {
      if (scalingDown) {
        await workflowQueue.pause();
        if (!force) {
          const drained = await waitUntilIdle(timeoutMs, lock.token);
          if (!drained.ok) {
            if (!wasPaused) {
              await workflowQueue.resume();
              patchControlState({ queuePaused: false });
            }
            return reply.code(409).send({
              error: "active jobs still running",
              active: drained.active,
              hint: "wait or retry with force=true",
            });
          }
        }
      }

      const state = patchControlState({ workers });
      await ensureWorkers({ generation: state.generation, count: workers });

      if (scalingDown && !wasPaused && !state.queuePaused) {
        await workflowQueue.resume();
        patchControlState({ queuePaused: false });
      }

      return reply.send({ ok: true, desired: readControlState() });
    } catch (err) {
      log.error({ err }, "scale failed");
      return reply.code(500).send({
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      releaseOpsLock(lock.token);
    }
  },
);

async function shutdown() {
  try {
    await workflowQueue.close();
    await closeRedis();
    await flushLogs();
    await db.destroy();
    disconnectPm2();
  } catch (err) {
    log.error({ err }, "control shutdown error");
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const port = Number(process.env.JFLOW_CONTROL_PORT ?? process.env.PORT ?? 8600);
server
  .listen({ host: "0.0.0.0", port })
  .then(() => {
    log.info(`Control is running on port ${port}`);
  })
  .catch((err) => {
    log.error({ err }, "failed to start control");
    process.exit(1);
  });
