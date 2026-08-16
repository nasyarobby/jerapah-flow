import { migrate, db } from "../db.js";
import { runScriptSource } from "../script-sandbox.js";
import { log } from "../logger.js";
import {
  deleteVariable,
  encodeVariableValue,
  getVariablePlain,
  upsertVariable,
} from "../variables-store.js";

await migrate();

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function assertThrows(fn, match) {
  try {
    await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (match && !message.includes(match)) {
      throw new Error(`threw "${message}", expected to include "${match}"`);
    }
    return;
  }
  throw new Error(`expected to throw (${match ?? "any error"})`);
}

const owner = "default";

await assertThrows(
  () => encodeVariableValue("number", "3"),
  "finite number",
);
await assertThrows(
  () => encodeVariableValue("number", NaN),
  "finite number",
);
await assertThrows(
  () => encodeVariableValue("boolean", "true"),
  "boolean",
);
await assertThrows(
  () => encodeVariableValue("string", 3),
  "string",
);

const created = [];
try {
  const str = await upsertVariable({
    owner,
    name: "variables_smoke_url",
    type: "string",
    value: "https://n.0dev.web.id/system",
  });
  created.push(str.id);
  assert(str.value === "https://n.0dev.web.id/system", "string stored");
  assert(
    (await getVariablePlain(owner, "variables_smoke_url")) === str.value,
    "string plain",
  );

  const num = await upsertVariable({
    owner,
    name: "variables_smoke_retry",
    type: "number",
    value: 3,
  });
  created.push(num.id);
  assert(num.value === 3 && typeof num.value === "number", "number stored");

  const flag = await upsertVariable({
    owner,
    name: "variables_smoke_debug",
    type: "boolean",
    value: false,
  });
  created.push(flag.id);
  assert(flag.value === false, "boolean false stored");

  const updated = await upsertVariable({
    owner,
    name: "variables_smoke_retry",
    type: "number",
    value: 9,
  });
  assert(updated.id === num.id, "upsert same id");
  assert(updated.value === 9, "upsert number");

  await assertThrows(
    () =>
      upsertVariable({
        owner,
        name: "variables_smoke_bad",
        type: "number",
        value: "abc",
      }),
    "finite number",
  );

  const scriptOut = await runScriptSource(
    "variables-smoke.js",
    `export default async function () {
      const url = await $vars.get("variables_smoke_url");
      const retry = await $vars.get("variables_smoke_retry");
      const debug = await $vars.get("variables_smoke_debug");
      return { url, retry, debug, retryType: typeof retry, debugType: typeof debug };
    }`,
    { data: {} },
    { log, workflowName: "default/variables-smoke.yaml", owner },
  );
  assert(scriptOut.url === "https://n.0dev.web.id/system", "script $vars string");
  assert(scriptOut.retry === 9 && scriptOut.retryType === "number", "script $vars number");
  assert(scriptOut.debug === false && scriptOut.debugType === "boolean", "script $vars boolean");

  await assertThrows(
    () =>
      runScriptSource(
        "variables-smoke.js",
        `export default async function () {
          return $vars.get("does_not_exist_xyz");
        }`,
        { data: {} },
        { log, workflowName: "default/variables-smoke.yaml", owner },
      ),
    'variable "does_not_exist_xyz" not found',
  );
} finally {
  for (const id of created) {
    await deleteVariable(id);
  }
}

console.log("variables smoke test passed");
await db.destroy();
