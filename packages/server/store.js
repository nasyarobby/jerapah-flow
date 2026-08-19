import { randomUUID } from "node:crypto";
import { db } from "./db.js";
import { jsonPreviewReplacer } from "./json-preview.js";
import { redactString } from "./secret-value.js";

const MAX_JSON_BYTES = 64 * 1024;

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function serialize(value) {
  if (value === undefined || value === null) return null;
  let json;
  try {
    json = JSON.stringify(value, jsonPreviewReplacer);
  } catch {
    json = JSON.stringify({ truncated: true, reason: "unserializable" });
  }
  json = redactString(json);
  if (Buffer.byteLength(json, "utf8") <= MAX_JSON_BYTES) return json;
  return JSON.stringify({
    truncated: true,
    preview: json.slice(0, 1024),
  });
}

/**
 * Parsed JSON-safe copy for API / UI (buffers summarized, size-capped).
 * @param {unknown} value
 */
export function toDisplayValue(value) {
  const json = serialize(value);
  if (json == null) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * @param {string | null} value
 * @returns {unknown}
 */
function deserialize(value) {
  if (value == null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * @param {{
 *   owner: string,
 *   workflow: string,
 *   workflowName?: string | null,
 *   trigger: { type: string, detail?: string | null },
 *   input?: unknown,
 *   parentRunId?: string | null,
 *   status?: "queued" | "running",
 * }} opts
 */
export async function startRun({
  owner,
  workflow,
  workflowName = null,
  trigger,
  input = null,
  parentRunId = null,
  status = "queued",
}) {
  const id = randomUUID();
  const now = nowIso();
  const isQueued = status === "queued";
  await db("workflow_runs").insert({
    id,
    owner,
    workflow,
    workflow_name: workflowName ?? null,
    trigger_type: trigger.type,
    trigger_detail: trigger.detail ?? null,
    status,
    started_at: now,
    queued_at: isQueued ? now : null,
    input: serialize(input),
    parent_run_id: parentRunId ?? null,
  });
  return { id, started_at: now, queued_at: isQueued ? now : null };
}

/**
 * @param {string} id
 * @param {string} jobId
 */
export async function setRunJobId(id, jobId) {
  await db("workflow_runs").where({ id }).update({ job_id: jobId });
}

/**
 * @param {string} id
 */
export async function markRunRunning(id) {
  const started_at = nowIso();
  const updated = await db("workflow_runs")
    .where({ id })
    .whereIn("status", ["queued", "running"])
    .update({
      status: "running",
      started_at,
    });
  return { updated: Number(updated) > 0, started_at };
}

/**
 * @param {string} id
 * @param {"success" | "failed"} status
 * @param {unknown} [output]
 * @param {Error | unknown} [err]
 */
export async function finishRun(id, status, output = null, err = null) {
  const finished_at = nowIso();
  const row = await db("workflow_runs").where({ id }).first("started_at");
  const duration_ms = row
    ? Date.parse(finished_at) - Date.parse(row.started_at)
    : null;
  await db("workflow_runs")
    .where({ id })
    .update({
      status,
      finished_at,
      duration_ms,
      output: serialize(output),
      error: err
        ? err instanceof Error
          ? err.message
          : String(err)
        : null,
    });
}

/**
 * @param {{
 *   runId: string,
 *   index: number,
 *   script: string,
 *   config?: unknown,
 * }} opts
 */
export async function startStep({ runId, index, script, config = null }) {
  const id = randomUUID();
  const started_at = nowIso();
  await db("step_runs").insert({
    id,
    run_id: runId,
    step_index: index,
    script,
    config: serialize(config),
    status: "running",
    started_at,
  });
  return { id, started_at };
}

/**
 * @param {string} id
 * @param {"success" | "failed" | "skipped"} status
 * @param {unknown} [output]
 * @param {Error | unknown} [err]
 */
export async function finishStep(id, status, output = null, err = null) {
  const finished_at = nowIso();
  const row = await db("step_runs").where({ id }).first("started_at");
  const duration_ms = row
    ? Date.parse(finished_at) - Date.parse(row.started_at)
    : null;
  await db("step_runs")
    .where({ id })
    .update({
      status,
      finished_at,
      duration_ms,
      output: serialize(output),
      error: err
        ? err instanceof Error
          ? err.message
          : String(err)
        : null,
    });
}

/**
 * @param {Array<{
 *   runId: string,
 *   stepId?: string | null,
 *   ts: string,
 *   level: number,
 *   msg?: string | null,
 *   payload?: unknown,
 * }>} rows
 */
export async function insertLogs(rows) {
  if (!rows.length) return;
  await db("logs").insert(
    rows.map((r) => ({
      run_id: r.runId,
      step_id: r.stepId ?? null,
      ts: r.ts,
      level: r.level,
      msg: r.msg ?? null,
      payload: serialize(r.payload),
    })),
  );
}

/**
 * @param {{
 *   owner?: string,
 *   workflow?: string,
 *   status?: string | string[],
 *   limit?: number,
 *   before?: string,
 * }} [filters]
 */
export async function listRuns(filters = {}) {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  let q = db("workflow_runs").select("*").orderBy("started_at", "desc");
  if (filters.owner) q = q.where("owner", filters.owner);
  if (filters.workflow) {
    const key = String(filters.workflow);
    if (key.includes("*")) {
      const pattern = key
        .replaceAll("\\", "\\\\")
        .replaceAll("%", "\\%")
        .replaceAll("_", "\\_")
        .replaceAll("*", "%");
      q = q.whereRaw("workflow LIKE ? ESCAPE '\\'", [pattern]);
    } else {
      q = q.where("workflow", key);
    }
  }
  if (filters.status) {
    if (Array.isArray(filters.status)) {
      q = q.whereIn("status", filters.status);
    } else {
      q = q.where("status", filters.status);
    }
  }
  if (filters.before) q = q.where("started_at", "<", filters.before);
  const rows = await q.limit(limit);
  return rows.map((row) => ({
    ...row,
    input: deserialize(row.input),
    output: deserialize(row.output),
  }));
}

/**
 * @param {string} id
 */
export async function getRun(id) {
  const run = await db("workflow_runs").where({ id }).first();
  if (!run) return null;

  const steps = await db("step_runs")
    .where({ run_id: id })
    .orderBy("step_index", "asc");
  const logs = await db("logs").where({ run_id: id }).orderBy("ts", "asc").orderBy("id", "asc");

  return {
    ...run,
    input: deserialize(run.input),
    output: deserialize(run.output),
    steps: steps.map((s) => ({
      ...s,
      config: deserialize(s.config),
      output: deserialize(s.output),
    })),
    logs: logs.map((l) => ({
      ...l,
      payload: deserialize(l.payload),
    })),
  };
}

/**
 * @param {number} days
 * @returns {Promise<number>} number of deleted runs
 */
export async function pruneOlderThan(days) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  return db("workflow_runs").where("started_at", "<", cutoff).del();
}

/**
 * @param {string} workflow
 * @param {string} triggerType
 * @param {string | null | undefined} triggerDetail
 */
export async function countConsecutiveFailures(workflow, triggerType, triggerDetail) {
  let q = db("workflow_runs")
    .select("status")
    .where({ workflow, trigger_type: triggerType })
    .whereIn("status", ["success", "failed"])
    .orderBy("started_at", "desc")
    .limit(100);

  if (triggerDetail == null || triggerDetail === "") {
    q = q.whereNull("trigger_detail");
  } else {
    q = q.where("trigger_detail", triggerDetail);
  }

  const rows = await q;
  let count = 0;
  for (const row of rows) {
    if (row.status === "failed") count += 1;
    else break;
  }
  return count;
}

const CONSECUTIVE_FAILURE_WINDOW = 5000;
const STREAK_LAST_RUN_FIELDS = [
  "id",
  "owner",
  "workflow",
  "workflow_name",
  "trigger_type",
  "trigger_detail",
  "status",
  "started_at",
  "finished_at",
  "duration_ms",
  "error",
];

/**
 * Workflow+trigger groups currently in a trailing failure streak.
 *
 * @param {{
 *   minCount?: number,
 *   limit?: number,
 * }} [opts]
 * @returns {Promise<{
 *   items: Array<{
 *     consecutiveFailures: number,
 *     workflow: string,
 *     workflow_name: string | null,
 *     owner: string,
 *     trigger_type: string,
 *     trigger_detail: string | null,
 *     lastRun: {
 *       id: string,
 *       owner: string,
 *       workflow: string,
 *       workflow_name: string | null,
 *       trigger_type: string,
 *       trigger_detail: string | null,
 *       status: string,
 *       started_at: string,
 *       finished_at: string | null,
 *       duration_ms: number | null,
 *       error: string | null,
 *     },
 *   }>,
 *   total: number,
 * }>}
 */
export async function listConsecutiveFailureStreaks(opts = {}) {
  const minCount = Math.max(opts.minCount ?? 4, 1);
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200);

  const rows = await db("workflow_runs")
    .select(STREAK_LAST_RUN_FIELDS)
    .whereIn("status", ["success", "failed"])
    .orderBy("started_at", "desc")
    .limit(CONSECUTIVE_FAILURE_WINDOW);

  /** @type {Map<string, { count: number, done: boolean, lastRun: (typeof rows)[number] }>} */
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.workflow}\0${row.trigger_type}\0${row.trigger_detail ?? ""}`;
    let group = groups.get(key);
    if (!group) {
      group = { count: 0, done: false, lastRun: row };
      groups.set(key, group);
    }
    if (group.done) continue;
    if (row.status === "failed") group.count += 1;
    else group.done = true;
  }

  const streaks = [...groups.values()]
    .filter((g) => g.lastRun.status === "failed" && g.count >= minCount)
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return String(b.lastRun.started_at).localeCompare(String(a.lastRun.started_at));
    });

  return {
    total: streaks.length,
    items: streaks.slice(0, limit).map((g) => ({
      consecutiveFailures: g.count,
      workflow: g.lastRun.workflow,
      workflow_name: g.lastRun.workflow_name,
      owner: g.lastRun.owner,
      trigger_type: g.lastRun.trigger_type,
      trigger_detail: g.lastRun.trigger_detail,
      lastRun: g.lastRun,
    })),
  };
}

/**
 * @returns {Promise<Record<string, { invocationCount: number, lastInvokedAt: string | null, lastStatus: string | null }>>}
 */
export async function workflowStats() {
  const rows = await db("workflow_runs")
    .select("workflow", "status", "started_at")
    .orderBy("started_at", "desc");

  /** @type {Record<string, { invocationCount: number, lastInvokedAt: string | null, lastStatus: string | null }>} */
  const out = {};
  for (const row of rows) {
    const existing = out[row.workflow];
    if (!existing) {
      out[row.workflow] = {
        invocationCount: 1,
        lastInvokedAt: row.started_at ?? null,
        lastStatus: row.status ?? null,
      };
    } else {
      existing.invocationCount += 1;
    }
  }
  return out;
}

export async function countUsers() {
  const row = await db("users").count({ n: "*" }).first();
  return Number(row?.n ?? 0);
}

export async function countAdmins() {
  const row = await db("users").where({ role: "admin" }).count({ n: "*" }).first();
  return Number(row?.n ?? 0);
}

/**
 * @param {{ username: string, passwordHash: string, role: string }} opts
 */
export async function createUser({ username, passwordHash, role }) {
  const id = randomUUID();
  const now = nowIso();
  await db("users").insert({
    id,
    username,
    password_hash: passwordHash,
    role,
    created_at: now,
    updated_at: now,
  });
  return getUserById(id);
}

export async function getUserById(id) {
  const row = await db("users").where({ id }).first();
  return row ? publicUser(row) : null;
}

export async function getUserAuthByUsername(username) {
  return db("users").where({ username }).first();
}

export async function getUserAuthById(id) {
  return db("users").where({ id }).first();
}

export async function listUsers() {
  const rows = await db("users")
    .select("id", "username", "role", "created_at", "updated_at")
    .orderBy("username", "asc");
  return rows;
}

/**
 * @param {string} id
 * @param {{ passwordHash?: string, role?: string }} patch
 */
export async function updateUser(id, patch) {
  const update = { updated_at: nowIso() };
  if (patch.passwordHash) update.password_hash = patch.passwordHash;
  if (patch.role) update.role = patch.role;
  await db("users").where({ id }).update(update);
  return getUserById(id);
}

export async function deleteUser(id) {
  return db("users").where({ id }).del();
}

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

