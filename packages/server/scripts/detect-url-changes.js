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

const ALLOWED_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

function resolveMethod(raw) {
  if (raw == null || raw === "") return "GET";
  if (typeof raw !== "string") {
    throw new Error("detect-url-changes: ctx.config.method must be a string");
  }
  const method = raw.trim().toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    throw new Error(`detect-url-changes: unsupported method "${raw}"`);
  }
  return method;
}

function previewValue(value) {
  const json = JSON.stringify(value);
  if (json == null) return value;
  if (json.length <= 500) return value;
  return { preview: `${json.slice(0, 500)}...`, truncated: true };
}

/**
 * Eval context for fingerprint/transform JSONata (reads `data.*`).
 * @param {unknown} ctx
 * @param {Record<string, unknown>} data
 */
function evalCtx(ctx, data) {
  return {
    data,
    context: passContext(ctx),
    config: ctx?.config ?? {},
  };
}

async function detectUrlChanges(ctx) {
  const url = ctx.config?.url;
  if (typeof url !== "string" || url.length === 0) {
    throw new Error("detect-url-changes: ctx.config.url is required");
  }

  const method = resolveMethod(ctx.config?.method);
  const headers = ctx.config?.headers;
  const body = ctx.config?.body;
  const key =
    typeof ctx.config?.key === "string" && ctx.config.key.length > 0
      ? ctx.config.key
      : url;
  const fingerprintExpr = ctx.config?.fingerprint;
  const outputVar = ctx.config?.outputVar;
  const transformExpr = ctx.config?.transform;
  const skipRemainingWhenUnchanged = ctx.config?.skipRemaining === true;

  if (
    typeof transformExpr === "string" &&
    transformExpr.length > 0 &&
    (typeof outputVar !== "string" || outputVar.length === 0)
  ) {
    throw new Error(
      "detect-url-changes: ctx.config.outputVar is required when transform is set",
    );
  }

  const data = mergeData(ctx.data);

  log.info({ url, method, key }, "detect-url-changes: fetching url");
  const response = await $axios.request({
    method,
    url,
    ...(headers && typeof headers === "object" ? { headers } : {}),
    ...(body !== undefined ? { data: body } : {}),
  });
  log.info(
    { status: response.status },
    "detect-url-changes: fetch complete",
  );

  data.httpResponse = response.data;

  let fingerprintSource = data.httpResponse;
  if (typeof fingerprintExpr === "string" && fingerprintExpr.length > 0) {
    log.info(
      { jsonata: fingerprintExpr },
      "detect-url-changes: evaluating fingerprint jsonata",
    );
    fingerprintSource = await jsonata(fingerprintExpr).evaluate(evalCtx(ctx, data));
  }

  const result = await $fingerprint.claim(key, fingerprintSource, {
    maxAge: ctx.config?.maxAge,
  });

  const extra = {
    hasChanges: result.changed,
    fingerprint: result.hash,
    fingerprintChanged: result.changed,
    fingerprintPrevious: result.previous,
    fingerprintAt: result.changed ? result.at : result.previousAt,
    fingerprintAge: result.ageMs,
    fingerprintExpired: result.expired,
  };
  Object.assign(data, extra);

  log.info(
    {
      key,
      hasChanges: result.changed,
      expired: result.expired,
      ageMs: result.ageMs,
    },
    "detect-url-changes: result",
  );

  if (typeof outputVar === "string" && outputVar.length > 0) {
    if (typeof transformExpr === "string" && transformExpr.length > 0) {
      log.info(
        { outputVar, jsonata: transformExpr },
        "detect-url-changes: evaluating transform jsonata",
      );
      const transformed = await jsonata(transformExpr).evaluate(evalCtx(ctx, data));
      data[outputVar] = transformed;
      log.info(
        { outputVar, value: previewValue(transformed) },
        "detect-url-changes: saved transform result",
      );
    } else {
      data[outputVar] = data.httpResponse;
      log.info({ outputVar }, "detect-url-changes: saved raw response to outputVar");
    }
  }

  /** @type {{ output: Record<string, unknown>, context: Record<string, unknown>, skipRemaining?: true }} */
  const envelope = {
    output: data,
    context: { ...passContext(ctx), ...extra },
  };
  if (skipRemainingWhenUnchanged && !result.changed) {
    envelope.skipRemaining = true;
  }
  return envelope;
}

detectUrlChanges.meta = {
  description:
    "Fetch a URL, fingerprint the response (or a JSONata-derived value), and report whether it changed since the last run",
  previewConfigKey: "url",
  tags: ["HTTP"],
  reads: "ctx",
  config: {
    url: { type: "string", required: true, description: "URL to fetch" },
    method: {
      type: "string",
      default: "GET",
      description: "HTTP method (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)",
    },
    headers: {
      type: "object",
      required: false,
      description: "Optional request headers",
    },
    body: {
      type: "any",
      required: false,
      description: "Optional request body for non-GET methods",
    },
    key: {
      type: "string",
      required: false,
      description: "KV key for the stored fingerprint. Defaults to the URL",
    },
    fingerprint: {
      type: "string",
      required: false,
      description:
        "JSONata against ctx used as the fingerprint source. Omitted fingerprints the raw response",
    },
    outputVar: {
      type: "string",
      required: false,
      description: "ctx.data key to store output. Required when transform is set",
    },
    transform: {
      type: "string",
      required: false,
      description:
        "JSONata against ctx stored at outputVar. Omitted stores the raw response",
    },
    maxAge: {
      type: "string",
      required: false,
      description:
        "Optional age limit (e.g. 24h, 7d, or milliseconds). Older matching fingerprints report a change again",
    },
    skipRemaining: {
      type: "boolean",
      default: false,
      description: "Skip later steps when the URL has not changed",
    },
  },
  input: {},
  output: {
    hasChanges: {
      type: "boolean",
      description: "True when the URL changed since the last run",
    },
    httpResponse: { type: "any", description: "Raw response body" },
    fingerprint: { type: "string", description: "SHA-256 hex of the source value" },
    fingerprintChanged: { type: "boolean" },
    fingerprintPrevious: { type: "string", required: false },
    fingerprintAt: { type: "string", required: false, description: "ISO timestamp of the stored record" },
    fingerprintAge: { type: "number", required: false, description: "Age in milliseconds" },
    fingerprintExpired: { type: "boolean" },
  },
  context: {
    hasChanges: { type: "boolean" },
    fingerprint: { type: "string" },
    fingerprintChanged: { type: "boolean" },
    fingerprintPrevious: { type: "string", required: false },
    fingerprintAt: { type: "string", required: false },
    fingerprintAge: { type: "number", required: false },
    fingerprintExpired: { type: "boolean" },
  },
  example: {
    data: {},
    config: {
      url: "https://example.com/",
      fingerprint: "data.httpResponse",
      outputVar: "message",
      transform: '"example.com changed at " & $now()',
      skipRemaining: true,
    },
  },
};

export default detectUrlChanges;
