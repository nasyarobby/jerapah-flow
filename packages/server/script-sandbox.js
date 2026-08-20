import fs from "fs";
import path from "path";
import vm from "node:vm";
import { createRequire } from "node:module";
import axios from "axios";
import pino from "pino";
import { createKvApi } from "./kv-store.js";
import { createFingerprintApi } from "./script-fingerprint.js";
import { resolveScriptRef, createPluginRequire } from "./plugin-store.js";
import { isSecret, Secret, unwrapSecretsDeep } from "./secret-value.js";
import { getHttpPageByName, getHttpTemplateByName } from "./http-pages-store.js";
import { getSecretPlaintext } from "./secrets-store.js";
import { getVariablePlain } from "./variables-store.js";

const hostRequire = createRequire(import.meta.url);

const ALLOWED_MODULES = new Set([
  "@aws-sdk/client-s3",
  "@aws-sdk/s3-request-presigner",
  "axios",
  "basic-ftp",
  "jsonata",
  "mustache",
  "node-html-parser",
  "node:stream",
  "nodemailer",
  "rss-parser",
  "ssh2-sftp-client",
  "webdav",
]);

const BUILTIN_NAMES = [
  "Infinity",
  "NaN",
  "undefined",
  "Object",
  "Array",
  "String",
  "Boolean",
  "Number",
  "Symbol",
  "BigInt",
  "Error",
  "AggregateError",
  "EvalError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError",
  "Math",
  "Date",
  "JSON",
  "RegExp",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "WeakRef",
  "FinalizationRegistry",
  "ArrayBuffer",
  "DataView",
  "Int8Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "Int16Array",
  "Uint16Array",
  "Int32Array",
  "Uint32Array",
  "Float16Array",
  "Float32Array",
  "Float64Array",
  "BigInt64Array",
  "BigUint64Array",
  "Promise",
  "Proxy",
  "Reflect",
  "Intl",
  "URL",
  "URLSearchParams",
  "Headers",
  "Request",
  "Response",
  "FormData",
  "Blob",
  "File",
  "AbortController",
  "AbortSignal",
  "TextEncoder",
  "TextDecoder",
  "Atomics",
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
  "encodeURI",
  "encodeURIComponent",
  "decodeURI",
  "decodeURIComponent",
  "setTimeout",
  "setInterval",
  "clearTimeout",
  "clearInterval",
  "setImmediate",
  "clearImmediate",
  "queueMicrotask",
  "structuredClone",
  "fetch",
  "atob",
  "btoa",
  "Buffer",
  "crypto",
  "performance",
];

/**
 * @type {Map<string, { compiled: import("node:vm").Script, mtimeMs: number }>}
 */
const scriptCache = new Map();

export function clearScriptCache() {
  scriptCache.clear();
}

function pickBuiltins() {
  /** @type {Record<string, unknown>} */
  const builtins = {};
  for (const name of BUILTIN_NAMES) {
    if (typeof globalThis[name] !== "undefined") {
      builtins[name] = globalThis[name];
    }
  }
  return builtins;
}

function transformEsmToCjs(source) {
  let code = source;

  code = code.replace(
    /^\s*import\s+(\w+)\s+from\s+["']([^"']+)["'];?\s*$/gm,
    'const $1 = require("$2");',
  );
  code = code.replace(
    /^\s*import\s+\*\s+as\s+(\w+)\s+from\s+["']([^"']+)["'];?\s*$/gm,
    'const $1 = require("$2");',
  );
  code = code.replace(
    /^\s*import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];?\s*$/gm,
    "const {$1} = require(\"$2\");",
  );
  code = code.replace(
    /^\s*import\s+["']([^"']+)["'];?\s*$/gm,
    'require("$1");',
  );

  const replaced = code.replace(
    /^\s*export\s+default\s+/m,
    "module.exports.default = ",
  );
  if (replaced === code) {
    throw new Error("script must have a default export");
  }
  return replaced;
}

