import { migrate, db } from "../db.js";
import { kvSet, kvDelete } from "../kv-store.js";
import { upsertSecret, deleteSecret, listSecrets } from "../secrets-store.js";
import {
  upsertHttpPage,
  deleteHttpPage,
  listHttpPages,
} from "../http-pages-store.js";
import {
  upsertHttpAuth,
  deleteHttpAuth,
  getHttpAuthInternal,
} from "../http-auths-store.js";
import {
  checkHttpAuth,
  coerceCredentialString,
  resolveAuthMechanism,
  resolveCredentialValue,
  resolveUnauthorizedSpec,
  sendHttpPageOrJson,
} from "../http-trigger-auth.js";
import { validateWorkflowHttpTriggers } from "../workflow-http-validate.js";
import { log } from "../logger.js";

await migrate();

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function mockReq(headers = {}) {
  return { headers };
}

const owner = "default";
const workflowKey = "default/auth-smoke.yaml";
const ctx = { owner, workflowKey };

// --- coerce ---
assert(coerceCredentialString("abc") === "abc", "coerce string");
assert(coerceCredentialString(42) === "42", "coerce number");
assert(coerceCredentialString({ a: 1 }) === null, "coerce object fails");

// --- pages ---
const page = await upsertHttpPage({
  name: "deny-smoke",
  content: "<h1>denied</h1>",
  mime: "html",
  status: 403,
});
assert(page.name === "deny-smoke", "page upsert");

// --- literal bearer ---
{
  const mech = await resolveAuthMechanism({
    type: "bearer",
    token: "secret-token-ok",
  });
  assert(mech?.type === "bearer", "inline bearer");
  const ok = await checkHttpAuth(
    mockReq({ authorization: "Bearer secret-token-ok" }),
    mech,
    ctx,
  );
  assert(ok, "bearer match");
  const bad = await checkHttpAuth(
    mockReq({ authorization: "Bearer wrong" }),
    mech,
    ctx,
  );
  assert(!bad, "bearer mismatch");
  const missing = await checkHttpAuth(mockReq({}), mech, ctx);
  assert(!missing, "bearer missing");
}

// --- basic ---
{
  const mech = await resolveAuthMechanism({
    type: "basic",
    user: "alice",
    password: "hunter2",
  });
  const encoded = Buffer.from("alice:hunter2").toString("base64");
  const ok = await checkHttpAuth(
    mockReq({ authorization: `Basic ${encoded}` }),
    mech,
    ctx,
  );
  assert(ok, "basic match");
  const badEnc = Buffer.from("alice:wrong").toString("base64");
  const bad = await checkHttpAuth(
    mockReq({ authorization: `Basic ${badEnc}` }),
    mech,
    ctx,
  );
  assert(!bad, "basic mismatch");
}

// --- header ---
{
  const mech = await resolveAuthMechanism({
    type: "header",
    header: "X-Webhook-Secret",
    value: "hdr-secret",
  });
  const ok = await checkHttpAuth(
    mockReq({ "x-webhook-secret": "hdr-secret" }),
    mech,
    ctx,
  );
  assert(ok, "header match");
  const bad = await checkHttpAuth(
    mockReq({ "x-webhook-secret": "nope" }),
    mech,
    ctx,
  );
  assert(!bad, "header mismatch");
}

// --- KV ref ---
await kvSet("auth", "webhook-token", "from-kv");
{
  const resolved = await resolveCredentialValue(
    { kv: "webhook-token", namespace: "auth" },
    ctx,
  );
  assert(resolved === "from-kv", "kv resolve");
  const mech = await resolveAuthMechanism({
    type: "bearer",
    token: { kv: "webhook-token", namespace: "auth" },
  });
  const ok = await checkHttpAuth(
    mockReq({ authorization: "Bearer from-kv" }),
    mech,
    ctx,
  );
  assert(ok, "bearer from kv");
  const missingKv = await checkHttpAuth(
    mockReq({ authorization: "Bearer from-kv" }),
    {
      type: "bearer",
      config: { token: { kv: "missing-key", namespace: "auth" } },
    },
    ctx,
  );
  assert(!missingKv, "missing kv fails closed");
}
await kvDelete("auth", "webhook-token");

