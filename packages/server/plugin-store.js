import fs from "fs";
import path from "path";
import { createRequire } from "node:module";
import { PLUGINS_DIR, SCRIPTS_DIR } from "./paths.js";
import {
  PLUGIN_MANIFEST,
  assertPluginId,
  buildManifest,
  checkJerapahCompat,
  parsePluginScriptRef,
  pluginScriptRef,
  readManifestFile,
  validateManifest,
} from "./plugin-manifest.js";
import { listScriptFiles } from "./fs-store.js";
import { bumpGeneration } from "./control-state.js";

/**
 * @param {string} id
 */
export function pluginDir(id) {
  return path.join(PLUGINS_DIR, assertPluginId(id));
}

export function ensurePluginsDir() {
  fs.mkdirSync(PLUGINS_DIR, { recursive: true });
}

/**
 * Core script file names (*.js) currently shipped under SCRIPTS_DIR.
 * @returns {string[]}
 */
export function listCoreScriptNames() {
  return listScriptFiles();
}

/**
 * Bare core names without .js (for collision checks).
 * @returns {Set<string>}
 */
export function coreBareNames() {
  return new Set(
    listCoreScriptNames().map((n) => (n.endsWith(".js") ? n.slice(0, -3) : n)),
  );
}

/**
 * @returns {Array<{
 *   id: string,
 *   scriptRef: string,
 *   dir: string,
 *   manifest: ReturnType<typeof readManifestFile>,
 *   compatible: boolean,
 *   compatError: string | null,
 *   disabled: boolean,
 * }>}
 */
