import { migrate, db } from "../db.js";
import { upsertSecret, deleteSecret } from "../secrets-store.js";
import { deleteVariable, upsertVariable } from "../variables-store.js";
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
assertParse("$KV_modem password", null);
assertParse("$VAR_ntfy_url", { kind: "var", name: "ntfy_url" });
assertParse("$CONTEXT_token", { kind: "context", name: "token" });
assertParse("$SECRET_", { kind: "secret", name: "" });
assertParse("$CONTEXT_SECRET_foo", { kind: "context", name: "SECRET_foo" });

{
  const literal = await resolveConfigRefs("password123", ctx);
  assert(literal === "password123", "literal passthrough");
  const unknown = await resolveConfigRefs("$FOO_bar", ctx);
  assert(unknown === "$FOO_bar", "$FOO_bar stays literal");
  const kvLiteral = await resolveConfigRefs("$KV_modem_password", ctx);
  assert(kvLiteral === "$KV_modem_password", "$KV_ stays literal");
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
const varUrl = await upsertVariable({
  owner,
  name: "config_refs_smoke_url",
  type: "string",
  value: "https://example.test",
});
const varRetry = await upsertVariable({
  owner,
  name: "config_refs_smoke_retry",
  type: "number",
  value: 3,
});
const varDebug = await upsertVariable({
  owner,
  name: "config_refs_smoke_debug",
  type: "boolean",
  value: false,
});

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
    const resolved = await resolveConfigRefs("$VAR_config_refs_smoke_url", ctx);
    assert(resolved === "https://example.test", "var string");
  }
  {
    const resolved = await resolveConfigRefs("$VAR_config_refs_smoke_retry", ctx);
    assert(resolved === 3, "var number stays number");
    assert(typeof resolved === "number", "var number type");
  }
  {
    const resolved = await resolveConfigRefs("$VAR_config_refs_smoke_debug", ctx);
    assert(resolved === false, "var boolean stays false");
    assert(typeof resolved === "boolean", "var boolean type");
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
        url: "$VAR_config_refs_smoke_url",
        retry: "$VAR_config_refs_smoke_retry",
        debug: "$VAR_config_refs_smoke_debug",
        password: "$SECRET_config_refs_smoke_token",
        headers: { Authorization: "$KV_modem_password" },
        extra: ["$CONTEXT_token", "plain"],
      },
      { ...ctx, context: { token: "ctx-token-ok" } },
    );
    assert(nested.url === "https://example.test", "nested var string");
    assert(nested.retry === 3, "nested var number");
    assert(nested.debug === false, "nested var boolean");
    assert(nested.password === "s3cret-ok", "nested secret");
    assert(nested.headers.Authorization === "$KV_modem_password", "nested $KV_ stays literal");
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
  await assertRejects(
    () => resolveConfigRefs("$VAR_does_not_exist_xyz", ctx),
    'variable "does_not_exist_xyz" not found',
  );
  await assertRejects(
    () => resolveConfigRefs("$VAR_not valid", ctx),
    "invalid variable name",
  );
  await assertRejects(
    () => resolveConfigRefs("$VAR_", ctx),
    "empty variable name",
  );
} finally {
  await deleteSecret(secret.id);
  await deleteVariable(varUrl.id);
  await deleteVariable(varRetry.id);
  await deleteVariable(varDebug.id);
}

console.log("config-refs smoke test passed");
await db.destroy();
