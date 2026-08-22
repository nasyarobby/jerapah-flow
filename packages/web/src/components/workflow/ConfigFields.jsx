import { useEffect, useState } from "react";
import { LuPlus, LuTrash2 } from "react-icons/lu";
import { triggerDestinations } from "../../lib/workflow-doc.js";
import { prettyJson } from "../../lib/script.js";
import { FormInput, FormSelect, FormTextarea } from "../FormControls.jsx";
import { FieldLabel } from "./FieldHelp.jsx";
import { ConfigRefHint } from "./ConfigRefHint.jsx";

const MULTILINE_KEYS = new Set(["expression", "jsonata"]);

function fieldSpec(meta, key) {
  const spec = meta?.config?.[key];
  if (spec && typeof spec === "object") return spec;
  return {};
}

/** Support meta `enum` or `options`: string[], or { value, label }[]. */
function enumOptions(spec) {
  const raw = spec?.enum ?? spec?.options;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw
    .map((item) => {
      if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
        return { value: item, label: String(item) };
      }
      if (item && typeof item === "object" && item.value != null) {
        return { value: item.value, label: item.label != null ? String(item.label) : String(item.value) };
      }
      return null;
    })
    .filter(Boolean);
}

function EditableText({ value, onCommit, className = "", placeholder = "…", disabled }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  if (!editing) {
    return (
      <button
        type="button"
        className={`min-h-8 w-full truncate rounded-btn px-2 text-left hover:bg-base-200 ${className}`}
        disabled={disabled}
        onClick={() => setEditing(true)}
      >
        {(value ?? "") === "" ? (
          <span className="opacity-40">{placeholder}</span>
        ) : (
          value
        )}
      </button>
    );
  }

  return (
    <FormInput
      className={`w-full ${className}`.trim()}
      value={draft}
      autoFocus
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        onCommit(draft);
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(value ?? "");
          setEditing(false);
        }
      }}
    />
  );
}

