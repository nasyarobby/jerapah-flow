import jsonata from "jsonata";

function jsonataFn(ctx) {
    log.info({ctx}, "jsonata: context")
    log.info("jsonata: evaluating expression %s", ctx.config.expression);
    const expression = jsonata(ctx.config.expression);
    const result = expression.evaluate(ctx.data);
    log.info({result}, "jsonata: expression result");
    return result;
}

jsonataFn.meta = {
  description: "Evaluate a JSONata expression against ctx.data and return the result as the next context",
  config: {
    expression: { type: "string", required: true, description: "JSONata expression" },
  },
  input: {},
  output: {},
  example: {
    data: { title: "Hello", url: "https://example.com" },
    config: {
      expression: '{"data": {"title": title, "message": title, "attach": url}}',
    },
  },
};

export default jsonataFn;
