import path from "path";
import { fileURLToPath } from "url";

export const SERVER_ROOT = path.dirname(fileURLToPath(import.meta.url));
export const SCRIPTS_DIR = path.join(SERVER_ROOT, "scripts");
export const DATA_DIR = path.join(SERVER_ROOT, "data");
/** Live instance workflows (not shipped in git). Override for tests. */
export const WORKFLOWS_DIR =
  process.env.JFLOW_WORKFLOWS_DIR ?? path.join(DATA_DIR, "workflows");
/** Pre-0.1 layout; used only for one-shot migrate into WORKFLOWS_DIR. */
export const LEGACY_WORKFLOWS_DIR = path.join(SERVER_ROOT, "workflows");
/** User plugins (repo-root /plugins, outside the pnpm workspace). */
export const PLUGINS_DIR =
  process.env.JFLOW_PLUGINS_DIR ??
  path.resolve(SERVER_ROOT, "../../plugins");
/** Example plugin sources shipped with the repo. */
export const EXAMPLE_PLUGINS_DIR = path.resolve(
  SERVER_ROOT,
  "../../examples/plugins",
);
/** Example workflow YAML presets (not loaded by the runner). */
export const EXAMPLE_WORKFLOWS_DIR = path.resolve(
  SERVER_ROOT,
  "../../examples/workflows",
);
export const LOGS_DIR = path.join(SERVER_ROOT, "logs");
export const WEB_DIST = path.resolve(SERVER_ROOT, "../web/dist");
