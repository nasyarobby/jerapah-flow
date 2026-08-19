import IORedis from "ioredis";
import { log } from "./logger.js";
import {
  getRedisPassword,
  getRedisUrl,
  getSharedConnection,
} from "./workflow-queue.js";

export const CHANNEL_RELOAD = "jflow:reload";
export const HEARTBEAT_KEY = "jflow:heartbeats";
export const HEARTBEAT_TTL_SEC = 20;
export const HEARTBEAT_INTERVAL_MS = 5_000;

/**
 * @returns {number}
 */
export function getConfigGeneration() {
  const raw = Number(process.env.JFLOW_CONFIG_GENERATION ?? 1);
  if (!Number.isFinite(raw) || raw < 1) return 1;
  return Math.floor(raw);
}

/**
 * Dedicated Redis connection for pub/sub (ioredis cannot mix pub/sub with other commands).
 * @returns {IORedis}
 */
export function createPubSubConnection() {
  /** @type {import("ioredis").RedisOptions} */
  const options = { maxRetriesPerRequest: null, enableReadyCheck: true };
  const password = getRedisPassword();
  if (password) options.password = password;
  const conn = new IORedis(getRedisUrl(), options);
  conn.on("error", (err) => {
    log.error({ err }, "redis pub/sub connection error");
  });
  return conn;
}

/**
 * @param {string} role
 * @param {{ pid?: number, hostname?: string }} [extra]
 */
export async function writeHeartbeat(role, extra = {}) {
  const conn = getSharedConnection();
  const payload = JSON.stringify({
    role,
    pid: extra.pid ?? process.pid,
    hostname: extra.hostname ?? process.env.HOSTNAME ?? "local",
    generation: getConfigGeneration(),
    ts: Date.now(),
  });
  const field = `${role}:${process.pid}`;
  await conn.hset(HEARTBEAT_KEY, field, payload);
  await conn.expire(HEARTBEAT_KEY, HEARTBEAT_TTL_SEC * 3);
}

/**
 * @returns {Promise<Array<{
 *   field: string,
 *   role: string,
 *   pid: number,
 *   hostname: string,
 *   generation: number,
 *   ts: number,
 *   stale: boolean,
 * }>>}
 */
export async function readHeartbeats() {
  const conn = getSharedConnection();
  const all = await conn.hgetall(HEARTBEAT_KEY);
  const now = Date.now();
  /** @type {Array<any>} */
  const out = [];
  for (const [field, raw] of Object.entries(all)) {
    try {
      const parsed = JSON.parse(raw);
      const ts = Number(parsed.ts) || 0;
      out.push({
        field,
        role: String(parsed.role ?? "unknown"),
        pid: Number(parsed.pid) || 0,
        hostname: String(parsed.hostname ?? ""),
        generation: Number(parsed.generation) || 0,
        ts,
        stale: now - ts > HEARTBEAT_TTL_SEC * 1000,
      });
    } catch {
      // skip bad rows
    }
  }
  return out;
}

/**
 * @param {{ type?: string }} [payload]
 */
export async function publishReload(payload = { type: "workflows" }) {
  const conn = getSharedConnection();
  await conn.publish(CHANNEL_RELOAD, JSON.stringify(payload));
}

/**
 * @param {(msg: { type?: string }) => void | Promise<void>} handler
 * @returns {Promise<{ stop: () => Promise<void> }>}
 */
export async function subscribeReload(handler) {
  const sub = createPubSubConnection();
  await sub.subscribe(CHANNEL_RELOAD);
  sub.on("message", (_channel, message) => {
    let parsed = { type: "workflows" };
    try {
      parsed = JSON.parse(message);
    } catch {
      // use default
    }
    void Promise.resolve(handler(parsed)).catch((err) => {
      log.error({ err }, "reload handler failed");
    });
  });
  return {
    async stop() {
      await sub.unsubscribe(CHANNEL_RELOAD).catch(() => {});
      await sub.quit().catch(() => sub.disconnect());
    },
  };
}

/**
 * Start periodic heartbeats. Returns a stop function.
 * @param {string} role
 */
export function startHeartbeatLoop(role) {
  const tick = () => {
    void writeHeartbeat(role).catch((err) => {
      log.error({ err, role }, "heartbeat failed");
    });
  };
  tick();
  const timer = setInterval(tick, HEARTBEAT_INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
