import path from "path";
import { fileURLToPath } from "url";

export const SERVER_ROOT = path.dirname(fileURLToPath(import.meta.url));
export const SCRIPTS_DIR = path.join(SERVER_ROOT, "scripts");
export const WORKFLOWS_DIR = path.join(SERVER_ROOT, "workflows");
export const DATA_DIR = path.join(SERVER_ROOT, "data");
/** User plugins (repo-root /plugins, outside the pnpm workspace). */
export const PLUGINS_DIR =
  process.env.JFLOW_PLUGINS_DIR ??
  path.resolve(SERVER_ROOT, "../../plugins");
/** Example plugin sources shipped with the repo. */
export const EXAMPLE_PLUGINS_DIR = path.resolve(
  SERVER_ROOT,
  "../../examples/plugins",
);
export const LOGS_DIR = path.join(SERVER_ROOT, "logs");
export const WEB_DIST = path.resolve(SERVER_ROOT, "../web/dist");