function ValueEditor({ value, onChange, spec, script, fieldKey, workflows, owner, excludeFile, disabled }) {
  const type = spec?.type ?? (value != null && typeof value === "object" ? "object" : "string");

  if (script === "trigger-workflow.js" && fieldKey === "name") {
    return (
      <WorkflowNamePicker
        value={typeof value === "string" ? value : ""}
        onChange={onChange}
        workflows={workflows}
        owner={owner}
        excludeFile={excludeFile}
        disabled={disabled}
      />
    );
  }

  const options = enumOptions(spec);
  if (options) {
    const fallback = spec?.default ?? (spec?.required ? options[0].value : "");
    const current = value === undefined || value === null ? fallback : value;
    const known = options.some((o) => o.value === current);
    return (
      <FormSelect
        className="w-full"
        value={current === undefined || current === null ? "" : String(current)}
        onChange={(e) => {
          const next = e.target.value;
          if (next === "") {
            onChange(undefined);
            return;
          }
          const match = options.find((o) => String(o.value) === next);
          onChange(match ? match.value : next);
        }}
        disabled={disabled}
      >
        {spec?.required ? null : <option value="">(default)</option>}
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
        {known || current === "" || current == null ? null : (
          <option value={String(current)}>{String(current)}</option>
        )}
      </FormSelect>
    );
  }

  if (type === "boolean") {
    return (
      <input
        type="checkbox"
        className="toggle toggle-sm"
        checked={Boolean(value)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  }

  if (type === "number") {
    return (
      <FormInput
        type="number"
        className="w-full"
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            onChange(undefined);
            return;
          }
          const n = Number(raw);
          onChange(Number.isNaN(n) ? raw : n);
        }}
      />
    );
  }

  if (type === "object" || (value != null && typeof value === "object" && !Array.isArray(value) && type !== "any")) {
    const obj = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return <ObjectFields value={obj} onChange={onChange} owner={owner} />;
  }

  if (type === "any") {
    const text =
      typeof value === "string" ? value : value === undefined ? "" : prettyJson(value) || "";
    return (
      <JsonOrTextArea
        text={text}
        onCommit={(next) => {
          if (next.trim() === "") {
            onChange(undefined);
            return;
          }
          try {
            onChange(JSON.parse(next));
          } catch {
            onChange(next);
          }
        }}
        disabled={disabled}
      />
    );
  }

  const str = value == null ? "" : String(value);
  const multiline = MULTILINE_KEYS.has(fieldKey) || str.includes("\n");
  if (multiline) {
    return (
      <FormTextarea
        className="w-full min-h-24 font-mono text-xs"
        value={str}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return <EditableText value={str} onCommit={onChange} className="font-mono text-sm" disabled={disabled} />;
}

function JsonOrTextArea({ text, onCommit, disabled }) {
  const [draft, setDraft] = useState(text);
  useEffect(() => {
    setDraft(text);
  }, [text]);
  return (
    <FormTextarea
      className="w-full min-h-24 font-mono text-xs"
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
    />
  );
}

function ObjectFields({ value, onChange, owner }) {
  const entries = Object.entries(value ?? {});

  function setKey(oldKey, nextKey) {
    if (!nextKey || nextKey === oldKey) return;
    const next = {};
    for (const [k, v] of Object.entries(value ?? {})) {
      next[k === oldKey ? nextKey : k] = v;
    }
    onChange(next);
  }

  function setVal(key, val) {
    onChange({ ...value, [key]: val });
  }

  function remove(key) {
    const next = { ...value };
    delete next[key];
    onChange(next);
  }

  function add() {
    let key = "key";
    let i = 1;
    while (key in (value ?? {})) {
      key = `key${i}`;
      i += 1;
    }
    onChange({ ...value, [key]: "" });
  }

  return (
    <div className="space-y-1 rounded-box border border-base-300 p-2">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-center gap-1">
          <div className="w-36 shrink-0">
            <EditableText value={k} onCommit={(nk) => setKey(k, nk)} className="font-mono text-xs" />
          </div>
          <div className="min-w-0 flex-1">
            {v != null && typeof v === "object" ? (
              <ObjectFields
                value={v && !Array.isArray(v) ? v : {}}
                onChange={(nv) => setVal(k, nv)}
                owner={owner}
              />
            ) : (
              <div className="space-y-0.5">
                <EditableText
                  value={v == null ? "" : String(v)}
                  onCommit={(nv) => setVal(k, nv)}
                  className="font-mono text-xs"
                />
                <ConfigRefHint value={v} owner={owner} />
              </div>
            )}
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-square text-error"
            aria-label={`Remove ${k}`}
            onClick={() => remove(k)}
          >
            <LuTrash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-xs" onClick={add}>
        <LuPlus className="size-3.5" />
        Add field
      </button>
    </div>
  );
}

function WorkflowNamePicker({ value, onChange, workflows, owner, excludeFile, disabled }) {
  const dest = triggerDestinations(workflows, { owner, excludeFile });
  const names = dest.map((w) => w.name);
  const known = names.includes(value);
  const [custom, setCustom] = useState(!known && Boolean(value));
  const selectValue = custom || (!known && value) ? "__custom__" : value || "";

  return (
    <div className="space-y-1">
      <FormSelect
        className="w-full"
        value={selectValue}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__custom__") {
            setCustom(true);
            return;
          }
          setCustom(false);
          onChange(v);
        }}
      >
        <option value="">Select workflow</option>
        {dest.map((w) => (
          <option key={`${w.owner}/${w.file}`} value={w.name} disabled={w.enabled === false}>
            {w.name}
            {w.file !== w.name ? ` (${w.file})` : ""}
            {w.enabled === false ? " — disabled" : ""}
          </option>
        ))}
        <option value="__custom__">Custom…</option>
      </FormSelect>
      {selectValue === "__custom__" ? (
        <FormInput
          className="w-full font-mono"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder="workflow name"
        />
      ) : null}
    </div>
  );
}

