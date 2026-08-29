import fs from "fs";
import path from "path";
import { DEFAULT_OWNER } from "@jerapah-flow/shared";
import { db } from "./db.js";
import { log } from "./logger.js";
import { EXAMPLE_WORKFLOWS_DIR, WORKFLOWS_DIR } from "./paths.js";
import { TRASH_WORKFLOWS_DIR } from "./workflow-trash.js";
import { rewriteLegacyConfigRefsInText } from "./config-ref-rewrite.js";

const LEGACY_OWNER = "default";

/**
 * @param {string} dir
 * @returns {string[]}
 */
function listFilesRecursive(dir) {
  if (!fs.existsSync(dir)) return [];
  /** @type {string[]} */
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(full));
    else out.push(full);
  }
  return out;
}

/**
 * Move files from legacy owner dir into DEFAULT_OWNER. Skip name collisions.
 * @param {string} rootDir
 * @returns {{ moved: number, skipped: number }}
 */
function mergeOwnerDir(rootDir) {
  const fromDir = path.join(rootDir, LEGACY_OWNER);
  const toDir = path.join(rootDir, DEFAULT_OWNER);
  if (!fs.existsSync(fromDir)) return { moved: 0, skipped: 0 };

  fs.mkdirSync(toDir, { recursive: true });
  let moved = 0;
  let skipped = 0;

  for (const name of fs.readdirSync(fromDir)) {
    const from = path.join(fromDir, name);
    const to = path.join(toDir, name);
    const st = fs.statSync(from);
    if (!st.isFile()) {
      skipped += 1;
      log.warn({ from }, "owner migrate: skip non-file under legacy owner dir");
      continue;
    }
    if (fs.existsSync(to)) {
      skipped += 1;
      log.warn(
        { from, to },
        "owner migrate: skip YAML collision (local already has file)",
      );
      continue;
    }
    fs.renameSync(from, to);
    moved += 1;
  }

  const remaining = fs.existsSync(fromDir) ? fs.readdirSync(fromDir) : [];
  if (remaining.length === 0 && fs.existsSync(fromDir)) {
    fs.rmdirSync(fromDir);
  }

  return { moved, skipped };
}

/**
 * @param {string} filePath
 * @returns {boolean}
 */
function rewriteFileInPlace(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const { text, changed } = rewriteLegacyConfigRefsInText(raw);
  if (!changed) return false;
  fs.writeFileSync(filePath, text, "utf8");
  return true;
}

/**
 * @param {string} rootDir
 * @returns {number}
 */
function rewriteYamlTree(rootDir) {
  let n = 0;
  for (const file of listFilesRecursive(rootDir)) {
    if (!/\.ya?ml$/i.test(file)) continue;
    if (rewriteFileInPlace(file)) n += 1;
  }
  return n;
}

/**
 * @param {import("knex").Knex} knex
 * @param {string} table
 * @param {"name" | "file" | null} uniqueCol
 */
async function migrateOwnerColumn(knex, table, uniqueCol) {
  const legacyRows = await knex(table).where({ owner: LEGACY_OWNER }).select("*");
  let moved = 0;
  let skipped = 0;
  for (const row of legacyRows) {
    if (uniqueCol != null) {
      const conflict = await knex(table)
        .where({ owner: DEFAULT_OWNER, [uniqueCol]: row[uniqueCol] })
        .first();
      if (conflict) {
        skipped += 1;
        log.warn(
          { table, id: row.id, [uniqueCol]: row[uniqueCol] },
          "owner migrate: skip row collision",
        );
        continue;
      }
    }
    await knex(table).where({ id: row.id }).update({ owner: DEFAULT_OWNER });
    moved += 1;
  }
  return { moved, skipped };
}

/**
 * @param {import("knex").Knex} knex
 */
async function migrateWorkflowRuns(knex) {
  const n = await knex("workflow_runs")
    .where({ owner: LEGACY_OWNER })
    .update({ owner: DEFAULT_OWNER });
  return { moved: Number(n) || 0, skipped: 0 };
}

/**
 * @param {import("knex").Knex} knex
 */
async function migrateWorkflowRevisionsOwner(knex) {
  const n = await knex("workflow_revisions")
    .where({ owner: LEGACY_OWNER })
    .update({ owner: DEFAULT_OWNER });
  return { moved: Number(n) || 0, skipped: 0 };
}

