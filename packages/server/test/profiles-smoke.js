import { migrate, db } from "../db.js";
import {
  assertProfileName,
  deleteProfile,
  encodeProfileConfig,
  getProfilePlain,
  listProfileUsages,
  upsertProfile,
} from "../profiles-store.js";
import { mergeProfileConfig } from "../profile-config.js";
import { parseScriptStep } from "../workflow-parse.js";

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

const merged = mergeProfileConfig(
  { url: "https://n.example/ops", fingerprint: true },
  { fingerprint: "comic-rss" },
);
assert(merged.url === "https://n.example/ops", "profile url kept");
assert(merged.fingerprint === "comic-rss", "overlay wins");

const emptyOverlay = mergeProfileConfig({ url: "https://n.example/ops" }, {});
assert(emptyOverlay.url === "https://n.example/ops", "empty overlay");

const emptyWins = mergeProfileConfig({ url: "https://n.example/ops" }, { url: "" });
assert(emptyWins.url === "", "empty string overlay wins");

const profileOnly = parseScriptStep({
  profile: "ops-ntfy",
  config: { fingerprint: "x" },
});
assert(profileOnly.kind === "script", "profile step kind");
assert(profileOnly.script === "", "script supplied by profile at runtime");
assert(profileOnly.profile === "ops-ntfy", "profile name");

const both = parseScriptStep({
  script: "ntfy.js",
  profile: "ops-ntfy",
});
assert(both.script === "ntfy.js" && both.profile === "ops-ntfy", "script + profile");

await assertThrows(
  () => parseScriptStep({ profile: "ops", set: { expression: "1" } }),
  "profile and set",
);

assert(assertProfileName("ops-ntfy") === "ops-ntfy", "valid name");
await assertThrows(() => assertProfileName("ops ntfy"), "invalid profile name");
await assertThrows(() => encodeProfileConfig([]), "config must be an object");

const owner = "default";
const name = `profiles_smoke_${Date.now()}`;
const created = await upsertProfile({
  owner,
  name,
  script: "ntfy.js",
  config: { url: "{{ vars.ntfy_channel }}" },
  description: "smoke",
});
assert(created.name === name, "created");
assert(created.config.url === "{{ vars.ntfy_channel }}", "config roundtrip");
assert(created.script === "ntfy.js", "script locked on profile");

const fetched = await getProfilePlain(owner, name);
assert(fetched?.id === created.id, "get by owner/name");

const updated = await upsertProfile({
  owner,
  name,
  script: "send-email.js",
  config: { service: "Gmail" },
  description: "now mail",
});
assert(updated.id === created.id, "upsert same row");
assert(updated.script === "send-email.js", "script may change");

const usages = listProfileUsages(owner, name);
assert(Array.isArray(usages) && usages.length === 0, "unused profile");

await deleteProfile(created.id);
assert((await getProfilePlain(owner, name)) == null, "deleted");

await db.destroy();
console.log("profiles-smoke: ok");