export function listInstalledPlugins() {
  ensurePluginsDir();
  if (!fs.existsSync(PLUGINS_DIR)) return [];
  /** @type {Array<any>} */
  const out = [];
  for (const entry of fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    let id;
    try {
      id = assertPluginId(entry.name);
    } catch {
      continue;
    }
    const dir = pluginDir(id);
    try {
      const manifest = readManifestFile(dir);
      if (manifest.id !== id) {
        out.push({
          id,
          scriptRef: pluginScriptRef(id),
          dir,
          manifest,
          compatible: false,
          compatError: `manifest id "${manifest.id}" does not match folder "${id}"`,
          disabled: true,
        });
        continue;
      }
      const compat = checkJerapahCompat(manifest);
      const disabledFlag = fs.existsSync(path.join(dir, ".disabled"));
      out.push({
        id,
        scriptRef: pluginScriptRef(id),
        dir,
        manifest,
        compatible: compat.ok,
        compatError: compat.ok ? null : compat.error,
        disabled: disabledFlag || !compat.ok,
      });
    } catch (err) {
      out.push({
        id,
        scriptRef: pluginScriptRef(id),
        dir,
        manifest: null,
        compatible: false,
        compatError: err instanceof Error ? err.message : String(err),
        disabled: true,
      });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * @param {string} id
 */
export function getInstalledPlugin(id) {
  const needle = assertPluginId(id);
  return listInstalledPlugins().find((p) => p.id === needle) ?? null;
}

/**
 * Resolve a workflow script ref to a filesystem path + kind.
 *
 * @param {string} scriptRef
 * @returns {{
 *   kind: "core" | "plugin",
 *   scriptRef: string,
 *   filePath: string,
 *   pluginId?: string,
 *   pluginDir?: string,
 *   disabled?: boolean,
 *   error?: string,
 * }}
 */
export function resolveScriptRef(scriptRef) {
  if (typeof scriptRef !== "string" || !scriptRef.trim()) {
    return {
      kind: "core",
      scriptRef: String(scriptRef),
      filePath: "",
      error: "invalid script ref",
    };
  }

  const plugin = parsePluginScriptRef(scriptRef);
  if (plugin) {
    const installed = getInstalledPlugin(plugin.id);
    if (!installed) {
      return {
        kind: "plugin",
        scriptRef: plugin.scriptRef,
        pluginId: plugin.id,
        filePath: "",
        error: `plugin not installed: ${plugin.scriptRef}`,
      };
    }
    if (installed.disabled) {
      return {
        kind: "plugin",
        scriptRef: plugin.scriptRef,
        pluginId: plugin.id,
        pluginDir: installed.dir,
        filePath: "",
        disabled: true,
        error:
          installed.compatError ||
          `plugin disabled: ${plugin.scriptRef}`,
      };
    }
    const mainPath = path.join(installed.dir, installed.manifest.main);
    if (!fs.existsSync(mainPath)) {
      return {
        kind: "plugin",
        scriptRef: plugin.scriptRef,
        pluginId: plugin.id,
        pluginDir: installed.dir,
        filePath: "",
        error: `plugin main missing: ${installed.manifest.main}`,
      };
    }
    return {
      kind: "plugin",
      scriptRef: plugin.scriptRef,
      pluginId: plugin.id,
      pluginDir: installed.dir,
      filePath: mainPath,
    };
  }

  // Core: must be a plain *.js filename
  if (
    scriptRef.includes("/") ||
    scriptRef.includes("\\") ||
    scriptRef.includes("..")
  ) {
    return {
      kind: "core",
      scriptRef,
      filePath: "",
      error: "invalid core script name",
    };
  }
  const name = scriptRef.endsWith(".js") ? scriptRef : `${scriptRef}.js`;
  const filePath = path.join(SCRIPTS_DIR, name);
  if (!fs.existsSync(filePath)) {
    return {
      kind: "core",
      scriptRef: name,
      filePath: "",
      error: `core script not found: ${name}`,
    };
  }
  return { kind: "core", scriptRef: name, filePath };
}

/**
 * Copy a prepared plugin directory into PLUGINS_DIR.
 *
 * @param {string} sourceDir  directory containing jerapah-plugin.json
 * @param {{ overwrite?: boolean, markRestart?: boolean, reason?: string }} [opts]
 */
export function installPluginFromDirectory(sourceDir, opts = {}) {
  const abs = path.resolve(sourceDir);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    const err = new Error("plugin source directory not found");
    err.statusCode = 400;
    throw err;
  }
  const manifest = readManifestFile(abs);
  const compat = checkJerapahCompat(manifest);
  if (!compat.ok) {
    const err = new Error(compat.error);
    err.statusCode = 409;
    throw err;
  }
  if (coreBareNames().has(manifest.id)) {
    const err = new Error(
      `plugin id "${manifest.id}" collides with a core script name`,
    );
    err.statusCode = 409;
    throw err;
  }

  const mainPath = path.join(abs, manifest.main);
  if (!fs.existsSync(mainPath)) {
    const err = new Error(`manifest.main not found: ${manifest.main}`);
    err.statusCode = 400;
    throw err;
  }

  ensurePluginsDir();
  const dest = pluginDir(manifest.id);
  if (fs.existsSync(dest)) {
    if (!opts.overwrite) {
      const err = new Error(`plugin already installed: ${manifest.id}`);
      err.statusCode = 409;
      throw err;
    }
    fs.rmSync(dest, { recursive: true, force: true });
  }

  fs.cpSync(abs, dest, { recursive: true });

  // Ensure package.json exists (fork / thin plugins).
  const pkgPath = path.join(dest, "package.json");
  if (!fs.existsSync(pkgPath)) {
    fs.writeFileSync(
      pkgPath,
      `${JSON.stringify(
        {
          name: `jflow-plugin-${manifest.id}`,
          version: manifest.version,
          private: true,
          type: "module",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  if (opts.markRestart !== false) {
    bumpGeneration(opts.reason ?? `plugin:${manifest.id} installed`);
  }

  return {
    id: manifest.id,
    scriptRef: pluginScriptRef(manifest.id),
    dir: dest,
    manifest,
  };
}

/**
 * @param {string} id
 * @param {{ markRestart?: boolean }} [opts]
 */
export function uninstallPlugin(id, opts = {}) {
  const pluginId = assertPluginId(id);
  const dir = pluginDir(pluginId);
  if (!fs.existsSync(dir)) {
    const err = new Error("plugin not found");
    err.statusCode = 404;
    throw err;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  if (opts.markRestart !== false) {
    bumpGeneration(`plugin:${pluginId} uninstalled`);
  }
  return { ok: true, id: pluginId };
}

/**
 * Fork a core script into a new plugin.
 *
 * @param {string} coreName  e.g. fetch-http.js
 * @param {string} newId
 * @param {{ description?: string }} [opts]
 */
export function forkCoreScript(coreName, newId, opts = {}) {
  const id = assertPluginId(newId);
  if (coreBareNames().has(id)) {
    const err = new Error(`plugin id collides with core script: ${id}`);
    err.statusCode = 409;
    throw err;
  }
  if (fs.existsSync(pluginDir(id))) {
    const err = new Error(`plugin already exists: ${id}`);
    err.statusCode = 409;
    throw err;
  }

  const coreFile = coreName.endsWith(".js") ? coreName : `${coreName}.js`;
  const src = path.join(SCRIPTS_DIR, coreFile);
  if (!fs.existsSync(src)) {
    const err = new Error(`core script not found: ${coreFile}`);
    err.statusCode = 404;
    throw err;
  }

  const staging = path.join(PLUGINS_DIR, `.staging-fork-${id}-${Date.now()}`);
  fs.mkdirSync(staging, { recursive: true });
  try {
    const main = "script.js";
    fs.copyFileSync(src, path.join(staging, main));
    const manifest = buildManifest({
      id,
      name: id,
      version: "0.1.0",
      jerapah: ">=0.1.0 <1.0.0",
      main,
      description:
        opts.description ?? `Fork of core script ${coreFile}`,
    });
    fs.writeFileSync(
      path.join(staging, PLUGIN_MANIFEST),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    fs.writeFileSync(
      path.join(staging, "package.json"),
      `${JSON.stringify(
        {
          name: `jflow-plugin-${id}`,
          version: "0.1.0",
          private: true,
          type: "module",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    return installPluginFromDirectory(staging, {
      overwrite: false,
      reason: `plugin:${id} forked from ${coreFile}`,
    });
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

/**
 * @param {string} pluginDirectory
 * @returns {((id: string) => unknown) | null}
 */
export function createPluginRequire(pluginDirectory) {
  const pkg = path.resolve(pluginDirectory, "package.json");
  if (!fs.existsSync(pkg)) return null;
  return createRequire(pkg);
}

/**
 * Create an empty plugin from the new-script template.
 * @param {string} newId
 * @param {string} source
 * @param {{ description?: string }} [opts]
 */
export function createBlankPlugin(newId, source, opts = {}) {
  const id = assertPluginId(newId);
  if (coreBareNames().has(id)) {
    const err = new Error(`plugin id collides with core script: ${id}`);
    err.statusCode = 409;
    throw err;
  }
  if (fs.existsSync(pluginDir(id))) {
    const err = new Error(`plugin already exists: ${id}`);
    err.statusCode = 409;
    throw err;
  }
  if (typeof source !== "string") {
    const err = new Error("source content is required");
    err.statusCode = 400;
    throw err;
  }

  const staging = path.join(PLUGINS_DIR, `.staging-new-${id}-${Date.now()}`);
  fs.mkdirSync(staging, { recursive: true });
  try {
    const main = "script.js";
    fs.writeFileSync(path.join(staging, main), source, "utf8");
    const manifest = buildManifest({
      id,
      name: id,
      version: "0.1.0",
      jerapah: ">=0.1.0 <1.0.0",
      main,
      description: opts.description ?? null,
    });
    fs.writeFileSync(
      path.join(staging, PLUGIN_MANIFEST),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    fs.writeFileSync(
      path.join(staging, "package.json"),
      `${JSON.stringify(
        {
          name: `jflow-plugin-${id}`,
          version: "0.1.0",
          private: true,
          type: "module",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    return installPluginFromDirectory(staging, {
      overwrite: false,
      reason: `plugin:${id} created`,
    });
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}
