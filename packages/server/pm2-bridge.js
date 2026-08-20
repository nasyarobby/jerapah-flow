import path from "path";
import pm2 from "pm2";
import { SERVER_ROOT } from "./paths.js";

const REPO_ROOT = path.resolve(SERVER_ROOT, "../..");

export const PM2_HTTP_NAME = "jflow-http";
export const PM2_WORKER_NAME = "jflow-worker";

/**
 * @returns {Promise<void>}
 */
export function connectPm2() {
  return new Promise((resolve, reject) => {
    pm2.connect((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function disconnectPm2() {
  try {
    pm2.disconnect();
  } catch {
    // ignore
  }
}

/**
 * @returns {Promise<import("pm2").ProcessDescription[]>}
 */
export function listPm2() {
  return new Promise((resolve, reject) => {
    pm2.list((err, list) => {
      if (err) reject(err);
      else resolve(list ?? []);
    });
  });
}

/**
 * @param {string} name
 * @returns {Promise<import("pm2").ProcessDescription[]>}
 */
export async function listPm2ByName(name) {
  const list = await listPm2();
  return list.filter((p) => p.name === name);
}

/**
 * @param {object} app
 * @returns {Promise<void>}
 */
function startPm2App(app) {
  return new Promise((resolve, reject) => {
    pm2.start(app, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * @param {string} name
 * @returns {Promise<void>}
 */
export function stopPm2App(name) {
  return new Promise((resolve, reject) => {
    pm2.stop(name, (err) => {
      if (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/not found|doesn't exist|process or namespace/i.test(msg)) {
          resolve();
          return;
        }
        reject(err);
        return;
      }
      resolve();
    });
  });
}

/**
 * @param {string} name
 * @returns {Promise<void>}
 */
export function deletePm2App(name) {
  return new Promise((resolve, reject) => {
    pm2.delete(name, (err) => {
      if (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/not found|doesn't exist|process or namespace/i.test(msg)) {
          resolve();
          return;
        }
        reject(err);
        return;
      }
      resolve();
    });
  });
}

/**
 * @param {string} name
 * @param {number} instances
 * @returns {Promise<void>}
 */
export function scalePm2App(name, instances) {
  return new Promise((resolve, reject) => {
    pm2.scale(name, instances, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * @param {string} name
 * @returns {Promise<void>}
 */
export function restartPm2App(name) {
  return new Promise((resolve, reject) => {
    pm2.restart(name, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Shared env for child processes.
 * @param {{ generation: number }} opts
 */
export function childEnv(opts) {
  return {
    ...process.env,
    JFLOW_CONFIG_GENERATION: String(opts.generation),
    JFLOW_CORS_ORIGIN: process.env.JFLOW_CORS_ORIGIN ?? "http://localhost:8500",
    PORT: process.env.JFLOW_HTTP_PORT ?? "8700",
  };
}

/**
 * Ensure HTTP app exists and matches desired running/stopped state.
 * @param {{ generation: number, running: boolean }} opts
 */
export async function ensureHttp(opts) {
  const existing = await listPm2ByName(PM2_HTTP_NAME);
  if (!opts.running) {
    if (existing.length) await stopPm2App(PM2_HTTP_NAME);
    return;
  }

  if (existing.length === 0) {
    await startPm2App({
      name: PM2_HTTP_NAME,
      script: path.join(SERVER_ROOT, "server.js"),
      cwd: REPO_ROOT,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 20,
      env: {
        ...childEnv(opts),
        JFLOW_ROLE: "api",
      },
    });
    return;
  }

  const online = existing.some((p) => p.pm2_env?.status === "online");
  if (!online) {
    await restartPm2App(PM2_HTTP_NAME);
  }
}

/**
 * Ensure worker app has `count` online forks (0 = stopped/deleted).
 * @param {{ generation: number, count: number }} opts
 */
export async function ensureWorkers(opts) {
  const count = Math.max(0, Math.min(32, Math.floor(opts.count)));
  const existing = await listPm2ByName(PM2_WORKER_NAME);

  if (count === 0) {
    if (existing.length) {
      await stopPm2App(PM2_WORKER_NAME);
      await deletePm2App(PM2_WORKER_NAME);
    }
    return;
  }

  if (existing.length === 0) {
    await startPm2App({
      name: PM2_WORKER_NAME,
      script: path.join(SERVER_ROOT, "worker.js"),
      cwd: REPO_ROOT,
      instances: count,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 50,
      env: {
        ...childEnv(opts),
        JFLOW_ROLE: "worker",
      },
    });
    return;
  }

  const current = existing.length;
  if (current !== count) {
    await scalePm2App(PM2_WORKER_NAME, count);
  }

  const stopped = existing.filter((p) => p.pm2_env?.status !== "online");
  if (stopped.length) {
    await restartPm2App(PM2_WORKER_NAME);
  }
}

/**
 * Hard recycle HTTP + workers with updated generation env.
 * Children must be stopped first for a clean migrate window.
 *
 * @param {{ generation: number, http: boolean, workers: number }} opts
 */
export async function recreateChildren(opts) {
  await stopPm2App(PM2_HTTP_NAME);
  await deletePm2App(PM2_HTTP_NAME);
  await stopPm2App(PM2_WORKER_NAME);
  await deletePm2App(PM2_WORKER_NAME);

  if (opts.http) {
    await ensureHttp({ generation: opts.generation, running: true });
  }
  if (opts.workers > 0) {
    await ensureWorkers({ generation: opts.generation, count: opts.workers });
  }
}

/**
 * Summarize PM2 process status for the ops UI.
 */
export async function describeChildren() {
  const list = await listPm2();
  const http = list.filter((p) => p.name === PM2_HTTP_NAME);
  const workers = list.filter((p) => p.name === PM2_WORKER_NAME);

  const mapOne = (p) => ({
    name: p.name,
    pmId: p.pm_id,
    status: p.pm2_env?.status ?? "unknown",
    pid: p.pid ?? null,
    restarts: p.pm2_env?.restart_time ?? 0,
    uptime: p.pm2_env?.pm_uptime ?? null,
    generation: Number(p.pm2_env?.JFLOW_CONFIG_GENERATION ?? 0) || null,
  });

  return {
    http: http.map(mapOne),
    workers: workers.map(mapOne),
    httpOnline: http.some((p) => p.pm2_env?.status === "online"),
    workerOnlineCount: workers.filter((p) => p.pm2_env?.status === "online").length,
  };
}

export function getRepoRoot() {
  return REPO_ROOT;
}
