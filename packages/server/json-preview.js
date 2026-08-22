const BUFFER_PREVIEW_BYTES = 16;

/**
 * @param {unknown} value
 */
export function isBinary(value) {
  return (
    Buffer.isBuffer(value) ||
    ArrayBuffer.isView(value) ||
    value instanceof ArrayBuffer
  );
}

/**
 * @param {Buffer | ArrayBufferView | ArrayBuffer} value
 */
export function toBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}

/**
 * Compact stand-in for JSON (Buffer.toJSON dumps every byte as a number).
 * @param {Buffer | ArrayBufferView | ArrayBuffer} value
 */
export function summarizeBinary(value) {
  const buf = toBuffer(value);
  const take = Math.min(buf.length, BUFFER_PREVIEW_BYTES);
  return {
    type: "Buffer",
    length: buf.length,
    preview: buf.subarray(0, take).toString("hex"),
    truncated: buf.length > take,
  };
}

/**
 * JSON-safe Buffer that can be revived (dry-run / Try chaining).
 * @param {Buffer | ArrayBufferView | ArrayBuffer} value
 */
export function encodeBinary(value) {
  const buf = toBuffer(value);
  return {
    type: "Buffer",
    encoding: "base64",
    data: buf.toString("base64"),
    length: buf.length,
  };
}

/**
 * @param {unknown} value
 */
export function isWireBuffer(value) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const obj = /** @type {{ type?: unknown, encoding?: unknown, data?: unknown }} */ (value);
  if (obj.type !== "Buffer") return false;
  if (obj.encoding === "base64" && typeof obj.data === "string") return true;
  return Array.isArray(obj.data);
}

/**
 * Replace live Buffers with reconstructable JSON (for dry-run responses).
 * Display still uses summarizeBinary / safeSerialize.
 * @param {unknown} value
 */
export function encodeBinaryForWire(value) {
  const seen = new WeakSet();
  /** @param {unknown} v */
  function walk(v) {
    if (isBinary(v)) return encodeBinary(v);
    if (typeof v === "bigint") return v.toString();
    if (v == null || typeof v !== "object") return v;
    if (seen.has(v)) return "[Circular]";
    seen.add(v);
    if (Array.isArray(v)) return v.map(walk);
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = walk(val);
    return out;
  }
  return walk(value);
}

/**
 * Revive `{ type: "Buffer", encoding: "base64", data }` or Node `{ type, data: number[] }`.
 * Preview-only summaries (`preview` / `truncated`, no payload) are left as-is.
 * @param {unknown} value
 */
export function reviveBinaryFromWire(value) {
  const seen = new WeakSet();
  /** @param {unknown} v */
  function walk(v) {
    if (v == null || typeof v !== "object") return v;
    if (isWireBuffer(v)) {
      const obj = /** @type {{ encoding?: unknown, data: string | number[] }} */ (v);
      if (obj.encoding === "base64" && typeof obj.data === "string") {
        return Buffer.from(obj.data, "base64");
      }
      return Buffer.from(/** @type {number[]} */ (obj.data));
    }
    if (seen.has(v)) return v;
    seen.add(v);
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) v[i] = walk(v[i]);
      return v;
    }
    const obj = /** @type {Record<string, unknown>} */ (v);
    for (const k of Object.keys(obj)) obj[k] = walk(obj[k]);
    return obj;
  }
  return walk(value);
}

/**
 * JSON.stringify replacer. Must be a real function so `this` is the holder:
 * Buffer#toJSON already ran on `value`, but `this[key]` is still the Buffer.
 * @param {string} key
 * @param {unknown} value
 */
export function jsonPreviewReplacer(key, value) {
  const raw = this[key];
  if (isBinary(raw)) return summarizeBinary(raw);
  return value;
}
