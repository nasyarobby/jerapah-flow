import { useEffect, useMemo, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { LuChevronDown, LuGripVertical, LuMaximize2, LuMinimize2, LuPlay, LuTrash2 } from "react-icons/lu";
import { useDryRunScript, useScript } from "../../api/hooks.js";
import { errorMessage } from "../../api/client.js";
import { CodeEditor } from "../CodeEditor.jsx";
import { LogViewer } from "../LogViewer.jsx";
import { StatusBadge } from "../../lib/format.jsx";
import { contextFromMeta, prettyJson } from "../../lib/script.js";
import { ConfigFields } from "./ConfigFields.jsx";
import { ConfigTooltip, configValueText, FieldLabel, previewConfigValue, SchemaTooltip } from "./FieldHelp.jsx";

export function ScriptCard({
  step,
  index,
  otherSteps,
  scriptsByName,
  onChange,
  onRemove,
  disabled,
  workflows,
  owner,
  excludeFile,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.uiId,
    disabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const [tryOpen, setTryOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const listed = scriptsByName?.get(step.script);
  const meta = listed?.meta ?? null;

  const duplicateId =
    step.id && otherSteps.some((s) => s.id === step.id && s.uiId !== step.uiId);
  const preview = previewConfigValue(step.config, meta?.previewConfigKey);
  const previewFull = configValueText(step.config, meta?.previewConfigKey);
  const baseName = step.kind === "set" ? `set:${step.as || "…"}` : step.script || "untitled";
  const titleFull = previewFull ? `${baseName} (${previewFull})` : baseName;
  const setConfig =
    step.kind === "set" ? { as: step.as ?? "", expression: step.expression ?? "" } : null;

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`card bg-base-100 border border-primary ${
        isDragging ? "z-40" : "z-0 hover:z-30 focus-within:z-30"
      }`}
    >
      <div className={`card-body gap-3 ${expanded ? "p-4" : "p-3"}`}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-square cursor-grab active:cursor-grabbing"
            aria-label={`Drag step ${index + 1}`}
            disabled={disabled}
            {...attributes}
            {...listeners}
          >
            <LuGripVertical className="size-4 opacity-60" />
          </button>
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => setExpanded((v) => !v)}
          >
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="card-title min-w-0 flex-1 text-base font-mono" title={titleFull}>
                <span className="min-w-0 truncate">{baseName}</span>
                {!expanded && preview ? (
                  <span
                    className="badge badge-secondary badge-sm max-w-[min(16rem,45%)] shrink-0 truncate font-mono font-normal"
                    title={previewFull}
                  >
                    {preview}
                  </span>
                ) : null}
              </h3>
              {step.id ? (
                <span className="badge badge-ghost badge-sm font-mono shrink-0">{step.id}</span>
              ) : null}
            </div>
            {expanded && step.kind === "script" && meta?.description ? (
              <p className="text-sm opacity-70 mt-1">{meta.description}</p>
            ) : null}
            {expanded && step.kind === "set" ? (
              <p className="text-sm opacity-70 mt-1">Assign a JSONata result onto the context</p>
            ) : null}
          </button>
          {step.kind === "script" ? (
            <SchemaTooltip label="Input" fields={meta?.input} />
          ) : null}
          {!expanded ? (
            <ConfigTooltip config={step.kind === "set" ? setConfig : (step.config ?? {})} />
          ) : null}
          <div className="card-actions shrink-0">
            {step.kind === "script" && step.script ? (
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                title="Try"
                disabled={disabled}
                onClick={() => setTryOpen(true)}
              >
                <LuPlay className="size-4" />
                Try
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-ghost btn-xs text-error"
              title="Remove"
              disabled={disabled}
              onClick={onRemove}
            >
              <LuTrash2 className="size-4" />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs btn-square"
              title={expanded ? "Collapse" : "Expand"}
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              <LuChevronDown className={`size-4 opacity-70 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>

        {expanded ? (
          <>
            {step.kind === "set" ? (
              <div className="space-y-2">
                <FieldLabel name="as" required description="Context field to write (not data or config)" />
                <input
                  className="input input-sm w-full font-mono"
                  value={step.as ?? ""}
                  disabled={disabled}
                  onChange={(e) => onChange({ ...step, as: e.target.value })}
                />
                <FieldLabel name="expression" required description="JSONata evaluated against ctx" />
                <textarea
                  className="textarea textarea-sm w-full min-h-24 font-mono text-xs"
                  value={step.expression ?? ""}
                  disabled={disabled}
                  onChange={(e) => onChange({ ...step, expression: e.target.value })}
                />
              </div>
            ) : (
              <ConfigFields
                script={step.script}
                config={step.config}
                meta={meta}
                disabled={disabled}
                workflows={workflows}
                owner={owner}
                excludeFile={excludeFile}
                onChange={(config) => onChange({ ...step, config })}
              />
            )}

            <details className="collapse collapse-arrow bg-base-200">
              <summary className="collapse-title min-h-0 py-2 text-sm font-semibold">Advanced</summary>
              <div className="collapse-content space-y-2">
                <label className="form-control">
                  <span className="label py-0 text-sm">id</span>
                  <input
                    className={`input input-sm font-mono ${duplicateId ? "input-error" : ""}`}
                    value={step.id ?? ""}
                    disabled={disabled}
                    onChange={(e) => onChange({ ...step, id: e.target.value })}
                    placeholder="optional step id"
                  />
                  {duplicateId ? (
                    <span className="text-error text-xs">Duplicate step id</span>
                  ) : null}
                </label>
                {step.kind === "set" ? null : (
                  <NeedsEditor
                    step={step}
                    otherSteps={otherSteps}
                    disabled={disabled}
                    onChange={onChange}
                  />
                )}
                <label className="form-control">
                  <span className="label py-0 text-sm">when</span>
                  <input
                    className="input input-sm w-full font-mono"
                    value={step.when ?? ""}
                    disabled={disabled || Boolean(step.needs)}
                    onChange={(e) => onChange({ ...step, when: e.target.value })}
                    placeholder="JSONata; skip if false (linear only)"
                  />
                  {step.needs ? (
                    <span className="text-xs opacity-60">when is not allowed when needs is set</span>
                  ) : null}
                </label>
              </div>
            </details>
          </>
        ) : null}
      </div>
      {tryOpen ? (
        <ScriptTryDialog
          script={step.script}
          config={step.config}
          meta={meta}
          owner={owner}
          onClose={() => setTryOpen(false)}
        />
      ) : null}
    </article>
  );
}

function NeedsEditor({ step, otherSteps, disabled, onChange }) {
  const mode = needsMode(step.needs);
  const ids = otherSteps.filter((s) => s.id && s.uiId !== step.uiId).map((s) => s.id);

  function setMode(next) {
    if (next === "none") onChange({ ...step, needs: null });
    else if (next === "list") onChange({ ...step, needs: [], when: "" });
    else onChange({ ...step, needs: {}, when: "" });
  }

  return (
    <div className="space-y-1">
      <span className="label py-0 text-sm">needs</span>
      <select
        className="select select-sm"
        value={mode}
        disabled={disabled}
        onChange={(e) => setMode(e.target.value)}
      >
        <option value="none">None (use previous step data)</option>
        <option value="list">List of step ids</option>
        <option value="map">Map alias → step id</option>
      </select>
      {mode === "list" ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {ids.length === 0 ? (
            <span className="text-xs opacity-60">Give other steps an id first</span>
          ) : (
            ids.map((id) => {
              const checked = Array.isArray(step.needs) && step.needs.includes(id);
              return (
                <label key={id} className="label cursor-pointer gap-1 py-0">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-xs"
                    checked={checked}
                    disabled={disabled}
                    onChange={(e) => {
                      const current = Array.isArray(step.needs) ? [...step.needs] : [];
                      onChange({
                        ...step,
                        needs: e.target.checked
                          ? [...current, id]
                          : current.filter((x) => x !== id),
                      });
                    }}
                  />
                  <span className="font-mono text-xs">{id}</span>
                </label>
              );
            })
          )}
        </div>
      ) : null}
      {mode === "map" ? (
        <NeedsMap
          needs={step.needs && !Array.isArray(step.needs) ? step.needs : {}}
          ids={ids}
          disabled={disabled}
          onChange={(needs) => onChange({ ...step, needs })}
        />
      ) : null}
    </div>
  );
}

function NeedsMap({ needs, ids, disabled, onChange }) {
  const entries = Object.entries(needs ?? {});
  return (
    <div className="space-y-1">
      {entries.map(([alias, from]) => (
        <div key={alias} className="flex gap-1">
          <input
            className="input input-sm font-mono w-28"
            value={alias}
            disabled={disabled}
            onChange={(e) => {
              const next = {};
              for (const [k, v] of Object.entries(needs)) {
                next[k === alias ? e.target.value : k] = v;
              }
              onChange(next);
            }}
          />
          <select
            className="select select-sm flex-1"
            value={from}
            disabled={disabled}
            onChange={(e) => onChange({ ...needs, [alias]: e.target.value })}
          >
            {from && !ids.includes(from) ? <option value={from}>{from}</option> : null}
            {ids.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            disabled={disabled}
            onClick={() => {
              const next = { ...needs };
              delete next[alias];
              onChange(next);
            }}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        disabled={disabled || ids.length === 0}
        onClick={() => {
          const used = new Set(Object.keys(needs));
          let alias = ids[0] || "step";
          let i = 1;
          while (used.has(alias)) {
            alias = `${ids[0] || "step"}${i}`;
            i += 1;
          }
          onChange({ ...needs, [alias]: ids[0] });
        }}
      >
        Add mapping
      </button>
    </div>
  );
}

function needsMode(needs) {
  if (needs == null) return "none";
  if (Array.isArray(needs)) return "list";
  return "map";
}

export function ScriptTryDialog({ script, config, meta, owner, onClose }) {
  const existing = useScript(script);
  const dryRun = useDryRunScript();
  const defaultData = useMemo(() => prettyJson(contextFromMeta(meta).data ?? {}), [meta]);
  const [dataJson, setDataJson] = useState(defaultData);
  const [parseError, setParseError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setDataJson(defaultData);
  }, [defaultData]);

  const outputJson = dryRun.data
    ? prettyJson(dryRun.data.status === "success" ? dryRun.data.output : { error: dryRun.data.error })
    : "";

  function onRun() {
    setParseError(null);
    let data;
    try {
      const parsed = JSON.parse(dataJson || "null");
      data = parsed;
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
      return;
    }
    if (!existing.data?.content) {
      setParseError("could not load script source");
      return;
    }
    dryRun.mutate({
      name: script,
      content: existing.data.content,
      data,
      config: config ?? {},
      owner,
    });
  }

  return (
    <dialog className="modal modal-open">
      <div
        className={
          expanded
            ? "modal-box flex h-dvh max-h-dvh w-dvw max-w-none flex-col rounded-none"
            : "modal-box flex max-w-4xl flex-col"
        }
      >
        <div className="flex shrink-0 items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-bold font-mono">{script}</h3>
            <p className="text-sm opacity-70">
              Dry-run this script with the card config. Does not create an event.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-square"
            title={expanded ? "Exit full screen" : "Full screen"}
            aria-label={expanded ? "Exit full screen" : "Full screen"}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <LuMinimize2 className="size-4" /> : <LuMaximize2 className="size-4" />}
          </button>
        </div>
        {parseError ? <p className="text-error text-sm mt-2 shrink-0">{parseError}</p> : null}
        {dryRun.isError ? (
          <p className="text-error text-sm mt-2 shrink-0">{errorMessage(dryRun.error)}</p>
        ) : null}
        <div
          className={`grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 min-h-0 ${expanded ? "flex-1" : ""}`}
        >
          <div className={expanded ? "min-h-0 flex-1 h-full" : "h-48"}>
            <p className="text-xs opacity-60 mb-1">data</p>
            <div className={expanded ? "h-[calc(100%-1.25rem)]" : "h-full"}>
              <CodeEditor language="json" value={dataJson} onChange={setDataJson} height="100%" />
            </div>
          </div>
          <div className={expanded ? "min-h-0 flex-1 h-full" : "h-48"}>
            <p className="text-xs opacity-60 mb-1 flex items-center gap-2">
              output
              {dryRun.data?.status ? <StatusBadge status={dryRun.data.status} /> : null}
            </p>
            <div className={expanded ? "h-[calc(100%-1.25rem)]" : "h-full"}>
              <CodeEditor language="json" value={outputJson} onChange={() => {}} readOnly height="100%" />
            </div>
          </div>
        </div>
        <details className="collapse collapse-arrow mt-2 border border-base-300 shrink-0">
          <summary className="collapse-title min-h-0 py-2 text-sm">config (from card)</summary>
          <div className="collapse-content">
            <pre className="text-xs overflow-auto">{prettyJson(config ?? {})}</pre>
          </div>
        </details>
        {dryRun.data?.logs?.length ? (
          <LogViewer logs={dryRun.data.logs} className={expanded ? "h-48 mt-2 shrink-0" : "h-36 mt-2"} />
        ) : null}
        <div className="modal-action shrink-0">
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={dryRun.isPending || existing.isLoading}
            onClick={onRun}
          >
            {dryRun.isPending ? <span className="loading loading-spinner loading-xs" /> : null}
            Run
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="button" onClick={onClose}>
          close
        </button>
      </form>
    </dialog>
  );
}
