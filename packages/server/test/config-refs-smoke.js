import { migrate, db } from "../db.js";
import { upsertSecret, deleteSecret } from "../secrets-store.js";
import { deleteVariable, upsertVariable } from "../variables-store.js";
import { Secret } from "../secret-value.js";
import { resolveConfigRefs } from "../config-refs.js";

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

const owner = "config_refs_smoke_owner";
const ctx = { owner, workflowKey: `${owner}/config-refs-smoke.yaml`, context: {}, data: {} };

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

const created = [];
try {
  const secret = await upsertSecret({
    owner,
    name: "config_refs_smoke_token",
    value: "s3cret-ok",
  });
  created.push(["secret", secret.id]);

  const varUrl = await upsertVariable({
    owner,
    name: "config_refs_smoke_url",
    type: "string",
    value: "https://example.test",
  });
  created.push(["var", varUrl.id]);

  const varRetry = await upsertVariable({
    owner,
    name: "config_refs_smoke_retry",
    type: "number",
    value: 3,
  });
  created.push(["var", varRetry.id]);

  const varDebug = await upsertVariable({
    owner,
    name: "config_refs_smoke_debug",
    type: "boolean",
    value: false,
  });
  created.push(["var", varDebug.id]);

  {
    const resolved = await resolveConfigRefs("{{ secrets.config_refs_smoke_token }}", ctx);
    assert(resolved === "s3cret-ok", "secret whole-value");
  }
  {
    const resolved = await resolveConfigRefs("{{ vars.config_refs_smoke_url }}", ctx);
    assert(resolved === "https://example.test", "var string");
  }
  {
    const resolved = await resolveConfigRefs("{{ vars.config_refs_smoke_retry }}", ctx);
    assert(resolved === 3, "var number keeps type");
  }
  {
    const resolved = await resolveConfigRefs("{{ vars.config_refs_smoke_debug }}", ctx);
    assert(resolved === false, "var boolean keeps type");
  }
  {
    const resolved = await resolveConfigRefs("{{ context.token }}", {
      ...ctx,
      context: { token: "ctx-token-ok" },
    });
    assert(resolved === "ctx-token-ok", "context string");
  }
  {
    const resolved = await resolveConfigRefs("{{ context.n }}", {
      ...ctx,
      context: { n: 7 },
    });
    assert(resolved === 7, "context number keeps type");
  }
  {
    const wrapped = new Secret("wrapped-secret-ok");
    const resolved = await resolveConfigRefs("{{ context.tok }}", {
      ...ctx,
      context: { tok: wrapped },
    });
    assert(resolved === "wrapped-secret-ok", "context Secret unwrap");
  }
  {
    const resolved = await resolveConfigRefs("{{ context.user }}", {
      ...ctx,
      context: { user: { id: "u1", role: "admin" } },
    });
    assert(
      resolved && typeof resolved === "object" && resolved.id === "u1",
      "whole-value object pass-through",
    );
  }
  {
    const resolved = await resolveConfigRefs("{{ context.user.id }}", {
      ...ctx,
      context: { user: { id: "nested-id" } },
    });
    assert(resolved === "nested-id", "nested context path");
  }
  {
    const resolved = await resolveConfigRefs("{{ data.items.0.id }}", {
      ...ctx,
      data: { items: [{ id: "row-0" }] },
    });
    assert(resolved === "row-0", "array index path");
  }
  {
    const resolved = await resolveConfigRefs(
      "{{ vars.config_refs_smoke_url }}/{{ data.channel }}",
      { ...ctx, data: { channel: "alerts" } },
    );
    assert(resolved === "https://example.test/alerts", "concatenation");
  }
  {
    const resolved = await resolveConfigRefs("Bearer {{ context.token }}", {
      ...ctx,
      context: { token: "abc" },
    });
    assert(resolved === "Bearer abc", "mixed string");
  }
  {
    const nested = await resolveConfigRefs(
      {
        url: "{{ vars.config_refs_smoke_url }}",
        retry: "{{ vars.config_refs_smoke_retry }}",
        debug: "{{ vars.config_refs_smoke_debug }}",
        password: "{{ secrets.config_refs_smoke_token }}",
        headers: { Authorization: "$KV_modem_password" },
        extra: ["{{ context.token }}", "plain"],
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

  const data = { password: "{{ secrets.config_refs_smoke_token }}" };
  const config = { password: "{{ secrets.config_refs_smoke_token }}" };
  const resolvedConfig = await resolveConfigRefs(config, ctx);
  assert(resolvedConfig.password === "s3cret-ok", "config resolved");
  assert(data.password === "{{ secrets.config_refs_smoke_token }}", "data not walked");
  assert(config.password === "{{ secrets.config_refs_smoke_token }}", "input config not mutated");

  await assertRejects(
    () => resolveConfigRefs("{{ secrets.does_not_exist_xyz }}", ctx),
    'secret "does_not_exist_xyz" not found',
  );
  await assertRejects(
    () => resolveConfigRefs("{{ context.missing }}", ctx),
    "path not found",
  );
  await assertRejects(
    () =>
      resolveConfigRefs("Bearer {{ context.obj }}", {
        ...ctx,
        context: { obj: { a: 1 } },
      }),
    "not a scalar",
  );
  await assertRejects(
    () => resolveConfigRefs("{{ vars }}", ctx),
    "empty var name",
  );
  await assertRejects(
    () => resolveConfigRefs("{{ title }}", ctx),
    "unknown root",
  );
  await assertRejects(
    () => resolveConfigRefs("{{ context.__proto__.x }}", ctx),
    "forbidden path segment",
  );
} finally {
  for (const [kind, id] of created.reverse()) {
    if (kind === "secret") await deleteSecret(id);
    else await deleteVariable(id);
  }
  await db.destroy();
}

console.log("config-refs smoke test passed");
