/**
 * Validate HTTP trigger auth / response fields on workflow save.
 */
import {
  assertAuthId,
  assertAuthType,
  getHttpAuthById,
} from "./http-auths-store.js";
import { getHttpPageByName, assertHttpResponsePage } from "./http-pages-store.js";
import { authLabel } from "./http-trigger-auth.js";

/**
 * @param {unknown} field
 * @param {string} label
 */
function assertCredentialFieldShape(field, label) {
  if (typeof field === "string") return;
  if (field && typeof field === "object" && !Array.isArray(field)) {
    const f = /** @type {Record<string, unknown>} */ (field);
    if (typeof f.secret === "string" && f.secret.length > 0) return;
    if (typeof f.kv === "string" && f.kv.length > 0) return;
  }
  const err = new Error(
    `${label} must be a string, { kv: "..." }, or { secret: "..." }`,
  );
  err.statusCode = 400;
  throw err;
}

/**
 * @param {unknown} entry
 * @param {string} path
 */
async function validateAuthEntry(entry, path) {
  if (typeof entry === "string") {
    try {
      assertAuthId(entry);
    } catch {
      const err = new Error(`${path} must be an auth profile UUID`);
      err.statusCode = 400;
      throw err;
    }
    const named = await getHttpAuthById(entry);
    if (!named) {
      const err = new Error(`unknown auth profile id "${entry}"`);
      err.statusCode = 400;
      throw err;
    }
    return;
  }

  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    const obj = /** @type {Record<string, unknown>} */ (entry);
    if (typeof obj.id === "string" && obj.id.length > 0 && !obj.type) {
      await validateAuthEntry(obj.id, path);
      return;
    }
    const type = assertAuthType(obj.type);
    if (type === "bearer") {
      assertCredentialFieldShape(obj.token, `${path}.token`);
    } else if (type === "basic") {
      assertCredentialFieldShape(obj.user, `${path}.user`);
      if (obj.password != null && obj.password !== "") {
        assertCredentialFieldShape(obj.password, `${path}.password`);
      }
    } else if (type === "header") {
      if (typeof obj.header !== "string" || obj.header.length === 0) {
        const err = new Error(`${path}.header must be a non-empty string`);
        err.statusCode = 400;
        throw err;
      }
      assertCredentialFieldShape(obj.value, `${path}.value`);
    }
    return;
  }

  const err = new Error(
    `${path} must be an auth profile UUID or an inline auth object`,
  );
  err.statusCode = 400;
  throw err;
}

/**
 * auth is an array of auth profile UUIDs and/or inline auth objects (OR).
 * null / false / [] = no auth.
 * @param {unknown} auth
 */
async function validateAuthField(auth) {
  if (auth == null || auth === false) return;

  if (!Array.isArray(auth)) {
    const err = new Error(
      "auth must be an array of auth profile UUIDs and/or inline auth objects",
    );
    err.statusCode = 400;
    throw err;
  }

  for (let i = 0; i < auth.length; i++) {
    await validateAuthEntry(auth[i], `auth[${i}]`);
  }
}

/**
 * @param {unknown} pageName
 * @param {string} label
 */
async function validatePageRef(pageName, label) {
  if (pageName == null || pageName === "") return;
  if (typeof pageName !== "string") {
    const err = new Error(`${label} must be a string`);
    err.statusCode = 400;
    throw err;
  }
  const page = await getHttpPageByName(pageName);
  assertHttpResponsePage(page, pageName, label);
}

/**
 * @param {unknown} workflow
 */
export async function validateWorkflowHttpTriggers(workflow) {
  if (!workflow || typeof workflow !== "object") return;
  const triggers = /** @type {{ triggers?: unknown[] }} */ (workflow).triggers;
  if (!Array.isArray(triggers)) return;

  for (const t of triggers) {
    if (!t || typeof t !== "object") continue;
    const trigger = /** @type {Record<string, unknown>} */ (t);
    if (String(trigger.type) !== "HTTP") continue;

    await validateAuthField(trigger.auth);

    if (
      trigger.unauthorized &&
      typeof trigger.unauthorized === "object" &&
      !Array.isArray(trigger.unauthorized)
    ) {
      const u = /** @type {Record<string, unknown>} */ (trigger.unauthorized);
      if (u.status != null) {
        const n = Number(u.status);
        if (!Number.isInteger(n) || n < 100 || n > 599) {
          const err = new Error("unauthorized.status must be 100-599");
          err.statusCode = 400;
          throw err;
        }
      }
      await validatePageRef(u.response, "unauthorized.response");
    }

    await validatePageRef(trigger.response, "response");
  }
}

export { authLabel };