function wrapScriptSource(source, filename) {
  const body = transformEsmToCjs(source);
  return `"use strict";
var module = { exports: {} };
var exports = module.exports;
${body}
if (typeof module.exports.default !== "function") {
  throw new TypeError(${JSON.stringify(filename)} + " default export must be a function");
}
module.exports.default;
`;
}

/**
 * @param {import("pino").Logger} logger
 */
function createConsole(logger) {
  const write = (level) => (...args) => {
    if (args.length === 0) {
      logger[level]("");
      return;
    }
    const [first, ...rest] = args;
    if (typeof first === "string") {
      if (rest.length === 0) {
        logger[level](first);
      } else {
        logger[level]({ args: rest }, first);
      }
      return;
    }
    logger[level]({ args });
  };

  return {
    log: write("info"),
    info: write("info"),
    warn: write("warn"),
    error: write("error"),
    debug: write("debug"),
    trace: write("trace"),
  };
}

function isBlockedHostname(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, "");

  if (host === "metadata.google.internal" || host === "metadata.goog") {
    return true;
  }

  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4Match) {
    return false;
  }

  const octets = ipv4Match.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) {
    return true;
  }

  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function resolveRequestUrl(config) {
  const target = config.url;
  if (typeof target !== "string" || target.length === 0) {
    throw new Error("axios request URL is required");
  }

  if (/^https?:\/\//i.test(target)) {
    return new URL(target);
  }

  const base = config.baseURL;
  if (typeof base !== "string" || base.length === 0) {
    throw new Error(`axios request URL must be absolute: ${target}`);
  }

  return new URL(target, base);
}

