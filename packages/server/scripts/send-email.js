import nodemailer from "nodemailer";

/**
 * @param {import("nodemailer").TransportOptions} transportOptions
 */
function createTransport(transportOptions) {
  return nodemailer.createTransport(transportOptions);
}

async function sendEmail(ctx) {
  const config = ctx.config ?? {};
  const host = config.host;
  if (typeof host !== "string" || host.length === 0) {
    throw new Error("config.host is required");
  }

  const user = config.user;
  if (typeof user !== "string" || user.length === 0) {
    throw new Error("config.user is required");
  }

  const passwordSecret = config.passwordSecret;
  if (typeof passwordSecret !== "string" || passwordSecret.length === 0) {
    throw new Error("config.passwordSecret is required");
  }

  const to = ctx.data?.to;
  if (typeof to !== "string" || to.length === 0) {
    throw new Error("data.to is required");
  }

  const subject = ctx.data?.subject;
  if (typeof subject !== "string" || subject.length === 0) {
    throw new Error("data.subject is required");
  }

  const text = ctx.data?.text ?? ctx.data?.body ?? ctx.data?.message;
  if (typeof text !== "string" || text.length === 0) {
    throw new Error("data.text is required (plain-text body)");
  }

  const password = $secrets.reveal(await $secrets.get(passwordSecret));
  const from =
    typeof config.from === "string" && config.from.length > 0 ? config.from : user;
  const port = Number(config.port ?? 587);
  const secure = config.secure === true;

  log.info(
    { host, port, secure, from, to, subjectLength: subject.length, textLength: text.length },
    "send-email: sending plain-text message",
  );

  const transporter = createTransport({
    host,
    port,
    secure,
    auth: { user, pass: password },
  });

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text,
  });

  log.info({ messageId: info.messageId }, "send-email: message sent");

  return {
    sent: true,
    messageId: info.messageId ?? null,
    to,
    subject,
  };
}

sendEmail.meta = {
  description: "Send a plain-text email via SMTP (nodemailer)",
  config: {
    host: {
      type: "string",
      required: true,
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
    user: {
      type: "string",
      required: true,
      description: "SMTP auth username (usually the sender email)",
    },
    from: {
      type: "string",
      required: false,
      description: "From address (defaults to user)",
    },
    passwordSecret: {
      type: "string",
      required: true,
      description: "Named secret holding the SMTP password or app password",
    },
  },
  input: {
    to: { type: "string", required: true, description: "Recipient email address" },
    subject: { type: "string", required: true, description: "Email subject" },
    text: {
      type: "string",
      required: true,
      description: "Plain-text body (aliases: body, message)",
    },
  },
  output: {
    sent: { type: "boolean", description: "Whether the message was sent" },
    messageId: { type: "string", description: "SMTP message id when available" },
    to: { type: "string" },
    subject: { type: "string" },
  },
  example: {
    data: {
      to: "recipient@example.com",
      subject: "Hello from scrunner",
      text: "This is a plain-text test message.",
    },
    config: {
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      user: "you@gmail.com",
      passwordSecret: "gmail_app_password",
    },
  },
};

export default sendEmail;
