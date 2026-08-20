import fs from "fs";
import path from "path";
import { DATA_DIR } from "./paths.js";

const STATE_PATH = path.join(DATA_DIR, "control-state.json");
const LOCK_PATH = path.join(DATA_DIR, "ops.lock");

/**
 * @typedef {{
 *   http: "running" | "stopped",
 *   workers: number,
 *   queuePaused: boolean,
 *   generation: number,
 *   restartNeeded: boolean,
 *   restartReason: string | null,
 * }} ControlState
 */

/** @returns {ControlState} */
export function defaultControlState() {
  return {
    http: "running",
    workers: 1,
    queuePaused: false,
    generation: 1,
    restartNeeded: false,
    restartReason: null,
  };
}

/**
 * @returns {ControlState}
 */
export function readControlState() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STATE_PATH)) {
    const initial = defaultControlState();
    writeControlState(initial);
    return initial;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
    const base = defaultControlState();
    return {
      http: raw.http === "stopped" ? "stopped" : "running",
      workers: Math.max(0, Math.min(32, Number(raw.workers) || 1)),
      queuePaused: Boolean(raw.queuePaused),
      generation: Math.max(1, Math.floor(Number(raw.generation) || 1)),
      restartNeeded: Boolean(raw.restartNeeded),
      restartReason:
        typeof raw.restartReason === "string" ? raw.restartReason : null,
    };
  } catch {
    return defaultControlState();
  }
}

/**
 * @param {ControlState} state
 */
export function writeControlState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${STATE_PATH}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, STATE_PATH);
}

/**
 * @param {Partial<ControlState>} patch
 * @returns {ControlState}
 */
export function patchControlState(patch) {
  const next = { ...readControlState(), ...patch };
  writeControlState(next);
  return next;
}

/**
 * Bump config generation and mark restart needed.
 * @param {string} reason
 * @returns {ControlState}
 */
export function bumpGeneration(reason) {
  const cur = readControlState();
  return patchControlState({
    generation: cur.generation + 1,
    restartNeeded: true,
    restartReason: reason,
  });
}

/**
 * Clear restart-needed after processes match generation.
 * @returns {ControlState}
 */
export function clearRestartNeeded() {
  return patchControlState({
    restartNeeded: false,
    restartReason: null,
  });
}

/**
 * @param {string} owner
 * @param {number} [ttlMs]
 * @returns {{ ok: true, token: string } | { ok: false, error: string, holder?: string }}
 */
export function tryAcquireOpsLock(owner, ttlMs = 120_000) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const now = Date.now();
  if (fs.existsSync(LOCK_PATH)) {
    try {
      const existing = JSON.parse(fs.readFileSync(LOCK_PATH, "utf8"));
      if (existing.expiresAt > now) {
        return {
          ok: false,
          error: "ops lock held",
          holder: String(existing.owner ?? "unknown"),
        };
      }
    } catch {
      // stale/corrupt lock — overwrite
    }
  }
  const token = `${owner}:${now}:${Math.random().toString(36).slice(2)}`;
  const payload = {
    owner,
    token,
    expiresAt: now + ttlMs,
  };
  fs.writeFileSync(LOCK_PATH, `${JSON.stringify(payload)}\n`, "utf8");
  return { ok: true, token };
}

/**
 * @param {string} token
 */
export function releaseOpsLock(token) {
  if (!fs.existsSync(LOCK_PATH)) return;
  try {
    const existing = JSON.parse(fs.readFileSync(LOCK_PATH, "utf8"));
    if (existing.token !== token) return;
  } catch {
    // ignore
  }
  fs.unlinkSync(LOCK_PATH);
}

/**
 * @param {string} token
 * @param {number} [ttlMs]
 */
export function refreshOpsLock(token, ttlMs = 120_000) {
  if (!fs.existsSync(LOCK_PATH)) return false;
  try {
    const existing = JSON.parse(fs.readFileSync(LOCK_PATH, "utf8"));
    if (existing.token !== token) return false;
    existing.expiresAt = Date.now() + ttlMs;
    fs.writeFileSync(LOCK_PATH, `${JSON.stringify(existing)}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}
