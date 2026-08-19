function passContext(ctx) {
  if (ctx?.context != null && typeof ctx.context === "object" && !Array.isArray(ctx.context)) {
    return { ...ctx.context };
  }
  return {};
}

function requiredString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} is required`);
  }
  return value;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatSmsTime(date = new Date()) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absHours = Math.abs(offsetMinutes) / 60;
  const tz = Number.isInteger(absHours) ? String(absHours) : String(absHours);
  return [
    pad2(date.getFullYear() % 100),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
    pad2(date.getHours()),
    pad2(date.getMinutes()),
    pad2(date.getSeconds()),
    `${sign}${tz}`,
  ].join(";");
}

function encodeUtf16BeHex(text) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    out += text.charCodeAt(i).toString(16).toUpperCase().padStart(4, "0");
  }
  return out;
}

function isGsm7(text) {
  const basic =
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
  const ext = new Set(["\f", "^", "{", "}", "\\", "[", "~", "]", "|", "€"]);
  for (const ch of text) {
    if (!basic.includes(ch) && !ext.has(ch)) return false;
  }
  return true;
}

function refererFromUrl(url) {
  return `${new URL(url).origin}/index.html`;
}

function parseResult(text) {
  const match = String(text).match(/\{[^{}]*"result"\s*:\s*"[^"]*"[^{}]*\}/);
  if (!match) return { raw: String(text) };
  try {
    return JSON.parse(match[0]);
  } catch {
    return { raw: String(text) };
  }
}

function leftoverFromError(err) {
  let current = err;
  for (let i = 0; i < 6 && current; i++) {
    if (typeof current.data === "string") return current.data;
    current = current.cause;
  }
  return null;
}

async function ztePost(url, fields) {
  const body = new URLSearchParams(fields).toString();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json, text/javascript, */*; q=0.01",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "x-requested-with": "XMLHttpRequest",
        Referer: refererFromUrl(url),
      },
      body,
    });
    return parseResult(await response.text());
  } catch (err) {
    const leftover = leftoverFromError(err);
    if (leftover != null) {
      const parsed = parseResult(leftover);
      log.info({ result: parsed.result ?? parsed }, "send-sms: recovered malformed response");
      return parsed;
    }
    throw err;
  }
}

async function sendZteSms(ctx) {
  const url = requiredString(ctx.config?.url, "config.url");
  const password = requiredString(ctx.config?.password, "config.password");
  const to = requiredString(ctx.data?.to ?? ctx.data?.number, "data.to");
  const message = requiredString(ctx.data?.message, "data.message");

  log.info({ url }, "send-sms: logging in");
  const login = await ztePost(url, {
    goformId: "LOGIN",
    password: btoa(password),
  });
  const loginResult = login.result;
  if (loginResult !== "0" && loginResult !== 0 && loginResult !== "3" && loginResult !== 3 && loginResult !== "success") {
    throw new Error(`ZTE login failed: ${JSON.stringify(login.result ?? login)}`);
  }

  const encodeType = isGsm7(message) ? "GSM7_default" : "UNICODE";
  const smsTime = formatSmsTime();
  log.info({ url, to, encodeType, messageLength: message.length }, "send-sms: sending");
  const sent = await ztePost(url, {
    goformId: "SEND_SMS",
    notCallback: "true",
    Number: to,
    sms_time: smsTime,
    MessageBody: encodeUtf16BeHex(message),
    ID: "-1",
    encode_type: encodeType,
  });
  if (sent.result !== "success" && sent.result !== "0" && sent.result !== 0) {
    throw new Error(`ZTE SEND_SMS failed: ${JSON.stringify(sent.result ?? sent)}`);
  }

  log.info({ to, result: sent.result }, "send-sms: sent");
  return {
    output: { sent: true, to, result: sent.result },
    context: passContext(ctx),
  };
}

sendZteSms.meta = {
  description: "Log in to a ZTE modem web UI and send an SMS",
  previewConfigKey: "url",
  tags: ["channel"],
  config: {
    url: {
      type: "string",
      required: true,
      default: "http://192.168.5.1/reqproc/proc_post",
      description: "Modem POST URL (LOGIN and SEND_SMS)",
    },
    password: {
      type: "string",
      required: true,
      description: "Web UI password (sent as base64)",
    },
  },
  input: {
    to: { type: "string", required: true, description: "Recipient phone number" },
    message: { type: "string", required: true, description: "SMS text" },
  },
  output: {
    sent: { type: "boolean" },
    to: { type: "string" },
    result: { type: "string" },
  },
  example: {
    data: {
      to: "082134336193",
      message: "Test nomor kirim aja dari XL prioritas",
    },
    config: {
      url: "http://192.168.5.1/reqproc/proc_post",
      password: "error403",
    },
  },
};

export default sendZteSms;
