import { migrate, db } from "../db.js";
import { kvSet, kvDelete } from "../kv-store.js";
import { upsertSecret, deleteSecret } from "../secrets-store.js";
import { Secret } from "../secret-value.js";
import { parseConfigRef, resolveConfigRefs } from "../config-refs.js";

await migrate();

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function assertRejects(fn, match) {
  try {
    await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (match && !message.includes(match)) {
      throw new Error(`rejected with "${message}", expected to include "${match}"`);
    }
    return;
  }
  throw new Error(`expected to reject (${match ?? "any error"})`);
}

const owner = "default";
const workflowKey = "default/config-refs-smoke.yaml";
const ctx = { owner, workflowKey, context: {} };

function assertParse(value, expected) {
  const got = parseConfigRef(value);
  if (expected == null) {
    assert(got == null, `expected null parse for ${JSON.stringify(value)}, got ${JSON.stringify(got)}`);
    return;
  }
  assert(got != null, `expected parse for ${JSON.stringify(value)}`);
  assert(got.kind === expected.kind, `kind ${got.kind} !== ${expected.kind}`);
  assert(got.name === expected.name, `name ${JSON.stringify(got.name)} !== ${JSON.stringify(expected.name)}`);
}

assertParse("password123", null);
assertParse("$FOO_bar", null);
assertParse("$SECRET", null);
assertParse("  password123  ", null);
assertParse("$SECRET_zte_modem_password", { kind: "secret", name: "zte_modem_password" });
assertParse("  $SECRET_zte_modem_password  ", { kind: "secret", name: "zte_modem_password" });
assertParse("Bearer $SECRET_x", null);
assertParse("$KV_modem password", { kind: "kv", name: "modem password" });
assertParse("$CONTEXT_token", { kind: "context", name: "token" });
assertParse("$SECRET_", { kind: "secret", name: "" });
assertParse("$CONTEXT_SECRET_foo", { kind: "context", name: "SECRET_foo" });

{
  const literal = await resolveConfigRefs("password123", ctx);
  assert(literal === "password123", "literal passthrough");
  const unknown = await resolveConfigRefs("$FOO_bar", ctx);
  assert(unknown === "$FOO_bar", "$FOO_bar stays literal");
  const embedded = await resolveConfigRefs("Bearer $SECRET_x", ctx);
  assert(embedded === "Bearer $SECRET_x", "mid-string stays literal");
  const number = await resolveConfigRefs(42, ctx);
  assert(number === 42, "number passthrough");
}

const secret = await upsertSecret({
  owner,
  name: "config_refs_smoke_token",
  value: "s3cret-ok",
});
await kvSet(workflowKey, "modem_password", "kv-pass-ok");
await kvSet(workflowKey, "modem password", "kv-spaced-ok");
await kvSet(workflowKey, "obj-key", { nested: true });

try {
  {
    const resolved = await resolveConfigRefs("$SECRET_config_refs_smoke_token", ctx);
    assert(resolved === "s3cret-ok", "secret resolve");
  }
  {
    const resolved = await resolveConfigRefs("  $SECRET_config_refs_smoke_token  ", ctx);
    assert(resolved === "s3cret-ok", "secret resolve trimmed");
  }
  {
    const resolved = await resolveConfigRefs("$KV_modem_password", ctx);
    assert(resolved === "kv-pass-ok", "kv resolve");
  }
  {
    const resolved = await resolveConfigRefs("$KV_modem password", ctx);
    assert(resolved === "kv-spaced-ok", "kv spaced key");
  }
  {
    const resolved = await resolveConfigRefs("$CONTEXT_token", {
      ...ctx,
      context: { token: "ctx-token-ok" },
    });
    assert(resolved === "ctx-token-ok", "context string");
  }
  {
    const resolved = await resolveConfigRefs("$CONTEXT_n", {
      ...ctx,
      context: { n: 7 },
    });
    assert(resolved === "7", "context number stringify");
  }
  {
    const wrapped = new Secret("wrapped-secret-ok");
    const resolved = await resolveConfigRefs("$CONTEXT_tok", {
      ...ctx,
      context: { tok: wrapped },
    });
    assert(resolved === "wrapped-secret-ok", "context Secret unwrap");
  }

  {
    const nested = await resolveConfigRefs(
      {
        url: "http://example.test",
        password: "$SECRET_config_refs_smoke_token",
        headers: { Authorization: "$KV_modem_password" },
        extra: ["$CONTEXT_token", "plain"],
      },
      { ...ctx, context: { token: "ctx-token-ok" } },
    );
    assert(nested.url === "http://example.test", "nested literal");
    assert(nested.password === "s3cret-ok", "nested secret");
    assert(nested.headers.Authorization === "kv-pass-ok", "nested kv");
    assert(nested.extra[0] === "ctx-token-ok", "nested array context");
    assert(nested.extra[1] === "plain", "nested array literal");
  }

  const data = { password: "$SECRET_config_refs_smoke_token" };
  const config = { password: "$SECRET_config_refs_smoke_token" };
  const resolvedConfig = await resolveConfigRefs(config, ctx);
  assert(resolvedConfig.password === "s3cret-ok", "config resolved");
  assert(data.password === "$SECRET_config_refs_smoke_token", "data not walked");
  assert(config.password === "$SECRET_config_refs_smoke_token", "input config not mutated");

  await assertRejects(
    () => resolveConfigRefs("$SECRET_does_not_exist_xyz", ctx),
    'secret "does_not_exist_xyz" not found',
  );
  await assertRejects(
    () => resolveConfigRefs("$SECRET_not valid", ctx),
    "invalid secret name",
  );
  await assertRejects(
    () => resolveConfigRefs("$SECRET_", ctx),
    "invalid secret name",
  );
  await assertRejects(
    () => resolveConfigRefs("$KV_missing-key", ctx),
    'KV "missing-key" not found',
  );
  await assertRejects(
    () => resolveConfigRefs("$KV_obj-key", ctx),
    'KV "obj-key" is not a scalar',
  );
  await assertRejects(
    () => resolveConfigRefs("$KV_", ctx),
    "empty KV key",
  );
  await assertRejects(
    () => resolveConfigRefs("$CONTEXT_missing", ctx),
    'context "missing" not found',
  );
  await assertRejects(
    () =>
      resolveConfigRefs("$CONTEXT_obj", {
        ...ctx,
        context: { obj: { a: 1 } },
      }),
    'context "obj" is not a scalar',
  );
  await assertRejects(
    () => resolveConfigRefs("$CONTEXT_", ctx),
    "empty context key",
  );
} finally {
  await deleteSecret(secret.id);
  await kvDelete(workflowKey, "modem_password");
  await kvDelete(workflowKey, "modem password");
  await kvDelete(workflowKey, "obj-key");
}

console.log("config-refs smoke test passed");
await db.destroy();