export function ConfigFields({
  script,
  config,
  meta,
  onChange,
  workflows,
  owner,
  excludeFile,
  disabled,
  inheritedConfig = null,
}) {
  const cfg = config && typeof config === "object" && !Array.isArray(config) ? config : {};
  const inherited =
    inheritedConfig && typeof inheritedConfig === "object" && !Array.isArray(inheritedConfig)
      ? inheritedConfig
      : null;
  const metaKeys = Object.keys(meta?.config ?? {});
  const extraKeys = Object.keys(cfg).filter((k) => !metaKeys.includes(k));
  const inheritedExtraKeys = inherited
    ? Object.keys(inherited).filter((k) => !metaKeys.includes(k) && !(k in cfg))
    : [];

  function setField(key, value) {
    const spec = fieldSpec(meta, key);
    const next = { ...cfg };
    const required = Boolean(spec.required) && !inherited;
    if (value === undefined || (value === "" && !required)) {
      delete next[key];
    } else {
      next[key] = value;
    }
    onChange(next);
  }

  function resetField(key) {
    const next = { ...cfg };
    delete next[key];
    onChange(next);
  }

  function renameExtra(oldKey, nextKey) {
    if (!nextKey || nextKey === oldKey) return;
    const next = {};
    for (const [k, v] of Object.entries(cfg)) {
      next[k === oldKey ? nextKey : k] = v;
    }
    onChange(next);
  }

  function addExtra() {
    let key = "key";
    let i = 1;
    while (key in cfg || (inherited && key in inherited)) {
      key = `key${i}`;
      i += 1;
    }
    onChange({ ...cfg, [key]: "" });
  }

  function renderField(key, { extra = false, inheritedOnly = false } = {}) {
    const spec = extra ? { type: "string" } : fieldSpec(meta, key);
    const overridden = Boolean(inherited && Object.prototype.hasOwnProperty.call(cfg, key));
    const displayValue = inheritedOnly
      ? inherited?.[key]
      : overridden || !inherited
        ? cfg[key]
        : inherited[key];
    const unknown =
      extra && metaKeys.length > 0 && !Object.prototype.hasOwnProperty.call(meta?.config ?? {}, key);

    return (
      <div
        key={key}
        className={`space-y-1 ${
          overridden ? "rounded-box border border-warning/50 bg-warning/5 p-2" : ""
        }`}
      >
        <FieldLabel name={key} required={Boolean(spec.required) && !inherited} description={spec.description}>
          {overridden ? (
            <span className="badge badge-warning badge-xs">overridden</span>
          ) : inherited && !inheritedOnly ? (
            <span className="badge badge-ghost badge-xs">from profile</span>
          ) : null}
          {unknown ? (
            <span className="badge badge-error badge-xs">not in schema</span>
          ) : null}
          {overridden ? (
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              disabled={disabled}
              onClick={() => resetField(key)}
            >
              Reset
            </button>
          ) : null}
        </FieldLabel>
        <ValueEditor
          value={displayValue}
          onChange={(v) => setField(key, v)}
          spec={extra ? { type: displayValue != null && typeof displayValue === "object" ? "object" : "string" } : spec}
          script={script}
          fieldKey={key}
          workflows={workflows}
          owner={owner}
          excludeFile={excludeFile}
          disabled={disabled}
        />
        <ConfigRefHint value={displayValue} owner={owner} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {metaKeys.map((key) => renderField(key))}
      {extraKeys.map((key) => (
        <div key={key} className="space-y-1">
          <div className="flex items-center gap-1">
            <EditableText
              value={key}
              onCommit={(nk) => renameExtra(key, nk)}
              className="font-mono text-sm"
              disabled={disabled}
            />
            {inherited ? <span className="badge badge-warning badge-xs">overridden</span> : null}
            {metaKeys.length > 0 ? (
              <span className="badge badge-error badge-xs">not in schema</span>
            ) : null}
            <button
              type="button"
              className="btn btn-ghost btn-xs btn-square text-error"
              aria-label={`Remove ${key}`}
              disabled={disabled}
              onClick={() => resetField(key)}
            >
              <LuTrash2 className="size-3.5" />
            </button>
          </div>
          <ValueEditor
            value={cfg[key]}
            onChange={(v) => setField(key, v)}
            spec={{ type: cfg[key] != null && typeof cfg[key] === "object" ? "object" : "string" }}
            script={script}
            fieldKey={key}
            workflows={workflows}
            owner={owner}
            excludeFile={excludeFile}
            disabled={disabled}
          />
          <ConfigRefHint value={cfg[key]} owner={owner} />
        </div>
      ))}
      {inheritedExtraKeys.map((key) => renderField(key, { extra: true, inheritedOnly: true }))}
      <button type="button" className="btn btn-ghost btn-xs" disabled={disabled} onClick={addExtra}>
        <LuPlus className="size-3.5" />
        Add field
      </button>
    </div>
  );
}
