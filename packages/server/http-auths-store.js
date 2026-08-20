import { randomUUID } from "node:crypto";
import { db } from "./db.js";
import { assertHttpStatus } from "./http-pages-store.js";

const MAX_NAME_LENGTH = 128;
const NAME_RE = /^[A-Za-z0-9._-]+$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_TYPES = new Set(["bearer", "basic", "header"]);

function nowIso() {
  return new Date().toISOString();
}

/**
 * @param {unknown} id
 * @returns {string}
 */
export function assertAuthId(id) {
  if (typeof id !== "string" || !UUID_RE.test(id)) {
    const err = new Error("invalid auth id");
    err.statusCode = 400;
    throw err;
  }
  return id.toLowerCase();
}

/**
 * @param {unknown} name
 * @returns {string}
 */
export function assertAuthName(name) {
  if (typeof name !== "string" || !NAME_RE.test(name)) {
    const err = new Error("invalid auth name");
    err.statusCode = 400;
    throw err;
  }
  if (name.length > MAX_NAME_LENGTH) {
    const err = new Error(`auth name must be at most ${MAX_NAME_LENGTH} characters`);
    err.statusCode = 400;
    throw err;
  }
  return name;
}

/**
 * @param {unknown} type
 * @returns {"bearer" | "basic" | "header"}
 */
export function assertAuthType(type) {
  const t = String(type ?? "");
  if (!ALLOWED_TYPES.has(t)) {
    const err = new Error('auth type must be "bearer", "basic", or "header"');
    err.statusCode = 400;
    throw err;
  }
  return /** @type {"bearer" | "basic" | "header"} */ (t);
}

/**
 * Detect value source without exposing literal values.
 * @param {unknown} value
 * @returns {"literal" | "kv" | "secret" | "missing"}
 */
export function valueSourceKind(value) {
  if (value == null) return "missing";
  if (typeof value === "string") return "literal";
  if (typeof value === "object" && !Array.isArray(value)) {
    if ("secret" in value) return "secret";
    if ("kv" in value) return "kv";
  }
  return "literal";
}

/**
 * Redact config for API responses: replace literal strings with source markers.
 * @param {Record<string, unknown>} config
 * @param {string} type
 */
export function publicConfig(config, type) {
  /** @type {Record<string, unknown>} */
  const out = {};
  if (type === "bearer") {
    out.token = redactField(config.token);
  } else if (type === "basic") {
    out.user = redactField(config.user);
    out.password = redactField(config.password);
  } else if (type === "header") {
    out.header = typeof config.header === "string" ? config.header : null;
    out.value = redactField(config.value);
  }
  return out;
}

/**
 * @param {unknown} value
 */
function redactField(value) {
  const kind = valueSourceKind(value);
  if (kind === "missing") return { source: "missing" };
  if (kind === "kv") {
    const v = /** @type {{ kv: string, namespace?: string }} */ (value);
    return {
      source: "kv",
      kv: v.kv,
      ...(v.namespace != null ? { namespace: v.namespace } : {}),
    };
  }
  if (kind === "secret") {
    const v = /** @type {{ secret: string }} */ (value);
    return { source: "secret", secret: v.secret };
  }
  return { source: "literal", set: true };
}

/**
 * Validate and normalize auth config for storage.
 * @param {string} type
 * @param {unknown} config
 * @param {{ keepLiteralsFrom?: Record<string, unknown> }} [opts]
 */
export function normalizeAuthConfig(type, config, opts = {}) {
  const raw = config && typeof config === "object" && !Array.isArray(config)
    ? /** @type {Record<string, unknown>} */ (config)
    : {};
  const keep = opts.keepLiteralsFrom ?? {};

  if (type === "bearer") {
    return {
      token: normalizeCredentialField(raw.token, keep.token, "token"),
    };
  }
  if (type === "basic") {
    return {
      user: normalizeCredentialField(raw.user, keep.user, "user"),
      password: normalizeCredentialField(raw.password, keep.password, "password", {
        allowEmpty: true,
      }),
    };
  }
  // header
  if (typeof raw.header !== "string" || raw.header.length === 0) {
    const err = new Error("header name must be a non-empty string");
    err.statusCode = 400;
    throw err;
  }
  return {
    header: raw.header,
    value: normalizeCredentialField(raw.value, keep.value, "value"),
  };
}

/**
 * @param {unknown} value
 * @param {unknown} previous
 * @param {string} label
 * @param {{ allowEmpty?: boolean }} [opts]
 */
