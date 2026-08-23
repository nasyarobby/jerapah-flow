#!/usr/bin/env node
/**
 * Run the same PM2 binary control.js `require("pm2")` uses.
 * A global `pm2` 7.x talking to an in-memory 6.x daemon pegs CPU on start.
 */
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(
  path.join(root, "packages/server/package.json"),
);
const pm2Root = path.dirname(require.resolve("pm2/package.json"));
const pm2Bin = path.join(pm2Root, "bin/pm2");
const args = process.argv.slice(2);

function run(pm2Args, opts = {}) {
  return spawnSync(process.execPath, [pm2Bin, ...pm2Args], {
    cwd: root,
    encoding: "utf8",
    ...opts,
  });
}

const cmd = args[0];
if (cmd === "start" || cmd === "restart" || cmd === "reload") {
  const probe = run(["ls"], { stdio: ["ignore", "pipe", "pipe"] });
  const text = `${probe.stdout ?? ""}${probe.stderr ?? ""}`;
  const mem = text.match(/In memory PM2 version:\s*(\S+)/);
  const loc = text.match(/Local PM2 version:\s*(\S+)/);
  if (mem && loc && mem[1] !== loc[1]) {
    console.error(
      `[jflow] PM2 daemon ${mem[1]} != CLI ${loc[1]}. Killing the daemon so control.js and the CLI share one version.`,
    );
    run(["kill"], { stdio: "inherit" });
  }
}

const child = spawn(process.execPath, [pm2Bin, ...args], {
  cwd: root,
  stdio: "inherit",
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
