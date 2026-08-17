import SftpClient from "ssh2-sftp-client";
import { Client } from "basic-ftp";
import { Readable, Writable } from "node:stream";

const PROTOCOLS = new Set(["ftp", "sftp"]);
const ACTIONS = new Set(["list", "read", "write", "delete", "stat", "mkdir", "rename"]);

function passContext(ctx) {
  if (ctx?.context != null && typeof ctx.context === "object" && !Array.isArray(ctx.context)) {
    return { ...ctx.context };
  }
  return {};
}

function mergeData(data) {
  if (data != null && typeof data === "object" && !Array.isArray(data)) {
    return { ...data };
  }
  return {};
}

function resolveProtocol(ctx) {
  const raw = ctx.config?.protocol ?? ctx.data?.protocol ?? "sftp";
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("remote-fs: protocol must be a non-empty string");
  }
  const protocol = raw.toLowerCase();
  if (!PROTOCOLS.has(protocol)) {
    throw new Error(`remote-fs: unsupported protocol "${raw}" (use ftp or sftp)`);
  }
  return protocol;
}

function resolveAction(ctx) {
  const raw = ctx.config?.action ?? ctx.data?.action ?? "list";
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("remote-fs: action must be a non-empty string");
  }
  const action = raw.toLowerCase();
  if (!ACTIONS.has(action)) {
    throw new Error(`remote-fs: unsupported action "${raw}"`);
  }
  return action;
}

function resolvePath(ctx, { required = false, label = "path" } = {}) {
  const path = ctx.config?.path ?? ctx.data?.path;
  if (path == null || path === "") {
    if (required) throw new Error(`remote-fs: ${label} is required`);
    return ".";
  }
  if (typeof path !== "string") {
    throw new Error(`remote-fs: ${label} must be a string`);
  }
  return path;
}

function resolveHost(ctx) {
  const host = ctx.config?.host ?? ctx.data?.host;
  if (typeof host !== "string" || host.length === 0) {
    throw new Error("remote-fs: host is required (ctx.config.host or ctx.data.host)");
  }
  return host;
}

function resolvePort(ctx, protocol) {
  const raw = ctx.config?.port ?? ctx.data?.port;
  if (raw == null || raw === "") {
    return protocol === "sftp" ? 22 : 21;
  }
  const port = Number(raw);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("remote-fs: port must be a positive number");
  }
  return port;
}

async function resolveSecretValue(secretName, label) {
  if (typeof secretName !== "string" || secretName.length === 0) {
    throw new Error(`remote-fs: ${label} is required`);
  }
  return $secrets.reveal(await $secrets.get(secretName));
}

async function resolveAuth(ctx) {
  const username =
    typeof ctx.config?.usernameSecret === "string" && ctx.config.usernameSecret.length > 0
      ? await resolveSecretValue(ctx.config.usernameSecret, "usernameSecret")
      : (ctx.config?.username ?? ctx.data?.username);
  if (typeof username !== "string" || username.length === 0) {
    throw new Error("remote-fs: username is required");
  }

  let password;
  if (typeof ctx.config?.passwordSecret === "string" && ctx.config.passwordSecret.length > 0) {
    password = await resolveSecretValue(ctx.config.passwordSecret, "passwordSecret");
  } else if (typeof ctx.config?.password === "string") {
    password = ctx.config.password;
  } else if (typeof ctx.data?.password === "string") {
    password = ctx.data.password;
  }

  let privateKey;
  if (typeof ctx.config?.privateKeySecret === "string" && ctx.config.privateKeySecret.length > 0) {
    privateKey = await resolveSecretValue(ctx.config.privateKeySecret, "privateKeySecret");
  } else if (typeof ctx.config?.privateKey === "string") {
    privateKey = ctx.config.privateKey;
  }

  let passphrase;
  if (typeof ctx.config?.passphraseSecret === "string" && ctx.config.passphraseSecret.length > 0) {
    passphrase = await resolveSecretValue(ctx.config.passphraseSecret, "passphraseSecret");
  } else if (typeof ctx.config?.passphrase === "string") {
    passphrase = ctx.config.passphrase;
  }

  if (!password && !privateKey) {
    throw new Error(
      "remote-fs: password or private key is required (passwordSecret/privateKeySecret or inline values)",
    );
  }

  return { username, password, privateKey, passphrase };
}

