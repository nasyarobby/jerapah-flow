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

async function getSecret(ctx) {
  const name = ctx.config?.name;
  if (typeof name !== "string" || name.length === 0) {
    throw new Error("config.name is required");
  }
  const as =
    typeof ctx.config?.as === "string" && ctx.config.as.length > 0
      ? ctx.config.as
      : name;

  const value = await $secrets.get(name);
  const extra = { [as]: value };
  return {
    output: { ...mergeData(ctx.data), ...extra },
    context: { ...passContext(ctx), ...extra },
  };
}

getSecret.meta = {
  description:
    "Load a named secret for this workflow owner onto output and context. The value is wrapped and redacted in logs.",
  previewConfigKey: "name",
  config: {
    name: {
      type: "string",
      required: true,
      description: "Secret name (per owner)",
    },
    as: {
      type: "string",
      required: false,
      description: "Field name on output and context (defaults to name)",
    },
  },
  input: {},
  output: {},
  context: {},
  example: {
    data: {},
    config: { name: "ntfy_token", as: "ntfyToken" },
  },
};

export default getSecret;
