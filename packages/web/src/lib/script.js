export const NEW_SCRIPT_TEMPLATE = `export default async function main(ctx) {
  return ctx;
}
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
