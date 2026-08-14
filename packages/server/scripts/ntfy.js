function ntfyHeaders(ctx) {
  const headers = {};

  if (ctx.data?.title) {
    log.info("ntfy: setting title %s", ctx.data.title);
    headers.Title = ctx.data.title;
  }

  return headers;
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

  const headers = ntfyHeaders(ctx);
  const ntfyUrl = ctx.config?.url || "https://ntfy.sh/scrunner";

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
    return { sent: "true" };
  }

  if (ctx.data?.attach) {
    log.info("ntfy: setting attach %s", ctx.data.attach);
    headers.Attach = ctx.data.attach;
  }

  const truncatedMessage = ctx.data?.message?.substring(0, 100);
  log.info("ntfy sending message to %s", ntfyUrl);
  log.info("ntfy messsage: %s", truncatedMessage);

  await $axios.post(ntfyUrl, ctx.data?.message || "Hello from scrunner", {
    headers,
  });
  return { sent: "true" };
}

ntfy.meta = {
  description: "Send a message or file to an ntfy topic",
  config: {
    url: {
      type: "string",
      default: "https://ntfy.sh/scrunner",
      description: "ntfy topic URL",
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
  output: {
    sent: { type: "string", description: "Replaces the workflow context with { sent: \"true\" }" },
  },
  example: {
    data: { title: "Hello", message: "Hello from scrunner" },
    config: { url: "https://ntfy.sh/scrunner" },
  },
};

export default ntfy;
