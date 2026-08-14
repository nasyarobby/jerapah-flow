import { migrate, db } from "../db.js";
import { createKvApi, kvDelete, kvSet } from "../kv-store.js";
import {
  createFingerprintApi,
  hashFingerprint,
} from "../script-fingerprint.js";
import { runScriptSource } from "../script-sandbox.js";
import { log } from "../logger.js";

await migrate();

const ns = "test/fingerprint-smoke";
const api = createKvApi(ns);
const fp = createFingerprintApi(api);

for (const key of ["a", "b", "cas", "age", "legacy", "script-key"]) {
  await kvDelete(ns, key);
}

const h1 = hashFingerprint({ b: 1, a: 2 });
const h2 = hashFingerprint({ a: 2, b: 1 });
if (h1 !== h2) throw new Error("hash should ignore key order");

const bufHash = hashFingerprint(Buffer.from("hello"));
const sameLen = hashFingerprint(Buffer.from("world"));
if (bufHash !== sameLen) {
  throw new Error("buffers of equal length should hash as { $bytes: length }");
}
const otherLen = hashFingerprint(Buffer.from("hi"));
if (bufHash === otherLen) throw new Error("different byte lengths should hash differently");

const first = await fp.check("a", { item: "one" });
if (!first.changed || first.previous !== null) {
  throw new Error(`first check should be changed: ${JSON.stringify(first)}`);
}

const remembered = await fp.remember("a", first.hash);
if (remembered.hash !== first.hash || typeof remembered.at !== "string") {
  throw new Error(`remember failed: ${JSON.stringify(remembered)}`);
}

const second = await fp.check("a", { item: "one" });
if (second.changed) throw new Error("second check should be unchanged");
if (second.previous !== first.hash) throw new Error("previous hash mismatch");
if (second.previousAt !== remembered.at) throw new Error("previousAt should be kept");

const claimNew = await fp.claim("b", "hello");
if (!claimNew.changed) throw new Error("first claim should be changed");
const storedAt = claimNew.at;

const claimSame = await fp.claim("b", "hello");
if (claimSame.changed) throw new Error("unchanged claim should return changed: false");
if (claimSame.at !== storedAt) throw new Error("unchanged claim should keep original at");

const oldAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
const oldHash = hashFingerprint("aged");
await kvSet(ns, "age", { hash: oldHash, at: oldAt });

const agedNoMax = await fp.check("age", "aged");
if (agedNoMax.changed) {
  throw new Error("omit maxAge: matching hash should skip even if old");
}

const agedExpired = await fp.claim("age", "aged", { maxAge: "7d" });
if (!agedExpired.changed || !agedExpired.expired) {
  throw new Error(`maxAge should expire old hash: ${JSON.stringify(agedExpired)}`);
}
if (agedExpired.at === oldAt) throw new Error("expired claim should write a new at");

const fresh = await fp.check("age", "aged", { maxAge: "7d" });
if (fresh.changed || fresh.expired) {
  throw new Error(`freshly claimed hash should not expire: ${JSON.stringify(fresh)}`);
}

await kvSet(ns, "legacy", oldHash);
const legacyNoMax = await fp.check("legacy", "aged");
if (legacyNoMax.changed) {
  throw new Error("legacy bare hash should still match without maxAge");
}
const legacyExpired = await fp.check("legacy", "aged", { maxAge: "1h" });
if (!legacyExpired.changed || !legacyExpired.expired) {
  throw new Error(`legacy hash with maxAge should expire: ${JSON.stringify(legacyExpired)}`);
}

const script = `
export default async function (ctx) {
  const result = await $fingerprint.claim("script-key", ctx.data.n);
  return result;
}
`;

const scriptOut = await runScriptSource(
  "fingerprint-smoke.js",
  script,
  { data: { n: 1 } },
  { log, workflowName: ns },
);
if (!scriptOut.changed) throw new Error("sandbox $fingerprint.claim should be new");

for (const key of ["a", "b", "cas", "age", "legacy", "script-key"]) {
  await kvDelete(ns, key);
}

console.log("fingerprint smoke test passed");
await db.destroy();
