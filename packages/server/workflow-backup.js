import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { DATA_DIR, PLUGINS_DIR, WORKFLOWS_DIR } from "./paths.js";
import { getAppVersion } from "./app-version.js";
import * as fsStore from "./fs-store.js";
import { listInstalledPlugins } from "./plugin-store.js";

const execFileAsync = promisify(execFile);

/**
 * @param {string} dir
 * @param {string} zipPath
 */
async function zipDirectory(dir, zipPath) {
  await execFileAsync("zip", ["-r", zipPath, "."], { cwd: dir });
}

/**
 * @param {string} zipPath
 * @param {string} destDir
 */
async function unzipArchive(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  await execFileAsync("unzip", ["-o", zipPath, "-d", destDir]);
}

/**
 * Copy directory recursively.
 * @param {string} src
 * @param {string} dest
 */
function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

/**
 * Build a backup zip buffer (workflows + installed plugins + manifest).
 */
export async function createWorkflowBackupBuffer() {
  const staging = path.join(DATA_DIR, `.backup-staging-${randomUUID()}`);
  fs.mkdirSync(staging, { recursive: true });
  const zipPath = path.join(DATA_DIR, `.backup-${randomUUID()}.zip`);

  try {
    const wfDest = path.join(staging, "workflows");
    copyDir(WORKFLOWS_DIR, wfDest);

    const pluginsDest = path.join(staging, "plugins");
    copyDir(PLUGINS_DIR, pluginsDest);

    const manifest = {
      version: getAppVersion(),
      created_at: new Date().toISOString(),
      plugins: listInstalledPlugins().map((p) => p.id),
      owners: fsStore.listOwners(),
    };
    fs.writeFileSync(
      path.join(staging, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf8",
    );

    await zipDirectory(staging, zipPath);
    return fs.readFileSync(zipPath);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  }
}

/**
 * @param {Buffer} zipBuffer
 * @param {{ mode?: "merge" | "replace" }} [opts]
 */
export async function restoreWorkflowBackup(zipBuffer, opts = {}) {
  const mode = opts.mode === "replace" ? "replace" : "merge";
  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), "jflow-restore-"));
  const zipPath = path.join(extractDir, "backup.zip");
  fs.writeFileSync(zipPath, zipBuffer);

  /** @type {string[]} */
  const warnings = [];

  try {
    const contentDir = path.join(extractDir, "content");
    await unzipArchive(zipPath, contentDir);

    const manifestPath = path.join(contentDir, "manifest.json");
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        for (const pluginId of manifest.plugins ?? []) {
          const dir = path.join(PLUGINS_DIR, pluginId);
          if (!fs.existsSync(dir)) {
            warnings.push(`Plugin "${pluginId}" from backup is not installed`);
          }
        }
      } catch {
        warnings.push("Could not read backup manifest.json");
      }
    }

    const wfSrc = path.join(contentDir, "workflows");
    if (fs.existsSync(wfSrc)) {
      if (mode === "replace" && fs.existsSync(WORKFLOWS_DIR)) {
        fs.rmSync(WORKFLOWS_DIR, { recursive: true, force: true });
      }
      copyDir(wfSrc, WORKFLOWS_DIR);
    }

    const pluginsSrc = path.join(contentDir, "plugins");
    if (fs.existsSync(pluginsSrc)) {
      if (mode === "replace" && fs.existsSync(PLUGINS_DIR)) {
        fs.rmSync(PLUGINS_DIR, { recursive: true, force: true });
      }
      copyDir(pluginsSrc, PLUGINS_DIR);
    }

    return { ok: true, mode, warnings };
  } finally {
    fs.rmSync(extractDir, { recursive: true, force: true });
  }
}
