import { createClient } from "webdav";

function passContext(ctx) {
  if (ctx?.context != null && typeof ctx.context === "object" && !Array.isArray(ctx.context)) {
    return { ...ctx.context };
  }
  return {};
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function resolveUrl(ctx) {
  const fromConfig = ctx.config?.url;
  if (typeof fromConfig === "string" && fromConfig.length > 0) {
    return fromConfig;
  }
  const fromData = ctx.data?.url;
  if (typeof fromData === "string" && fromData.length > 0) {
    return fromData;
  }
  return null;
}

function resolvePath(ctx) {
  const raw = ctx.config?.path ?? ctx.data?.path ?? "/";
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("list-webdav: path must be a non-empty string");
  }
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function normalizeHeaders(value, label) {
  if (value == null) return {};
  if (!isPlainObject(value)) {
    throw new Error(`list-webdav: ${label} must be an object`);
  }

  /** @type {Record<string, string>} */
  const headers = {};
  for (const [key, val] of Object.entries(value)) {
    if (val == null) continue;
    if (typeof val === "string") {
      headers[key] = val;
      continue;
    }
    if (typeof val === "number" || typeof val === "boolean") {
      headers[key] = String(val);
      continue;
    }
    throw new Error(`list-webdav: header "${key}" must be a string`);
  }
  return headers;
}

function toIsoDate(value) {
  if (value == null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}

/**
 * @param {Record<string, unknown>} item
 */
function normalizeEntry(item) {
  const type = item.type === "directory" ? "directory" : "file";
  return {
    name: typeof item.basename === "string" ? item.basename : null,
    path: typeof item.filename === "string" ? item.filename : null,
    type,
    size: type === "directory" ? null : typeof item.size === "number" ? item.size : null,
    modified: toIsoDate(item.lastmod),
    contentType: typeof item.mime === "string" ? item.mime : null,
    etag: item.etag == null ? null : String(item.etag),
  };
}

async function resolvePassword(ctx) {
  if (typeof ctx.config?.passwordSecret === "string" && ctx.config.passwordSecret.length > 0) {
    return $secrets.reveal(await $secrets.get(ctx.config.passwordSecret));
  }
  if (typeof ctx.config?.password === "string") {
    return ctx.config.password;
  }
  if (typeof ctx.data?.password === "string") {
    return ctx.data.password;
  }
  return undefined;
}

async function listWebdav(ctx) {
  const url = resolveUrl(ctx);
  if (!url) {
    throw new Error("list-webdav: url is required (ctx.config.url or ctx.data.url)");
  }

  const remotePath = resolvePath(ctx);
  const includeDirectories = ctx.config?.includeDirectories !== false;
  const recursive = ctx.config?.recursive === true;
  const glob = typeof ctx.config?.glob === "string" && ctx.config.glob.length > 0
    ? ctx.config.glob
    : undefined;

  const username =
    typeof ctx.config?.username === "string" && ctx.config.username.length > 0
      ? ctx.config.username
      : typeof ctx.data?.username === "string" && ctx.data.username.length > 0
        ? ctx.data.username
        : undefined;
  const password = await resolvePassword(ctx);
  const headers = {
    ...normalizeHeaders(ctx.config?.headers, "config.headers"),
    ...normalizeHeaders(ctx.data?.headers, "data.headers"),
  };

  /** @type {Record<string, unknown>} */
  const clientOptions = {};
  if (username) clientOptions.username = username;
  if (password) clientOptions.password = password;
  if (Object.keys(headers).length > 0) clientOptions.headers = headers;

  /** @type {Record<string, unknown>} */
  const listOptions = { deep: recursive };
  if (glob) listOptions.glob = glob;

  log.info(
    { url, path: remotePath, recursive, includeDirectories, glob: glob ?? null },
    "list-webdav: listing directory",
  );

  const client = createClient(url, clientOptions);
  const rawItems = await client.getDirectoryContents(remotePath, listOptions);
  const items = Array.isArray(rawItems) ? rawItems : rawItems.data;

  let entries = items.map((item) => normalizeEntry(/** @type {Record<string, unknown>} */ (item)));
  if (!includeDirectories) {
    entries = entries.filter((entry) => entry.type !== "directory");
  }

  const output = { entries, count: entries.length };
  log.info({ count: output.count, path: remotePath }, "list-webdav: listing complete");

  return { output, context: { ...passContext(ctx), ...output } };
}

listWebdav.meta = {
  description: "List files on a WebDAV server with names and file stats",
  previewConfigKey: "url",
  tags: ["WebDAV"],
  config: {
    url: {
      type: "string",
      required: true,
      description: "WebDAV base URL (or pass data.url)",
    },
    path: {
      type: "string",
      default: "/",
      description: "Remote directory path to list",
    },
    includeDirectories: {
      type: "boolean",
      default: true,
      description: "Include directory entries in the result",
    },
    recursive: {
      type: "boolean",
      default: false,
      description: "List subdirectories recursively (maps to webdav deep option)",
    },
    glob: {
      type: "string",
      required: false,
      description: "Optional glob filter (e.g. /**/*.pdf); implies deep listing on the client",
    },
    username: {
      type: "string",
      required: false,
      description: "Basic auth username",
    },
    passwordSecret: {
      type: "string",
      required: false,
      description: "Named secret holding the WebDAV password",
    },
    password: {
      type: "string",
      required: false,
      description: "Plain password (prefer passwordSecret in production)",
    },
    headers: {
      type: "object",
      required: false,
      description: "Extra request headers",
    },
  },
  input: {
    url: { type: "string", required: false, description: "Fallback WebDAV URL" },
    path: { type: "string", required: false, description: "Fallback directory path" },
    username: { type: "string", required: false },
    password: { type: "string", required: false },
    headers: { type: "object", required: false },
  },
  output: {
    entries: {
      type: "array",
      description: "Listed files and optionally directories with stats",
    },
    count: { type: "number", description: "Number of entries returned" },
  },
  context: {
    entries: { type: "array", description: "Same as output.entries" },
    count: { type: "number", description: "Same as output.count" },
  },
  example: {
    data: {},
    config: {
      url: "https://cloud.example.com/remote.php/dav/files/me/",
      path: "/Documents",
      includeDirectories: true,
      recursive: false,
      username: "me",
      passwordSecret: "cloud_password",
    },
  },
};

export default listWebdav;
