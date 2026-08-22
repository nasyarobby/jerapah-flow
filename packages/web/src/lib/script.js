import { isPlainObject } from "@jerapah-flow/shared";

export const NEW_SCRIPT_TEMPLATE = `async function main(ctx) {
  return { output: ctx.data ?? null, context: ctx.context ?? {} };
}

main.meta = {
  description: "",
  previewConfigKey: "",
  tags: [],
  config: {},
  input: {},
  output: {},
  context: {},
  example: {
    data: {},
    context: {},
    config: {},
  },
};

export default main;
`;

export const DEFAULT_INPUT_CONTEXT = `{
  "data": {},
  "context": {},
  "config": {}
}
`;

export function scriptTags(meta) {
  if (!Array.isArray(meta?.tags)) return [];
  return meta.tags.map((t) => String(t).trim()).filter(Boolean);
}

export function scriptReadsCtx(meta) {
  return meta?.reads === "ctx";
}

const TAG_PALETTE = [
  { bg: "color-mix(in oklab, #2563eb 22%, transparent)", text: "#2563eb" },
  { bg: "color-mix(in oklab, #059669 22%, transparent)", text: "#059669" },
  { bg: "color-mix(in oklab, #d97706 22%, transparent)", text: "#b45309" },
  { bg: "color-mix(in oklab, #db2777 22%, transparent)", text: "#db2777" },
  { bg: "color-mix(in oklab, #7c3aed 22%, transparent)", text: "#7c3aed" },
  { bg: "color-mix(in oklab, #0d9488 22%, transparent)", text: "#0f766e" },
  { bg: "color-mix(in oklab, #ea580c 22%, transparent)", text: "#c2410c" },
  { bg: "color-mix(in oklab, #4f46e5 22%, transparent)", text: "#4338ca" },
  { bg: "color-mix(in oklab, #dc2626 22%, transparent)", text: "#b91c1c" },
  { bg: "color-mix(in oklab, #65a30d 22%, transparent)", text: "#4d7c0f" },
];

function hashTag(tag) {
  let h = 2166136261;
  const s = String(tag).toLowerCase();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function tagColor(tag) {
  return TAG_PALETTE[hashTag(tag) % TAG_PALETTE.length];
}

export function prettyJson(value) {
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function defaultsFromFields(fields) {
  if (!isPlainObject(fields)) return {};
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, spec] of Object.entries(fields)) {
    if (spec && typeof spec === "object" && "default" in spec) {
      out[key] = spec.default;
    }
  }
  return out;
}

function placeholderForField(spec) {
  const type = spec?.type;
  if (type === "object") return {};
  if (type === "array") return [];
  if (type === "number" || type === "integer") return 0;
  if (type === "boolean") return false;
  if (type === "string") return "";
  return null;
}

function seedFromInputFields(fields) {
  if (!isPlainObject(fields)) return {};
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, spec] of Object.entries(fields)) {
    const field = spec && typeof spec === "object" ? spec : {};
    if ("default" in field) out[key] = field.default;
    else if (field.required) out[key] = placeholderForField(field);
  }
  return out;
}

export function inputHasFields(meta) {
  return isPlainObject(meta?.input) && Object.keys(meta.input).length > 0;
}

/** First script step with a non-empty `meta.input`; else first script meta. */
export function firstInputMeta(steps, scriptsByName, profilesByName) {
  let fallback = null;
  for (const step of steps ?? []) {
    if (step?.kind === "set") continue;
    let name = typeof step === "string" ? step : step?.script;
    if (!name && step?.profile && profilesByName) {
      name = profilesByName.get(step.profile)?.script;
    }
    if (!name) continue;
    const listed = scriptsByName?.get(name);
    const meta = listed && typeof listed === "object" ? listed.meta ?? null : null;
    if (!fallback) fallback = meta;
    if (inputHasFields(meta)) return meta;
  }
  return fallback;
}

/** Seed workflow test `data` from required/default fields, example, then YAML `data`. */
export function dataFromInputMeta(meta, yamlData) {
  const fromExample = contextFromMeta(meta).data;
  return {
    ...seedFromInputFields(meta?.input),
    ...(isPlainObject(fromExample) ? fromExample : {}),
    ...(isPlainObject(yamlData) ? yamlData : {}),
  };
}

export function defaultConfigFromMeta(meta) {
  if (meta?.example?.config && typeof meta.example.config === "object" && !Array.isArray(meta.example.config)) {
    return { ...meta.example.config };
  }
  return defaultsFromFields(meta?.config);
}

export function contextFromMeta(meta) {
  if (meta?.example && typeof meta.example === "object" && !Array.isArray(meta.example)) {
    return {
      data: "data" in meta.example ? meta.example.data : {},
      context: "context" in meta.example ? meta.example.context ?? {} : {},
      config: "config" in meta.example ? meta.example.config ?? {} : {},
    };
  }
  return {
    data: defaultsFromFields(meta?.input),
    context: defaultsFromFields(meta?.context),
    config: defaultsFromFields(meta?.config),
  };
}
