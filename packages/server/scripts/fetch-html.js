import { parse } from "node-html-parser";
import jsonata from "jsonata";

function ensureDataObject(ctx) {
  if (ctx.data == null || typeof ctx.data !== "object" || Array.isArray(ctx.data)) {
    ctx.data = {};
  }
}

function serializeElement(el) {
  const attrs = el.attributes ?? {};
  const classNames = attrs.class ? attrs.class.split(/\s+/).filter(Boolean) : [];
  return {
    tagName: el.tagName?.toLowerCase() ?? null,
    id: attrs.id ?? null,
    classNames,
    attributes: { ...attrs },
    text: el.text?.trim() ?? "",
    innerHTML: el.innerHTML ?? "",
    outerHTML: el.outerHTML ?? "",
  };
}

function previewValue(value) {
  const json = JSON.stringify(value);
  if (json.length <= 500) {
    return value;
  }
  return { preview: `${json.slice(0, 500)}...`, truncated: true };
}

async function fetchHtml(ctx) {
  const url = ctx.config?.url;
  if (typeof url !== "string" || url.length === 0) {
    throw new Error("fetch-html: ctx.config.url is required");
  }

  const selector = ctx.config?.selector;
  const outputVar = ctx.config?.outputVar;
  const jsonataExpr = ctx.config?.jsonata;

  if ((selector || jsonataExpr) && (typeof outputVar !== "string" || outputVar.length === 0)) {
    throw new Error("fetch-html: ctx.config.outputVar is required when selector or jsonata is set");
  }

  ensureDataObject(ctx);

  log.info({ url }, "fetch-html: fetching page");
  const response = await $axios.get(url);
  log.info(
    { status: response.status, length: String(response.data ?? "").length },
    "fetch-html: fetch complete",
  );

  ctx.data.httpResponse = String(response.data ?? "");
  log.info(
    { length: ctx.data.httpResponse.length },
    "fetch-html: saved httpResponse",
  );

  if (selector) {
    log.info({ selector, outputVar }, "fetch-html: selecting elements");
    const root = parse(ctx.data.httpResponse);
    const elements = root.querySelectorAll(selector);
    ctx.data[outputVar] = elements.map(serializeElement);
    log.info(
      { outputVar, count: ctx.data[outputVar].length },
      "fetch-html: saved selector matches",
    );
  }

  if (jsonataExpr) {
    log.info({ outputVar, jsonata: jsonataExpr }, "fetch-html: evaluating jsonata");
    const expression = jsonata(jsonataExpr);
    const input = ctx.data[outputVar];
    const result = await expression.evaluate(input);
    ctx.data[outputVar] = result;
    log.info(
      { outputVar, result: previewValue(result) },
      "fetch-html: saved jsonata result",
    );
  }

  return ctx;
}

fetchHtml.meta = {
  description: "Fetch HTML and optionally select elements or transform with JSONata",
  previewConfigKey: "url",
  config: {
    url: { type: "string", required: true, description: "Page URL" },
    selector: { type: "string", required: false, description: "CSS selector" },
    outputVar: {
      type: "string",
      required: false,
      description: "Required when selector or jsonata is set",
    },
    jsonata: { type: "string", required: false, description: "JSONata applied to selector matches" },
  },
  input: {},
  output: {
    httpResponse: { type: "string", description: "Raw HTML" },
  },
  example: {
    data: {},
    config: {
      url: "https://example.com/",
      selector: "h1",
      outputVar: "headings",
    },
  },
};

export default fetchHtml;
