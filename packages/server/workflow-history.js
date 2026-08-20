import { randomUUID } from "node:crypto";
import { db } from "./db.js";
import * as fsStore from "./fs-store.js";
import { workflowContentSha, workflowIdFromFile } from "./workflow-normalize.js";

const MAX_REVISIONS = 50;

function nowIso() {
  return new Date().toISOString();
}

/**
 * @param {string | null} meta
 */
function parseMeta(meta) {
  if (!meta) return null;
  try {
    return JSON.parse(meta);
  } catch {
    return null;
  }
}

/**
 * @param {string} workflowId
 */
export async function getLatestRevision(workflowId) {
  const row = await db("workflow_revisions")
    .where({ workflow_id: workflowId })
    .orderBy("revision", "desc")
    .first();
  if (!row) return null;
  return {
    ...row,
    meta: parseMeta(row.meta),
  };
}

/**
 * @param {string} workflowId
 */
export async function listRevisions(workflowId) {
  const rows = await db("workflow_revisions")
    .where({ workflow_id: workflowId })
    .orderBy("revision", "desc");
  return rows.map((row) => ({
    id: row.id,
    workflow_id: row.workflow_id,
    owner: row.owner,
    file: row.file,
    revision: row.revision,
    content_sha: row.content_sha,
    reason: row.reason ?? null,
    meta: parseMeta(row.meta),
    created_at: row.created_at,
  }));
}

/**
 * @param {string} workflowId
 * @param {number} revision
 */
export async function getRevision(workflowId, revision) {
  const row = await db("workflow_revisions")
    .where({ workflow_id: workflowId, revision })
    .first();
  if (!row) return null;
  return {
    ...row,
    meta: parseMeta(row.meta),
  };
}

/**
 * Ensure a workflow has at least revision #1 (seed from disk when history is empty).
 * @param {{ owner: string, file: string }} opts
 * @returns {Promise<{ revision: number, id: string, content_sha: string, created_at: string, seeded: boolean } | null>}
 */
export async function ensureInitialRevision(opts) {
  const workflowId = workflowIdFromFile(opts.file);
  const latest = await getLatestRevision(workflowId);
  if (latest) {
    return {
      revision: latest.revision,
      id: latest.id,
      content_sha: latest.content_sha,
      created_at: latest.created_at,
      seeded: false,
    };
  }

  const content = fsStore.readWorkflowYaml(opts.owner, opts.file);
  if (content == null) return null;

  const recorded = await recordRevision({
    workflowId,
    owner: opts.owner,
    file: opts.file,
    content,
    reason: "seed",
    force: true,
  });

  if (recorded.revision == null || recorded.id == null) return null;

  const row = await getLatestRevision(workflowId);
  if (!row) return null;

  return {
    revision: row.revision,
    id: row.id,
    content_sha: row.content_sha,
    created_at: row.created_at,
    seeded: true,
  };
}

/**
 * Insert a revision when content changed (SHA dedup skips identical saves).
 * @param {{
 *   workflowId: string,
 *   owner: string,
 *   file: string,
 *   content: string,
 *   reason?: string | null,
 *   meta?: Record<string, unknown> | null,
 *   force?: boolean,
 * }} opts
 * @returns {Promise<{ skipped: boolean, revision: number | null, id: string | null }>}
 */
export async function recordRevision(opts) {
  const sha = workflowContentSha(opts.content);
  const latest = await getLatestRevision(opts.workflowId);
  if (!opts.force && latest && latest.content_sha === sha) {
    return { skipped: true, revision: latest.revision, id: latest.id };
  }

  const nextRevision = latest ? latest.revision + 1 : 1;
  const id = randomUUID();
  const created_at = nowIso();

  await db("workflow_revisions").insert({
    id,
    workflow_id: opts.workflowId,
    owner: opts.owner,
    file: opts.file,
    revision: nextRevision,
    content_sha: sha,
    content: opts.content,
    reason: opts.reason ?? null,
    meta: opts.meta ? JSON.stringify(opts.meta) : null,
    created_at,
  });

  const overflow = await db("workflow_revisions")
    .where({ workflow_id: opts.workflowId })
    .orderBy("revision", "desc")
    .offset(MAX_REVISIONS)
    .pluck("id");

  if (overflow.length) {
    await db("workflow_revisions").whereIn("id", overflow).del();
  }

  return { skipped: false, revision: nextRevision, id };
}

/**
 * @param {string} workflowId
 */
export async function deleteRevisionHistory(workflowId) {
  return db("workflow_revisions").where({ workflow_id: workflowId }).del();
}
