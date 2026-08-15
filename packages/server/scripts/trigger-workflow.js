import jsonata from "jsonata";

async function triggerWorkflow(ctx) {
  const name = ctx.config?.name;
  if (typeof name !== "string" || name.length === 0) {
    throw new Error("config.name is required");
  }

  let data = ctx.data;
  const expression = ctx.config?.expression;
  if (typeof expression === "string" && expression.length > 0) {
    const result = jsonata(expression).evaluate(ctx.data);
    data = await result;
  }

  const started = await $workflows.trigger(name, data);
  const triggered = { name, runId: started?.runId ?? null };

  const base =
    ctx != null && typeof ctx === "object" && !Array.isArray(ctx) ? { ...ctx } : {};

  if (base.data != null && typeof base.data === "object" && !Array.isArray(base.data)) {
    return { ...base, data: { ...base.data, triggered } };
  }
  return { ...base, triggered };
}

triggerWorkflow.meta = {
  description:
    "Fire-and-forget another workflow by YAML name (same owner). Destination must declare triggers: [{ type: workflow }]. Optionally reshape ctx.data with JSONata before sending.",
  previewConfigKey: "name",
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
        "Optional JSONata expression evaluated against ctx.data; result becomes the destination run input",
    },
  },
  input: {},
  output: {
    triggered: {
      type: "object",
      description: "Record of the kicked-off run ({ name, runId }); under data when data is an object",
    },
  },
  example: {
    data: {
      title: "Hello",
      url: "https://example.com/img.png",
    },
    config: {
      name: "notify-comic",
      expression:
        '{ "title": title, "message": title, "attach": url }',
    },
  },
};

export default triggerWorkflow;
