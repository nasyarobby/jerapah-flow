import http from "node:http";
import { migrate, db } from "../db.js";
import { kvDelete } from "../kv-store.js";
import { runScript } from "../script-sandbox.js";
import { log } from "../logger.js";

await migrate();

const ns = "test/detect-url-changes-smoke";

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const state = {
  status: 200,
  contentType: "text/html; charset=utf-8",
  body: "<html><body>v1</body></html>",
  lastMethod: null,
};

const server = http.createServer((req, res) => {
  state.lastMethod = req.method;
  res.writeHead(state.status, { "content-type": state.contentType });
  res.end(typeof state.body === "string" ? state.body : JSON.stringify(state.body));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

function run(config) {
  return runScript(
    "detect-url-changes.js",
    { data: {}, config },
    { log, workflowName: ns, owner: "default" },
  );
}

const cleanupKeys = [];
async function freshUrl(pathname) {
  const url = `${base}${pathname}`;
  await kvDelete(ns, url);
  cleanupKeys.push(url);
  return url;
}

// 1. Raw-response change detection across runs.
{
  const url = await freshUrl("/raw");
  state.body = "<html><body>v1</body></html>";

  const first = await run({ url });
  assert(first.output.hasChanges === true, "first run should report hasChanges=true");
  assert(
    first.output.httpResponse === "<html><body>v1</body></html>",
    "httpResponse should hold the raw body",
  );
  assert(typeof first.output.fingerprint === "string", "fingerprint hash should be set");

  const second = await run({ url });
  assert(second.output.hasChanges === false, "unchanged body should report hasChanges=false");

  state.body = "<html><body>v2 CHANGED</body></html>";
  const third = await run({ url });
  assert(third.output.hasChanges === true, "changed body should report hasChanges=true");
  assert(
    third.output.fingerprintPrevious === second.output.fingerprint,
    "fingerprintPrevious should equal the prior hash",
  );
}

// 2. fingerprint JSONata isolates the watched field; unrelated changes are ignored.
{
  const url = await freshUrl("/json");
  state.contentType = "application/json";
  state.body = { version: "1.0.0", servedAt: "2020-01-01T00:00:00Z" };

  const first = await run({ url, fingerprint: "data.httpResponse.version" });
  assert(first.output.hasChanges === true, "json first run should report a change");

  // Change only an unwatched field -> no change.
  state.body = { version: "1.0.0", servedAt: "2020-06-01T00:00:00Z" };
  const second = await run({ url, fingerprint: "data.httpResponse.version" });
  assert(
    second.output.hasChanges === false,
    "changing an unwatched field should not report a change",
  );

  // Change the watched field -> change.
  state.body = { version: "2.0.0", servedAt: "2020-06-01T00:00:00Z" };
  const third = await run({ url, fingerprint: "data.httpResponse.version" });
  assert(third.output.hasChanges === true, "changing the watched field should report a change");

  state.contentType = "text/html; charset=utf-8";
}

// 3. transform + outputVar, and raw output when transform is omitted.
{
  const url = await freshUrl("/output");
  state.body = "<html><body>hello</body></html>";

  const withTransform = await run({
    url,
    outputVar: "message",
    transform: '"changed=" & $string(data.hasChanges)',
  });
  assert(
    withTransform.output.message === "changed=true",
    `transform should populate outputVar, got ${JSON.stringify(withTransform.output.message)}`,
  );

  const rawOutput = await run({ url: await freshUrl("/output-raw"), outputVar: "payload" });
  assert(
    rawOutput.output.payload === rawOutput.output.httpResponse,
    "outputVar without transform should store the raw response",
  );

  let threw = false;
  try {
    await run({ url, transform: "1" });
  } catch {
    threw = true;
  }
  assert(threw, "transform without outputVar should throw");
}

// 4. optional skipRemaining only halts when unchanged.
{
  const url = await freshUrl("/skip");
  state.body = "<html><body>stable</body></html>";

  const first = await run({ url, skipRemaining: true });
  assert(first.output.hasChanges === true, "skip test first run should change");
  assert(first.skipRemaining !== true, "changed run must not set skipRemaining");

  const second = await run({ url, skipRemaining: true });
  assert(second.output.hasChanges === false, "skip test second run should be unchanged");
  assert(second.skipRemaining === true, "unchanged run with skipRemaining should halt");

  // Default (skipRemaining off) never halts, so downstream can still notify.
  const third = await run({ url });
  assert(third.skipRemaining !== true, "default should not set skipRemaining when unchanged");
}

// 5. non-GET methods are supported.
{
  const url = await freshUrl("/method");
  state.body = "ok";
  await run({ url, method: "POST", body: { ping: true } });
  assert(state.lastMethod === "POST", `server should have received POST, got ${state.lastMethod}`);
}

for (const key of cleanupKeys) {
  await kvDelete(ns, key);
}

await new Promise((resolve) => server.close(resolve));
await db.destroy();
console.log("detect-url-changes smoke test passed");
process.exit(0);
