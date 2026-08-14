import jsonata from "jsonata";

function ensureDataObject(ctx) {
  if (ctx.data == null || typeof ctx.data !== "object" || Array.isArray(ctx.data)) {
    ctx.data = {};
  }
}

async function fingerprint(ctx) {
  const key =
    typeof ctx.config?.key === "string" && ctx.config.key.length > 0
      ? ctx.config.key
      : "fingerprint";
  const jsonataExpr = ctx.config?.jsonata;
  const skipRemaining = ctx.config?.skipRemaining !== false;

  let source;
  if (typeof jsonataExpr === "string" && jsonataExpr.length > 0) {
    log.info({ jsonata: jsonataExpr }, "fingerprint: evaluating jsonata");
    const expression = jsonata(jsonataExpr);
    source = await expression.evaluate(ctx);
  } else {
    source = ctx.data;
  }

  log.info({ key }, "fingerprint: claiming");
  const result = await $fingerprint.claim(key, source, {
    maxAge: ctx.config?.maxAge,
  });

  ensureDataObject(ctx);
  ctx.data.fingerprint = result.hash;
  ctx.data.fingerprintChanged = result.changed;
  ctx.data.fingerprintPrevious = result.previous;
  ctx.data.fingerprintAt = result.changed ? result.at : result.previousAt;
  ctx.data.fingerprintAge = result.ageMs;
  ctx.data.fingerprintExpired = result.expired;

  log.info(
    {
      key,
      changed: result.changed,
      expired: result.expired,
      ageMs: result.ageMs,
    },
    "fingerprint: result",
  );

  if (!result.changed && skipRemaining) {
    ctx.skipRemaining = true;
  }

  return ctx;
}

fingerprint.meta = {
  description:
    "Hash a value, compare it to the last stored fingerprint, and skip remaining steps when unchanged",
  config: {
    key: {
      type: "string",
      default: "fingerprint",
      description: "KV key for the stored fingerprint record",
    },
    jsonata: {
      type: "string",
      required: false,
      description: "JSONata against ctx; omitted hashes ctx.data",
    },
    skipRemaining: {
      type: "boolean",
      default: true,
      description: "Skip later steps when the fingerprint is unchanged",
    },
    maxAge: {
      type: "string",
      required: false,
      description: "Optional age limit (e.g. 24h, 7d, or milliseconds). Older matching hashes fire again",
    },
  },
  input: {},
  output: {
    fingerprint: { type: "string", description: "SHA-256 hex of the source value" },
    fingerprintChanged: { type: "boolean" },
    fingerprintPrevious: { type: "string", required: false },
    fingerprintAt: { type: "string", required: false, description: "ISO timestamp of the stored record" },
    fingerprintAge: { type: "number", required: false, description: "Age in milliseconds" },
    fingerprintExpired: { type: "boolean" },
  },
  example: {
    data: { item: { guid: "https://example.com/post-1" } },
    config: {
      key: "latest-item",
      jsonata: "data.item.guid ? data.item.guid : data.item.link",
    },
  },
};

export default fingerprint;
