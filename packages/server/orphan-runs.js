import * as store from "./store.js";
import { log } from "./logger.js";

/**
 * Mark SQLite runs stuck in `running` when BullMQ no longer has them active.
 *
 * @param {import("bullmq").Queue} queue
 * @returns {Promise<{ repaired: number, ids: string[] }>}
 */
export async function reconcileOrphanRuns(queue) {
  const runs = await store.listRuns({ status: "running", limit: 200 });
  if (!runs.length) return { repaired: 0, ids: [] };

  /** @type {Set<string>} */
  const activeIds = new Set();
  try {
    const active = await queue.getJobs(["active"]);
    for (const job of active) {
      if (job?.id != null) activeIds.add(String(job.id));
    }
  } catch (err) {
    log.error({ err }, "failed to list active jobs for orphan reconcile");
    return { repaired: 0, ids: [] };
  }

  /** @type {string[]} */
  const ids = [];
  for (const run of runs) {
    const jobId = run.job_id ? String(run.job_id) : run.id;
    if (activeIds.has(jobId)) continue;

    let stillAlive = false;
    try {
      const job = await queue.getJob(jobId);
      if (job) {
        const state = await job.getState();
        // waiting/delayed means not started as running worker — still orphan for SQLite running
        stillAlive = state === "active";
      }
    } catch {
      stillAlive = false;
    }
    if (stillAlive) continue;

    await store.finishRun(
      run.id,
      "failed",
      null,
      new Error("worker_lost: run interrupted by process stop or crash"),
    );
    ids.push(run.id);
  }

  if (ids.length) {
    log.warn({ count: ids.length, ids }, "reconciled orphan running runs");
  }
  return { repaired: ids.length, ids };
}