function screenRequestUrl(url, log) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Request blocked: unsupported protocol ${url.protocol}`);
  }

  if (isBlockedHostname(url.hostname)) {
    const message = `Request blocked: ${url.href}`;
    log.warn({ url: url.href, hostname: url.hostname }, message);
    throw new Error(message);
  }
}

/**
 * @param {import("pino").Logger} log
 */
function createScreenedAxios(log) {
  const instance = axios.create();
  instance.interceptors.request.use((config) => {
    const url = resolveRequestUrl(config);
    screenRequestUrl(url, log);
    return config;
  });

  for (const method of [
    "request",
    "get",
    "delete",
    "head",
    "options",
    "post",
    "put",
    "patch",
  ]) {
    const orig = instance[method].bind(instance);
    instance[method] = (...args) => orig(...unwrapSecretsDeep(args));
  }

  return new Proxy(instance, {
    apply(_target, _thisArg, args) {
      return instance.request(...args);
    },
  });
}

const BLOCKED_PLUGIN_MODULES = new Set([
  "child_process",
  "node:child_process",
  "cluster",
  "node:cluster",
  "fs",
  "node:fs",
  "fs/promises",
  "node:fs/promises",
  "module",
  "node:module",
  "vm",
  "node:vm",
  "worker_threads",
  "node:worker_threads",
  "v8",
  "node:v8",
  "inspector",
  "node:inspector",
  "sqlite",
  "node:sqlite",
]);

/**
 * @param {import("axios").AxiosInstance} screenedAxios
 * @param {string | null} [pluginDirectory]
 */
function createRestrictedRequire(screenedAxios, pluginDirectory = null) {
  const pluginRequire = pluginDirectory
    ? createPluginRequire(pluginDirectory)
    : null;

  return function restrictedRequire(id) {
    if (typeof id !== "string") {
      throw new Error(`require(${JSON.stringify(id)}) is not allowed`);
    }
    if (BLOCKED_PLUGIN_MODULES.has(id)) {
      throw new Error(`require(${JSON.stringify(id)}) is not allowed`);
    }
    if (ALLOWED_MODULES.has(id)) {
      if (id === "axios") return screenedAxios;
      return hostRequire(id);
    }
    if (pluginRequire) {
      try {
        return pluginRequire(id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `require(${JSON.stringify(id)}) failed in plugin: ${msg}`,
        );
      }
    }
    throw new Error(`require(${JSON.stringify(id)}) is not allowed`);
  };
}

/**
 * @param {string} owner
 */
function createVarsApi(owner) {
  return {
    /**
     * @param {string} name
     */
    async get(name) {
      const value = await getVariablePlain(owner, name);
      if (value == null) {
        throw new Error(`variable "${name}" not found`);
      }
      return value;
    },
  };
}

/**
 * @param {string} owner
 */
function createSecretsApi(owner) {
  return {
    /**
     * @param {string} name
     */
    async get(name) {
      const value = await getSecretPlaintext(owner, name);
      if (value == null) {
        throw new Error(`secret "${name}" not found`);
      }
      return new Secret(value);
    },
    /**
     * @param {unknown} value
     */
    reveal(value) {
      if (isSecret(value)) return value.reveal();
      throw new Error("reveal() expects a Secret from $secrets.get()");
    },
  };
}

/**
 * Load HTML template pages from the Responses store.
 */
function createResponsesApi() {
  return {
    /**
     * @param {string} name
     */
    async getTemplate(name) {
      if (typeof name !== "string" || name.length === 0) {
        throw new Error("template name is required");
      }
      const page = await getHttpTemplateByName(name);
      if (!page) {
        const any = await getHttpPageByName(name);
        if (any && any.kind !== "template") {
          throw new Error(
            `"${name}" is an HTTP response page, not an HTML template`,
          );
        }
        throw new Error(`html template "${name}" not found`);
      }
      return page.content;
    },
  };
}

const $workflowsStub = {
  async trigger() {
    throw new Error("workflow runner is not available");
  },
};

/**
 * @param {{
 *   log: import("pino").Logger,
 *   script: string,
 *   workflowName: string,
 *   owner?: string,
 *   $workflows?: { trigger: (name: string, data?: unknown) => Promise<unknown> },
 *   pluginDir?: string | null,
 * }} opts
 */
function createScriptSandbox({
  log,
  script,
  workflowName,
  owner = "default",
  $workflows = $workflowsStub,
  pluginDir = null,
}) {
  const scriptLog = log.child({ workflow: workflowName, script });
  const $axios = createScreenedAxios(scriptLog);
  const $kv = createKvApi(workflowName);
  const $fingerprint = createFingerprintApi($kv);
  const $secrets = createSecretsApi(owner);
  const $vars = createVarsApi(owner);
  const $responses = createResponsesApi();
  const sandbox = {
    ...pickBuiltins(),
    log: scriptLog,
    console: createConsole(scriptLog),
    $axios,
    $kv,
    $fingerprint,
    $secrets,
    $vars,
    $responses,
    $workflows,
    require: createRestrictedRequire($axios, pluginDir),
  };

  vm.createContext(sandbox, {
    name: `jerapah-flow:${workflowName}:${script}`,
    codeGeneration: { strings: false, wasm: false },
  });

  return sandbox;
}

function compileScriptSource(source, filename) {
  return new vm.Script(wrapScriptSource(source, filename), { filename });
}

const inspectLog = pino({ level: "silent" });

/**
 * @param {unknown} fn
 * @returns {{ meta: Record<string, unknown> | null, metaError: string | null }}
 */
export function extractScriptMeta(fn) {
  if (typeof fn !== "function") {
    return { meta: null, metaError: "default export must be a function" };
  }
  if (!("meta" in fn) || fn.meta == null) {
    return { meta: null, metaError: null };
  }
  try {
    const serialized = JSON.parse(JSON.stringify(fn.meta));
    if (serialized == null || typeof serialized !== "object" || Array.isArray(serialized)) {
      return { meta: null, metaError: "script.meta must be a plain object" };
    }
    return { meta: serialized, metaError: null };
  } catch (err) {
    return {
      meta: null,
      metaError: err instanceof Error ? err.message : "script.meta could not be serialized",
    };
  }
}

/**
 * @param {import("node:vm").Script} compiled
 * @param {{
 *   log: import("pino").Logger,
 *   script: string,
 *   workflowName: string,
 *   owner?: string,
 *   $workflows?: { trigger: (name: string, data?: unknown) => Promise<unknown> },
 * }} opts
 */
/**
 * @param {import("vm").Script} compiled
 * @param {{
 *   log: import("pino").Logger,
 *   script: string,
 *   workflowName: string,
 *   owner?: string,
 *   $workflows?: { trigger: (name: string, data?: unknown) => Promise<unknown> },
 *   pluginDir?: string | null,
 * }} opts
 */
function instantiateCompiled(
  compiled,
  { log, script, workflowName, owner, $workflows, pluginDir = null },
) {
  const sandbox = createScriptSandbox({
    log,
    script,
    workflowName,
    owner,
    $workflows,
    pluginDir,
  });
  return compiled.runInContext(sandbox);
}

/**
 * Compile source and return the default-export function plus extracted meta.
 * Does not call the script.
 *
 * @param {string} script
 * @param {string} source
 * @param {{
 *   log?: import("pino").Logger,
 *   workflowName?: string,
 *   owner?: string,
 *   $workflows?: { trigger: (name: string, data?: unknown) => Promise<unknown> },
 *   pluginDir?: string | null,
 * }} [opts]
 */
export function instantiateScriptSource(script, source, opts = {}) {
  const compiled = compileScriptSource(source, script);
  const fn = instantiateCompiled(compiled, {
    log: opts.log ?? inspectLog,
    script,
    workflowName: opts.workflowName ?? "inspect",
    owner: opts.owner ?? "default",
    $workflows: opts.$workflows,
    pluginDir: opts.pluginDir ?? null,
  });
  return { fn, ...extractScriptMeta(fn) };
}

/**
 * Evaluate module-level code and read `defaultExport.meta` without calling the script.
 *
 * @param {string} script
 * @param {string} source
 */
export function inspectScriptSource(script, source) {
  try {
    const { meta, metaError } = instantiateScriptSource(script, source);
    return { meta, metaError };
  } catch (err) {
    return {
      meta: null,
      metaError: err instanceof Error ? err.message : String(err),
    };
  }
}

function loadCompiledScript(script) {
  const resolved = resolveScriptRef(script);
  if (resolved.error || !resolved.filePath) {
    throw new Error(resolved.error || `script not found: ${script}`);
  }
  const filePath = resolved.filePath;
  const { mtimeMs } = fs.statSync(filePath);
  const cacheKey = `${resolved.kind}:${resolved.scriptRef}:${filePath}`;
  const cached = scriptCache.get(cacheKey);
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached;
  }

  const source = fs.readFileSync(filePath, "utf8");
  const compiled = compileScriptSource(source, filePath);
  const entry = {
    compiled,
    mtimeMs,
    pluginDir: resolved.pluginDir ?? null,
    scriptRef: resolved.scriptRef,
  };
  scriptCache.set(cacheKey, entry);
  return entry;
}

/**
 * Evaluate a workflow script's default export inside a restricted vm context.
 *
 * @param {string} script
 * @param {unknown} ctx
 * @param {{
 *   log: import("pino").Logger,
 *   workflowName: string,
 *   owner?: string,
 *   $workflows?: { trigger: (name: string, data?: unknown) => Promise<unknown> },
 * }} opts
 */
export async function runScript(script, ctx, { log, workflowName, owner, $workflows }) {
  const loaded = loadCompiledScript(script);
  const fn = instantiateCompiled(loaded.compiled, {
    log,
    script: loaded.scriptRef,
    workflowName,
    owner,
    $workflows,
    pluginDir: loaded.pluginDir,
  });
  return await fn(ctx);
}

/**
 * Evaluate script source in memory (dry-run). Does not read from disk or use the disk cache.
 *
 * @param {string} script
 * @param {string} source
 * @param {unknown} ctx
 * @param {{
 *   log: import("pino").Logger,
 *   workflowName: string,
 *   owner?: string,
 *   $workflows?: { trigger: (name: string, data?: unknown) => Promise<unknown> },
 * }} opts
 */
export async function runScriptSource(script, source, ctx, { log, workflowName, owner, $workflows }) {
  const { fn } = instantiateScriptSource(script, source, {
    log,
    workflowName,
    owner,
    $workflows,
  });
  return await fn(ctx);
}
