import { migrate } from "../db.js";
import { createKvApi, kvDelete } from "../kv-store.js";
import { runScriptSource } from "../script-sandbox.js";
import { log } from "../logger.js";

await migrate();

const ns = "test/kv-smoke";
await kvDelete(ns, "counter");
await kvDelete(ns, "cas");

const api = createKvApi(ns);

await api.set("counter", { n: 1 });
const v1 = await api.get("counter");
if (v1?.n !== 1) throw new Error(`expected n=1, got ${JSON.stringify(v1)}`);

const casFail = await api.compareAndSet("cas", null, { first: true });
if (!casFail.ok || casFail.previous !== null) {
  throw new Error(`first CAS failed: ${JSON.stringify(casFail)}`);
}

const casFail2 = await api.compareAndSet("cas", null, { second: true });
if (casFail2.ok) throw new Error("second CAS with null expected should fail");

const casOk = await api.compareAndSet("cas", { first: true }, { second: true });
if (!casOk.ok) throw new Error("CAS update should succeed");

const listed = await api.list();
if (!listed.some((item) => item.key === "cas")) {
  throw new Error(`list missing cas: ${JSON.stringify(listed)}`);
}

const script = `
export default async function () {
  const prev = await $kv.get("script-key");
  await $kv.set("script-key", { prev, now: Date.now() });
  return { prev, namespace: $kv.namespace };
}
`;

const out = await runScriptSource("kv-smoke.js", script, { data: {} }, {
  log,
  workflowName: ns,
});
if (out.namespace !== ns) throw new Error(`wrong namespace: ${out.namespace}`);

await kvDelete(ns, "counter");
await kvDelete(ns, "cas");
await kvDelete(ns, "script-key");

console.log("kv smoke test passed");
