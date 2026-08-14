import { randomUUID } from "node:crypto";
import { db } from "./db.js";

const MAX_JSON_BYTES = 64 * 1024;

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function serialize(value) {
  if (value === undefined || value === null) return null;
  let json;
  try {
    json = JSON.stringify(value);
  } catch {
    json = JSON.stringify({ truncated: true, reason: "unserializable" });
  }
  if (Buffer.byteLength(json, "utf8") <= MAX_JSON_BYTES) return json;
  return JSON.stringify({
    truncated: true,
    preview: json.slice(0, 1024),
  });
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
 * }} opts
 */
export async function startRun({
  owner,
  workflow,
  workflowName = null,
  trigger,
  input = null,
  parentRunId = null,
}) {
  const id = randomUUID();
  const started_at = nowIso();
  await db("workflow_runs").insert({
    id,
    owner,
    workflow,
    workflow_name: workflowName ?? null,
    trigger_type: trigger.type,
    trigger_detail: trigger.detail ?? null,
    status: "running",
    started_at,
    input: serialize(input),
    parent_run_id: parentRunId ?? null,
  });
  return { id, started_at };
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
 * @param {"success" | "failed"} status
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
 *   status?: string,
 *   limit?: number,
 *   before?: string,
 * }} [filters]
 */
export async function listRuns(filters = {}) {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  let q = db("workflow_runs").select("*").orderBy("started_at", "desc");
  if (filters.owner) q = q.where("owner", filters.owner);
  if (filters.workflow) q = q.where("workflow", filters.workflow);
  if (filters.status) q = q.where("status", filters.status);
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
