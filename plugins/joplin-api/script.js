const HTTP_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const DEFAULT_TIMEOUT_MS = 600_000;
const JOPLIN_ID_RE = /^[a-fA-F0-9]{32}$/;

function passContext(ctx) {
  if (ctx?.context != null && typeof ctx.context === "object" && !Array.isArray(ctx.context)) {
    return { ...ctx.context };
  }
  return {};
}

function unwrapScalar(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value.reveal === "function") {
    return unwrapScalar(value.reveal());
  }
  return "";
}

function fail(ctx, startedAt, message, extra = {}) {
  const durationMs = Date.now() - startedAt;
  const output = {
    ok: false,
    status: extra.status ?? null,
    httpResponse: extra.httpResponse ?? null,
    durationMs,
    message,
  };
  log.warn({ durationMs, status: output.status, message }, "joplin-api: failed");
  return { output, context: { ...passContext(ctx), ...output } };
}

function okResult(ctx, startedAt, status, httpResponse, message) {
  const durationMs = Date.now() - startedAt;
  const output = {
    ok: true,
    status,
    httpResponse,
    durationMs,
    message,
  };
  log.info({ durationMs, status }, "joplin-api: ok");
  return { output, context: { ...passContext(ctx), ...output } };
}

function resolveMethod(ctx) {
  const raw = unwrapScalar(ctx.config?.method || ctx.data?.method || "POST");
  const method = raw.toUpperCase();
  if (!HTTP_METHODS.includes(method)) {
    return { error: `unsupported method "${raw}"` };
  }
  return { method };
}

function resolveTimeoutMs(ctx) {
  const raw = ctx.config?.timeoutMs ?? ctx.data?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TIMEOUT_MS;
  return n;
}

function noteIdFromData(ctx) {
  const id = unwrapScalar(ctx.data?.id).trim();
  return id.length > 0 ? id : null;
}

function joinUrl(base, id) {
  const trimmed = base.replace(/\/+$/, "");
  return `${trimmed}/${id}`;
}

function authorizationHeader(token) {
  const trimmed = token.trim();
  if (/^bearer\s+/i.test(trimmed)) return trimmed;
  return `Bearer ${trimmed}`;
}

function summarizeSuccess(status, body, durationMs) {
  if (body != null && typeof body === "object" && !Array.isArray(body)) {
    if (typeof body.date === "string" && body.date) {
      return `ok ${status} date=${body.date} in ${durationMs}ms`;
    }
    if (typeof body.status === "string" && body.status) {
      return `ok ${status} ${body.status} in ${durationMs}ms`;
    }
  }
  return `ok ${status} in ${durationMs}ms`;
}

function summarizeError(status, body) {
  if (body != null && typeof body === "object" && typeof body.error === "string") {
    return status != null ? `HTTP ${status}: ${body.error}` : body.error;
  }
  if (typeof body === "string" && body.length > 0) {
    const clip = body.length > 300 ? `${body.slice(0, 300)}…` : body;
    return status != null ? `HTTP ${status}: ${clip}` : clip;
  }
  return status != null ? `HTTP ${status}` : "request failed";
}

async function parseBody(response) {
  const text = await response.text();
  if (text.length === 0) return null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json") || /^[\[{]/.test(text.trim())) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

async function joplinHttp(ctx) {
  const startedAt = Date.now();
  const url = unwrapScalar(ctx.config?.url).trim();
  if (!url) {
    return fail(ctx, startedAt, "config.url is required");
  }

  const token = unwrapScalar(ctx.config?.token);
  if (!token) {
    return fail(ctx, startedAt, "config.token is required");
  }

  const methodResult = resolveMethod(ctx);
  if (methodResult.error) {
    return fail(ctx, startedAt, methodResult.error);
  }
  const { method } = methodResult;

  const id = noteIdFromData(ctx);
  if (id != null && !JOPLIN_ID_RE.test(id)) {
    return fail(ctx, startedAt, "data.id must be a 32-character hex Joplin id");
  }

  const requestUrl = id != null ? joinUrl(url, id) : url;
  const timeoutMs = resolveTimeoutMs(ctx);

  log.info({ url: requestUrl, method, timeoutMs, hasId: id != null }, "joplin-api: request");

  try {
    const response = await fetch(requestUrl, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: authorizationHeader(token),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const httpResponse = await parseBody(response);
    const durationMs = Date.now() - startedAt;
    if (response.ok) {
      return okResult(
        ctx,
        startedAt,
        response.status,
        httpResponse,
        summarizeSuccess(response.status, httpResponse, durationMs),
      );
    }
    return fail(ctx, startedAt, summarizeError(response.status, httpResponse), {
      status: response.status,
      httpResponse,
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const message =
      name === "TimeoutError" || name === "AbortError"
        ? `request timed out after ${timeoutMs}ms`
        : err instanceof Error
          ? err.message
          : String(err);
    return fail(ctx, startedAt, message);
  }
}

joplinHttp.meta = {
  description:
    "GET/POST a Joplin host with Bearer token using native fetch (LAN/WG IPs). Optional data.id is appended to the URL. Does not throw; ok=false on failure.",
  previewConfigKey: "url",
  tags: ["HTTP", "Joplin"],
  config: {
    url: {
      type: "string",
      required: true,
      description: "Request URL. data.id is appended as a path segment when set.",
    },
    method: {
      type: "string",
      default: "POST",
      enum: HTTP_METHODS,
      description: "HTTP method",
    },
    token: {
      type: "string",
      required: true,
      description: "Bearer token ($SECRET_); Bearer prefix is added if missing",
    },
    timeoutMs: {
      type: "number",
      required: false,
      description: "Abort timeout in milliseconds (default 600000)",
    },
  },
  input: {
    id: {
      type: "string",
      required: false,
      description: "32-char hex Joplin note id; appended to config.url",
    },
    method: {
      type: "string",
      required: false,
      description: "Fallback when config.method is omitted",
    },
  },
  output: {
    ok: { type: "boolean" },
    status: { type: "number", description: "HTTP status, or null on network error" },
    httpResponse: { type: "any", description: "Parsed JSON or response text" },
    durationMs: { type: "number" },
    message: { type: "string" },
  },
  context: {
    ok: { type: "boolean" },
    status: { type: "number" },
    httpResponse: { type: "any" },
    durationMs: { type: "number" },
    message: { type: "string" },
  },
  example: {
    data: { id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    config: {
      url: "http://10.8.0.6:3030/notes",
      method: "GET",
      token: "$SECRET_joplin_api_token",
      timeoutMs: 60000,
    },
  },
};

export default joplinHttp;
