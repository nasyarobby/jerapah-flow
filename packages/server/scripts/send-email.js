import nodemailer from "nodemailer";

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string | undefined}
 */
function normalizeRecipients(value, label) {
  if (value == null || value === "") return undefined;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const items = value.filter((item) => typeof item === "string" && item.length > 0);
    if (items.length === 0) return undefined;
    if (items.length !== value.length) {
      throw new Error(`${label} must be a string or array of non-empty strings`);
    }
    return items.join(", ");
  }
  throw new Error(`${label} must be a string or array of strings`);
}

/**
 * @param {Record<string, unknown>} config
 * @param {string | null} password
 */
function buildTransportOptions(config, password) {
  /** @type {import("nodemailer").TransportOptions} */
  const transport = {};

  if (typeof config.service === "string" && config.service.length > 0) {
    transport.service = config.service;
  }
  if (typeof config.url === "string" && config.url.length > 0) {
    transport.url = config.url;
  }
  if (typeof config.host === "string" && config.host.length > 0) {
    transport.host = config.host;
  }
  if (config.port != null && config.port !== "") {
    transport.port = Number(config.port);
  }
  if (config.secure === true) transport.secure = true;
  if (config.requireTLS === true) transport.requireTLS = true;
  if (config.ignoreTLS === true) transport.ignoreTLS = true;
  if (typeof config.name === "string" && config.name.length > 0) {
    transport.name = config.name;
  }
  if (config.connectionTimeout != null && config.connectionTimeout !== "") {
    transport.connectionTimeout = Number(config.connectionTimeout);
  }
  if (config.greetingTimeout != null && config.greetingTimeout !== "") {
    transport.greetingTimeout = Number(config.greetingTimeout);
  }
  if (config.socketTimeout != null && config.socketTimeout !== "") {
    transport.socketTimeout = Number(config.socketTimeout);
  }
  if (typeof config.authMethod === "string" && config.authMethod.length > 0) {
    transport.authMethod = config.authMethod;
  }
  if (config.tls != null && typeof config.tls === "object" && !Array.isArray(config.tls)) {
    transport.tls = config.tls;
  }
  if (config.pool === true) {
    transport.pool = true;
    if (config.maxConnections != null && config.maxConnections !== "") {
      transport.maxConnections = Number(config.maxConnections);
    }
    if (config.maxMessages != null && config.maxMessages !== "") {
      transport.maxMessages = Number(config.maxMessages);
    }
    if (config.rateDelta != null && config.rateDelta !== "") {
      transport.rateDelta = Number(config.rateDelta);
    }
    if (config.rateLimit != null && config.rateLimit !== "") {
      transport.rateLimit = Number(config.rateLimit);
    }
  }

  const user = config.user;
  if (typeof user === "string" && user.length > 0) {
    /** @type {Record<string, unknown>} */
    const auth = { user };
    if (typeof password === "string" && password.length > 0) {
      auth.pass = password;
    }
    if (typeof config.authType === "string" && config.authType.length > 0) {
      auth.type = config.authType;
    }
    if (typeof config.authMethod === "string" && config.authMethod.length > 0) {
      auth.method = config.authMethod;
    }
    transport.auth = auth;
  }

  return transport;
}

/**
 * @param {Record<string, unknown>} config
 */
function assertTransportConfig(config) {
  const hasEndpoint =
    (typeof config.service === "string" && config.service.length > 0) ||
    (typeof config.host === "string" && config.host.length > 0) ||
    (typeof config.url === "string" && config.url.length > 0) ||
    (typeof config.urlSecret === "string" && config.urlSecret.length > 0);

  if (!hasEndpoint) {
    throw new Error("config.service, config.host, config.url, or config.urlSecret is required");
  }

  const hasUrl = typeof config.url === "string" && config.url.length > 0;
  const hasUrlSecret = typeof config.urlSecret === "string" && config.urlSecret.length > 0;
  const hasUser = typeof config.user === "string" && config.user.length > 0;
  const hasPasswordSecret =
    typeof config.passwordSecret === "string" && config.passwordSecret.length > 0;

  if (!hasUrl && !hasUrlSecret && !hasUser) {
    throw new Error("config.user is required unless config.url or config.urlSecret is set");
  }
  if (!hasUrl && !hasUrlSecret && !hasPasswordSecret) {
    throw new Error("config.passwordSecret is required unless config.url or config.urlSecret is set");
  }
}

