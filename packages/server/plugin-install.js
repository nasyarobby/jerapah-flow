import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { EXAMPLE_PLUGINS_DIR, PLUGINS_DIR } from "./paths.js";
import {
  installPluginFromDirectory,
  pluginDir,
} from "./plugin-store.js";
import { readManifestFile } from "./plugin-manifest.js";

const execFileAsync = promisify(execFile);

/**
 * @param {string} url
 */
export function assertHttpsGitUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    const err = new Error("invalid git URL");
    err.statusCode = 400;
    throw err;
  }
  if (parsed.protocol !== "https:") {
    const err = new Error("git URL must use https://");
    err.statusCode = 400;
    throw err;
  }
  return parsed.toString();
}

/**
 * Run pnpm install in a plugin directory (ignore lifecycle scripts).
 * @param {string} dir
 */
export async function pnpmInstallPlugin(dir) {
  const pkg = path.join(dir, "package.json");
  if (!fs.existsSync(pkg)) return { skipped: true };
  let hasDeps = false;
  try {
    const raw = JSON.parse(fs.readFileSync(pkg, "utf8"));
    hasDeps = Boolean(
      (raw.dependencies && Object.keys(raw.dependencies).length) ||
        (raw.optionalDependencies &&
          Object.keys(raw.optionalDependencies).length),
    );
  } catch {
    hasDeps = true;
  }
  if (!hasDeps) return { skipped: true };

  await execFileAsync(
    "pnpm",
    ["install", "--dir", dir, "--ignore-scripts", "--prefer-offline"],
    {
      cwd: dir,
      env: { ...process.env, CI: "1" },
      timeout: 5 * 60_000,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  return { skipped: false };
}

/**
 * @param {string} url
 * @param {{ ref?: string, overwrite?: boolean }} [opts]
 */
export async function installPluginFromGit(url, opts = {}) {
  const httpsUrl = assertHttpsGitUrl(url);
  const staging = path.join(
    PLUGINS_DIR,
    `.staging-git-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  fs.mkdirSync(PLUGINS_DIR, { recursive: true });
  fs.mkdirSync(staging, { recursive: true });
  try {
    const args = ["clone", "--depth", "1"];
    if (opts.ref) {
      args.push("--branch", String(opts.ref));
    }
    args.push(httpsUrl, staging);
    await execFileAsync("git", args, {
      timeout: 5 * 60_000,
      maxBuffer: 5 * 1024 * 1024,
    });
    // Remove .git to keep plugins lean
    fs.rmSync(path.join(staging, ".git"), { recursive: true, force: true });
    const installed = installPluginFromDirectory(staging, {
      overwrite: Boolean(opts.overwrite),
      markRestart: false,
    });
    await pnpmInstallPlugin(installed.dir);
    const { bumpGeneration } = await import("./control-state.js");
    bumpGeneration(`plugin:${installed.id} installed from git`);
    return installed;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

/**
 * @param {string} zipPath
 * @param {{ overwrite?: boolean }} [opts]
 */
export async function installPluginFromZipFile(zipPath, opts = {}) {
  const abs = path.resolve(zipPath);
  if (!fs.existsSync(abs)) {
    const err = new Error("zip file not found");
    err.statusCode = 400;
    throw err;
  }
  const staging = path.join(
    PLUGINS_DIR,
    `.staging-zip-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const extractDir = path.join(staging, "extract");
  fs.mkdirSync(extractDir, { recursive: true });
  try {
    await execFileAsync("unzip", ["-q", abs, "-d", extractDir], {
      timeout: 120_000,
    });
    const root = findPluginRoot(extractDir);
    const installed = installPluginFromDirectory(root, {
      overwrite: Boolean(opts.overwrite),
      markRestart: false,
    });
    await pnpmInstallPlugin(installed.dir);
    const { bumpGeneration } = await import("./control-state.js");
    bumpGeneration(`plugin:${installed.id} installed from zip`);
    return installed;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

/**
 * @param {Buffer} buffer
 * @param {{ overwrite?: boolean }} [opts]
 */
export async function installPluginFromZipBuffer(buffer, opts = {}) {
  const tmp = path.join(
    os.tmpdir(),
    `jflow-plugin-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`,
  );
  fs.writeFileSync(tmp, buffer);
  try {
    return await installPluginFromZipFile(tmp, opts);
  } finally {
    fs.unlinkSync(tmp);
  }
}

/**
 * Find directory containing jerapah-plugin.json (zip may have a single top folder).
 * @param {string} extractDir
 */
function findPluginRoot(extractDir) {
  const direct = path.join(extractDir, "jerapah-plugin.json");
  if (fs.existsSync(direct)) return extractDir;
  const entries = fs.readdirSync(extractDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith("."));
  if (dirs.length === 1) {
    const nested = path.join(extractDir, dirs[0].name);
    if (fs.existsSync(path.join(nested, "jerapah-plugin.json"))) return nested;
  }
  for (const e of dirs) {
    const nested = path.join(extractDir, e.name);
    if (fs.existsSync(path.join(nested, "jerapah-plugin.json"))) return nested;
  }
  const err = new Error("zip missing jerapah-plugin.json");
  err.statusCode = 400;
  throw err;
}

/**
 * Install a shipped example plugin by id (from examples/plugins/<id>).
 * @param {string} exampleId
 * @param {{ overwrite?: boolean }} [opts]
 */
export async function installExamplePlugin(exampleId, opts = {}) {
  const src = path.join(EXAMPLE_PLUGINS_DIR, exampleId);
  if (!fs.existsSync(src)) {
    const err = new Error(`example plugin not found: ${exampleId}`);
    err.statusCode = 404;
    throw err;
  }
  const installed = installPluginFromDirectory(src, {
    overwrite: Boolean(opts.overwrite),
    markRestart: false,
  });
  await pnpmInstallPlugin(installed.dir);
  const { bumpGeneration } = await import("./control-state.js");
  bumpGeneration(`plugin:${installed.id} installed from example`);
  return installed;
}

/**
 * Copy example into plugins if missing (used by smoke / first-run helpers).
 * @param {string} exampleId
 */
export function ensureExampleInstalled(exampleId) {
  const dest = pluginDir(exampleId);
  if (fs.existsSync(dest)) {
    return { id: exampleId, already: true, dir: dest };
  }
  const src = path.join(EXAMPLE_PLUGINS_DIR, exampleId);
  const installed = installPluginFromDirectory(src, {
    overwrite: false,
    markRestart: false,
  });
  return { ...installed, already: false };
}

void readManifestFile;
