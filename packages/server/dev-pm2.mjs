#!/usr/bin/env node
/**
 * Start Vite (:8500) + control (:8600). Control connects to PM2 and starts HTTP/workers.
 *
 * Usage: pnpm dev:pm2
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const children = [];

function run(command, args, opts = {}) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      JFLOW_CORS_ORIGIN: process.env.JFLOW_CORS_ORIGIN ?? "http://localhost:8500",
      JFLOW_CONTROL_PORT: process.env.JFLOW_CONTROL_PORT ?? "8600",
      PORT: process.env.JFLOW_HTTP_PORT ?? "8700",
      ...opts.env,
    },
    shell: false,
  });
  children.push(child);
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`[dev:pm2] ${command} ${args.join(" ")} exited (${code ?? signal})`);
    shutdown(code ?? 1);
  });
  return child;
}

let shuttingDown = false;

async function redisReachable() {
  const url = process.env.REDIS_URL || "redis://127.0.0.1:6379";
  let host = "127.0.0.1";
  let port = 6379;
  try {
    const u = new URL(url);
    host = u.hostname || host;
    port = Number(u.port || 6379);
  } catch {
    // keep defaults
  }
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    socket.setTimeout(1500);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
  });
}

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  // Best-effort: stop jflow apps so the next run is clean
  try {
    const stop = spawn(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["pm2", "delete", "jflow-http", "jflow-worker"],
      { cwd: root, stdio: "ignore", shell: false },
    );
    await new Promise((r) => stop.on("exit", r));
  } catch {
    // ignore
  }
  process.exit(code);
}

process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));

if (!(await redisReachable())) {
  console.error(
    "[dev:pm2] Redis is not reachable. Start Redis (default redis://127.0.0.1:6379) and retry.",
  );
  process.exit(1);
}

console.log("[dev:pm2] starting control on :8600 (PM2 will start HTTP :8700 + workers)");
run(process.execPath, [path.join(root, "packages/server/control.js")], {
  env: {
    JFLOW_CONTROL_PORT: "8600",
  },
});

// Give control a moment to migrate + spawn before Vite opens
await new Promise((r) => setTimeout(r, 1500));

console.log("[dev:pm2] starting Vite on :8500");
run(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  ["--filter", "@jerapah-flow/web", "dev"],
  {
    env: {
      // vite.config reads nothing; port is set in vite.config.js
    },
  },
);
