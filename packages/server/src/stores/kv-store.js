import { db } from "../../db.js";

const MAX_KEY_LENGTH = 512;
const MAX_NAMESPACE_LENGTH = 512;
const MAX_VALUE_BYTES = 256 * 1024;
const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 500;

function nowIso() {
  return new Date().toISOString();
}

/**
 * @param {unknown} value
 */
function valuesEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * @param {string} label
 * @param {unknown} value
 */
function assertString(label, value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

/**
 * @param {string} label
 * @param {string} value
 * @param {number} max
 */
function assertMaxLength(label, value, max) {
  if (value.length > max) {
    throw new Error(`${label} must be at most ${max} characters`);
  }
}

/**
 * @param {string} namespace
 */
function assertNamespace(namespace) {
  assertString("namespace", namespace);
  assertMaxLength("namespace", namespace, MAX_NAMESPACE_LENGTH);
}

/**
 * @param {string} key
 */
function assertKey(key) {
  assertString("key", key);
  assertMaxLength("key", key, MAX_KEY_LENGTH);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function serializeKvValue(value) {
  let json;
  try {
    json = JSON.stringify(value);
  } catch {
    throw new Error("value must be JSON-serializable");
  }
  if (Buffer.byteLength(json, "utf8") > MAX_VALUE_BYTES) {
    throw new Error(`value exceeds ${MAX_VALUE_BYTES} byte limit`);
  }
  return json;
}

/**
 * @param {string | null | undefined} value
 * @returns {unknown}
 */
function deserializeKvValue(value) {
  if (value == null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * @param {{ expires_at?: string | null }} row
 */
function isExpired(row) {
  if (!row.expires_at) return false;
  return Date.parse(row.expires_at) <= Date.now();
}

/**
 * @param {string} namespace
 * @param {string} key
 * @returns {Promise<unknown>}
 */
export async function kvGet(namespace, key) {
  assertNamespace(namespace);
  assertKey(key);

  const row = await db("script_state").where({ namespace, key }).first();
  if (!row) return null;

  if (isExpired(row)) {
    await db("script_state").where({ namespace, key }).del();
    return null;
  }

  return deserializeKvValue(row.value);
}

/**
 * @param {string} namespace
 * @param {string} key
 * @param {unknown} value
 * @param {{ expiresAt?: string | Date | null }} [opts]
 */
export async function kvSet(namespace, key, value, opts = {}) {
  assertNamespace(namespace);
  assertKey(key);

  const json = serializeKvValue(value);
  const updated_at = nowIso();
  let expires_at = null;
  if (opts.expiresAt != null) {
    expires_at =
      opts.expiresAt instanceof Date
        ? opts.expiresAt.toISOString()
        : String(opts.expiresAt);
  }

  await db("script_state")
    .insert({
      namespace,
      key,
      value: json,
      updated_at,
      expires_at,
    })
    .onConflict(["namespace", "key"])
    .merge({
      value: json,
      updated_at,
      expires_at,
    });
}

/**
 * @param {string} namespace
 * @param {string} key
 * @returns {Promise<boolean>}
 */
export async function kvDelete(namespace, key) {
  assertNamespace(namespace);
  assertKey(key);
  const deleted = await db("script_state").where({ namespace, key }).del();
  return deleted > 0;
}

/**
 * @param {string} namespace
 * @param {string} key
 * @param {unknown} expected
 * @param {unknown} next
 * @param {{ expiresAt?: string | Date | null }} [opts]
 * @returns {Promise<{ ok: boolean, previous: unknown }>}
 */
export async function kvCompareAndSet(namespace, key, expected, next, opts = {}) {
  assertNamespace(namespace);
  assertKey(key);

  return db.transaction(async (trx) => {
    const row = await trx("script_state").where({ namespace, key }).first();

    if (row && isExpired(row)) {
      await trx("script_state").where({ namespace, key }).del();
    }

    const currentRow =
      row && !isExpired(row)
        ? row
        : await trx("script_state").where({ namespace, key }).first();
    const previous = currentRow ? deserializeKvValue(currentRow.value) : null;

    if (!valuesEqual(previous, expected)) {
      return { ok: false, previous };
    }

    const json = serializeKvValue(next);
    const updated_at = nowIso();
    let expires_at = null;
    if (opts.expiresAt != null) {
      expires_at =
        opts.expiresAt instanceof Date
          ? opts.expiresAt.toISOString()
          : String(opts.expiresAt);
    }

    if (currentRow) {
      await trx("script_state").where({ namespace, key }).update({
        value: json,
        updated_at,
        expires_at,
      });
    } else {
      await trx("script_state").insert({
        namespace,
        key,
        value: json,
        updated_at,
        expires_at,
      });
    }

    return { ok: true, previous };
  });
}

/**
 * @param {string} namespace
 * @param {{ limit?: number }} [opts]
 */
export async function kvList(namespace, opts = {}) {
  assertNamespace(namespace);
  const limit = Math.min(
    Math.max(opts.limit ?? DEFAULT_LIST_LIMIT, 1),
    MAX_LIST_LIMIT,
  );

  const rows = await db("script_state")
    .where({ namespace })
    .orderBy("updated_at", "desc")
    .limit(limit);

  const items = [];
  for (const row of rows) {
    if (isExpired(row)) {
      await db("script_state").where({ namespace, key: row.key }).del();
      continue;
    }
    items.push({
      key: row.key,
      value: deserializeKvValue(row.value),
      updatedAt: row.updated_at,
      expiresAt: row.expires_at ?? null,
    });
  }
  return items;
}

function escapeLike(value) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

async function pruneExpiredKv() {
  await db("script_state")
    .whereNotNull("expires_at")
    .andWhere("expires_at", "<=", nowIso())
    .del();
}

/**
 * @param {{
 *   namespace?: string,
 *   q?: string,
 *   limit?: number,
 *   offset?: number,
 * }} [opts]
 */
export async function kvQuery(opts = {}) {
  await pruneExpiredKv();

  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const offset = Math.max(Number(opts.offset) || 0, 0);

  let q = db("script_state");
  if (opts.namespace) {
    assertNamespace(opts.namespace);
    q = q.where({ namespace: opts.namespace });
  }
  if (typeof opts.q === "string" && opts.q.length > 0) {
    const like = `%${escapeLike(opts.q)}%`;
    q = q.where(function likeSearch() {
      this.whereRaw("key LIKE ? ESCAPE '\\'", [like]).orWhereRaw(
        "value LIKE ? ESCAPE '\\'",
        [like],
      );
    });
  }

  const countRow = await q.clone().count({ count: "*" }).first();
  const total = Number(countRow?.count ?? 0);

  const rows = await q
    .clone()
    .orderBy("updated_at", "desc")
    .orderBy("namespace", "asc")
    .orderBy("key", "asc")
    .limit(limit)
    .offset(offset);

  return {
    items: rows.map((row) => ({
      namespace: row.namespace,
      key: row.key,
      value: deserializeKvValue(row.value),
      updatedAt: row.updated_at,
      expiresAt: row.expires_at ?? null,
    })),
    total,
    limit,
    offset,
  };
}

/**
 * @returns {Promise<string[]>}
 */
export async function kvNamespaces() {
  await pruneExpiredKv();
  const rows = await db("script_state").distinct("namespace").orderBy("namespace", "asc");
  return rows.map((row) => row.namespace);
}

/**
 * @param {string} defaultNamespace
 */
export function createKvApi(defaultNamespace) {
  assertNamespace(defaultNamespace);

  /**
   * @param {{ namespace?: string }} [opts]
   */
  function resolveNamespace(opts = {}) {
    const namespace = opts.namespace ?? defaultNamespace;
    assertNamespace(namespace);
    return namespace;
  }

  return {
    namespace: defaultNamespace,

    /**
     * @param {string} key
     * @param {{ namespace?: string }} [opts]
     */
    get(key, opts) {
      return kvGet(resolveNamespace(opts), key);
    },

    /**
     * @param {string} key
     * @param {unknown} value
     * @param {{ namespace?: string, expiresAt?: string | Date | null }} [opts]
     */
    set(key, value, opts) {
      const { namespace, expiresAt } = opts ?? {};
      return kvSet(resolveNamespace(opts), key, value, { expiresAt });
    },

    /**
     * @param {string} key
     * @param {{ namespace?: string }} [opts]
     */
    delete(key, opts) {
      return kvDelete(resolveNamespace(opts), key);
    },

    /**
     * @param {string} key
     * @param {unknown} expected
     * @param {unknown} next
     * @param {{ namespace?: string, expiresAt?: string | Date | null }} [opts]
     */
    compareAndSet(key, expected, next, opts) {
      const { expiresAt } = opts ?? {};
      return kvCompareAndSet(resolveNamespace(opts), key, expected, next, {
        expiresAt,
      });
    },

    /**
     * @param {{ namespace?: string, limit?: number }} [opts]
     */
    list(opts) {
      const { namespace, limit } = opts ?? {};
      return kvList(resolveNamespace(opts), { limit });
    },
  };
}
