export const NEW_SCRIPT_TEMPLATE = `async function main(ctx) {
  return ctx;
}

main.meta = {
  description: "",
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