async function sendEmail(ctx) {
  const config = ctx.config ?? {};
  assertTransportConfig(config);

  const fromConfig =
    typeof config.from === "string" && config.from.length > 0 ? config.from : undefined;
  const fromData =
    typeof ctx.data?.from === "string" && ctx.data.from.length > 0 ? ctx.data.from : undefined;
  const from = fromData ?? fromConfig;
  if (!from) {
    throw new Error("data.from or config.from is required (sender email address)");
  }

  const to = normalizeRecipients(ctx.data?.to, "data.to");
  if (!to) {
    throw new Error("data.to is required");
  }

  const subject = ctx.data?.subject;
  if (typeof subject !== "string" || subject.length === 0) {
    throw new Error("data.subject is required");
  }

  const text = ctx.data?.text ?? ctx.data?.body ?? ctx.data?.message;
  const html = ctx.data?.html;
  const hasText = typeof text === "string" && text.length > 0;
  const hasHtml = typeof html === "string" && html.length > 0;
  if (!hasText && !hasHtml) {
    throw new Error("data.text or data.html is required");
  }

  const cc = normalizeRecipients(ctx.data?.cc, "data.cc");
  const bcc = normalizeRecipients(ctx.data?.bcc, "data.bcc");
  const replyTo =
    normalizeRecipients(ctx.data?.replyTo ?? config.replyTo, "replyTo");

  let url = typeof config.url === "string" && config.url.length > 0 ? config.url : undefined;
  if (!url && typeof config.urlSecret === "string" && config.urlSecret.length > 0) {
    url = $secrets.reveal(await $secrets.get(config.urlSecret));
  }

  let password = null;
  if (typeof config.passwordSecret === "string" && config.passwordSecret.length > 0) {
    password = $secrets.reveal(await $secrets.get(config.passwordSecret));
  }

  const transportConfig = url ? { ...config, url } : config;
  const transporter = nodemailer.createTransport(buildTransportOptions(transportConfig, password));

  /** @type {import("nodemailer").SendMailOptions} */
  const mail = {
    from,
    to,
    subject,
  };
  if (hasText) mail.text = text;
  if (hasHtml) mail.html = html;
  if (cc) mail.cc = cc;
  if (bcc) mail.bcc = bcc;
  if (replyTo) mail.replyTo = replyTo;

  if (typeof config.priority === "string" && config.priority.length > 0) {
    mail.priority = config.priority;
  } else if (typeof ctx.data?.priority === "string" && ctx.data.priority.length > 0) {
    mail.priority = ctx.data.priority;
  }

  if (ctx.data?.headers != null && typeof ctx.data.headers === "object" && !Array.isArray(ctx.data.headers)) {
    mail.headers = ctx.data.headers;
  } else if (config.headers != null && typeof config.headers === "object" && !Array.isArray(config.headers)) {
    mail.headers = config.headers;
  }

  log.info(
    {
      service: config.service,
      host: config.host,
      port: config.port,
      secure: config.secure === true,
      from,
      to,
      cc: cc ?? null,
      bcc: bcc ? "[redacted]" : null,
      subjectLength: subject.length,
      textLength: hasText ? text.length : 0,
      htmlLength: hasHtml ? html.length : 0,
    },
    "send-email: sending message",
  );

  const info = await transporter.sendMail(mail);

  log.info({ messageId: info.messageId }, "send-email: message sent");

  return {
    sent: true,
    messageId: info.messageId ?? null,
    from,
    to,
    cc: cc ?? null,
    bcc: bcc ?? null,
    subject,
  };
}

