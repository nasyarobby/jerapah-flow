import path from "path";
import pm2 from "pm2";
import { REPO_ROOT, SERVER_ROOT } from "./paths.js";

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
 * Restart a single PM2 process by id. Only jflow-http / jflow-worker.
 * @param {number} pmId
 * @returns {Promise<{ name: string, pmId: number }>}
 */
export async function restartPm2Process(pmId) {
  const id = Math.floor(Number(pmId));
  if (!Number.isFinite(id) || id < 0) {
    const err = new Error("invalid pmId");
    err.code = "BAD_REQUEST";
    throw err;
  }

  const list = await listPm2();
  const proc = list.find((p) => Number(p.pm_id) === id);
  if (!proc) {
    const err = new Error("process not found");
    err.code = "NOT_FOUND";
    throw err;
  }
  if (proc.name !== PM2_HTTP_NAME && proc.name !== PM2_WORKER_NAME) {
    const err = new Error("process is not a JerapahFlow child");
    err.code = "FORBIDDEN";
    throw err;
  }
  await new Promise((resolve, reject) => {
    pm2.restart(id, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  return { name: proc.name, pmId: id };
}

/**
 * PM2 injects these into process.env of a managed app. Spreading them into
 * `pm2.start({ env })` overwrites `name` / `pm_exec_path` so God restarts
 * jflow-control instead of launching http/worker (EADDRINUSE :8600 loop).
 */
const PM2_META_KEYS = new Set([
  "name",
  "namespace",
  "exec_mode",
  "exec_interpreter",
  "instances",
  "instance_var",
  "node_app_instance",
  "unique_id",
  "status",
  "username",
  "windowsHide",
  "merge_logs",
  "vizion",
  "vizion_running",
  "autostart",
  "autorestart",
  "automation",
  "km_link",
]);

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {NodeJS.ProcessEnv}
 */
export function withoutPm2Meta(env) {
  /** @type {NodeJS.ProcessEnv} */
  const out = {};
  for (const [key, val] of Object.entries(env)) {
    if (val == null) continue;
    if (PM2_META_KEYS.has(key)) continue;
    if (key.startsWith("pm_") || key.startsWith("axm_") || key.startsWith("PM2_")) {
      continue;
    }
    out[key] = val;
  }
  return out;
}

/**
 * Shared env for child processes.
 * @param {{ generation: number }} opts
 */
export function childEnv(opts) {
  return {
    ...withoutPm2Meta(process.env),
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
    pmId: Number(p.pm_id),
    status: p.pm2_env?.status ?? "unknown",
    pid: p.pid ?? null,
    restarts: p.pm2_env?.restart_time ?? 0,
    uptime: p.pm2_env?.pm_uptime ?? null,
    generation: Number(p.pm2_env?.JFLOW_CONFIG_GENERATION ?? 0) || null,
    memory: Number(p.monit?.memory) || 0,
    cpu: Number(p.monit?.cpu) || 0,
  });

  const httpMapped = http.map(mapOne);
  const workersMapped = workers.map(mapOne);
  const all = [...httpMapped, ...workersMapped];

  return {
    http: httpMapped,
    workers: workersMapped,
    httpOnline: http.some((p) => p.pm2_env?.status === "online"),
    workerOnlineCount: workers.filter((p) => p.pm2_env?.status === "online").length,
    totals: {
      memory: all.reduce((sum, p) => sum + p.memory, 0),
      cpu: all.reduce((sum, p) => sum + p.cpu, 0),
    },
  };
}

export function getRepoRoot() {
  return REPO_ROOT;
}
