const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

const REPLY_SKIP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "content-encoding",
  "content-length",
]);

/**
 * Control origin used when the UI or HTTP process proxies to control.
 * @returns {string}
 */
export function controlOrigin() {
  const explicit = process.env.JFLOW_CONTROL_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const port = Number(process.env.JFLOW_CONTROL_PORT ?? 8600);
  return `http://127.0.0.1:${port}`;
}

/**
 * HTTP API origin (workflow triggers + REST).
 * @returns {string}
 */
export function httpOrigin() {
  const explicit = process.env.JFLOW_HTTP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const port = Number(process.env.JFLOW_HTTP_PORT ?? process.env.PORT ?? 8700);
  return `http://127.0.0.1:${port}`;
}

/**
 * Forward the incoming request to `origin`, preserving path + query.
 * @param {import("fastify").FastifyRequest} req
 * @param {import("fastify").FastifyReply} reply
 * @param {string} origin
 * @param {{ unreachableMessage?: string }} [opts]
 */
export async function proxyToOrigin(req, reply, origin, opts = {}) {
  const target = `${origin.replace(/\/$/, "")}${req.raw.url ?? "/"}`;
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null || HOP_BY_HOP.has(key.toLowerCase())) continue;
    headers[key] = Array.isArray(value) ? value.join(", ") : String(value);
  }

  const method = req.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  let body;
  if (hasBody) {
    if (Buffer.isBuffer(req.body)) body = req.body;
    else if (typeof req.body === "string") body = req.body;
    else if (req.body != null) {
      body = JSON.stringify(req.body);
      if (!headers["content-type"]) headers["content-type"] = "application/json";
    }
  }

  let res;
  try {
    res = await fetch(target, { method, headers, body });
  } catch (err) {
    const message = opts.unreachableMessage ?? "upstream unreachable";
    req.log.warn({ err, target }, `proxy: ${message}`);
    return reply.code(502).send({ error: message });
  }

  reply.code(res.status);
  res.headers.forEach((value, key) => {
    if (REPLY_SKIP.has(key.toLowerCase())) return;
    reply.header(key, value);
  });
  return reply.send(Buffer.from(await res.arrayBuffer()));
}

/**
 * Forward `/ops/*` to the control plane (same-origin UI in production).
 * @param {import("fastify").FastifyRequest} req
 * @param {import("fastify").FastifyReply} reply
 */
export async function proxyOpsToControl(req, reply) {
  return proxyToOrigin(req, reply, controlOrigin(), {
    unreachableMessage: "control plane unreachable",
  });
}
