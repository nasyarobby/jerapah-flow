/**
 * Smoke: core vs plugin scripts, fork, example install, resolve, run.
 *
 * Run:
 *   JFLOW_DATA_DIR=packages/server/data \
 *   JFLOW_PLUGINS_DIR=packages/server/data/plugins-smoke-test \
 *   JFLOW_DB_PATH=packages/server/data/plugins-smoke.db \
 *   node packages/server/test/plugins-smoke.js
 */
import assert from "node:assert/strict";
import fs from "fs";
import { migrate, db } from "../db.js";
import { getAppVersion, satisfiesRange } from "../app-version.js";
import {
  forkCoreScript,
  duplicatePlugin,
  resolveScriptRef,
  uninstallPlugin,
  listInstalledPlugins,
  createBlankPlugin,
} from "../plugin-store.js";
import { installExamplePlugin } from "../plugin-install.js";
import {
  runScript,
  clearScriptCache,
  inspectScriptSource,
} from "../script-sandbox.js";
import { PLUGINS_DIR } from "../paths.js";
import pino from "pino";

const silent = pino({ level: "silent" });

async function main() {
  assert.equal(getAppVersion(), "0.1.0");
  assert.equal(satisfiesRange("0.1.0", ">=0.1.0 <1.0.0"), true);
  assert.equal(satisfiesRange("1.0.0", ">=0.1.0 <1.0.0"), false);
  assert.equal(satisfiesRange("0.2.0", ">=0.1.0 <1.0.0"), true);

  await migrate();

  if (fs.existsSync(PLUGINS_DIR)) {
    fs.rmSync(PLUGINS_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(PLUGINS_DIR, { recursive: true });

  const core = resolveScriptRef("fetch-http.js");
  assert.equal(core.kind, "core");
  assert.ok(core.filePath && fs.existsSync(core.filePath));
  assert.ok(resolveScriptRef("nope.js").error?.includes("not found"));

  const example = await installExamplePlugin("get-current-time", {
    overwrite: true,
  });
  assert.equal(example.id, "get-current-time");
  assert.equal(example.scriptRef, "plugin/get-current-time");

  clearScriptCache();
  const pluginResolved = resolveScriptRef("plugin/get-current-time");
  assert.equal(pluginResolved.kind, "plugin");
  assert.ok(pluginResolved.filePath);

  const result = await runScript(
    "plugin/get-current-time",
    { data: null, context: {}, config: null },
    { log: silent, workflowName: "smoke", owner: "default" },
  );
  assert.ok(result?.output?.datetime);

  const forked = forkCoreScript("jsonata.js", "jsonata-smoke-fork");
  assert.equal(forked.scriptRef, "plugin/jsonata-smoke-fork");
  clearScriptCache();
  assert.equal(resolveScriptRef("plugin/jsonata-smoke-fork").kind, "plugin");

  const blank = createBlankPlugin(
    "blank-smoke",
    `export default async function main(ctx) { return { output: { ok: true }, context: ctx.context ?? {} }; }`,
  );
  assert.equal(blank.scriptRef, "plugin/blank-smoke");
  clearScriptCache();
  const blankRun = await runScript(
    "plugin/blank-smoke",
    { data: 1, context: {}, config: null },
    { log: silent, workflowName: "smoke", owner: "default" },
  );
  assert.equal(blankRun.output.ok, true);

  const duplicated = duplicatePlugin("blank-smoke", "blank-smoke-copy");
  assert.equal(duplicated.scriptRef, "plugin/blank-smoke-copy");
  clearScriptCache();
  assert.equal(resolveScriptRef("plugin/blank-smoke-copy").kind, "plugin");
  const dupRun = await runScript(
    "plugin/blank-smoke-copy",
    { data: 1, context: {}, config: null },
    { log: silent, workflowName: "smoke", owner: "default" },
  );
  assert.equal(dupRun.output.ok, true);

  let hitDupSelf = false;
  try {
    duplicatePlugin("blank-smoke", "blank-smoke");
  } catch (err) {
    hitDupSelf = true;
    assert.match(String(err.message), /itself/);
  }
  assert.equal(hitDupSelf, true);

  let hit = false;
  try {
    forkCoreScript("ntfy.js", "ntfy");
  } catch (err) {
    hit = true;
    assert.match(String(err.message), /collides/);
  }
  assert.equal(hit, true);

  const meta = inspectScriptSource(
    "fetch-http.js",
    fs.readFileSync(core.filePath, "utf8"),
  );
  assert.ok(meta);

  assert.ok(listInstalledPlugins().some((p) => p.id === "get-current-time"));

  uninstallPlugin("jsonata-smoke-fork");
  uninstallPlugin("blank-smoke");
  uninstallPlugin("blank-smoke-copy");
  uninstallPlugin("get-current-time");

  console.log("plugins-smoke: ok");
  await db.destroy();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await db.destroy();
  } catch {
    // ignore
  }
  process.exit(1);
});
