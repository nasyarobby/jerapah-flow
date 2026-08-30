import jsonata from "jsonata";

function passContext(ctx) {
  if (ctx?.context != null && typeof ctx.context === "object" && !Array.isArray(ctx.context)) {
    return { ...ctx.context };
  }
  return {};
}

function ntfyHeaders(ctx) {
  const headers = {};

  if (ctx.data?.title) {
    log.info("ntfy: setting title %s", ctx.data.title);
    headers.Title = ctx.data.title;
  }

  if (ctx.config?.markdown === true) {
    headers.md = "true";
  }

  return headers;
}

function resolveFingerprintKey(config) {
  const fingerprint = config?.fingerprint;
  if (fingerprint === true) return "fingerprint:ntfy";
  if (typeof fingerprint === "string" && fingerprint.length > 0) return fingerprint;
  return null;
}

function defaultFingerprintSource(ctx) {
  return {
    title: ctx.data?.title,
    message: ctx.data?.message,
    attach: ctx.data?.attach,
    filename: ctx.data?.filename,
    contentType: ctx.data?.contentType,
  };
}

async function resolveFingerprintValue(ctx) {
  const expr = ctx.config?.fingerprintJsonata;
  if (typeof expr === "string" && expr.length > 0) {
    const expression = jsonata(expr);
    return await expression.evaluate(ctx);
  }
  return defaultFingerprintSource(ctx);
}

async function ntfy(ctx) {
  const file = ctx.data?.file;
  const hasFile = Buffer.isBuffer(file) || file instanceof Uint8Array;

  log.info(
    {
      title: ctx.data?.title,
      message: ctx.data?.message,
      filename: ctx.data?.filename,
      hasFile,
      fileLength: hasFile ? file.length : 0,
      attach: ctx.data?.attach,
    },
    "ntfy incoming context",
  );

  const fingerprintKey = resolveFingerprintKey(ctx.config);
  /** @type {{ hash: string, previousAt: string | null, ageMs: number | null } | null} */
  let fp = null;

  if (fingerprintKey) {
    const source = await resolveFingerprintValue(ctx);
    const checked = await $fingerprint.check(fingerprintKey, source, {
      maxAge: ctx.config?.fingerprintMaxAge,
    });
    if (!checked.changed) {
      log.info(
        {
          key: fingerprintKey,
          fingerprint: checked.hash,
          ageMs: checked.ageMs,
        },
        "ntfy: skipped, fingerprint unchanged",
      );
      return {
        output: {
          sent: "false",
          skipped: true,
          fingerprint: checked.hash,
          fingerprintAt: checked.previousAt,
          fingerprintAge: checked.ageMs,
        },
        context: passContext(ctx),
      };
    }
    fp = checked;
  }

  const headers = ntfyHeaders(ctx);
  const ntfyUrl = ctx.config?.url || "https://ntfy.sh/jerapah-flow";

  if (hasFile) {
    const filename = ctx.data?.filename || "attachment";
    headers.Filename = filename;
    if (ctx.data?.message) {
      headers.Message = ctx.data.message;
    }
    if (ctx.data?.contentType) {
      headers["Content-Type"] = ctx.data.contentType;
    }

    log.info(
      { ntfyUrl, filename, length: file.length },
      "ntfy uploading file",
    );
    await $axios.put(ntfyUrl, file, {
      headers,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
  } else {
    if (ctx.data?.attach) {
      log.info("ntfy: setting attach %s", ctx.data.attach);
      headers.Attach = ctx.data.attach;
    }

    const truncatedMessage = ctx.data?.message?.substring(0, 100);
    log.info("ntfy sending message to %s", ntfyUrl);
    log.info("ntfy messsage: %s", truncatedMessage);

    await $axios.post(ntfyUrl, ctx.data?.message || "Hello from jerapah-flow", {
      headers,
    });
  }

  /** @type {Record<string, unknown>} */
  const sent = { sent: "true" };
  if (fingerprintKey && fp) {
    const stored = await $fingerprint.remember(fingerprintKey, fp.hash);
    sent.fingerprint = stored.hash;
    sent.fingerprintAt = stored.at;
  }
  return { output: sent, context: passContext(ctx) };
}

ntfy.meta = {
  description: "Send a message or file to an ntfy topic",
  previewConfigKey: "url",
  tags: ["channel"],
  config: {
    url: {
      type: "string",
      default: "https://ntfy.sh/jerapah-flow",
      description: "ntfy topic URL",
    },
    markdown: {
      type: "boolean",
      default: false,
      description: "Send as Markdown (ntfy md header)",
    },
    fingerprint: {
      type: "string",
      required: false,
      description: "true or a KV key; skip send when the payload fingerprint is unchanged",
    },
    fingerprintJsonata: {
      type: "string",
      required: false,
      description: "JSONata against full ctx; default hashes data title, message, attach, filename, contentType",
    },
    fingerprintMaxAge: {
      type: "string",
      required: false,
      description: "Optional age limit (e.g. 24h, 7d, or milliseconds)",
    },
  },
  input: {
    title: { type: "string", required: false },
    message: { type: "string", required: false },
    attach: { type: "string", required: false, description: "Remote attachment URL" },
    file: { type: "buffer", required: false, description: "Binary body to PUT" },
    filename: { type: "string", required: false },
    contentType: { type: "string", required: false },
  },
  reads: "ctx",
  output: {
    sent: { type: "string", description: '"true" when sent, "false" when fingerprint skipped' },
  },
  example: {
    data: { title: "Hello", message: "Hello from jerapah-flow" },
    config: { url: "https://ntfy.sh/jerapah-flow", fingerprint: true },
  },
};

export default ntfy;
