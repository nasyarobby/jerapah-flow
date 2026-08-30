import { coerceCredentialString } from "./http-trigger-auth.js";
import { assertSecretName, getSecretPlaintext } from "./secrets-store.js";
import { isSecret } from "./secret-value.js";
import { assertVariableName, getVariablePlain } from "./variables-store.js";

const FORBIDDEN_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);
const MUSTACHE_TOKEN_RE =
  /\{\{\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*)\s*\}\}/g;
const WHOLE_MUSTACHE_RE =
  /^\{\{\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*)\s*\}\}$/;

/**
 * @typedef {{
 *   owner: string,
 *   workflowKey?: string,
 *   context?: unknown,
 *   data?: unknown,
 * }} ConfigRefCtx
 */

/**
 * Walk config (objects/arrays) and interpolate `{{ path }}` strings.
 * Does not walk trigger data.
 *
 * @param {unknown} value
 * @param {ConfigRefCtx} ctx
 * @param {WeakSet<object>} [seen]
 * @returns {Promise<unknown>}
 */
export async function resolveConfigRefs(value, ctx, seen = new WeakSet()) {
  if (typeof value === "string") {
    return resolveStringRef(value, ctx);
  }
  if (value == null || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) return value;
  seen.add(value);

  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) {
      out.push(await resolveConfigRefs(item, ctx, seen));
    }
    return out;
  }

  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    out[key] = await resolveConfigRefs(child, ctx, seen);
  }
  return out;
}

/**
 * @param {string} value
 * @param {ConfigRefCtx} ctx
 * @returns {Promise<unknown>}
 */
async function resolveStringRef(value, ctx) {
  const whole = WHOLE_MUSTACHE_RE.exec(value);
  if (whole && whole[0] === value) {
    return resolvePath(whole[1], ctx, { raw: value, allowObject: true });
  }

  if (!value.includes("{{")) {
    return value;
  }

  MUSTACHE_TOKEN_RE.lastIndex = 0;
  let out = "";
  let lastIndex = 0;
  let match;
  while ((match = MUSTACHE_TOKEN_RE.exec(value)) != null) {
    out += value.slice(lastIndex, match.index);
    const resolved = await resolvePath(match[1], ctx, {
      raw: match[0],
      allowObject: false,
    });
    out += stringifyScalar(resolved, match[0]);
    lastIndex = match.index + match[0].length;
  }
  out += value.slice(lastIndex);
  return out;
}

/**
 * @param {string} pathExpr
 * @param {ConfigRefCtx} ctx
 * @param {{ raw: string, allowObject: boolean }} opts
 */
async function resolvePath(pathExpr, ctx, opts) {
  const segments = pathExpr.split(".");
  if (segments.length === 0 || segments.some((s) => !s)) {
    throw new Error(`config ref ${opts.raw}: empty path`);
  }
  for (const seg of segments) {
    if (FORBIDDEN_SEGMENTS.has(seg)) {
      throw new Error(`config ref ${opts.raw}: forbidden path segment "${seg}"`);
    }
  }

  const root = segments[0];
  const rest = segments.slice(1);

  if (root === "vars") {
    return resolveNamedStore("var", rest, ctx, opts);
  }
  if (root === "secrets") {
    return resolveNamedStore("secret", rest, ctx, opts);
  }
  if (root === "context") {
    return walkObject(ctx.context, rest, opts);
  }
  if (root === "data") {
    return walkObject(ctx.data, rest, opts);
  }
  throw new Error(
    `config ref ${opts.raw}: unknown root "${root}" (use vars, secrets, context, or data)`,
  );
}

/**
 * @param {"var" | "secret"} kind
 * @param {string[]} rest
 * @param {ConfigRefCtx} ctx
 * @param {{ raw: string, allowObject: boolean }} opts
 */
async function resolveNamedStore(kind, rest, ctx, opts) {
  if (rest.length === 0) {
    throw new Error(`config ref ${opts.raw}: empty ${kind} name`);
  }
  const name = rest.join(".");
  try {
    if (kind === "secret") assertSecretName(name);
    else assertVariableName(name);
  } catch {
    throw new Error(`config ref ${opts.raw}: invalid ${kind} name`);
  }

  if (kind === "secret") {
    const plaintext = await getSecretPlaintext(ctx.owner, name);
    if (plaintext == null) {
      throw new Error(`config ref ${opts.raw}: secret "${name}" not found`);
    }
    return plaintext;
  }

  const value = await getVariablePlain(ctx.owner, name);
  if (value == null) {
    throw new Error(`config ref ${opts.raw}: variable "${name}" not found`);
  }
  return value;
}

/**
 * @param {unknown} root
 * @param {string[]} rest
 * @param {{ raw: string, allowObject: boolean }} opts
 */
function walkObject(root, rest, opts) {
  if (rest.length === 0) {
    return unwrapValue(root, opts);
  }

  let cur = root;
  for (const seg of rest) {
    if (cur == null || typeof cur !== "object") {
      throw new Error(`config ref ${opts.raw}: path not found`);
    }
    if (Array.isArray(cur)) {
      if (!/^\d+$/.test(seg)) {
        throw new Error(`config ref ${opts.raw}: path not found`);
      }
      const idx = Number(seg);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) {
        throw new Error(`config ref ${opts.raw}: path not found`);
      }
      cur = cur[idx];
      continue;
    }
    const bag = /** @type {Record<string, unknown>} */ (cur);
    if (!Object.prototype.hasOwnProperty.call(bag, seg)) {
      throw new Error(`config ref ${opts.raw}: path not found`);
    }
    cur = bag[seg];
  }
  return unwrapValue(cur, opts);
}

/**
 * @param {unknown} value
 * @param {{ raw: string, allowObject: boolean }} opts
 */
function unwrapValue(value, opts) {
  if (isSecret(value)) {
    return value.reveal();
  }
  if (!opts.allowObject && value != null && typeof value === "object") {
    throw new Error(`config ref ${opts.raw}: value is not a scalar`);
  }
  // Whole-value context/data may be any JSON type; mixed strings need scalars only.
  if (opts.allowObject) {
    if (value != null && typeof value === "object") return value;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return value;
    }
    // Prefer credential coercion for odd primitives (e.g. bigint) when whole-value.
    const coerced = coerceCredentialString(value);
    if (coerced != null) return coerced;
    return value;
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} raw
 */
function stringifyScalar(value, raw) {
  if (value == null) {
    throw new Error(`config ref ${raw}: value is null`);
  }
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  throw new Error(`config ref ${raw}: value is not a scalar`);
}
