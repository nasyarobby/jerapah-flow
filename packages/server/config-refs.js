import { coerceCredentialString } from "./http-trigger-auth.js";
import { assertSecretName, getSecretPlaintext } from "./secrets-store.js";
import { isSecret } from "./secret-value.js";
import { assertVariableName, getVariablePlain } from "./variables-store.js";

const PREFIXES = [
  { kind: "context", prefix: "$CONTEXT_" },
  { kind: "secret", prefix: "$SECRET_" },
  { kind: "var", prefix: "$VAR_" },
];

/**
 * @typedef {{ kind: "secret" | "context" | "var", name: string, raw: string }} ConfigRef
 * @typedef {{ owner: string, workflowKey: string, context?: unknown }} ConfigRefCtx
 */

/**
 * Parse a whole-value config placeholder. Returns null for literals.
 * @param {unknown} value
 * @returns {ConfigRef | null}
 */
export function parseConfigRef(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  for (const { kind, prefix } of PREFIXES) {
    if (trimmed.startsWith(prefix)) {
      return { kind, name: trimmed.slice(prefix.length), raw: trimmed };
    }
  }
  return null;
}

/**
 * Walk config (objects/arrays) and replace whole-value `$SECRET_` / `$CONTEXT_` / `$VAR_`
 * strings. Does not walk trigger data.
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
 * @returns {Promise<string | number | boolean>}
 */
async function resolveStringRef(value, ctx) {
  const ref = parseConfigRef(value);
  if (!ref) return value;

  if (ref.kind === "secret") {
    return resolveSecretRef(ref, ctx);
  }
  if (ref.kind === "var") {
    return resolveVarRef(ref, ctx);
  }
  return resolveContextRef(ref, ctx);
}

/**
 * @param {ConfigRef} ref
 * @param {ConfigRefCtx} ctx
 * @returns {Promise<string>}
 */
async function resolveSecretRef(ref, ctx) {
  try {
    assertSecretName(ref.name);
  } catch {
    throw new Error(`config ref ${ref.raw}: invalid secret name`);
  }
  const plaintext = await getSecretPlaintext(ctx.owner, ref.name);
  if (plaintext == null) {
    throw new Error(`config ref ${ref.raw}: secret "${ref.name}" not found`);
  }
  return plaintext;
}

/**
 * @param {ConfigRef} ref
 * @param {ConfigRefCtx} ctx
 * @returns {Promise<string | number | boolean>}
 */
async function resolveVarRef(ref, ctx) {
  if (ref.name.length === 0) {
    throw new Error(`config ref ${ref.raw}: empty variable name`);
  }
  try {
    assertVariableName(ref.name);
  } catch {
    throw new Error(`config ref ${ref.raw}: invalid variable name`);
  }
  const value = await getVariablePlain(ctx.owner, ref.name);
  if (value == null) {
    throw new Error(`config ref ${ref.raw}: variable "${ref.name}" not found`);
  }
  return value;
}

/**
 * @param {ConfigRef} ref
 * @param {ConfigRefCtx} ctx
 * @returns {string}
 */
function resolveContextRef(ref, ctx) {
  if (ref.name.length === 0) {
    throw new Error(`config ref ${ref.raw}: empty context key`);
  }
  const bag =
    ctx.context != null && typeof ctx.context === "object" && !Array.isArray(ctx.context)
      ? /** @type {Record<string, unknown>} */ (ctx.context)
      : {};
  if (!Object.prototype.hasOwnProperty.call(bag, ref.name)) {
    throw new Error(`config ref ${ref.raw}: context "${ref.name}" not found`);
  }
  const raw = bag[ref.name];
  if (isSecret(raw)) {
    return raw.reveal();
  }
  const coerced = coerceCredentialString(raw);
  if (coerced == null) {
    throw new Error(`config ref ${ref.raw}: context "${ref.name}" is not a scalar`);
  }
  return coerced;
}
