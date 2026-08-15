const HTTP_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

function ensureDataObject(ctx) {
  if (ctx.data == null || typeof ctx.data !== "object" || Array.isArray(ctx.data)) {
    ctx.data = {};
  }
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function resolveMethod(ctx) {
  const raw = ctx.config?.method ?? ctx.data?.method ?? "GET";
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("fetch-http: method must be a non-empty string");
  }
  const method = raw.toUpperCase();
  if (!HTTP_METHODS.includes(method)) {
    throw new Error(`fetch-http: unsupported method "${raw}"`);
  }
  return method;
}

function normalizeHeaders(value, label) {
  if (value == null) return {};
  if (!isPlainObject(value)) {
    throw new Error(`fetch-http: ${label} must be an object`);
  }

  /** @type {Record<string, unknown>} */
  const headers = {};
  for (const [key, val] of Object.entries(value)) {
    if (val == null) continue;
    if (typeof val === "string") {
      headers[key] = val;
      continue;
    }
    if (typeof val === "number" || typeof val === "boolean") {
      headers[key] = String(val);
      continue;
    }
    // Secret wrappers are unwrapped by $axios; do not String() them.
    if (typeof val === "object") {
      headers[key] = val;
      continue;
    }
    throw new Error(`fetch-http: header "${key}" must be a string`);
  }
  return headers;
}

function resolveHeaders(ctx) {
  return {
    ...normalizeHeaders(ctx.config?.headers, "config.headers"),
    ...normalizeHeaders(ctx.data?.headers, "data.headers"),
  };
}

function resolveBody(ctx) {
  if (ctx.config != null && typeof ctx.config === "object" && "body" in ctx.config) {
    return { present: true, value: ctx.config.body };
  }
  if (ctx.data != null && typeof ctx.data === "object" && "body" in ctx.data) {
    return { present: true, value: ctx.data.body };
  }
  return { present: false, value: undefined };
}

function responseSize(data) {
  if (data == null) return 0;
  if (typeof data === "string") return data.length;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(data)) return data.length;
  try {
    return JSON.stringify(data).length;
  } catch {
    return null;
  }
}

async function fetchHttp(ctx) {
  const url = ctx.config?.url;
  if (typeof url !== "string" || url.length === 0) {
    throw new Error("fetch-http: ctx.config.url is required");
  }

  const method = resolveMethod(ctx);
  const headers = resolveHeaders(ctx);
  const body = resolveBody(ctx);

  ensureDataObject(ctx);

  /** @type {Record<string, unknown>} */
  const request = { url, method, headers };
  if (body.present && method !== "HEAD") {
    request.data = body.value;
  }

  log.info({ url, method }, "fetch-http: fetching");
  const response = await $axios.request(request);
  log.info(
    { status: response.status, length: responseSize(response.data) },
    "fetch-http: fetch complete",
  );

  ctx.data.httpResponse = response.data;
  ctx.data.httpStatus = response.status;
  log.info(
    { status: ctx.data.httpStatus, length: responseSize(ctx.data.httpResponse) },
    "fetch-http: saved httpResponse",
  );

  return ctx;
}

fetchHttp.meta = {
  description: "Fetch a URL and store the response body.",
  previewConfigKey: "url",
  tags: ["HTTP"],
  config: {
    url: { type: "string", required: true, description: "Request URL" },
    method: {
      type: "string",
      default: "GET",
      enum: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      description: "HTTP method",
    },
    headers: {
      type: "object",
      required: false,
      description: "Request headers (string values; Secret values are unwrapped)",
    },
    body: {
      type: "any",
      required: false,
      description: "Request body for POST/PUT/PATCH (object, string, or buffer)",
    },
  },
  input: {
    method: {
      type: "string",
      required: false,
      enum: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      description: "Fallback when config.method is omitted",
    },
    headers: {
      type: "object",
      required: false,
      description: "Merged over config.headers (e.g. Authorization from a secret)",
    },
    body: { type: "any", required: false, description: "Fallback when config.body is omitted" },
  },
  output: {
    httpResponse: { type: "any", description: "Response body as returned by the server" },
    httpStatus: { type: "number", description: "HTTP status code" },
  },
  example: {
    data: {},
    config: {
      url: "https://httpbin.org/post",
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: { hello: "world" },
    },
  },
};

export default fetchHttp;