function toIsoDate(value) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function joinRemotePath(parentPath, name) {
  if (!parentPath || parentPath === ".") return name;
  if (parentPath.endsWith("/")) return `${parentPath}${name}`;
  return `${parentPath}/${name}`;
}

function normalizeSftpEntry(entry, parentPath) {
  const name = entry.name;
  const type = entry.type === "d" ? "directory" : "file";
  return {
    name,
    path: joinRemotePath(parentPath, name),
    type,
    size: type === "directory" ? null : typeof entry.size === "number" ? entry.size : null,
    modified: toIsoDate(entry.modifyTime),
  };
}

function normalizeFtpEntry(entry, parentPath) {
  const type = entry.type === 2 ? "directory" : "file";
  return {
    name: entry.name,
    path: joinRemotePath(parentPath, entry.name),
    type,
    size: type === "directory" ? null : typeof entry.size === "number" ? entry.size : null,
    modified: toIsoDate(entry.modifiedAt ?? entry.rawModifiedAt),
  };
}

function bufferFromWritable(writeFn) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = [];
    const writable = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        callback();
      },
    });
    writable.on("finish", () => resolve(Buffer.concat(chunks)));
    writable.on("error", reject);
    Promise.resolve(writeFn(writable)).catch(reject);
  });
}

function resolveWriteBody(ctx) {
  if (ctx.config != null && typeof ctx.config === "object" && "body" in ctx.config) {
    const body = ctx.config.body;
    if (Buffer.isBuffer(body) || body instanceof Uint8Array) return Buffer.from(body);
    if (typeof body === "string") return Buffer.from(body, "utf8");
    return Buffer.from(JSON.stringify(body), "utf8");
  }
  if (ctx.data?.file != null) {
    const file = ctx.data.file;
    if (Buffer.isBuffer(file) || file instanceof Uint8Array) return Buffer.from(file);
  }
  if (ctx.data?.body != null) {
    const body = ctx.data.body;
    if (Buffer.isBuffer(body) || body instanceof Uint8Array) return Buffer.from(body);
    if (typeof body === "string") return Buffer.from(body, "utf8");
    return Buffer.from(JSON.stringify(body), "utf8");
  }
  throw new Error("remote-fs: write requires ctx.config.body, ctx.data.body, or ctx.data.file");
}

