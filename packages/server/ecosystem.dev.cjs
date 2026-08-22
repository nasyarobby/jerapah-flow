/**
 * Local multi-process Ops UI ecosystem (`pnpm dev:pm2`).
 * Prefer starting children via control.js (desired state) rather than this file.
 * Kept as a reference / fallback: `pm2 start packages/server/ecosystem.dev.cjs`
 * For production monolith, use root ecosystem.config.cjs instead.
 */
const path = require("path");

const root = path.resolve(__dirname, "../..");

module.exports = {
  apps: [
    {
      name: "jflow-http",
      script: path.join(__dirname, "server.js"),
      cwd: root,
      instances: 1,
      exec_mode: "fork",
      env: {
        JFLOW_ROLE: "api",
        PORT: "8700",
        JFLOW_CORS_ORIGIN: "http://localhost:8500",
        JFLOW_CONFIG_GENERATION: "1",
      },
    },
    {
      name: "jflow-worker",
      script: path.join(__dirname, "worker.js"),
      cwd: root,
      instances: 1,
      exec_mode: "fork",
      env: {
        JFLOW_ROLE: "worker",
        JFLOW_CORS_ORIGIN: "http://localhost:8500",
        JFLOW_CONFIG_GENERATION: "1",
      },
    },
  ],
};