sendEmail.meta = {
  description: "Send an email via SMTP (nodemailer); plain text, HTML, or both",
  previewConfigKey: "from",
  config: {
    service: {
      type: "string",
      required: false,
      description:
        "Nodemailer well-known service ID (e.g. Gmail, Outlook365, SendGrid). Sets host, port, and TLS. See https://nodemailer.com/smtp/well-known-services",
    },
    host: {
      type: "string",
      required: false,
      description: "SMTP server hostname (e.g. smtp.gmail.com)",
    },
    port: {
      type: "number",
      default: 587,
      description: "SMTP port (587 for STARTTLS, 465 for SSL)",
    },
    secure: {
      type: "boolean",
      default: false,
      description: "Use TLS on connect (true for port 465)",
    },
    requireTLS: {
      type: "boolean",
      required: false,
      description: "Require STARTTLS upgrade",
    },
    ignoreTLS: {
      type: "boolean",
      required: false,
      description: "Disable STARTTLS even if the server supports it",
    },
    name: {
      type: "string",
      required: false,
      description: "Client EHLO hostname",
    },
    user: {
      type: "string",
      required: false,
      description: "SMTP auth username (separate from the visible From address)",
    },
    from: {
      type: "string",
      required: false,
      description: "Default sender email address (overridden by data.from)",
    },
    replyTo: {
      type: "string",
      required: false,
      description: "Default Reply-To address (overridden by data.replyTo)",
    },
    passwordSecret: {
      type: "string",
      required: false,
      description: "Named secret holding the SMTP password or app password",
    },
    url: {
      type: "string",
      required: false,
      description: "Full SMTP connection URL (smtp:// or smtps://); prefer urlSecret in production",
    },
    urlSecret: {
      type: "string",
      required: false,
      description: "Named secret holding a full SMTP connection URL",
    },
    authType: {
      type: "string",
      required: false,
      description: "SMTP auth type (e.g. LOGIN, OAUTH2)",
    },
    authMethod: {
      type: "string",
      required: false,
      description: "SMTP auth method override (e.g. LOGIN, PLAIN, CRAM-MD5)",
    },
    tls: {
      type: "object",
      required: false,
      description: "TLS options (e.g. rejectUnauthorized, minVersion, ciphers)",
    },
    connectionTimeout: {
      type: "number",
      required: false,
      description: "Socket connection timeout in milliseconds",
    },
    greetingTimeout: {
      type: "number",
      required: false,
      description: "SMTP greeting timeout in milliseconds",
    },
    socketTimeout: {
      type: "number",
      required: false,
      description: "Socket inactivity timeout in milliseconds",
    },
    pool: {
      type: "boolean",
      required: false,
      description: "Reuse SMTP connections",
    },
    maxConnections: {
      type: "number",
      required: false,
      description: "Max pooled connections when pool is enabled",
    },
    maxMessages: {
      type: "number",
      required: false,
      description: "Max messages per pooled connection",
    },
    rateDelta: {
      type: "number",
      required: false,
      description: "Rate limit window in milliseconds when pool is enabled",
    },
    rateLimit: {
      type: "number",
      required: false,
      description: "Max messages per rateDelta when pool is enabled",
    },
    priority: {
      type: "string",
      required: false,
      description: "Default message priority: high, normal, or low",
    },
    headers: {
      type: "object",
      required: false,
      description: "Default custom headers object",
    },
  },
  input: {
    from: {
      type: "string",
      required: false,
      description: "Sender email address (overrides config.from)",
    },
    to: {
      type: "string",
      required: true,
      description: "Recipient(s); string or array of strings",
    },
    cc: {
      type: "string",
      required: false,
      description: "CC recipient(s); string or array of strings",
    },
    bcc: {
      type: "string",
      required: false,
      description: "BCC recipient(s); string or array of strings",
    },
    replyTo: {
      type: "string",
      required: false,
      description: "Reply-To address (overrides config.replyTo)",
    },
    subject: { type: "string", required: true, description: "Email subject" },
    text: {
      type: "string",
      required: false,
      description: "Plain-text body (aliases: body, message)",
    },
    html: {
      type: "string",
      required: false,
      description: "HTML body (e.g. from render-template.js)",
    },
    priority: {
      type: "string",
      required: false,
      description: "Message priority: high, normal, or low",
    },
    headers: {
      type: "object",
      required: false,
      description: "Per-message custom headers",
    },
  },
  output: {
    sent: { type: "boolean", description: "Whether the message was sent" },
    messageId: { type: "string", description: "SMTP message id when available" },
    from: { type: "string" },
    to: { type: "string" },
    cc: { type: "string" },
    bcc: { type: "string" },
    subject: { type: "string" },
  },
  example: {
    data: {
      from: "notifications@example.com",
      to: ["recipient@example.com", "other@example.com"],
      cc: "manager@example.com",
      bcc: "audit@example.com",
      subject: "Hello from scrunner",
      text: "This is a plain-text test message.",
    },
    config: {
      service: "Gmail",
      user: "smtp-login@gmail.com",
      from: "notifications@example.com",
      passwordSecret: "gmail_app_password",
    },
  },
};

export default sendEmail;
