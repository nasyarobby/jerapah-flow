function passContext(ctx) {
  if (ctx?.context != null && typeof ctx.context === "object" && !Array.isArray(ctx.context)) {
    return { ...ctx.context };
  }
  return {};
}

function getCurrentTime(ctx) {
  const output = {
    datetime: new Date().toISOString(),
    processId: "1234",
  };
  return { output, context: { ...passContext(ctx), ...output } };
}

getCurrentTime.meta = {
  description: "Return the current time as output.datetime",
  config: {},
  input: {},
  output: {
    datetime: { type: "string", description: "ISO timestamp" },
    processId: { type: "string" },
  },
  context: {
    datetime: { type: "string", description: "ISO timestamp" },
    processId: { type: "string" },
  },
  example: {
    data: {},
    config: {},
  },
};

export default getCurrentTime;
