import { timingSafeEqual } from "node:crypto";
import { kvGet } from "./kv-store.js";
import { getSecretPlaintext } from "./secrets-store.js";
import { getHttpAuthInternal, assertAuthType } from "./http-auths-store.js";
import { getHttpPageByName, contentTypeForMime, assertHttpResponsePage } from "./http-pages-store.js";
import { log } from "./logger.js";

/**
 * @param {string} a
 * @param {string} b
 */
function safeEqualString(a, b) {
  const ba = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Coerce a KV JSON value to a string credential. Objects fail closed.
 * @param {unknown} value
 * @returns {string | null}
 */
export function coerceCredentialString(value) {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

/**
 * Resolve a credential field: literal string, { kv }, or { secret }.
 * @param {unknown} field
 * @param {{ owner: string, workflowKey: string }} ctx
 * @returns {Promise<string | null>}
 */
export async function resolveCredentialValue(field, ctx) {
  if (field == null) return null;
  if (typeof field === "string") return field;

  if (typeof field === "object" && !Array.isArray(field)) {
    const f = /** @type {Record<string, unknown>} */ (field);

    if (typeof f.secret === "string" && f.secret.length > 0) {
      try {
        return await getSecretPlaintext(ctx.owner, f.secret);
      } catch (err) {
        log.warn(
          { err, secret: f.secret, owner: ctx.owner },
          "http auth: failed to resolve secret",
        );
        return null;
      }
    }

    if (typeof f.kv === "string" && f.kv.length > 0) {
      const namespace =
        typeof f.namespace === "string" && f.namespace.length > 0
          ? f.namespace
          : ctx.workflowKey;
      try {
        const raw = await kvGet(namespace, f.kv);
        return coerceCredentialString(raw);
      } catch (err) {
        log.warn(
          { err, kv: f.kv, namespace },
          "http auth: failed to resolve kv",
        );
        return null;
      }
    }
  }

  return null;
}

/**
 * @typedef {{
 *   type: string,
 *   config: Record<string, unknown>,
 *   unauthorized_status?: number | null,
 *   unauthorized_response?: string | null,
 *   label: string,
 * }} AuthMechanism
 */

/**
 * Resolve one auth entry (auth profile id UUID, or inline object).
 * @param {unknown} entry
 * @returns {Promise<AuthMechanism | null>}
 */
export async function resolveAuthMechanism(entry) {
  if (entry == null || entry === false) return null;

  if (typeof entry === "string") {
    try {
      const named = await getHttpAuthInternal(entry);
      if (!named) {
        log.warn({ id: entry }, "http auth: profile id not found");
        return null;
      }
      return {
        type: named.type,
        config: named.config,
        unauthorized_status: named.unauthorized_status,
        unauthorized_response: named.unauthorized_response,
        label: named.name,
      };
    } catch (err) {
      log.warn({ err, id: entry }, "http auth: invalid profile id");
      return null;
    }
  }

  if (typeof entry === "object" && !Array.isArray(entry)) {
    const obj = /** @type {Record<string, unknown>} */ (entry);
    if (typeof obj.id === "string" && obj.id.length > 0 && !obj.type) {
      return resolveAuthMechanism(obj.id);
    }
    try {
      const type = assertAuthType(obj.type);
      /** @type {Record<string, unknown>} */
      const config = { ...obj };
      delete config.type;
      delete config.name;
      delete config.id;
      return {
        type,
        config,
        unauthorized_status: null,
        unauthorized_response: null,
        label: type,
      };
    } catch (err) {
      log.warn({ err }, "http auth: invalid inline auth");
      return null;
    }
  }

  return null;
}

/**
 * Normalize trigger.auth (array of auth ids / inline objects) into mechanisms.
 * Empty / null / false → no auth. Any entry that fails to resolve is skipped;
 * if the field was non-empty but nothing resolves, returns [] (caller treats as unauthorized).
 * @param {unknown} authField
 * @returns {Promise<AuthMechanism[]>}
 */
export async function resolveAuthMechanisms(authField) {
  if (authField == null || authField === false) return [];
  if (!Array.isArray(authField) || authField.length === 0) return [];

  /** @type {AuthMechanism[]} */
  const out = [];
  for (const entry of authField) {
    const mech = await resolveAuthMechanism(entry);
    if (mech) out.push(mech);
  }
  return out;
}

/**
 * True if any mechanism accepts the request (OR).
 * @param {import("fastify").FastifyRequest} req
 * @param {AuthMechanism[]} mechanisms
 * @param {{ owner: string, workflowKey: string }} ctx
 */
export async function checkAnyHttpAuth(req, mechanisms, ctx) {
  for (const mechanism of mechanisms) {
    if (await checkHttpAuth(req, mechanism, ctx)) return true;
  }
  return false;
}

/**
 * Label for mermaid / summary (sync). Prefer resolved display names when provided.
 * @param {unknown} authField
 * @param {Map<string, string> | Record<string, string>} [nameById]
 */
export function authLabel(authField, nameById) {
  if (authField == null || authField === false) return null;
  if (!Array.isArray(authField) || authField.length === 0) return null;
  const lookup =
    nameById instanceof Map
      ? (id) => nameById.get(id)
      : nameById
        ? (id) => nameById[id]
        : () => undefined;
  const parts = authField.map((entry) => {
    if (typeof entry === "string") return lookup(entry) ?? entry;
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const o = /** @type {Record<string, unknown>} */ (entry);
      if (typeof o.id === "string" && o.id && !o.type) {
        return lookup(o.id) ?? o.id;
      }
      if (typeof o.type === "string" && o.type) return o.type;
    }
    return "auth";
  });
  return parts.join("|");
}

/**
 * @param {import("fastify").FastifyRequest} req
 * @param {{ type: string, config: Record<string, unknown> }} mechanism
 * @param {{ owner: string, workflowKey: string }} ctx
 * @returns {Promise<boolean>}
 */
export async function checkHttpAuth(req, mechanism, ctx) {
  const type = mechanism.type;
  const config = mechanism.config ?? {};

  if (type === "bearer") {
    const expected = await resolveCredentialValue(config.token, ctx);
    if (expected == null) return false;
    const header = req.headers.authorization;
    if (typeof header !== "string") return false;
    const m = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (!m) return false;
    return safeEqualString(m[1], expected);
  }

  if (type === "basic") {
    const expectedUser = await resolveCredentialValue(config.user, ctx);
    if (expectedUser == null) return false;
    const expectedPass =
      (await resolveCredentialValue(config.password, ctx)) ?? "";
    const header = req.headers.authorization;
    if (typeof header !== "string") return false;
    const m = /^Basic\s+(.+)$/i.exec(header.trim());
    if (!m) return false;
    let decoded;
    try {
      decoded = Buffer.from(m[1], "base64").toString("utf8");
    } catch {
      return false;
    }
    const colon = decoded.indexOf(":");
    const user = colon === -1 ? decoded : decoded.slice(0, colon);
    const pass = colon === -1 ? "" : decoded.slice(colon + 1);
    return safeEqualString(user, expectedUser) && safeEqualString(pass, expectedPass);
  }

  if (type === "header") {
    const headerName = config.header;
    if (typeof headerName !== "string" || headerName.length === 0) return false;
    const expected = await resolveCredentialValue(config.value, ctx);
    if (expected == null) return false;
    const actual = req.headers[headerName.toLowerCase()];
    if (actual == null) return false;
    const actualStr = Array.isArray(actual) ? actual[0] : String(actual);
    return safeEqualString(actualStr, expected);
  }

  return false;
}

/**
 * Resolve unauthorized response settings from trigger + named profile defaults.
 * @param {Record<string, unknown> | undefined} trigger
 * @param {{ unauthorized_status?: number | null, unauthorized_response?: string | null } | null} mechanism
 */
export function resolveUnauthorizedSpec(trigger, mechanism) {
  const unauth =
    trigger?.unauthorized &&
    typeof trigger.unauthorized === "object" &&
    !Array.isArray(trigger.unauthorized)
      ? /** @type {Record<string, unknown>} */ (trigger.unauthorized)
      : {};

  let status = 401;
  if (unauth.status != null) {
    const n = Number(unauth.status);
    if (Number.isInteger(n) && n >= 100 && n <= 599) status = n;
  } else if (mechanism?.unauthorized_status != null) {
    status = mechanism.unauthorized_status;
  }

  let pageName = null;
  if (typeof unauth.response === "string" && unauth.response.length > 0) {
    pageName = unauth.response;
  } else if (
    typeof mechanism?.unauthorized_response === "string" &&
    mechanism.unauthorized_response.length > 0
  ) {
    pageName = mechanism.unauthorized_response;
  }

  return { status, pageName };
}

/**
 * Send a named HTTP page or a default JSON body.
 * @param {import("fastify").FastifyReply} reply
 * @param {number} status
 * @param {string | null} pageName
 * @param {unknown} [fallbackBody]
 */
export async function sendHttpPageOrJson(reply, status, pageName, fallbackBody) {
  if (pageName) {
    const page = await getHttpPageByName(pageName);
    if (page && page.kind !== "template") {
      const code = status ?? page.status;
      return reply
        .code(code)
        .type(contentTypeForMime(page.mime))
        .send(page.content);
    }
    if (page?.kind === "template") {
      log.warn({ pageName }, "http template page cannot be used as HTTP response");
    } else {
      log.warn({ pageName }, "http page not found; using fallback");
    }
  }
  return reply.code(status).send(fallbackBody ?? { error: "unauthorized" });
}

/**
 * Send a named success response page (uses page's own status by default).
 * @param {import("fastify").FastifyReply} reply
 * @param {string} pageName
 * @param {unknown} [fallbackBody]
 */
export async function sendSuccessPage(reply, pageName, fallbackBody) {
  const page = await getHttpPageByName(pageName);
  if (page && page.kind !== "template") {
    return reply
      .code(page.status)
      .type(contentTypeForMime(page.mime))
      .send(page.content);
  }
  if (page?.kind === "template") {
    log.warn({ pageName }, "html template page cannot be used as HTTP success response");
  } else {
    log.warn({ pageName }, "success page not found; using default JSON");
  }
  return reply.send(fallbackBody);
}
