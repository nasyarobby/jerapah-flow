import rssParser from "rss-parser";
import jsonata from "jsonata";

function ensureDataObject(ctx) {
  if (ctx.data == null || typeof ctx.data !== "object" || Array.isArray(ctx.data)) {
    ctx.data = {};
  }
}

function previewValue(value) {
  const json = JSON.stringify(value);
  if (json.length <= 500) {
    return value;
  }
  return { preview: `${json.slice(0, 500)}...`, truncated: true };
}

async function fetchRssFeed(ctx) {
  const url = ctx.config?.url ?? ctx.data?.url;
  if (typeof url !== "string" || url.length === 0) {
    throw new Error("fetch-rss-feed: url is required (ctx.config.url or ctx.data.url)");
  }

  const outputVar = ctx.config?.outputVar;
  const jsonataExpr = ctx.config?.jsonata;

  if (jsonataExpr && (typeof outputVar !== "string" || outputVar.length === 0)) {
    throw new Error("fetch-rss-feed: ctx.config.outputVar is required when jsonata is set");
  }

  ensureDataObject(ctx);

  log.info({ url }, "fetch-rss-feed: fetching feed");
  const parser = new rssParser({
    customFields: {
      item: [
        ["media:content", "mediaContent"],
        ["content:encoded", "contentEncoded"],
      ],
    },
  });
  const feed = await parser.parseURL(url);
  const itemCount = Array.isArray(feed.items) ? feed.items.length : 0;
  log.info(
    { title: feed.title, itemCount },
    "fetch-rss-feed: fetch complete",
  );

  ctx.data.rssFeed = feed;
  log.info(
    { title: feed.title, itemCount },
    "fetch-rss-feed: saved rssFeed",
  );

  if (jsonataExpr) {
    log.info({ outputVar, jsonata: jsonataExpr }, "fetch-rss-feed: evaluating jsonata");
    const expression = jsonata(jsonataExpr);
    const result = await expression.evaluate(feed);
    ctx.data[outputVar] = result;
    log.info(
      { outputVar, result: previewValue(result) },
      "fetch-rss-feed: saved jsonata result",
    );
  }

  return ctx;
}

fetchRssFeed.meta = {
  description: "Fetch an RSS/Atom feed and optionally transform it with JSONata",
  config: {
    url: { type: "string", required: false, description: "Feed URL (or pass data.url)" },
    outputVar: {
      type: "string",
      required: false,
      description: "Required when jsonata is set; destination on ctx.data",
    },
    jsonata: {
      type: "string",
      required: false,
      description: "JSONata applied to the parsed feed object",
    },
  },
  input: {
    url: { type: "string", required: false, description: "Feed URL when config.url is omitted" },
  },
  output: {
    rssFeed: { type: "object", description: "Parsed RSS/Atom feed from rss-parser" },
  },
  example: {
    data: {},
    config: {
      url: "https://selfh.st/rss/",
      outputVar: "item",
      jsonata: "items[0]",
    },
  },
};

export default fetchRssFeed;
