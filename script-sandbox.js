import fs from "fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const hostRequire = createRequire(import.meta.url);

const ALLOWED_MODULES = new Set(["axios", "jsonata"]);

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

function createRestrictedRequire() {
  return function restrictedRequire(id) {
    if (typeof id !== "string" || !ALLOWED_MODULES.has(id)) {
      throw new Error(`require(${JSON.stringify(id)}) is not allowed`);
    }
    return hostRequire(id);
  };
}

/**
 * @param {{ log: import("pino").Logger, script: string, workflowName: string }} opts
 */
function createScriptSandbox({ log, script, workflowName }) {
  const scriptLog = log.child({ workflow: workflowName, script });
  const sandbox = {
    ...pickBuiltins(),
    log: scriptLog,
    console: createConsole(scriptLog),
    require: createRestrictedRequire(),
  };

  vm.createContext(sandbox, {
    name: `scrunner:${workflowName}:${script}`,
    codeGeneration: { strings: false, wasm: false },
  });

  return sandbox;
}

function loadCompiledScript(script) {
  const filePath = fileURLToPath(new URL(`./scripts/${script}`, import.meta.url));
  const { mtimeMs } = fs.statSync(filePath);
  const cached = scriptCache.get(script);
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.compiled;
  }

  const source = fs.readFileSync(filePath, "utf8");
  const compiled = new vm.Script(wrapScriptSource(source, script), {
    filename: filePath,
  });
  scriptCache.set(script, { compiled, mtimeMs });
  return compiled;
}

/**
 * Evaluate a workflow script's default export inside a restricted vm context.
 *
 * @param {string} script
 * @param {unknown} ctx
 * @param {{ log: import("pino").Logger, workflowName: string }} opts
 */
export async function runScript(script, ctx, { log, workflowName }) {
  const compiled = loadCompiledScript(script);
  const sandbox = createScriptSandbox({ log, script, workflowName });
  const fn = compiled.runInContext(sandbox);
  return await fn(ctx);
}