async function withSftp(ctx, protocol, fn) {
  const auth = await resolveAuth(ctx);
  const client = new SftpClient();
  /** @type {Record<string, unknown>} */
  const connectOptions = {
    host: resolveHost(ctx),
    port: resolvePort(ctx, protocol),
    username: auth.username,
  };
  if (auth.privateKey) {
    connectOptions.privateKey = auth.privateKey;
    if (auth.passphrase) connectOptions.passphrase = auth.passphrase;
  } else {
    connectOptions.password = auth.password;
  }
  if (ctx.config?.readyTimeout != null) {
    connectOptions.readyTimeout = Number(ctx.config.readyTimeout);
  }

  await client.connect(connectOptions);
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function withFtp(ctx, protocol, fn) {
  const auth = await resolveAuth(ctx);
  const client = new Client(
    typeof ctx.config?.timeout === "number" ? ctx.config.timeout : 30000,
  );
  const secure = ctx.config?.secure === true || ctx.config?.secure === "implicit";
  await client.access({
    host: resolveHost(ctx),
    port: resolvePort(ctx, protocol),
    user: auth.username,
    password: auth.password ?? "",
    secure,
  });
  if (ctx.config?.passive === false) {
    client.ftp.passive = false;
  }
  try {
    return await fn(client);
  } finally {
    client.close();
  }
}

async function runAction(protocol, ctx, action) {
  const path = resolvePath(ctx, { required: action !== "list", label: "path" });

  if (protocol === "sftp") {
    return withSftp(ctx, protocol, async (client) => {
      switch (action) {
        case "list": {
          const listPath = resolvePath(ctx);
          const items = await client.list(listPath);
          const entries = items.map((item) => normalizeSftpEntry(item, listPath));
          return { path: listPath, entries, count: entries.length };
        }
        case "read": {
          const outputVar =
            typeof ctx.config?.outputVar === "string" && ctx.config.outputVar.length > 0
              ? ctx.config.outputVar
              : "file";
          const file = await client.get(path);
          const buffer = Buffer.isBuffer(file) ? file : Buffer.from(file);
          const encoding = ctx.config?.encoding ?? ctx.data?.encoding;
          /** @type {Record<string, unknown>} */
          const out = {
            path,
            [outputVar]: buffer,
            contentLength: buffer.length,
          };
          if (encoding === "utf8" || encoding === "text") out.text = buffer.toString("utf8");
          if (encoding === "base64") out.base64 = buffer.toString("base64");
          return out;
        }
        case "write": {
          const body = resolveWriteBody(ctx);
          await client.put(body, path);
          return { path, written: true, contentLength: body.length };
        }
        case "delete": {
          await client.delete(path);
          return { path, deleted: true };
        }
        case "stat": {
          const stat = await client.stat(path);
          return {
            path,
            type: stat.isDirectory ? "directory" : "file",
            size: typeof stat.size === "number" ? stat.size : null,
            modified: toIsoDate(stat.modifyTime),
            accessed: toIsoDate(stat.accessTime),
          };
        }
        case "mkdir": {
          const recursive = ctx.config?.recursive !== false;
          await client.mkdir(path, recursive);
          return { path, created: true, recursive };
        }
        case "rename": {
          const destination = ctx.config?.destination ?? ctx.data?.destination;
          if (typeof destination !== "string" || destination.length === 0) {
            throw new Error("remote-fs: rename requires destination");
          }
          await client.rename(path, destination);
          return { path, destination, renamed: true };
        }
        default:
          throw new Error(`remote-fs: unsupported action "${action}"`);
      }
    });
  }

  return withFtp(ctx, protocol, async (client) => {
    switch (action) {
      case "list": {
        const listPath = resolvePath(ctx);
        const items = await client.list(listPath === "." ? undefined : listPath);
        const entries = items.map((item) => normalizeFtpEntry(item, listPath));
        return { path: listPath, entries, count: entries.length };
      }
      case "read": {
        const outputVar =
          typeof ctx.config?.outputVar === "string" && ctx.config.outputVar.length > 0
            ? ctx.config.outputVar
            : "file";
        const buffer = await bufferFromWritable((writable) => client.downloadTo(writable, path));
        const encoding = ctx.config?.encoding ?? ctx.data?.encoding;
        /** @type {Record<string, unknown>} */
        const out = {
          path,
          [outputVar]: buffer,
          contentLength: buffer.length,
        };
        if (encoding === "utf8" || encoding === "text") out.text = buffer.toString("utf8");
        if (encoding === "base64") out.base64 = buffer.toString("base64");
        return out;
      }
      case "write": {
        const body = resolveWriteBody(ctx);
        const stream = Readable.from(body);
        await client.uploadFrom(stream, path);
        return { path, written: true, contentLength: body.length };
      }
      case "delete": {
        await client.remove(path);
        return { path, deleted: true };
      }
      case "stat": {
        const size = await client.size(path);
        const modified = await client.lastMod(path);
        return {
          path,
          type: "file",
          size: typeof size === "number" ? size : null,
          modified: toIsoDate(modified),
        };
      }
      case "mkdir": {
        await client.ensureDir(path);
        return { path, created: true, recursive: true };
      }
      case "rename": {
        const destination = ctx.config?.destination ?? ctx.data?.destination;
        if (typeof destination !== "string" || destination.length === 0) {
          throw new Error("remote-fs: rename requires destination");
        }
        await client.rename(path, destination);
        return { path, destination, renamed: true };
      }
      default:
        throw new Error(`remote-fs: unsupported action "${action}"`);
    }
  });
}

async function remoteFs(ctx) {
  const protocol = resolveProtocol(ctx);
  const action = resolveAction(ctx);
  const host = resolveHost(ctx);
  const port = resolvePort(ctx, protocol);

  log.info({ protocol, action, host, port }, "remote-fs: starting");

  const result = await runAction(protocol, ctx, action);
  const output = {
    protocol,
    action,
    host,
    ...result,
  };

  log.info(
    { protocol, action, path: output.path ?? null, count: output.count ?? null },
    "remote-fs: complete",
  );

  return {
    output: { ...mergeData(ctx.data), ...output },
    context: { ...passContext(ctx), ...output },
  };
}

remoteFs.meta = {
  description: "Access remote files over SFTP or FTP/FTPS",
  previewConfigKey: "protocol",
  tags: ["SFTP", "FTP", "storage"],
  config: {
    protocol: {
      type: "string",
      default: "sftp",
      enum: ["sftp", "ftp"],
      description: "Transfer protocol",
    },
    action: {
      type: "string",
      default: "list",
      enum: ["list", "read", "write", "delete", "stat", "mkdir", "rename"],
      description: "Operation to perform",
    },
    host: { type: "string", required: true, description: "Server hostname" },
    port: { type: "number", required: false, description: "Port (default 22 for SFTP, 21 for FTP)" },
    path: {
      type: "string",
      required: false,
      description: "Remote directory for list, or file path for other actions",
    },
    username: { type: "string", required: false, description: "Login username" },
    usernameSecret: { type: "string", required: false, description: "Named secret for username" },
    password: { type: "string", required: false, description: "Login password" },
    passwordSecret: { type: "string", required: false, description: "Named secret for password" },
    privateKeySecret: {
      type: "string",
      required: false,
      description: "Named secret holding an SFTP private key (PEM)",
    },
    privateKey: { type: "string", required: false, description: "Inline SFTP private key (PEM)" },
    passphraseSecret: {
      type: "string",
      required: false,
      description: "Named secret for encrypted private key passphrase",
    },
    passphrase: { type: "string", required: false, description: "Private key passphrase" },
    secure: {
      type: "boolean",
      default: false,
      description: "Use FTPS for FTP protocol",
    },
    passive: {
      type: "boolean",
      default: true,
      description: "Use passive FTP mode",
    },
    recursive: {
      type: "boolean",
      default: true,
      description: "Create parent directories for mkdir",
    },
    destination: {
      type: "string",
      required: false,
      description: "Destination path for rename",
    },
    body: { type: "any", required: false, description: "Write payload" },
    outputVar: {
      type: "string",
      default: "file",
      description: "Output key for read action bytes",
    },
    encoding: {
      type: "string",
      required: false,
      enum: ["utf8", "text", "base64"],
      description: "Optional read decoding helper",
    },
    timeout: { type: "number", required: false, description: "FTP client timeout in ms" },
    readyTimeout: { type: "number", required: false, description: "SFTP ready timeout in ms" },
  },
  input: {
    protocol: { type: "string", required: false },
    action: { type: "string", required: false },
    host: { type: "string", required: false },
    path: { type: "string", required: false },
    username: { type: "string", required: false },
    password: { type: "string", required: false },
    body: { type: "any", required: false },
    file: { type: "buffer", required: false },
    destination: { type: "string", required: false },
  },
  output: {
    protocol: { type: "string" },
    action: { type: "string" },
    host: { type: "string" },
    entries: { type: "array", required: false, description: "list results" },
    file: { type: "buffer", required: false, description: "read bytes (or outputVar)" },
    written: { type: "boolean", required: false },
    deleted: { type: "boolean", required: false },
    renamed: { type: "boolean", required: false },
    created: { type: "boolean", required: false },
  },
  context: {
    protocol: { type: "string" },
    action: { type: "string" },
    host: { type: "string" },
  },
  example: {
    data: {},
    config: {
      protocol: "sftp",
      action: "list",
      host: "sftp.example.com",
      path: "/incoming",
      username: "deploy",
      passwordSecret: "sftp_password",
    },
  },
};

export default remoteFs;
