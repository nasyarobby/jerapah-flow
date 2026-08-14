import jsonata from "jsonata";

export default function jsonataFn(context) {
    const expression = jsonata(context.config.expression);
    return expression.evaluate(context.data)
}