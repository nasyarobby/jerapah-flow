import fs from "fs";
import path from "path";
import { REPO_ROOT } from "./paths.js";

const ROOT_PKG = path.join(REPO_ROOT, "package.json");

/**
 * JerapahFlow app version from the monorepo root package.json.
 * @returns {string}
 */
export function getAppVersion() {
  try {
    const raw = JSON.parse(fs.readFileSync(ROOT_PKG, "utf8"));
    if (typeof raw.version === "string" && raw.version.trim()) {
      return raw.version.trim();
    }
  } catch {
    // fall through
  }
  return "0.1.0";
}

/**
 * @param {string} version
 * @returns {[number, number, number]}
 */
function parseSemver(version) {
  const cleaned = String(version).trim().replace(/^v/i, "");
  const core = cleaned.split("-")[0].split("+")[0];
  const parts = core.split(".").map((p) => Number(p));
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

/**
 * @param {[number, number, number]} a
 * @param {[number, number, number]} b
 */
function cmp(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

/**
 * Minimal semver range check for patterns used in manifests:
 * `1.2.3`, `>=0.1.0`, `<1.0.0`, `>=0.1.0 <1.0.0`
 *
 * @param {string} version
 * @param {string} range
 * @returns {boolean}
 */
export function satisfiesRange(version, range) {
  if (typeof range !== "string" || !range.trim()) return false;
  const ver = parseSemver(version);
  const tokens = range.trim().split(/\s+/);
  for (const token of tokens) {
    if (/^\d+\.\d+\.\d+/.test(token) && !token.startsWith(">") && !token.startsWith("<")) {
      if (cmp(ver, parseSemver(token)) !== 0) return false;
      continue;
    }
    const m = /^(>=|<=|>|<|=)?\s*v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/.exec(
      token,
    );
    if (!m) return false;
    const op = m[1] || "=";
    const bound = parseSemver(m[2]);
    const c = cmp(ver, bound);
    if (op === ">=" && c < 0) return false;
    if (op === "<=" && c > 0) return false;
    if (op === ">" && c <= 0) return false;
    if (op === "<" && c >= 0) return false;
    if (op === "=" && c !== 0) return false;
  }
  return true;
}
