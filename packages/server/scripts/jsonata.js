import jsonata from "jsonata";

export default function jsonataFn(ctx) {
    log.info({ctx}, "jsonata: context")
    log.info("jsonata: evaluating expression %s", ctx.config.expression);
    const expression = jsonata(ctx.config.expression);
    const result = expression.evaluate(ctx.data);
    log.info({result}, "jsonata: expression result");
    return result;
}