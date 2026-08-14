function ensureDataObject(ctx) {
  if (ctx.data == null || typeof ctx.data !== "object" || Array.isArray(ctx.data)) {
    ctx.data = {};
  }
}

function filenameFromUrl(url) {
  try {
    const name = new URL(url).pathname.split("/").filter(Boolean).pop();
    return name || "attachment";
  } catch {
    return "attachment";
  }
}

function resolveUrl(ctx) {
  const fromConfig = ctx.config?.url;
  if (typeof fromConfig === "string" && fromConfig.length > 0) {
    return fromConfig;
  }

  const urlVar = ctx.config?.urlVar;
  if (typeof urlVar === "string" && urlVar.length > 0) {
    const value = ctx.data?.[urlVar];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  for (const key of ["attach", "url"]) {
    const value = ctx.data?.[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return null;
}

export default async function fetchBinary(ctx) {
  ensureDataObject(ctx);

  const url = resolveUrl(ctx);
  if (!url) {
    throw new Error(
      "fetch-binary: url is required (ctx.config.url, ctx.config.urlVar, ctx.data.attach, or ctx.data.url)",
    );
  }

  const outputVar = typeof ctx.config?.outputVar === "string" && ctx.config.outputVar.length > 0
    ? ctx.config.outputVar
    : "file";

  log.info({ url, outputVar }, "fetch-binary: fetching");
  const response = await $axios.get(url, { responseType: "arraybuffer" });
  const file = Buffer.from(response.data ?? []);
  const contentType = String(response.headers?.["content-type"] ?? "application/octet-stream");
  const filename = ctx.config?.filename || ctx.data.filename || filenameFromUrl(url);

  ctx.data[outputVar] = file;
  ctx.data.filename = filename;
  ctx.data.contentType = contentType;

  log.info(
    { outputVar, filename, contentType, length: file.length },
    "fetch-binary: saved",
  );

  return ctx;
}
