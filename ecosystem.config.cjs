/**
 * Production PM2 ecosystem (control plane + UI).
 * Starts always-on processes only; HTTP (:8700) and workers are owned by
 * control.js via PM2 (same as `pnpm dev:pm2`).
 *
 * Prerequisites: `pnpm build` (packages/web/dist), Redis, .env secrets.
 */
const fs = require("fs");
const path = require("path");

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const root = __dirname;
const env = {
  NODE_ENV: "production",
  ...loadEnv(path.join(root, ".env")),
};

module.exports = {
  apps: [
    {
      name: "jflow-control",
      cwd: root,
      script: "packages/server/control.js",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 20,
      env: {
        ...env,
        JFLOW_CONTROL_PORT: env.JFLOW_CONTROL_PORT ?? "8600",
      },
    },
    {
      name: "jflow-web",
      cwd: root,
      script: "packages/server/web-server.js",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 20,
      env: {
        ...env,
        JFLOW_UI_PORT: env.JFLOW_UI_PORT ?? "8500",
        JFLOW_CONTROL_PORT: env.JFLOW_CONTROL_PORT ?? "8600",
        JFLOW_HTTP_PORT: env.JFLOW_HTTP_PORT ?? "8700",
      },
    },
  ],
};
