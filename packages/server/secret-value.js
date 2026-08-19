import { inspect } from "node:util";

export const REDACTED = "[secret]";
/** Short values are stored, but skipped in log redaction to avoid false positives. */
export const MIN_SECRET_LENGTH = 8;

/** @type {Set<string>} */
const plaintextValues = new Set();

/**
 * @param {string} value
 */
export function registerPlaintext(value) {
  if (typeof value === "string" && value.length >= MIN_SECRET_LENGTH) {
    plaintextValues.add(value);
  }
}

/**
 * Replace registered secret strings in text (raw and JSON-escaped forms).
 * @param {string} text
 */
export function redactString(text) {
  if (typeof text !== "string" || plaintextValues.size === 0) return text;
  let out = text;
  for (const secret of plaintextValues) {
    if (out.includes(secret)) {
      out = out.split(secret).join("***");
    }
    const escaped = JSON.stringify(secret).slice(1, -1);
    if (escaped !== secret && out.includes(escaped)) {
      out = out.split(escaped).join("***");
    }
  }
  return out;
}

export class Secret {
  /** @type {string} */
  #value;

  /**
   * @param {string} value
   */
  constructor(value) {
    if (typeof value !== "string") {
      throw new Error("secret value must be a string");
    }
    this.#value = value;
    registerPlaintext(value);
  }

  reveal() {
    return this.#value;
  }

  toString() {
    return REDACTED;
  }

  toJSON() {
    return REDACTED;
  }

  [inspect.custom]() {
    return REDACTED;
  }

  [Symbol.toPrimitive]() {
    return REDACTED;
  }
}

/**
 * @param {unknown} value
 */
export function isSecret(value) {
  return value instanceof Secret;
}

/**
 * @param {unknown} value
 * @param {WeakSet<object>} [seen]
 */
export function unwrapSecretsDeep(value, seen = new WeakSet()) {
  if (isSecret(value)) return value.reveal();
  if (value == null || typeof value !== "object") return value;
  if (Buffer.isBuffer(value) || ArrayBuffer.isView(value)) return value;
  if (seen.has(value)) return value;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => unwrapSecretsDeep(item, seen));
  }

  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    out[key] = unwrapSecretsDeep(child, seen);
  }
  return out;
}
