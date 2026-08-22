import fs from "fs";
import path from "path";
import yaml from "yaml";
import { EXAMPLE_WORKFLOWS_DIR } from "./paths.js";

/**
 * @param {string} id
 * @returns {string | null} safe basename without extension, or null if invalid
 */
export function assertExampleWorkflowId(id) {
  if (typeof id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(id)) {
    return null;
  }
  return id;
}

/**
 * Absolute path to an example YAML, or null if missing/unsafe.
 * @param {string} id
 */
export function exampleWorkflowPath(id) {
  const safe = assertExampleWorkflowId(id);
  if (!safe) return null;
  const filePath = path.join(EXAMPLE_WORKFLOWS_DIR, `${safe}.yaml`);
  const resolved = path.resolve(filePath);
  if (
    resolved !== EXAMPLE_WORKFLOWS_DIR &&
    !resolved.startsWith(EXAMPLE_WORKFLOWS_DIR + path.sep)
  ) {
    return null;
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return null;
  }
  return resolved;
}

/**
 * @returns {{ id: string, name: string, description: string }[]}
 */
export function listExampleWorkflows() {
  if (!fs.existsSync(EXAMPLE_WORKFLOWS_DIR)) return [];
  return fs
    .readdirSync(EXAMPLE_WORKFLOWS_DIR)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort()
    .map((f) => {
      const id = f.replace(/\.ya?ml$/i, "");
      const filePath = path.join(EXAMPLE_WORKFLOWS_DIR, f);
      let name = id;
      let description = "";
      try {
        const parsed = yaml.parse(fs.readFileSync(filePath, "utf8")) ?? {};
        if (typeof parsed.name === "string" && parsed.name.trim()) {
          name = parsed.name.trim();
        }
        if (parsed.description != null) {
          description = String(parsed.description).trim();
        }
      } catch {
        // keep id as name
      }
      return { id, name, description };
    });
}

/**
 * @param {string} id
 * @returns {{ id: string, content: string } | null}
 */
export function readExampleWorkflow(id) {
  const filePath = exampleWorkflowPath(id);
  if (!filePath) return null;
  const safe = assertExampleWorkflowId(id);
  return {
    id: /** @type {string} */ (safe),
    content: fs.readFileSync(filePath, "utf8"),
  };
}
