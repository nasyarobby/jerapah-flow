import { randomUUID } from "node:crypto";
import yaml from "yaml";
import { db } from "../../db.js";
import { assertOwner, listOwnerYamlFiles, readWorkflowYaml } from "../../fs-store.js";

const MAX_NAME_LENGTH = 128;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_CONFIG_BYTES = 64 * 1024;
const PROFILE_NAME_RE = /^[A-Za-z0-9._-]+$/;

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
export function assertProfileName(name) {
  if (typeof name !== "string" || !PROFILE_NAME_RE.test(name)) {
    throw httpError("invalid profile name");
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw httpError(`profile name must be at most ${MAX_NAME_LENGTH} characters`);
  }
  return name;
}

/**
 * @param {unknown} script
 * @returns {string}
 */
export function assertProfileScript(script) {
  if (typeof script !== "string" || script.trim().length === 0) {
    throw httpError("script is required");
  }
  const trimmed = script.trim();
  if (trimmed.length > 256) {
    throw httpError("script name is too long");
  }
  return trimmed;
}

/**
 * @param {unknown} description
 * @returns {string}
 */
export function assertProfileDescription(description) {
  if (description == null) return "";
  if (typeof description !== "string") {
    throw httpError("description must be a string");
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw httpError(`description must be at most ${MAX_DESCRIPTION_LENGTH} characters`);
  }
  return description;
}

/**
 * @param {unknown} config
 * @returns {string}
 */
export function encodeProfileConfig(config) {
  if (config == null) return "{}";
  if (typeof config !== "object" || Array.isArray(config)) {
    throw httpError("config must be an object");
  }
  let encoded;
  try {
    encoded = JSON.stringify(config);
  } catch {
    throw httpError("config must be JSON-serializable");
  }
  if (Buffer.byteLength(encoded, "utf8") > MAX_CONFIG_BYTES) {
    throw httpError(`config exceeds ${MAX_CONFIG_BYTES} byte limit`);
  }
  return encoded;
}

/**
 * @param {string} stored
 * @returns {Record<string, unknown>}
 */
export function decodeProfileConfig(stored) {
  if (stored == null || stored === "") return {};
  try {
    const parsed = JSON.parse(stored);
    if (parsed != null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    throw new Error(`corrupt profile config: ${JSON.stringify(stored).slice(0, 80)}`);
  }
  throw new Error("corrupt profile config: not an object");
}

/**
 * @param {Record<string, unknown>} row
 */
function publicProfile(row) {
  return {
    id: row.id,
    owner: row.owner,
    name: row.name,
    script: row.script,
    config: decodeProfileConfig(String(row.config ?? "{}")),
    description: row.description == null ? "" : String(row.description),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * @param {{ owner?: string }} [filters]
 */
export async function listProfiles(filters = {}) {
  let q = db("profiles")
    .select("id", "owner", "name", "script", "config", "description", "created_at", "updated_at")
    .orderBy("owner", "asc")
    .orderBy("name", "asc");
  if (filters.owner) {
    q = q.where("owner", assertOwner(filters.owner));
  }
  const rows = await q;
  return rows.map((row) => publicProfile(row));
}

/**
 * @param {string} id
 */
export async function getProfileById(id) {
  const row = await db("profiles").where({ id }).first();
  return row ? publicProfile(row) : null;
}

/**
 * @param {string} owner
 * @param {string} name
 */
export async function getProfilePlain(owner, name) {
  const ownerName = assertOwner(owner);
  const profileName = assertProfileName(name);
  const row = await db("profiles").where({ owner: ownerName, name: profileName }).first();
  return row ? publicProfile(row) : null;
}

/**
 * @param {{
 *   owner: string,
 *   name: string,
 *   script: unknown,
 *   config?: unknown,
 *   description?: unknown,
 * }} opts
 */
export async function upsertProfile({ owner, name, script, config, description }) {
  const ownerName = assertOwner(owner);
  const profileName = assertProfileName(name);
  const scriptName = assertProfileScript(script);
  const encoded = encodeProfileConfig(config ?? {});
  const desc = assertProfileDescription(description);
  const now = nowIso();
  const existing = await db("profiles").where({ owner: ownerName, name: profileName }).first();

  if (existing) {
    await db("profiles")
      .where({ id: existing.id })
      .update({
        script: scriptName,
        config: encoded,
        description: desc,
        updated_at: now,
      });
    return getProfileById(existing.id);
  }

  const id = randomUUID();
  await db("profiles").insert({
    id,
    owner: ownerName,
    name: profileName,
    script: scriptName,
    config: encoded,
    description: desc,
    created_at: now,
    updated_at: now,
  });
  return getProfileById(id);
}

/**
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteProfile(id) {
  const n = await db("profiles").where({ id }).del();
  return n > 0;
}

/**
 * Workflows (same owner) whose YAML steps reference this profile name.
 * @param {string} owner
 * @param {string} name
 * @returns {{ file: string, name: string, steps: number }[]}
 */
export function listProfileUsages(owner, name) {
  const ownerName = assertOwner(owner);
  const profileName = assertProfileName(name);
  /** @type {{ file: string, name: string, steps: number }[]} */
  const usages = [];
  for (const file of listOwnerYamlFiles(ownerName)) {
    const content = readWorkflowYaml(ownerName, file);
    if (content == null) continue;
    let parsed;
    try {
      parsed = yaml.parse(content);
    } catch {
      continue;
    }
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    const scripts = parsed.scripts;
    if (!Array.isArray(scripts)) continue;
    let steps = 0;
    for (const step of scripts) {
      if (step != null && typeof step === "object" && !Array.isArray(step) && step.profile === profileName) {
        steps += 1;
      }
    }
    if (steps > 0) {
      usages.push({
        file,
        name: typeof parsed.name === "string" && parsed.name ? parsed.name : file,
        steps,
      });
    }
  }
  return usages;
}
