import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const DEV_DEFAULT = "jflow-dev-secrets-key";
const SCRYPT_SALT = Buffer.from("jflow-secrets-v1");
const KEY_LEN = 32;
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;

/**
 * @returns {string}
 */
export function resolveSecretsKeyMaterial() {
  const raw =
    process.env.JFLOW_SECRETS_KEY ??
    (process.env.NODE_ENV === "production" ? "" : DEV_DEFAULT);
  if (!raw) {
    throw new Error("JFLOW_SECRETS_KEY is required in production");
  }
  return raw;
}

/** @type {Buffer | null} */
let cachedKey = null;

/**
 * @returns {Buffer}
 */
function getMasterKey() {
  if (cachedKey) return cachedKey;
  const raw = resolveSecretsKeyMaterial();
  cachedKey = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : scryptSync(raw, SCRYPT_SALT, KEY_LEN);
  return cachedKey;
}

/**
 * @param {string} plaintext
 * @returns {{ ciphertext: string, iv: string, authTag: string }}
 */
export function encryptSecret(plaintext) {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", getMasterKey(), iv, {
    authTagLength: AUTH_TAG_LEN,
  });
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

/**
 * @param {{ ciphertext: string, iv: string, authTag: string }} row
 * @returns {string}
 */
export function decryptSecret(row) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getMasterKey(),
    Buffer.from(row.iv, "base64"),
    { authTagLength: AUTH_TAG_LEN },
  );
  decipher.setAuthTag(Buffer.from(row.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(row.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
