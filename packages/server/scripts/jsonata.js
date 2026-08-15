import jsonata from "jsonata";

async function jsonataFn(ctx) {
  log.info({ ctx }, "jsonata: context");
  log.info("jsonata: evaluating expression %s", ctx.config.expression);
  const expression = jsonata(ctx.config.expression);
  const result = await expression.evaluate(ctx);
  log.info({ result }, "jsonata: expression result");
  return {
    output: result,
    context:
      ctx.context != null && typeof ctx.context === "object" && !Array.isArray(ctx.context)
        ? ctx.context
        : {},
  };
}

jsonataFn.meta = {
  description:
    "Evaluate a JSONata expression against the full ctx (data, context, config); the result is the next data",
  previewConfigKey: "expression",
  reads: "ctx",
  config: {
    expression: { type: "string", required: true, description: "JSONata expression against ctx" },
  },
  input: {},
  output: {},
  example: {
    data: { title: "Hello", url: "https://example.com" },
    config: {
      expression: '{"title": data.title, "message": data.title, "attach": data.url}',
    },
  },
};

export default jsonataFn;
