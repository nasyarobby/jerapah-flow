import fs from "fs";
import path from "path";
import { LEGACY_WORKFLOWS_DIR, WORKFLOWS_DIR } from "./paths.js";
import { log } from "./logger.js";

/**
 * Recursively copy a directory.
 * @param {string} src
 * @param {string} dest
 */
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

/**
 * True when WORKFLOWS_DIR has no owner subdirectories.
 * @param {string} dir
 */
function isEmptyWorkflowsDir(dir) {
  if (!fs.existsSync(dir)) return true;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return !entries.some((e) => e.isDirectory());
}

/**
 * One-shot: copy packages/server/workflows → data/workflows when the new
 * store is empty and the legacy tree still exists.
 * Does not copy from examples/workflows.
 */
export function migrateLegacyWorkflowsIfNeeded() {
  if (!isEmptyWorkflowsDir(WORKFLOWS_DIR)) return false;
  if (!fs.existsSync(LEGACY_WORKFLOWS_DIR)) return false;
  const legacyEntries = fs.readdirSync(LEGACY_WORKFLOWS_DIR, {
    withFileTypes: true,
  });
  if (!legacyEntries.some((e) => e.isDirectory())) return false;

  fs.mkdirSync(WORKFLOWS_DIR, { recursive: true });
  copyDir(LEGACY_WORKFLOWS_DIR, WORKFLOWS_DIR);
  log.info(
    { from: LEGACY_WORKFLOWS_DIR, to: WORKFLOWS_DIR },
    "migrated legacy workflows into instance store",
  );
  return true;
}
