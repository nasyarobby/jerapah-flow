import { createHash, randomUUID } from "node:crypto";
import yaml from "yaml";

/**
 * Stable key order for canonical JSON (dedup ignores YAML formatting).
 * @param {unknown} value
 */
export function canonicalize(value) {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = canonicalize(value[key]);
  }
  return out;
}

/**
 * Parse YAML to a JS object (null when empty/invalid for callers that handle errors).
 * @param {string} content
 */
export function parseWorkflowObject(content) {
  if (typeof content !== "string" || !content.trim()) return null;
  return yaml.parse(content) ?? null;
}

/**
 * Drop `enabled` before hashing so enable/disable does not create revision points.
 * @param {unknown} parsed
 */
function stripEnabledForHash(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return parsed;
  const { enabled, ...rest } = parsed;
  return rest;
}

/**
 * SHA256 of normalized workflow content (YAML → object → canonical JSON).
 * @param {string} content
 */
export function workflowContentSha(content) {
  const parsed = stripEnabledForHash(parseWorkflowObject(content));
  const canonical = canonicalize(parsed);
  const json = JSON.stringify(canonical);
  return createHash("sha256").update(json, "utf8").digest("hex");
}

/**
 * @param {string} file
 */
export function workflowIdFromFile(file) {
  return String(file).replace(/\.ya?ml$/i, "");
}

/** @param {string} file */
export function workflowFileStem(file) {
  return workflowIdFromFile(file);
}

/**
 * New on-disk workflow filename: `{uuid}.yaml`.
 * @param {string} [uuid]
 */
export function newWorkflowFilename(uuid) {
  const id = uuid ?? randomUUID();
  return `${id}.yaml`;
}

const UUID_FILE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.ya?ml$/i;

/**
 * @param {string} file
 */
export function isUuidWorkflowFile(file) {
  return UUID_FILE_RE.test(String(file));
}
