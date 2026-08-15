export const NEW_SCRIPT_TEMPLATE = `async function main(ctx) {
  return ctx;
}

main.meta = {
  description: "",
  previewConfigKey: "",
  tags: [],
  config: {},
  input: {},
  output: {},
  example: {
    data: {},
    config: {},
  },
};

export default main;
`;

export const DEFAULT_INPUT_CONTEXT = `{
  "data": {},
  "config": {}
}
`;

export function normalizeScriptName(name) {
  const trimmed = name.trim();
  if (!trimmed) return "";
  return trimmed.endsWith(".js") ? trimmed : `${trimmed}.js`;
}

export function scriptTags(meta) {
  if (!Array.isArray(meta?.tags)) return [];
  return meta.tags.map((t) => String(t).trim()).filter(Boolean);
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
  if (fields == null || typeof fields !== "object" || Array.isArray(fields)) return {};
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, spec] of Object.entries(fields)) {
    if (spec && typeof spec === "object" && "default" in spec) {
      out[key] = spec.default;
    }
  }
  return out;
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
      config: "config" in meta.example ? meta.example.config ?? {} : {},
    };
  }
  return {
    data: defaultsFromFields(meta?.input),
    config: defaultsFromFields(meta?.config),
  };
}
