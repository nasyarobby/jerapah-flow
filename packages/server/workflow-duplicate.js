import yaml from "yaml";
import {
  newWorkflowFilename,
  workflowFileStem,
} from "./workflow-normalize.js";

export { workflowFileStem };

export function ensureWorkflowFilename(file) {
  const trimmed = String(file ?? "").trim();
  if (!trimmed) return "";
  return /\.ya?ml$/i.test(trimmed) ? trimmed : `${trimmed}.yaml`;
}

/**
 * Legacy human-readable copy name (kept for UI hints).
 * @param {string} file
 * @param {string[]} existingFiles
 */
export function suggestCopyFilename(file, existingFiles = []) {
  const name = ensureWorkflowFilename(file) || "workflow.yaml";
  const match = name.match(/^(.*?)(\.ya?ml)$/i);
  const base = match ? match[1] : name;
  const ext = match ? match[2] : ".yaml";
  const existing = new Set(existingFiles);

  const copyMatch = base.match(/^(.*)-copy(?:-(\d+))?$/);
  const root = copyMatch ? copyMatch[1] : base;
  const candidate = (i) =>
    i <= 1 ? `${root}-copy${ext}` : `${root}-copy-${i}${ext}`;

  let n = copyMatch ? Number(copyMatch[2] || 1) + 1 : 1;
  while (existing.has(candidate(n))) n += 1;
  return candidate(n);
}

/**
 * UUID-based duplicate filename (default for new duplicates).
 * @param {string[]} existingFiles
 */
export function suggestDuplicateFilename(existingFiles = []) {
  const existing = new Set(existingFiles);
  let file = newWorkflowFilename();
  while (existing.has(file)) {
    file = newWorkflowFilename();
  }
  return file;
}

export function nextCopyName(name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return "copy";
  const match = trimmed.match(/^(.*) \(copy(?: (\d+))?\)$/);
  if (!match) return `${trimmed} (copy)`;
  const n = match[2] ? Number(match[2]) + 1 : 2;
  return `${match[1]} (copy ${n})`;
}

export function httpPathCopySuffix(sourceFile, destFile) {
  const src = workflowFileStem(sourceFile);
  const dest = workflowFileStem(destFile);
  if (dest.startsWith(`${src}-`) && dest.length > src.length + 1) {
    return dest.slice(src.length + 1);
  }
  if (dest === src) return "copy";
  return dest || "copy";
}

function suffixHttpPath(path, suffix) {
  const trimmed = String(path).replace(/\/+$/, "");
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const safe =
    String(suffix)
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "copy";
  return `${withSlash}-${safe}`;
}

function rewriteHttpTriggerPaths(doc, suffix) {
  const triggers = doc.get("triggers");
  if (!yaml.isSeq(triggers)) return;
  for (const item of triggers.items) {
    if (!yaml.isMap(item)) continue;
    if (String(item.get("type") ?? "").toLowerCase() !== "http") continue;
    const path = item.get("path");
    if (typeof path !== "string" || !path.trim()) continue;
    item.set("path", suffixHttpPath(path, suffix));
  }
}

/**
 * Copy workflow YAML: append " (copy)" to name, disable, optionally rewrite HTTP paths.
 * Preserves comments via YAML CST.
 * @param {string} content
 * @param {{ sourceFile: string, destFile: string, rewriteHttpPaths?: boolean }} opts
 */
export function duplicateWorkflowYaml(content, opts) {
  const sourceFile = opts?.sourceFile ?? "";
  const destFile = opts?.destFile ?? "";
  const rewriteHttpPaths = opts?.rewriteHttpPaths !== false;

  const doc = yaml.parseDocument(content);
  if (doc.errors?.length) {
    const err = new Error(doc.errors[0]?.message ?? "invalid yaml");
    err.statusCode = 400;
    throw err;
  }
  const parsed = doc.toJSON();
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    const err = new Error("workflow yaml must be an object");
    err.statusCode = 400;
    throw err;
  }

  const currentName = doc.get("name");
  if (typeof currentName === "string" && currentName.trim()) {
    doc.set("name", nextCopyName(currentName));
  } else {
    doc.set("name", workflowFileStem(destFile) || "copy");
  }
  doc.set("enabled", false);

  if (rewriteHttpPaths) {
    rewriteHttpTriggerPaths(doc, httpPathCopySuffix(sourceFile, destFile));
  }

  return String(doc);
}
