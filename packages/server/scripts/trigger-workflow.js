import jsonata from "jsonata";

function passContext(ctx) {
  if (ctx?.context != null && typeof ctx.context === "object" && !Array.isArray(ctx.context)) {
    return { ...ctx.context };
  }
  return {};
}

async function triggerWorkflow(ctx) {
  const name = ctx.config?.name;
  if (typeof name !== "string" || name.length === 0) {
    throw new Error("config.name is required");
  }

  let data = ctx.data;
  const expression = ctx.config?.expression;
  if (typeof expression === "string" && expression.length > 0) {
    const result = jsonata(expression).evaluate(ctx);
    data = await result;
  }

  const started = await $workflows.trigger(name, data);
  return {
    output: { name, runId: started?.runId ?? null },
    context: passContext(ctx),
  };
}

triggerWorkflow.meta = {
  description:
    "Fire-and-forget another workflow by YAML name (same owner). Destination must declare triggers: [{ type: workflow }]. Optionally reshape the destination input with JSONata against full ctx.",
  previewConfigKey: "name",
  tags: ["trigger"],
  reads: "ctx",
  config: {
    name: {
      type: "string",
      required: true,
      description: "Destination workflow YAML name (same owner)",
    },
    expression: {
      type: "string",
      required: false,
      description:
        "Optional JSONata expression evaluated against ctx; result becomes the destination run input",
    },
  },
  input: {},
  output: {
    name: { type: "string", description: "Destination workflow name" },
    runId: { type: "string", description: "Started run id (null if the destination failed to start)" },
  },
  example: {
    data: {
      title: "Hello",
      url: "https://example.com/img.png",
    },
    config: {
      name: "notify-comic",
      expression:
        '{ "title": data.title, "message": data.title, "attach": data.url }',
    },
  },
};

export default triggerWorkflow;
