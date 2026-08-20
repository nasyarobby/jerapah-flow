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

module.exports = {
  apps: [
    {
      name: "jerapah-flow",
      cwd: root,
      script: "packages/server/runner.js",
      interpreter: "node",
      instances: 1,
      autorestart: true,
      max_restarts: 20,
      env: {
        NODE_ENV: "production",
        ...loadEnv(path.join(root, ".env")),
      },
    },
  ],
};