import fs from "fs";
import path from "path";
import { getAppVersion, satisfiesRange } from "./app-version.js";

export const PLUGIN_MANIFEST = "jerapah-plugin.json";
export const PLUGIN_PREFIX = "plugin/";

/**
 * @param {string} id
 * @returns {string}
 */
export function assertPluginId(id) {
  if (typeof id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    const err = new Error(
      "invalid plugin id (use lowercase letters, numbers, hyphens)",
    );
    err.statusCode = 400;
    throw err;
  }
  if (id.length > 64) {
    const err = new Error("plugin id too long");
    err.statusCode = 400;
    throw err;
  }
  return id;
}

/**
 * @param {string} scriptRef  e.g. plugin/foo or plugin/foo.js
 * @returns {{ id: string, scriptRef: string } | null}
 */
export function parsePluginScriptRef(scriptRef) {
  if (typeof scriptRef !== "string") return null;
  let rest = scriptRef;
  if (rest.startsWith(PLUGIN_PREFIX)) {
    rest = rest.slice(PLUGIN_PREFIX.length);
  } else {
    return null;
  }
  if (rest.endsWith(".js")) rest = rest.slice(0, -3);
  if (!rest || rest.includes("/") || rest.includes("\\")) return null;
  try {
    const id = assertPluginId(rest);
    return { id, scriptRef: `${PLUGIN_PREFIX}${id}` };
  } catch {
    return null;
  }
}

/**
 * @param {string} id
 * @returns {string}
 */
export function pluginScriptRef(id) {
  return `${PLUGIN_PREFIX}${assertPluginId(id)}`;
}

/**
 * @param {unknown} raw
 * @returns {{
 *   id: string,
 *   name: string,
 *   version: string,
 *   jerapah: string,
 *   main: string,
 *   description: string | null,
 * }}
 */
export function validateManifest(raw) {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    const err = new Error("manifest must be an object");
    err.statusCode = 400;
    throw err;
  }
  const id = assertPluginId(String(/** @type {any} */ (raw).id ?? ""));
  const version = String(/** @type {any} */ (raw).version ?? "").trim();
  if (!/^\d+\.\d+\.\d+/.test(version)) {
    const err = new Error("manifest.version must be semver (e.g. 0.1.0)");
    err.statusCode = 400;
    throw err;
  }
  const jerapah = String(/** @type {any} */ (raw).jerapah ?? "").trim();
  if (!jerapah) {
    const err = new Error("manifest.jerapah range is required");
    err.statusCode = 400;
    throw err;
  }
  const main = String(/** @type {any} */ (raw).main ?? "script.js").trim();
  if (!main || main.includes("..") || path.isAbsolute(main)) {
    const err = new Error("manifest.main must be a relative file path");
    err.statusCode = 400;
    throw err;
  }
  const name =
    String(/** @type {any} */ (raw).name ?? id).trim() || id;
  const descriptionRaw = /** @type {any} */ (raw).description;
  const description =
    typeof descriptionRaw === "string" && descriptionRaw.trim()
      ? descriptionRaw.trim()
      : null;
  return { id, name, version, jerapah, main, description };
}

/**
 * @param {string} pluginDir
 */
export function readManifestFile(pluginDir) {
  const filePath = path.join(pluginDir, PLUGIN_MANIFEST);
  if (!fs.existsSync(filePath)) {
    const err = new Error(`missing ${PLUGIN_MANIFEST}`);
    err.statusCode = 400;
    throw err;
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    const err = new Error(`invalid ${PLUGIN_MANIFEST} JSON`);
    err.statusCode = 400;
    throw err;
  }
  return validateManifest(raw);
}

/**
 * @param {ReturnType<typeof validateManifest>} manifest
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function checkJerapahCompat(manifest) {
  const appVersion = getAppVersion();
  if (!satisfiesRange(appVersion, manifest.jerapah)) {
    return {
      ok: false,
      error: `plugin requires JerapahFlow ${manifest.jerapah}; app is ${appVersion}`,
    };
  }
  return { ok: true };
}

/**
 * @param {{
 *   id: string,
 *   name?: string,
 *   version?: string,
 *   jerapah?: string,
 *   main?: string,
 *   description?: string | null,
 * }} opts
 */
export function buildManifest(opts) {
  return validateManifest({
    id: opts.id,
    name: opts.name ?? opts.id,
    version: opts.version ?? "0.1.0",
    jerapah: opts.jerapah ?? ">=0.1.0 <1.0.0",
    main: opts.main ?? "script.js",
    description: opts.description ?? null,
  });
}