/**
 * @param {import("knex").Knex} knex
 */
async function migrateScriptStateNamespaces(knex) {
  const rows = await knex("script_state")
    .where("namespace", "like", `${LEGACY_OWNER}/%`)
    .select("namespace", "key");
  let moved = 0;
  let skipped = 0;
  for (const row of rows) {
    const nextNs = `${DEFAULT_OWNER}${row.namespace.slice(LEGACY_OWNER.length)}`;
    const conflict = await knex("script_state")
      .where({ namespace: nextNs, key: row.key })
      .first();
    if (conflict) {
      skipped += 1;
      log.warn(
        { namespace: row.namespace, key: row.key, nextNs },
        "owner migrate: skip script_state collision",
      );
      continue;
    }
    await knex("script_state")
      .where({ namespace: row.namespace, key: row.key })
      .update({ namespace: nextNs });
    moved += 1;
  }
  return { moved, skipped };
}

/**
 * @param {import("knex").Knex} knex
 */
async function rewriteDbConfigStrings(knex) {
  let profiles = 0;
  let revisions = 0;

  const profileRows = await knex("profiles").select("id", "config");
  for (const row of profileRows) {
    const { text, changed } = rewriteLegacyConfigRefsInText(String(row.config ?? ""));
    if (!changed) continue;
    await knex("profiles").where({ id: row.id }).update({ config: text });
    profiles += 1;
  }

  const revisionRows = await knex("workflow_revisions").select("id", "content");
  for (const row of revisionRows) {
    const { text, changed } = rewriteLegacyConfigRefsInText(String(row.content ?? ""));
    if (!changed) continue;
    await knex("workflow_revisions").where({ id: row.id }).update({ content: text });
    revisions += 1;
  }

  return { profiles, revisions };
}

/**
 * One-shot: move owner `default` → `local`, rewrite prefix refs to mustache.
 * Idempotent when there is no remaining `default` data / prefix refs.
 */
export async function migrateDefaultOwnerIfNeeded() {
  const knex = db;

  const yamlLive = mergeOwnerDir(WORKFLOWS_DIR);
  const yamlTrash = mergeOwnerDir(TRASH_WORKFLOWS_DIR);

  const variables = await migrateOwnerColumn(knex, "variables", "name");
  const secrets = await migrateOwnerColumn(knex, "secrets", "name");
  const profiles = await migrateOwnerColumn(knex, "profiles", "name");
  const trash = await migrateOwnerColumn(knex, "workflow_trash", "file");
  const runs = await migrateWorkflowRuns(knex);
  const revisionsOwner = await migrateWorkflowRevisionsOwner(knex);
  const scriptState = await migrateScriptStateNamespaces(knex);

  const yamlRewritten =
    rewriteYamlTree(path.join(WORKFLOWS_DIR, DEFAULT_OWNER)) +
    rewriteYamlTree(path.join(TRASH_WORKFLOWS_DIR, DEFAULT_OWNER)) +
    rewriteYamlTree(path.join(WORKFLOWS_DIR, LEGACY_OWNER)) +
    rewriteYamlTree(path.join(TRASH_WORKFLOWS_DIR, LEGACY_OWNER));

  let examplesRewritten = 0;
  if (fs.existsSync(EXAMPLE_WORKFLOWS_DIR)) {
    examplesRewritten = rewriteYamlTree(EXAMPLE_WORKFLOWS_DIR);
  }

  const dbStrings = await rewriteDbConfigStrings(knex);

  const summary = {
    yamlLive,
    yamlTrash,
    variables,
    secrets,
    profiles,
    trash,
    runs,
    revisionsOwner,
    scriptState,
    yamlRewritten,
    examplesRewritten,
    dbStrings,
  };

  const touched =
    yamlLive.moved +
      yamlTrash.moved +
      variables.moved +
      secrets.moved +
      profiles.moved +
      trash.moved +
      runs.moved +
      revisionsOwner.moved +
      scriptState.moved +
      yamlRewritten +
      examplesRewritten +
      dbStrings.profiles +
      dbStrings.revisions >
    0;

  if (touched) {
    log.info(summary, "migrated owner default → local and rewrote config refs");
  }

  return summary;
}