function normalizeCredentialField(value, previous, label, opts = {}) {
  // Explicit "keep previous literal" marker from UI when editing without re-entering
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    /** @type {{ keep?: boolean }} */ (value).keep === true
  ) {
    if (typeof previous === "string") return previous;
    if (previous && typeof previous === "object") return previous;
    const err = new Error(`${label} was not previously set`);
    err.statusCode = 400;
    throw err;
  }

  if (value == null || value === "") {
    if (opts.allowEmpty && value === "") return "";
    // Allow empty password for basic
    if (opts.allowEmpty && (value === "" || value == null)) {
      if (typeof previous === "string") return previous;
      return "";
    }
    const err = new Error(`${label} is required`);
    err.statusCode = 400;
    throw err;
  }

  if (typeof value === "string") return value;

  if (typeof value === "object" && !Array.isArray(value)) {
    const v = /** @type {Record<string, unknown>} */ (value);
    if (typeof v.secret === "string" && v.secret.length > 0) {
      return { secret: v.secret };
    }
    if (typeof v.kv === "string" && v.kv.length > 0) {
      /** @type {{ kv: string, namespace?: string }} */
      const out = { kv: v.kv };
      if (typeof v.namespace === "string" && v.namespace.length > 0) {
        out.namespace = v.namespace;
      }
      return out;
    }
  }

  const err = new Error(
    `${label} must be a string, { kv }, { secret }, or { keep: true }`,
  );
  err.statusCode = 400;
  throw err;
}

function parseConfig(raw) {
  if (typeof raw !== "string") return raw ?? {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function publicAuth(row, { includeConfig = true } = {}) {
  const type = row.type;
  const config = parseConfig(row.config);
  return {
    id: row.id,
    name: row.name,
    type,
    ...(includeConfig ? { config: publicConfig(config, type) } : {}),
    unauthorized_status: row.unauthorized_status ?? null,
    unauthorized_response: row.unauthorized_response ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Internal: full config including literals (for runtime auth checks).
 * @param {string} id
 */
export async function getHttpAuthInternal(id) {
  const authId = assertAuthId(id);
  const row = await db("http_auths").where({ id: authId }).first();
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    config: parseConfig(row.config),
    unauthorized_status: row.unauthorized_status ?? null,
    unauthorized_response: row.unauthorized_response ?? null,
  };
}

/**
 * Return only plaintext literal credential fields (not KV refs or encrypted secrets).
 * @param {string} id
 * @returns {Promise<{ id: string, name: string, type: string, literals: Record<string, string> } | null>}
 */
export async function revealHttpAuthLiterals(id) {
  const internal = await getHttpAuthInternal(id);
  if (!internal) return null;
  /** @type {Record<string, string>} */
  const literals = {};
  const cfg = internal.config ?? {};
  for (const key of ["token", "user", "password", "value"]) {
    const v = cfg[key];
    if (typeof v === "string") literals[key] = v;
  }
  return {
    id: internal.id,
    name: internal.name,
    type: internal.type,
    literals,
  };
}

export async function listHttpAuths() {
  const rows = await db("http_auths").select("*").orderBy("name", "asc");
  return rows.map((r) => publicAuth(r));
}

/**
 * @param {string} id
 */
export async function getHttpAuthById(id) {
  let authId;
  try {
    authId = assertAuthId(id);
  } catch {
    return null;
  }
  const row = await db("http_auths").where({ id: authId }).first();
  return row ? publicAuth(row) : null;
}

/**
 * @param {{
 *   id?: string | null,
 *   name: string,
 *   type: string,
 *   config?: unknown,
 *   unauthorized_status?: number | null,
 *   unauthorized_response?: string | null,
 * }} opts
 */
export async function upsertHttpAuth({
  id,
  name,
  type,
  config,
  unauthorized_status,
  unauthorized_response,
}) {
  const authName = assertAuthName(name);
  const authType = assertAuthType(type);

  /** @type {Record<string, unknown> | null} */
  let existing = null;
  if (id != null && String(id).length > 0) {
    const authId = assertAuthId(id);
    existing = await db("http_auths").where({ id: authId }).first();
    if (!existing) {
      const err = new Error("auth not found");
      err.statusCode = 404;
      throw err;
    }
  }

  const nameClash = await db("http_auths").where({ name: authName }).first();
  if (nameClash && (!existing || nameClash.id !== existing.id)) {
    const err = new Error(`auth name "${authName}" already exists`);
    err.statusCode = 409;
    throw err;
  }

  const prevConfig = existing ? parseConfig(existing.config) : {};
  const normalized = normalizeAuthConfig(authType, config, {
    keepLiteralsFrom: prevConfig,
  });

  let unauthStatus = null;
  if (unauthorized_status != null && unauthorized_status !== "") {
    unauthStatus = assertHttpStatus(unauthorized_status, 401);
  }
  let unauthResponse = null;
  if (
    unauthorized_response != null &&
    String(unauthorized_response).length > 0
  ) {
    unauthResponse = String(unauthorized_response);
  }

  const now = nowIso();
  const configJson = JSON.stringify(normalized);

  if (existing) {
    await db("http_auths")
      .where({ id: existing.id })
      .update({
        name: authName,
        type: authType,
        config: configJson,
        unauthorized_status: unauthStatus,
        unauthorized_response: unauthResponse,
        updated_at: now,
      });
    return getHttpAuthById(/** @type {string} */ (existing.id));
  }

  const newId = randomUUID();
  await db("http_auths").insert({
    id: newId,
    name: authName,
    type: authType,
    config: configJson,
    unauthorized_status: unauthStatus,
    unauthorized_response: unauthResponse,
    created_at: now,
    updated_at: now,
  });
  return getHttpAuthById(newId);
}

/**
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteHttpAuth(id) {
  const authId = assertAuthId(id);
  const n = await db("http_auths").where({ id: authId }).del();
  return n > 0;
}
