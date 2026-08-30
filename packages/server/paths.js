import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export const SERVER_ROOT = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SERVER_ROOT, "../..");
export const SCRIPTS_DIR = path.join(SERVER_ROOT, "scripts");

/** Prefer `preferred` unless only `legacy` already has files. */
function existingDir(preferred, legacy, probe) {
  const has = (dir) =>
    probe ? probe(dir) : fs.existsSync(dir);
  if (has(preferred) || !has(legacy)) return preferred;
  return legacy;
}

function hasInstanceData(dir) {
  return (
    fs.existsSync(path.join(dir, "jerapah-flow.db")) ||
    fs.existsSync(path.join(dir, "workflows"))
  );
}

/** Instance data (SQLite, live workflows, control-state). Not product source. */
export const DATA_DIR = path.resolve(
  process.env.JFLOW_DATA_DIR ??
    existingDir(
      path.join(REPO_ROOT, "data"),
      path.join(SERVER_ROOT, "data"),
      hasInstanceData,
    ),
);
/** Live instance workflows (not shipped in git). Override for tests. */
export const WORKFLOWS_DIR = path.resolve(
  process.env.JFLOW_WORKFLOWS_DIR ?? path.join(DATA_DIR, "workflows"),
);
/** User plugins (repo-root /plugins, outside the pnpm workspace). */
export const PLUGINS_DIR = path.resolve(
  process.env.JFLOW_PLUGINS_DIR ?? path.join(REPO_ROOT, "plugins"),
);
/** Example plugin sources shipped with the repo. */
export const EXAMPLE_PLUGINS_DIR = path.join(REPO_ROOT, "examples/plugins");
/** Example workflow YAML presets (not loaded by the runner). */
export const EXAMPLE_WORKFLOWS_DIR = path.join(REPO_ROOT, "examples/workflows");
export const LOGS_DIR = path.resolve(
  process.env.JFLOW_LOGS_DIR ??
    existingDir(path.join(REPO_ROOT, "logs"), path.join(SERVER_ROOT, "logs")),
);
export const WEB_DIST = path.join(REPO_ROOT, "packages/web/dist");