// --- secret ref ---
const secret = await upsertSecret({
  owner,
  name: "http_auth_smoke_token",
  value: "encrypted-token-ok",
});
{
  const resolved = await resolveCredentialValue(
    { secret: "http_auth_smoke_token" },
    ctx,
  );
  assert(resolved === "encrypted-token-ok", "secret resolve");
  const mech = await resolveAuthMechanism({
    type: "bearer",
    token: { secret: "http_auth_smoke_token" },
  });
  const ok = await checkHttpAuth(
    mockReq({ authorization: "Bearer encrypted-token-ok" }),
    mech,
    ctx,
  );
  assert(ok, "bearer from secret");
  const missingSec = await checkHttpAuth(
    mockReq({ authorization: "Bearer x" }),
    {
      type: "bearer",
      config: { token: { secret: "does_not_exist_xyz" } },
    },
    ctx,
    );
  assert(!missingSec, "missing secret fails closed");
}

// --- named profile ---
const profile = await upsertHttpAuth({
  name: "webhook-smoke",
  type: "bearer",
  config: { token: "named-token" },
  unauthorized_status: 403,
  unauthorized_response: "deny-smoke",
});
{
  const mech = await resolveAuthMechanism("webhook-smoke");
  assert(mech?.label === "webhook-smoke", "named profile");
  const ok = await checkHttpAuth(
    mockReq({ authorization: "Bearer named-token" }),
    mech,
    ctx,
  );
  assert(ok, "named profile match");
  const { status, pageName } = resolveUnauthorizedSpec({}, mech);
  assert(status === 403, "profile unauth status");
  assert(pageName === "deny-smoke", "profile unauth page");
}

// trigger-level override
{
  const mech = await getHttpAuthInternal("webhook-smoke");
  const { status, pageName } = resolveUnauthorizedSpec(
    { unauthorized: { status: 401, response: "deny-smoke" } },
    mech,
  );
  assert(status === 401, "trigger override status");
  assert(pageName === "deny-smoke", "trigger override page");
}

// default 401
{
  const { status, pageName } = resolveUnauthorizedSpec({}, null);
  assert(status === 401 && pageName == null, "default 401");
}

// validation
await validateWorkflowHttpTriggers({
  triggers: [
    {
      type: "HTTP",
      method: "POST",
      path: "/x",
      auth: "webhook-smoke",
      response: "deny-smoke",
    },
  ],
});

let threw = false;
try {
  await validateWorkflowHttpTriggers({
    triggers: [{ type: "HTTP", path: "/x", auth: "no-such-profile" }],
  });
} catch {
  threw = true;
}
assert(threw, "unknown auth fails validation");

threw = false;
try {
  await validateWorkflowHttpTriggers({
    triggers: [{ type: "HTTP", path: "/x", response: "no-such-page" }],
  });
} catch {
  threw = true;
}
assert(threw, "unknown page fails validation");

// send page helper (mock reply)
{
  /** @type {any} */
  const reply = {
    _code: 200,
    _type: null,
    _body: null,
    code(c) {
      this._code = c;
      return this;
    },
    type(t) {
      this._type = t;
      return this;
    },
    send(b) {
      this._body = b;
      return this;
    },
  };
  await sendHttpPageOrJson(reply, 401, "deny-smoke", { error: "unauthorized" });
  assert(reply._code === 401, "page status from arg");
  assert(String(reply._type).includes("text/html"), "page mime");
  assert(reply._body === "<h1>denied</h1>", "page body");
}

// cleanup
await deleteHttpAuth(profile.id);
await deleteHttpPage(page.id);
await deleteSecret(secret.id);
const leftover = (await listSecrets({ owner })).find(
  (s) => s.name === "http_auth_smoke_token",
);
assert(!leftover, "secret cleaned");
assert(!(await listHttpPages()).some((p) => p.name === "deny-smoke"), "page cleaned");

log.info("http-trigger-auth-smoke ok");
await db.destroy();
process.exit(0);
