import fs from "fs";
import path from "path";
import { randomUUID } from "node:crypto";
import { db } from "./db.js";
import { deleteRevisionHistory } from "./workflow-history.js";
import { DATA_DIR, WORKFLOWS_DIR } from "./paths.js";
import * as fsStore from "./fs-store.js";

export const TRASH_WORKFLOWS_DIR = path.join(DATA_DIR, "trash", "workflows");
export const TRASH_RETENTION_DAYS = 7;

function nowIso() {
  return new Date().toISOString();
}

function trashFilePath(owner, file) {
  return path.join(TRASH_WORKFLOWS_DIR, owner, file);
}

/**
 * @param {string} deletedAtIso
 */
export function trashAgeMs(deletedAtIso) {
  return Date.now() - Date.parse(deletedAtIso);
}

/**
 * @param {string} deletedAtIso
 */
export function trashDaysRemaining(deletedAtIso) {
  const purgeAt =
    Date.parse(deletedAtIso) + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((purgeAt - Date.now()) / (24 * 60 * 60 * 1000)));
}

function rowToItem(row) {
  return {
    id: row.id,
    workflow_id: row.workflow_id,
    owner: row.owner,
    file: row.file,
    name: row.name ?? null,
    deleted_at: row.deleted_at,
    trash_path: row.trash_path,
    age_ms: trashAgeMs(row.deleted_at),
    days_until_purge: trashDaysRemaining(row.deleted_at),
  };
}

export async function listTrash() {
  const rows = await db("workflow_trash").orderBy("deleted_at", "desc");
  return rows.map(rowToItem);
}

export async function getTrashItem(id) {
  const row = await db("workflow_trash").where({ id }).first();
  return row ? rowToItem(row) : null;
}

export async function isInTrash(owner, file) {
  const row = await db("workflow_trash").where({ owner, file }).first();
  return Boolean(row);
}

/**
 * Soft-delete: move YAML to trash dir, unregister, keep revision history.
 * @param {{
 *   workflowId: string,
 *   owner: string,
 *   file: string,
 *   name?: string | null,
 * }} opts
 */
export async function moveWorkflowToTrash(opts) {
  const sourcePath = path.join(WORKFLOWS_DIR, opts.owner, opts.file);
  if (!fs.existsSync(sourcePath)) {
    const err = new Error("workflow not found");
    err.statusCode = 404;
    throw err;
  }

  const trashPath = trashFilePath(opts.owner, opts.file);
  fs.mkdirSync(path.dirname(trashPath), { recursive: true });
  fs.renameSync(sourcePath, trashPath);

  const registered = fsStore.readRegisters(opts.owner).filter((f) => f !== opts.file);
  fsStore.writeRegisters(opts.owner, registered);

  const id = randomUUID();
  const deleted_at = nowIso();
  await db("workflow_trash").insert({
    id,
    workflow_id: opts.workflowId,
    owner: opts.owner,
    file: opts.file,
    name: opts.name ?? null,
    deleted_at,
    trash_path: trashPath,
  });

  return rowToItem(await db("workflow_trash").where({ id }).first());
}

/**
 * Restore workflow from trash.
 * @param {string} trashId
 */
export async function restoreFromTrash(trashId) {
  const row = await db("workflow_trash").where({ id: trashId }).first();
  if (!row) {
    const err = new Error("trash item not found");
    err.statusCode = 404;
    throw err;
  }

  const destPath = path.join(WORKFLOWS_DIR, row.owner, row.file);
  if (fs.existsSync(destPath)) {
    const err = new Error("workflow file already exists");
    err.statusCode = 409;
    throw err;
  }
  if (!fs.existsSync(row.trash_path)) {
    const err = new Error("trash file missing on disk");
    err.statusCode = 410;
    throw err;
  }

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.renameSync(row.trash_path, destPath);

  const registered = fsStore.readRegisters(row.owner);
  if (!registered.includes(row.file)) {
    registered.push(row.file);
    fsStore.writeRegisters(row.owner, registered);
  }

  await db("workflow_trash").where({ id: trashId }).del();

  return {
    owner: row.owner,
    file: row.file,
    workflow_id: row.workflow_id,
    content: fs.readFileSync(destPath, "utf8"),
  };
}

/**
 * Permanently delete a trash item and its revision history.
 * @param {string} trashId
 */
export async function purgeTrashItem(trashId) {
  const row = await db("workflow_trash").where({ id: trashId }).first();
  if (!row) {
    const err = new Error("trash item not found");
    err.statusCode = 404;
    throw err;
  }

  if (fs.existsSync(row.trash_path)) {
    fs.unlinkSync(row.trash_path);
  }

  await deleteRevisionHistory(row.workflow_id);
  await db("workflow_trash").where({ id: trashId }).del();
  return { ok: true };
}

/**
 * Auto-purge trash older than retention window.
 * @returns {Promise<number>}
 */
export async function purgeExpiredTrash() {
  const cutoff = new Date(
    Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const rows = await db("workflow_trash")
    .where("deleted_at", "<", cutoff)
    .select("id");
  for (const row of rows) {
    await purgeTrashItem(row.id);
  }
  return rows.length;
}
