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
  const base =
    ctx != null && typeof ctx === "object" && !Array.isArray(ctx) ? { ...ctx } : {};
  const data =
    base.data != null && typeof base.data === "object" && !Array.isArray(base.data)
      ? { ...base.data }
      : {};
  data[as] = value;
  return { ...base, data };
}

getSecret.meta = {
  description:
    "Load a named secret for this workflow owner into ctx.data. The value is wrapped and redacted in logs.",
  config: {
    name: {
      type: "string",
      required: true,
      description: "Secret name (per owner)",
    },
    as: {
      type: "string",
      required: false,
      description: "ctx.data field to write (defaults to name)",
    },
  },
  input: {},
  output: {
    data: {
      type: "object",
      description: "Previous ctx.data plus the retrieved Secret at [as]",
    },
  },
  example: {
    data: {},
    config: { name: "ntfy_token", as: "ntfyToken" },
  },
};

export default getSecret;
