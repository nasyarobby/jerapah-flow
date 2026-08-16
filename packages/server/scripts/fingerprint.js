import jsonata from "jsonata";

function passContext(ctx) {
  if (ctx?.context != null && typeof ctx.context === "object" && !Array.isArray(ctx.context)) {
    return { ...ctx.context };
  }
  return {};
}

function mergeData(data) {
  if (data != null && typeof data === "object" && !Array.isArray(data)) {
    return { ...data };
  }
  return {};
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

  const extra = {
    fingerprint: result.hash,
    fingerprintChanged: result.changed,
    fingerprintPrevious: result.previous,
    fingerprintAt: result.changed ? result.at : result.previousAt,
    fingerprintAge: result.ageMs,
    fingerprintExpired: result.expired,
  };

  log.info(
    {
      key,
      changed: result.changed,
      expired: result.expired,
      ageMs: result.ageMs,
    },
    "fingerprint: result",
  );

  /** @type {{ output: Record<string, unknown>, context: Record<string, unknown>, skipRemaining?: true }} */
  const envelope = {
    output: { ...mergeData(ctx.data), ...extra },
    context: { ...passContext(ctx), ...extra },
  };
  if (!result.changed && skipRemaining) {
    envelope.skipRemaining = true;
  }
  return envelope;
}

fingerprint.meta = {
  description:
    "Hash a value, compare it to the last stored fingerprint, and skip remaining steps when unchanged",
  previewConfigKey: "key",
  reads: "ctx",
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
  context: {
    fingerprint: { type: "string" },
    fingerprintChanged: { type: "boolean" },
    fingerprintPrevious: { type: "string", required: false },
    fingerprintAt: { type: "string", required: false },
    fingerprintAge: { type: "number", required: false },
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
