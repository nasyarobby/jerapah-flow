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
 * Compact stand-in for JSON (Buffer.toJSON dumps every byte as a number).
 * @param {Buffer | ArrayBufferView | ArrayBuffer} value
 */
export function summarizeBinary(value) {
  const buf = Buffer.isBuffer(value)
    ? value
    : value instanceof ArrayBuffer
      ? Buffer.from(value)
      : Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  const take = Math.min(buf.length, BUFFER_PREVIEW_BYTES);
  return {
    type: "Buffer",
    length: buf.length,
    preview: buf.subarray(0, take).toString("hex"),
    truncated: buf.length > take,
  };
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
