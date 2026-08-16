import { randomUUID } from "node:crypto";
import { db } from "./db.js";
import { assertOwner } from "./fs-store.js";

const MAX_NAME_LENGTH = 128;
const MAX_STRING_BYTES = 64 * 1024;
const VARIABLE_NAME_RE = /^[A-Za-z0-9._-]+$/;
export const VARIABLE_TYPES = /** @type {const} */ (["string", "number", "boolean"]);

function nowIso() {
  return new Date().toISOString();
}

function httpError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

/**
 * @param {unknown} name
 * @returns {string}
 */
export function assertVariableName(name) {
  if (typeof name !== "string" || !VARIABLE_NAME_RE.test(name)) {
    throw httpError("invalid variable name");
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw httpError(`variable name must be at most ${MAX_NAME_LENGTH} characters`);
  }
  return name;
}

/**
 * @param {unknown} type
 * @returns {"string" | "number" | "boolean"}
 */
export function assertVariableType(type) {
  if (type !== "string" && type !== "number" && type !== "boolean") {
    throw httpError("type must be string, number, or boolean");
  }
  return type;
}

/**
 * @param {"string" | "number" | "boolean"} type
 * @param {unknown} value
 * @returns {string}
 */
export function encodeVariableValue(type, value) {
  if (type === "string") {
    if (typeof value !== "string") {
      throw httpError("value must be a string");
    }
    if (Buffer.byteLength(value, "utf8") > MAX_STRING_BYTES) {
      throw httpError(`value exceeds ${MAX_STRING_BYTES} byte limit`);
    }
    return value;
  }
  if (type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw httpError("value must be a finite number");
    }
    return String(value);
  }
  if (typeof value !== "boolean") {
    throw httpError("value must be a boolean");
  }
  return value ? "true" : "false";
}

/**
 * @param {"string" | "number" | "boolean"} type
 * @param {string} stored
 * @returns {string | number | boolean}
 */
export function decodeVariableValue(type, stored) {
  if (type === "string") return stored;
  if (type === "number") {
    const n = Number(stored);
    if (!Number.isFinite(n)) {
      throw new Error(`corrupt number variable: ${JSON.stringify(stored)}`);
    }
    return n;
  }
  if (stored === "true") return true;
  if (stored === "false") return false;
  throw new Error(`corrupt boolean variable: ${JSON.stringify(stored)}`);
}

/**
 * @param {Record<string, unknown>} row
 */
function publicVariable(row) {
  const type = assertVariableType(row.type);
  return {
    id: row.id,
    owner: row.owner,
    name: row.name,
    type,
    value: decodeVariableValue(type, String(row.value ?? "")),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * @param {{ owner?: string }} [filters]
 */
export async function listVariables(filters = {}) {
  let q = db("variables")
    .select("id", "owner", "name", "type", "value", "created_at", "updated_at")
    .orderBy("owner", "asc")
    .orderBy("name", "asc");
  if (filters.owner) {
    q = q.where("owner", assertOwner(filters.owner));
  }
  const rows = await q;
  return rows.map((row) => publicVariable(row));
}

/**
 * @param {string} id
 */
export async function getVariableById(id) {
  const row = await db("variables").where({ id }).first();
  return row ? publicVariable(row) : null;
}

/**
 * @param {{ owner: string, name: string, type: unknown, value: unknown }} opts
 */
export async function upsertVariable({ owner, name, type, value }) {
  const ownerName = assertOwner(owner);
  const variableName = assertVariableName(name);
  const variableType = assertVariableType(type);
  const encoded = encodeVariableValue(variableType, value);
  const now = nowIso();
  const existing = await db("variables")
    .where({ owner: ownerName, name: variableName })
    .first();

  if (existing) {
    await db("variables")
      .where({ id: existing.id })
      .update({
        type: variableType,
        value: encoded,
        updated_at: now,
      });
    return getVariableById(existing.id);
  }

  const id = randomUUID();
  await db("variables").insert({
    id,
    owner: ownerName,
    name: variableName,
    type: variableType,
    value: encoded,
    created_at: now,
    updated_at: now,
  });
  return getVariableById(id);
}

/**
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteVariable(id) {
  const n = await db("variables").where({ id }).del();
  return n > 0;
}

/**
 * Typed primitive for an owner/name. Returns null if missing.
 * @param {string} owner
 * @param {string} name
 * @returns {Promise<string | number | boolean | null>}
 */
export async function getVariablePlain(owner, name) {
  const ownerName = assertOwner(owner);
  const variableName = assertVariableName(name);
  const row = await db("variables")
    .where({ owner: ownerName, name: variableName })
    .first();
  if (!row) return null;
  return decodeVariableValue(assertVariableType(row.type), String(row.value ?? ""));
}
