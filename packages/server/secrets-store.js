import { randomUUID } from "node:crypto";
import { db } from "./db.js";
import { assertOwner } from "./fs-store.js";
import { decryptSecret, encryptSecret } from "./secrets.js";
import { MIN_SECRET_LENGTH, registerPlaintext } from "./secret-value.js";

const MAX_NAME_LENGTH = 128;
const SECRET_NAME_RE = /^[A-Za-z0-9._-]+$/;

function nowIso() {
  return new Date().toISOString();
}

/**
 * @param {unknown} name
 * @returns {string}
 */
export function assertSecretName(name) {
  if (typeof name !== "string" || !SECRET_NAME_RE.test(name)) {
    const err = new Error("invalid secret name");
    err.statusCode = 400;
    throw err;
  }
  if (name.length > MAX_NAME_LENGTH) {
    const err = new Error(`secret name must be at most ${MAX_NAME_LENGTH} characters`);
    err.statusCode = 400;
    throw err;
  }
  return name;
}

function publicSecret(row) {
  return {
    id: row.id,
    owner: row.owner,
    name: row.name,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * @param {{ owner?: string }} [filters]
 */
export async function listSecrets(filters = {}) {
  let q = db("secrets")
    .select("id", "owner", "name", "created_at", "updated_at")
    .orderBy("owner", "asc")
    .orderBy("name", "asc");
  if (filters.owner) {
    q = q.where("owner", assertOwner(filters.owner));
  }
  return q;
}

/**
 * @param {string} id
 */
export async function getSecretById(id) {
  const row = await db("secrets")
    .select("id", "owner", "name", "created_at", "updated_at")
    .where({ id })
    .first();
  return row ?? null;
}

/**
 * @param {{ owner: string, name: string, value: string }} opts
 */
export async function upsertSecret({ owner, name, value }) {
  if (typeof value !== "string" || value.length < MIN_SECRET_LENGTH) {
    const err = new Error(`value must be at least ${MIN_SECRET_LENGTH} characters`);
    err.statusCode = 400;
    throw err;
  }
  const ownerName = assertOwner(owner);
  const secretName = assertSecretName(name);
  registerPlaintext(value);
  const { ciphertext, iv, authTag } = encryptSecret(value);
  const now = nowIso();
  const existing = await db("secrets")
    .where({ owner: ownerName, name: secretName })
    .first();

  if (existing) {
    await db("secrets")
      .where({ id: existing.id })
      .update({
        ciphertext,
        iv,
        auth_tag: authTag,
        updated_at: now,
      });
    return getSecretById(existing.id);
  }

  const id = randomUUID();
  await db("secrets").insert({
    id,
    owner: ownerName,
    name: secretName,
    ciphertext,
    iv,
    auth_tag: authTag,
    created_at: now,
    updated_at: now,
  });
  return getSecretById(id);
}

/**
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteSecret(id) {
  const n = await db("secrets").where({ id }).del();
  return n > 0;
}

/**
 * Decrypt a named secret for an owner. Returns null if missing.
 * @param {string} owner
 * @param {string} name
 * @returns {Promise<string | null>}
 */
export async function getSecretPlaintext(owner, name) {
  const ownerName = assertOwner(owner);
  const secretName = assertSecretName(name);
  const row = await db("secrets")
    .where({ owner: ownerName, name: secretName })
    .first();
  if (!row) return null;
  try {
    const plaintext = decryptSecret({
      ciphertext: row.ciphertext,
      iv: row.iv,
      authTag: row.auth_tag,
    });
    registerPlaintext(plaintext);
    return plaintext;
  } catch {
    throw new Error(`failed to decrypt secret "${secretName}"`);
  }
}
