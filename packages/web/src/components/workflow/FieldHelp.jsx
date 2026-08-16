import { LuCircleHelp } from "react-icons/lu";

export function FieldHelp({ description }) {
  if (!description) return null;
  const long = String(description).length > 80;
  return (
    <div className="tooltip tooltip-top z-50" {...(long ? {} : { "data-tip": description })}>
      {long ? (
        <div className="tooltip-content">
          <p className="max-w-xs text-left text-xs whitespace-pre-wrap">{description}</p>
        </div>
      ) : null}
      <button type="button" className="btn btn-ghost btn-xs btn-circle" aria-label={description}>
        <LuCircleHelp className="size-3.5 opacity-60" />
      </button>
    </div>
  );
}

export function FieldLabel({ name, required, description, children }) {
  return (
    <div className="flex items-center gap-1">
      <span className="font-mono text-sm">{name}</span>
      {required ? <span className="text-error text-xs">*</span> : null}
      <FieldHelp description={description} />
      {children}
    </div>
  );
}

function fieldNotes(field) {
  return [
    field.required ? "required" : null,
    field.default !== undefined ? `default ${JSON.stringify(field.default)}` : null,
    Array.isArray(field.enum)
      ? field.enum.map((x) => (x && typeof x === "object" ? x.value : x)).join(" | ")
      : Array.isArray(field.options)
        ? field.options.map((x) => (x && typeof x === "object" ? x.value : x)).join(" | ")
        : null,
    field.description,
  ]
    .filter(Boolean)
    .join(" · ");
}

const TITLE_PREVIEW_MAX = 40;
const TOOLTIP_VALUE_MAX = 120;

function stringifyConfigValue(val) {
  if (typeof val === "string") return val.replace(/\s+/g, " ").trim();
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
}

function truncateConfigValue(val, maxLen) {
  const text = stringifyConfigValue(val);
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 1))}…`;
}

/** Collapsed card title suffix from `meta.previewConfigKey`. */
export function previewConfigValue(config, key, maxLen = TITLE_PREVIEW_MAX) {
  const text = configValueText(config, key);
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 1))}…`;
}

export function configValueText(config, key) {
  if (typeof key !== "string" || !key.trim()) return "";
  if (config == null || typeof config !== "object") return "";
  const val = config[key];
  if (val == null || val === "") return "";
  return stringifyConfigValue(val);
}

/** Formatted DaisyUI tooltip for a step's current config. */
export function ConfigTooltip({ config, label = "config" }) {
  const entries =
    config && typeof config === "object" && !Array.isArray(config) ? Object.entries(config) : [];

  return (
    <div className="tooltip tooltip-bottom z-50">
      <div className="tooltip-content z-50 p-0">
        <div className="max-w-sm text-left">
          {entries.length === 0 ? (
            <p className="px-3 py-2 text-xs opacity-80">No config</p>
          ) : (
            <table className="table table-xs">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(([name, val]) => (
                  <tr key={name}>
                    <td className="font-mono align-top">{name}</td>
                    <td className="max-w-56 break-all whitespace-normal font-mono opacity-90">
                      {val == null || val === "" ? (
                        <span className="opacity-50">—</span>
                      ) : (
                        truncateConfigValue(val, TOOLTIP_VALUE_MAX)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <button type="button" className="badge badge-ghost badge-sm h-6 cursor-help font-normal" aria-label="Current config">
        {label}
      </button>
    </div>
  );
}

/** Formatted DaisyUI tooltip for script.meta.input (or similar field maps). */
export function SchemaTooltip({ label = "Input", fields }) {
  const entries = Object.entries(fields ?? {});
  if (entries.length === 0) return null;

  return (
    <div className="tooltip tooltip-bottom z-50">
      <div className="tooltip-content z-50 p-0">
        <div className="max-w-sm text-left">
          <table className="table table-xs">
            <thead>
              <tr>
                <th>Field</th>
                <th>Type</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([name, spec]) => {
                const field = spec && typeof spec === "object" ? spec : { description: String(spec) };
                return (
                  <tr key={name}>
                    <td className="font-mono">
                      {name}
                      {field.required ? <span className="text-error">*</span> : null}
                    </td>
                    <td className="opacity-80">{field.type ?? ""}</td>
                    <td className="max-w-48 whitespace-normal opacity-90">{fieldNotes(field)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <button type="button" className="btn btn-ghost btn-xs" aria-label={`${label} schema`}>
        {label}
      </button>
    </div>
  );
}
