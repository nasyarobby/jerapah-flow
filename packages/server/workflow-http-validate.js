/**
 * Validate HTTP trigger auth / response fields on workflow save.
 */
import { assertAuthType, getHttpAuthByName } from "./http-auths-store.js";
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
 * @param {unknown} auth
 */
async function validateAuthField(auth) {
  if (auth == null || auth === false) return;

  if (typeof auth === "string") {
    const named = await getHttpAuthByName(auth);
    if (!named) {
      const err = new Error(`unknown auth profile "${auth}"`);
      err.statusCode = 400;
      throw err;
    }
    return;
  }

  if (typeof auth === "object" && !Array.isArray(auth)) {
    const obj = /** @type {Record<string, unknown>} */ (auth);
    if (typeof obj.name === "string" && obj.name.length > 0 && !obj.type) {
      await validateAuthField(obj.name);
      return;
    }
    const type = assertAuthType(obj.type);
    if (type === "bearer") {
      assertCredentialFieldShape(obj.token, "auth.token");
    } else if (type === "basic") {
      assertCredentialFieldShape(obj.user, "auth.user");
      if (obj.password != null && obj.password !== "") {
        assertCredentialFieldShape(obj.password, "auth.password");
      }
    } else if (type === "header") {
      if (typeof obj.header !== "string" || obj.header.length === 0) {
        const err = new Error("auth.header must be a non-empty string");
        err.statusCode = 400;
        throw err;
      }
      assertCredentialFieldShape(obj.value, "auth.value");
    }
    return;
  }

  const err = new Error("auth must be a profile name or an auth object");
  err.statusCode = 400;
  throw err;
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
