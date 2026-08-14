import { createHash } from "node:crypto";

const MAX_AGE_RE = /^(\d+(?:\.\d+)?)(s|m|h|d)$/i;
const UNIT_MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/**
 * @param {unknown} maxAge
 * @returns {number | null}
 */
export function parseMaxAge(maxAge) {
  if (maxAge == null || maxAge === false || maxAge === "") return null;
  if (typeof maxAge === "number") {
    if (!Number.isFinite(maxAge) || maxAge < 0) {
      throw new Error("maxAge must be a non-negative number of milliseconds");
    }
    return maxAge;
  }
  if (typeof maxAge === "string") {
    const trimmed = maxAge.trim();
    if (trimmed === "") return null;
    if (!/[a-z]/i.test(trimmed)) {
      const asNum = Number(trimmed);
      if (!Number.isFinite(asNum) || asNum < 0) {
        throw new Error(`invalid maxAge: ${JSON.stringify(maxAge)}`);
      }
      return asNum;
    }
    const match = trimmed.match(MAX_AGE_RE);
    if (!match) {
      throw new Error(`invalid maxAge: ${JSON.stringify(maxAge)}`);
    }
    return Number(match[1]) * UNIT_MS[match[2].toLowerCase()];
  }
  throw new Error(`invalid maxAge: ${JSON.stringify(maxAge)}`);
}

function isBytes(value) {
  return Buffer.isBuffer(value) || value instanceof Uint8Array;
}

/**
 * @param {unknown} value
 */
export function canonicalize(value) {
  if (value === undefined) return null;
  if (isBytes(value)) return { $bytes: value.length };
  if (value === null) return null;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value instanceof Date) return value.toISOString();
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = canonicalize(value[key]);
  }
  return out;
}

/**
 * @param {unknown} value
 */
export function hashFingerprint(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

/**
 * @param {unknown} stored
 * @returns {{ hash: string | null, at: string | null } | null}
 */
export function parseFingerprintRecord(stored) {
  if (stored == null) return null;
  if (typeof stored === "string" && stored.length > 0) {
    return { hash: stored, at: null };
  }
  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    const hash = /** @type {{ hash?: unknown }} */ (stored).hash;
    const at = /** @type {{ at?: unknown }} */ (stored).at;
    if (typeof hash === "string" && hash.length > 0) {
      return { hash, at: typeof at === "string" && at.length > 0 ? at : null };
    }
  }
  return { hash: null, at: null };
}

function ageMs(at, now = Date.now()) {
  if (at == null) return null;
  const t = Date.parse(at);
  if (Number.isNaN(t)) return null;
  return now - t;
}

function isAgeExpired(record, maxAgeMs, now) {
  if (maxAgeMs == null || !record) return false;
  if (record.at == null) return true;
  const age = ageMs(record.at, now);
  if (age == null) return true;
  return age >= maxAgeMs;
}

function inspect(stored, hash, maxAgeMs, now = Date.now()) {
  const previous = parseFingerprintRecord(stored);
  const previousAt = previous?.at ?? null;
  const age = ageMs(previousAt, now);
  const hashChanged = !previous || previous.hash !== hash;
  const expired = Boolean(previous) && !hashChanged && isAgeExpired(previous, maxAgeMs, now);
  return {
    hash,
    previous: previous?.hash ?? null,
    previousAt,
    ageMs: age,
    changed: hashChanged || expired,
    expired,
  };
}

/**
 * @param {ReturnType<import("./kv-store.js").createKvApi>} kv
 */
export function createFingerprintApi(kv) {
  return {
    hash(value) {
      return hashFingerprint(value);
    },

    /**
     * @param {string} key
     * @param {unknown} value
     * @param {{ maxAge?: unknown }} [opts]
     */
    async check(key, value, opts = {}) {
      const maxAgeMs = parseMaxAge(opts.maxAge);
      const hash = hashFingerprint(value);
      const stored = await kv.get(key);
      return inspect(stored, hash, maxAgeMs);
    },

    /**
     * @param {string} key
     * @param {string} hash
     */
    async remember(key, hash) {
      if (typeof hash !== "string" || hash.length === 0) {
        throw new Error("fingerprint hash is required");
      }
      const record = { hash, at: new Date().toISOString() };
      await kv.set(key, record);
      return record;
    },

    /**
     * @param {string} key
     * @param {unknown} value
     * @param {{ maxAge?: unknown }} [opts]
     */
    async claim(key, value, opts = {}) {
      const maxAgeMs = parseMaxAge(opts.maxAge);
      const hash = hashFingerprint(value);
      const stored = await kv.get(key);
      const result = inspect(stored, hash, maxAgeMs);

      if (!result.changed) {
        return { ...result, at: result.previousAt };
      }

      const next = { hash, at: new Date().toISOString() };
      const cas = await kv.compareAndSet(key, stored ?? null, next);
      if (!cas.ok) {
        const again = inspect(cas.previous, hash, maxAgeMs);
        if (!again.changed) {
          return { ...again, at: again.previousAt };
        }
        return {
          ...again,
          changed: false,
          expired: false,
          at: again.previousAt,
        };
      }

      return { ...result, at: next.at };
    },
  };
}
