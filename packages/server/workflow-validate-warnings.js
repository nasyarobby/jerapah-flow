import yaml from "yaml";
import { parseScriptStep } from "./workflow-parse.js";
import { resolveScriptRef } from "./plugin-store.js";
import { parseWorkflowObject } from "./workflow-normalize.js";

const SECRET_KEY_RE =
  /(?:password|passwd|secret|token|api[_-]?key|auth(?:orization)?|credential|private[_-]?key)/i;

const BEARER_RE = /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/;

/**
 * Walk parsed YAML for suspicious secret-like string values.
 * @param {unknown} value
 * @param {string} pathKey
 * @param {Array<{ code: string, message: string, path?: string }>} warnings
 */
function scanSecrets(value, pathKey, warnings) {
  if (value == null) return;
  if (typeof value === "string") {
    if (BEARER_RE.test(value)) {
      warnings.push({
        code: "plaintext_secret",
        message: "Possible Bearer token in workflow YAML",
        path: pathKey,
      });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => scanSecrets(item, `${pathKey}[${i}]`, warnings));
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      const childPath = pathKey ? `${pathKey}.${k}` : k;
      if (typeof v === "string" && v.trim() && SECRET_KEY_RE.test(k)) {
        warnings.push({
          code: "plaintext_secret",
          message: `Possible secret in field "${k}"`,
          path: childPath,
        });
      }
      scanSecrets(v, childPath, warnings);
    }
  }
}

/**
 * Collect non-blocking save warnings for workflow YAML.
 * @param {string} content
 * @returns {{ warnings: Array<{ code: string, message: string, path?: string }>, parsed: unknown | null, parseError: string | null }}
 */
export function collectWorkflowWarnings(content) {
  /** @type {Array<{ code: string, message: string, path?: string }>} */
  const warnings = [];

  let parsed = null;
  let parseError = null;
  try {
    parsed = parseWorkflowObject(content);
    if (parsed == null) {
      warnings.push({
        code: "invalid_yaml",
        message: "Workflow YAML is empty or not an object",
      });
    } else if (typeof parsed !== "object" || Array.isArray(parsed)) {
      warnings.push({
        code: "invalid_yaml",
        message: "Workflow YAML must be a mapping/object",
      });
      parsed = null;
    }
  } catch (err) {
    parseError = err instanceof Error ? err.message : String(err);
    warnings.push({
      code: "invalid_yaml",
      message: `Invalid YAML: ${parseError}`,
    });
  }

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    scanSecrets(parsed, "", warnings);

    for (const [i, raw] of (parsed.scripts ?? []).entries()) {
      try {
        const step = parseScriptStep(raw);
        if (step.kind === "set") continue;
        const resolved = resolveScriptRef(step.script);
        if (resolved.error) {
          warnings.push({
            code: "unknown_script",
            message: resolved.error,
            path: `scripts[${i}]`,
          });
        }
      } catch (err) {
        warnings.push({
          code: "invalid_script_step",
          message: err instanceof Error ? err.message : String(err),
          path: `scripts[${i}]`,
        });
      }
    }
  }

  return { warnings, parsed, parseError };
}

/**
 * Strict validation used when saveAnyway is false.
 * @param {unknown} parsed
 */
export function assertStrictWorkflow(parsed) {
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    const err = new Error("workflow yaml must be an object");
    err.statusCode = 400;
    throw err;
  }
  return parsed;
}

/**
 * Parse for PATCH/enable toggles (must be valid YAML document).
 * @param {string} content
 */
export function parseWorkflowDocument(content) {
  const doc = yaml.parseDocument(content);
  if (doc.errors?.length) {
    const err = new Error(doc.errors[0]?.message ?? "invalid yaml");
    err.statusCode = 400;
    throw err;
  }
  const parsed = doc.toJSON();
  assertStrictWorkflow(parsed);
  return { doc, parsed };
}
