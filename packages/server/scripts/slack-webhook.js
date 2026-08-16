import jsonata from "jsonata";

function passContext(ctx) {
  if (ctx?.context != null && typeof ctx.context === "object" && !Array.isArray(ctx.context)) {
    return { ...ctx.context };
  }
  return {};
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function resolveFingerprintKey(config) {
  if (config?.fingerprint === false) return null;
  const fingerprint = config?.fingerprint;
  if (fingerprint == null || fingerprint === true) return "fingerprint:slack-webhook";
  if (typeof fingerprint === "string" && fingerprint.length > 0) return fingerprint;
  return null;
}

function resolveFingerprintMaxAge(config) {
  if (config?.fingerprintMaxAge == null || config.fingerprintMaxAge === "") {
    return "1h";
  }
  return config.fingerprintMaxAge;
}

function defaultFingerprintSource(ctx) {
  return buildPayload(ctx);
}

async function resolveFingerprintValue(ctx) {
  const expr = ctx.config?.fingerprintJsonata;
  if (typeof expr === "string" && expr.length > 0) {
    const expression = jsonata(expr);
    return await expression.evaluate(ctx);
  }
  return defaultFingerprintSource(ctx);
}

async function resolveWebhookUrl(ctx) {
  const secretName = ctx.config?.webhookUrlSecret;
  if (typeof secretName !== "string" || secretName.length === 0) {
    throw new Error("slack-webhook: config.webhookUrlSecret is required");
  }
  return $secrets.reveal(await $secrets.get(secretName));
}

function buildPayload(ctx) {
  if (isPlainObject(ctx.config?.payload)) {
    return { ...ctx.config.payload };
  }
  if (isPlainObject(ctx.data?.payload)) {
    return { ...ctx.data.payload };
  }

  const text =
    typeof ctx.data?.text === "string"
      ? ctx.data.text
      : typeof ctx.data?.message === "string"
        ? ctx.data.message
        : typeof ctx.config?.text === "string"
          ? ctx.config.text
          : undefined;

  const blocks = Array.isArray(ctx.data?.blocks)
    ? ctx.data.blocks
    : Array.isArray(ctx.config?.blocks)
      ? ctx.config.blocks
      : undefined;

  if ((text == null || text === "") && (!blocks || blocks.length === 0)) {
    throw new Error(
      "slack-webhook: text or blocks is required (or provide config.payload / data.payload)",
    );
  }

  /** @type {Record<string, unknown>} */
  const payload = {};
  if (typeof text === "string" && text.length > 0) payload.text = text;
  if (blocks) payload.blocks = blocks;

  if (typeof ctx.config?.username === "string" && ctx.config.username.length > 0) {
    payload.username = ctx.config.username;
  }
  if (typeof ctx.config?.iconEmoji === "string" && ctx.config.iconEmoji.length > 0) {
    payload.icon_emoji = ctx.config.iconEmoji;
  }
  if (typeof ctx.config?.iconUrl === "string" && ctx.config.iconUrl.length > 0) {
    payload.icon_url = ctx.config.iconUrl;
  }

  return payload;
}

function assertSlackResponse(response) {
  const status = response.status;
  if (status < 200 || status >= 300) {
    throw new Error(`slack-webhook: request failed with status ${status}`);
  }

  const body = response.data;
  if (typeof body === "string") {
    const trimmed = body.trim();
    if (trimmed.length > 0 && trimmed !== "ok") {
      throw new Error(`slack-webhook: ${trimmed}`);
    }
    return;
  }

  if (isPlainObject(body) && body.ok === false) {
    const detail = typeof body.error === "string" ? body.error : "request failed";
    throw new Error(`slack-webhook: ${detail}`);
  }
}

async function slackWebhook(ctx) {
  const payload = buildPayload(ctx);
  const fingerprintKey = resolveFingerprintKey(ctx.config);
  /** @type {{ hash: string, previousAt: string | null, ageMs: number | null } | null} */
  let fp = null;

  log.info(
    {
      hasText: typeof payload.text === "string",
      blockCount: Array.isArray(payload.blocks) ? payload.blocks.length : 0,
      fingerprint: fingerprintKey,
    },
    "slack-webhook: preparing message",
  );

  if (fingerprintKey) {
    const source = await resolveFingerprintValue(ctx);
    const checked = await $fingerprint.check(fingerprintKey, source, {
      maxAge: resolveFingerprintMaxAge(ctx.config),
    });
    if (!checked.changed) {
      log.info(
        {
          key: fingerprintKey,
          fingerprint: checked.hash,
          ageMs: checked.ageMs,
        },
        "slack-webhook: skipped, fingerprint unchanged",
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

  const webhookUrl = await resolveWebhookUrl(ctx);
  log.info("slack-webhook: sending message");

  const response = await $axios.post(webhookUrl, payload, {
    headers: { "Content-Type": "application/json" },
  });
  assertSlackResponse(response);

  /** @type {Record<string, unknown>} */
  const sent = { sent: "true", slackStatus: response.status };
  if (fingerprintKey && fp) {
    const stored = await $fingerprint.remember(fingerprintKey, fp.hash);
    sent.fingerprint = stored.hash;
    sent.fingerprintAt = stored.at;
  }

  log.info({ slackStatus: response.status }, "slack-webhook: message sent");
  return { output: sent, context: passContext(ctx) };
}

slackWebhook.meta = {
  description: "Send a message to Slack using an Incoming Webhook URL stored as a secret",
  previewConfigKey: "webhookUrlSecret",
  tags: ["Slack", "channel"],
  config: {
    webhookUrlSecret: {
      type: "string",
      required: true,
      description: "Named secret holding the Slack Incoming Webhook URL",
    },
    text: {
      type: "string",
      required: false,
      description: "Fallback message text when data.text / data.message are omitted",
    },
    blocks: {
      type: "array",
      required: false,
      description: "Slack Block Kit blocks (merged unless data.blocks or data.payload is set)",
    },
    payload: {
      type: "object",
      required: false,
      description: "Full Slack webhook JSON body override",
    },
    username: {
      type: "string",
      required: false,
      description: "Override the displayed bot username",
    },
    iconEmoji: {
      type: "string",
      required: false,
      description: "Override the bot icon emoji (e.g. :robot_face:)",
    },
    iconUrl: {
      type: "string",
      required: false,
      description: "Override the bot icon with an image URL",
    },
    fingerprint: {
      type: "string",
      required: false,
      description: "true (default), a KV key, or false to disable deduplication",
    },
    fingerprintJsonata: {
      type: "string",
      required: false,
      description: "JSONata against full ctx; default hashes the outgoing Slack payload",
    },
    fingerprintMaxAge: {
      type: "string",
      default: "1h",
      description: "Deduplication window (e.g. 1h, 24h, 7d, or milliseconds)",
    },
  },
  input: {
    text: { type: "string", required: false, description: "Message text" },
    message: { type: "string", required: false, description: "Alias for text" },
    blocks: { type: "array", required: false, description: "Slack Block Kit blocks" },
    payload: { type: "object", required: false, description: "Full Slack webhook JSON body override" },
  },
  reads: "ctx",
  output: {
    sent: { type: "string", description: '"true" when sent, "false" when fingerprint skipped' },
    skipped: { type: "boolean", required: false, description: "Present when deduplication skipped the send" },
    slackStatus: { type: "number", required: false, description: "HTTP status from Slack" },
    fingerprint: { type: "string", required: false },
    fingerprintAt: { type: "string", required: false },
    fingerprintAge: { type: "number", required: false },
  },
  context: {},
  example: {
    data: {
      message: "Deploy finished successfully",
    },
    config: {
      webhookUrlSecret: "slack_deploy_webhook",
      fingerprint: true,
      fingerprintMaxAge: "1h",
    },
  },
};

export default slackWebhook;
