import { useMemo, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  LuChevronDown,
  LuGripVertical,
  LuMaximize2,
  LuMinimize2,
  LuPlay,
  LuTrash2,
} from "react-icons/lu";
import { useDryRunScript, useScript } from "../../api/hooks.js";
import { errorMessage } from "../../api/client.js";
import { CodeEditor } from "../CodeEditor.jsx";
import { FormInput, FormSelect, FormTextarea } from "../FormControls.jsx";
import { JsonTree } from "../JsonViewBlock.jsx";
import { LogViewer } from "../LogViewer.jsx";
import { StatusBadge } from "../../lib/format";
import { prettyJson } from "../../lib/script.js";
import { seedTryDialog, stepTryLabel } from "../../lib/try-session.js";
import { needsMode } from "../../lib/workflow-doc.js";
import {
  stepPredecessors,
  stepSuccessors,
} from "../../lib/workflow-graph.js";
import { ConfigFields } from "./ConfigFields.jsx";
import {
  ConfigTooltip,
  configValueText,
  FieldLabel,
  previewConfigValue,
  SchemaTooltip,
} from "./FieldHelp.jsx";
import { ScriptIcon } from "../ScriptIcon.jsx";
import {
  configHasOverlay,
  mergeProfileConfig,
  overlayFromMerged,
} from "../../lib/profile.js";

export function ScriptCard(props) {
  if (props.sortable === false) {
    return <ScriptCardView {...props} drag={null} />;
  }
  return <ScriptCardSortable {...props} />;
}

function ScriptCardSortable(props) {
  const drag = useSortable({
    id: props.step.uiId,
    disabled: props.disabled,
  });
  return <ScriptCardView {...props} drag={drag} />;
}

function ScriptCardView({
  step,
  index,
  otherSteps,
  scriptsByName,
  profilesByName,
  onChange,
  onRemove,
  disabled,
  workflows,
  owner,
  excludeFile,
  sortable = true,
  defaultExpanded = false,
  trySession,
  onTrySuccess,
  tryOpen: tryOpenProp,
  onTryOpenChange,
  onNavigateTry,
  drag,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = drag ?? {
    attributes: {},
    listeners: {},
    setNodeRef: undefined,
    transform: null,
    transition: undefined,
    isDragging: false,
  };
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const tryControlled = typeof onTryOpenChange === "function";
  const [localTryOpen, setLocalTryOpen] = useState(false);
  const tryOpen = tryControlled ? Boolean(tryOpenProp) : localTryOpen;
  function setTryOpen(open) {
    if (tryControlled) onTryOpenChange(open);
    else setLocalTryOpen(open);
  }
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [configMode, setConfigMode] = useState("form");
  const profile = step.profile && profilesByName?.get(step.profile);
  const scriptName = profile?.script || step.script;
  const listed = scriptsByName?.get(scriptName);
  const meta = listed?.meta ?? null;
  const inheritedConfig = profile?.config ?? null;
  const mergedConfig = profile
    ? mergeProfileConfig(profile.config, step.config)
    : step.config;
  const overridden = Boolean(step.profile && configHasOverlay(step.config));

  const duplicateId =
    step.id && otherSteps.some((s) => s.id === step.id && s.uiId !== step.uiId);
  const preview = previewConfigValue(mergedConfig, meta?.previewConfigKey);
  const previewFull = configValueText(mergedConfig, meta?.previewConfigKey);
  const baseName = step.kind === "set" ? "set" : scriptName || "untitled";
  const titleFull = previewFull ? `${baseName} (${previewFull})` : baseName;
  const setConfig =
    step.kind === "set" ? { expression: step.expression ?? "" } : null;
  const missingProfile = Boolean(step.profile) && !profile;

  const neighborOpts = useMemo(() => {
    const steps = otherSteps ?? [];
    const byUi = new Map(steps.map((s, i) => [s.uiId, { step: s, index: i }]));
    function labeled(uiIds) {
      return uiIds
        .map((uiId) => {
          const hit = byUi.get(uiId);
          if (!hit) return null;
          return {
            uiId,
            label: stepTryLabel(hit.step, hit.index),
          };
        })
        .filter(Boolean);
    }
    return {
      predecessors: labeled(stepPredecessors(steps, step.uiId)),
      successors: labeled(stepSuccessors(steps, step.uiId)),
    };
  }, [otherSteps, step.uiId]);

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`card bg-base-100 border ${
        step.profile ? "border-accent" : "border-primary"
      } ${isDragging ? "z-40" : "z-0 hover:z-30 focus-within:z-30"}`}
    >
      <div className={`card-body gap-3 ${expanded ? "p-4" : "p-3"}`}>
        <div className="flex items-center gap-2">
          {sortable !== false ? (
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
          ) : null}
          {step.kind === "script" && scriptName ? (
            <ScriptIcon
              name={scriptName}
              hasIcon={listed?.hasIcon}
              className="size-8 shrink-0"
            />
          ) : null}
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => setExpanded((v) => !v)}
          >
            <div className="flex min-w-0 items-center gap-2">
              <h3
                className="card-title min-w-0 flex-1 text-base font-mono"
                title={titleFull}
              >
                <span className="min-w-0 truncate">{baseName}</span>
                {!expanded && preview ? (
                  <span
                    className="badge badge-secondary badge-sm shrink-0 truncate font-mono font-normal"
                    title={previewFull}
                  >
                    {preview}
                  </span>
                ) : null}
              </h3>
              {step.profile ? (
                <span
                  className={`badge badge-sm shrink-0 font-mono font-normal ${
                    overridden ? "badge-warning" : "badge-accent"
                  }`}
                  title={
                    overridden
                      ? `profile ${step.profile} + overridden`
                      : `profile ${step.profile}`
                  }
                >
                  {overridden
                    ? `profile ${step.profile} + overridden`
                    : `profile ${step.profile}`}
                </span>
              ) : null}
              {step.id ? (
                <span className="badge badge-ghost badge-sm font-mono shrink-0">
                  {step.id}
                </span>
              ) : null}
            </div>
            {expanded && step.kind === "script" && missingProfile ? (
              <p className="text-sm text-error mt-1">
                Profile {step.profile} not found for owner {owner || "?"}
              </p>
            ) : null}
            {expanded && step.kind === "script" && meta?.description ? (
              <p className="text-sm opacity-70 mt-1">{meta.description}</p>
            ) : null}
            {expanded && step.kind === "set" ? (
              <p className="text-sm opacity-70 mt-1">
                JSONata over ctx; result becomes the next step’s data
              </p>
            ) : null}
          </button>
          {step.kind === "script" ? (
            <SchemaTooltip label="Input" fields={meta?.input} />
          ) : null}
          {!expanded ? (
            <ConfigTooltip
              config={step.kind === "set" ? setConfig : (mergedConfig ?? {})}
            />
          ) : null}
          <div className="card-actions shrink-0">
            {step.kind === "set" || (step.kind === "script" && scriptName) ? (
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
              <LuChevronDown
                className={`size-4 opacity-70 transition-transform ${expanded ? "rotate-180" : ""}`}
              />
            </button>
          </div>
        </div>

        {expanded ? (
          <>
            {step.kind === "set" ? (
              <div className="space-y-2">
                <FieldLabel
                  name="expression"
                  required
                  description="JSONata evaluated against ctx (data, context, config). Result becomes the next step's data."
                />
                <FormTextarea
                  className="w-full min-h-24 font-mono text-xs"
                  value={step.expression ?? ""}
                  disabled={disabled}
                  onChange={(e) =>
                    onChange({ ...step, expression: e.target.value })
                  }
                />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="join">
                    <button
                      type="button"
                      className={`btn btn-xs join-item ${configMode === "form" ? "btn-active" : ""}`}
                      disabled={disabled}
                      onClick={() => setConfigMode("form")}
                    >
                      Form
                    </button>
                    <button
                      type="button"
                      className={`btn btn-xs join-item ${configMode === "json" ? "btn-active" : ""}`}
                      disabled={disabled}
                      onClick={() => setConfigMode("json")}
                    >
                      JSON
                    </button>
                  </div>
                  {step.profile ? (
                    <span className="text-xs opacity-60">
                      JSON is the step overlay, not the merged runtime config
                    </span>
                  ) : null}
                </div>
                {configMode === "form" ? (
                  <ConfigFields
                    script={scriptName}
                    config={step.config}
                    inheritedConfig={inheritedConfig}
                    meta={meta}
                    disabled={disabled}
                    workflows={workflows}
                    owner={owner}
                    excludeFile={excludeFile}
                    onChange={(config) => onChange({ ...step, config })}
                  />
                ) : (
                  <ConfigJsonEditor
                    config={step.config}
                    disabled={disabled}
                    onChange={(config) => onChange({ ...step, config })}
                  />
                )}
              </div>
            )}

            <details className="collapse collapse-arrow bg-base-200">
              <summary className="collapse-title min-h-0 py-2 text-sm font-semibold">
                Advanced
              </summary>
              <div className="collapse-content space-y-2">
                <label className="form-control">
                  <span className="label py-0 text-sm">id</span>
                  <FormInput
                    className={`font-mono ${duplicateId ? "input-error" : ""}`}
                    value={step.id ?? ""}
                    disabled={disabled}
                    onChange={(e) => onChange({ ...step, id: e.target.value })}
                    placeholder="optional step id"
                  />
                  {duplicateId ? (
                    <span className="text-error text-xs">
                      Duplicate step id
                    </span>
                  ) : null}
                </label>
                <NeedsEditor
                  step={step}
                  otherSteps={otherSteps}
                  disabled={disabled}
                  onChange={onChange}
                />
                <label className="form-control">
                  <span className="label py-0 text-sm">when</span>
                  <FormInput
                    className="w-full font-mono"
                    value={step.when ?? ""}
                    disabled={disabled || Boolean(step.needs)}
                    onChange={(e) =>
                      onChange({ ...step, when: e.target.value })
                    }
                    placeholder="JSONata; skip if false (linear only)"
                  />
                  {step.needs ? (
                    <span className="text-xs opacity-60">
                      when is not allowed when needs is set
                    </span>
                  ) : null}
                </label>
              </div>
            </details>
          </>
        ) : null}
      </div>
      {tryOpen ? (
        <ScriptTryDialog
          kind={step.kind === "set" ? "set" : "script"}
          script={step.kind === "set" ? "set" : scriptName}
          expression={step.expression ?? ""}
          config={mergedConfig}
          inheritedConfig={inheritedConfig}
          meta={meta}
          owner={owner}
          disabled={disabled}
          step={step}
          index={index}
          otherSteps={otherSteps}
          trySession={trySession}
          onTrySuccess={onTrySuccess}
          predecessors={neighborOpts.predecessors}
          successors={neighborOpts.successors}
          onNavigateTry={onNavigateTry}
          onApplyConfig={
            step.kind === "set"
              ? (expression) => onChange({ ...step, expression })
              : (config) => onChange({ ...step, config })
          }
          onClose={() => setTryOpen(false)}
        />
      ) : null}
    </article>
  );
}

function parseConfigObject(text) {
  const parsed = JSON.parse(text || "{}");
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("config must be a JSON object");
  }
  return parsed;
}

function configsEqual(a, b) {
  try {
    return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
  } catch {
    return false;
  }
}

function ConfigJsonEditor({ config, disabled, onChange }) {
  const [draft, setDraft] = useState(() => prettyJson(config ?? {}) || "{}");
  const [parseError, setParseError] = useState(null);

  function commit(nextText) {
    setDraft(nextText);
    try {
      const parsed = parseConfigObject(nextText);
      setParseError(null);
      if (!configsEqual(parsed, config ?? {})) {
        onChange(parsed);
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-1">
      {parseError ? <p className="text-error text-xs">{parseError}</p> : null}
      <div className="h-48">
        <CodeEditor
          language="json"
          value={draft}
          onChange={disabled ? () => {} : commit}
          readOnly={disabled}
          height="100%"
        />
      </div>
    </div>
  );
}

function NeedsEditor({ step, otherSteps, disabled, onChange }) {
  const mode = needsMode(step.needs);
  const ids = otherSteps
    .filter((s) => s.id && s.uiId !== step.uiId)
    .map((s) => s.id);

  function setMode(next) {
    if (next === "none") onChange({ ...step, needs: null });
    else if (next === "list") onChange({ ...step, needs: [], when: "" });
    else onChange({ ...step, needs: {}, when: "" });
  }

  return (
    <div className="space-y-1">
      <span className="label py-0 text-sm">needs</span>
      <FormSelect
        value={mode}
        disabled={disabled}
        onChange={(e) => setMode(e.target.value)}
      >
        <option value="none">None (trigger data / previous output)</option>
        <option value="list">List of step ids</option>
        <option value="map">Map alias → step id</option>
      </FormSelect>
      {mode === "list" ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {ids.length === 0 ? (
            <span className="text-xs opacity-60">
              Give other steps an id first
            </span>
          ) : (
            ids.map((id) => {
              const checked =
                Array.isArray(step.needs) && step.needs.includes(id);
              return (
                <label key={id} className="label cursor-pointer gap-1 py-0">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-xs"
                    checked={checked}
                    disabled={disabled}
                    onChange={(e) => {
                      const current = Array.isArray(step.needs)
                        ? [...step.needs]
                        : [];
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
          <FormInput
            className="font-mono w-28"
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
          <FormSelect
            className="flex-1"
            value={from}
            disabled={disabled}
            onChange={(e) => onChange({ ...needs, [alias]: e.target.value })}
          >
            {from && !ids.includes(from) ? (
              <option value={from}>{from}</option>
            ) : null}
            {ids.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </FormSelect>
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


function TryNavCluster({ direction, neighbors, pick, onPick, onGo, disabled }) {
  if (!neighbors?.length) return null;
  const isPrev = direction === "prev";
  if (neighbors.length === 1) {
    const only = neighbors[0];
    return (
      <button
        type="button"
        className="btn btn-ghost btn-sm max-w-xs truncate"
        disabled={disabled}
        title={only.label}
        onClick={() => onGo(only.uiId)}
      >
        {isPrev ? `← Prev: ${only.label}` : `Try next: ${only.label}`}
      </button>
    );
  }
  const selected =
    neighbors.some((n) => n.uiId === pick) ? pick : neighbors[0].uiId;
  return (
    <div className="join max-w-md">
      <FormSelect
        className="join-item select-sm max-w-[14rem] font-mono text-xs"
        value={selected}
        disabled={disabled}
        onChange={(e) => onPick(e.target.value)}
        aria-label={isPrev ? "Previous step" : "Next step"}
      >
        {neighbors.map((n) => (
          <option key={n.uiId} value={n.uiId}>
            {n.label}
          </option>
        ))}
      </FormSelect>
      <button
        type="button"
        className="btn btn-sm join-item"
        disabled={disabled || !selected}
        onClick={() => onGo(selected)}
      >
        {isPrev ? "← Go" : "Go →"}
      </button>
    </div>
  );
}

function ScriptTryDialog({
  kind = "script",
  script,
  expression: initialExpression = "",
  config,
  inheritedConfig,
  meta,
  owner,
  disabled,
  step,
  index,
  otherSteps,
  trySession,
  onTrySuccess,
  predecessors = [],
  successors = [],
  onNavigateTry,
  onApplyConfig,
  onClose,
}) {
  const isSet = kind === "set";
  const existing = useScript(script, !isSet);
  const dryRun = useDryRunScript();

  const seed = useMemo(
    () =>
      seedTryDialog({
        step: step ?? { uiId: script },
        index: index ?? 0,
        steps: otherSteps ?? [],
        session: trySession ?? { byStep: {}, lastTriedUiId: null },
        meta: isSet ? null : meta,
      }),
    [step, index, otherSteps, trySession, meta, isSet, script],
  );

  const [dataJson, setDataJson] = useState(() => prettyJson(seed.data ?? {}) || "{}");
  const [contextJson, setContextJson] = useState(
    () => prettyJson(seed.context ?? {}) || "{}",
  );
  const [configJson, setConfigJson] = useState(
    () => prettyJson(config ?? {}) || "{}",
  );
  const [expression, setExpression] = useState(() => initialExpression ?? "");
  const [baselineMerged, setBaselineMerged] = useState(() => ({
    ...(config ?? {}),
  }));
  const [baselineExpression, setBaselineExpression] = useState(
    () => initialExpression ?? "",
  );
  const [parseError, setParseError] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [seedHint] = useState(() => seed.source);
  const [sessionResult, setSessionResult] = useState(() => seed.lastResult ?? null);
  const [prevPick, setPrevPick] = useState(
    () => predecessors[0]?.uiId ?? "",
  );
  const [nextPick, setNextPick] = useState(
    () => successors[0]?.uiId ?? "",
  );

  const resultValue = useMemo(() => {
    if (dryRun.data) {
      if (dryRun.data.status === "success") {
        return {
          output: dryRun.data.output,
          context: dryRun.data.context,
          ...(dryRun.data.skipRemaining ? { skipRemaining: true } : {}),
        };
      }
      return { error: dryRun.data.error };
    }
    if (sessionResult) {
      return {
        output: sessionResult.output,
        context: sessionResult.context,
      };
    }
    return undefined;
  }, [dryRun.data, sessionResult]);

  function parseTryConfig() {
    return parseConfigObject(configJson);
  }

  const configParse = useMemo(() => {
    if (isSet) return { ok: true, value: { expression } };
    try {
      return { ok: true, value: parseConfigObject(configJson) };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }, [configJson, isSet, expression]);

  const configDirty = isSet
    ? expression !== baselineExpression
    : configParse.ok && !configsEqual(configParse.value, baselineMerged);
  const canApply =
    Boolean(onApplyConfig) && !disabled && configParse.ok && configDirty;

  function onRun() {
    setParseError(null);
    let data;
    let context;
    let runConfig;
    try {
      data = JSON.parse(dataJson || "null");
      context = JSON.parse(contextJson || "{}");
      if (!isSet) runConfig = parseTryConfig();
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
      return;
    }
    if (
      context != null &&
      (typeof context !== "object" || Array.isArray(context))
    ) {
      setParseError("context must be a JSON object");
      return;
    }
    if (isSet) {
      if (!expression.trim()) {
        setParseError("expression is required");
        return;
      }
      dryRun.mutate(
        {
          name: "set",
          expression,
          data,
          context: context ?? {},
          config: { expression },
          owner,
        },
        {
          onSuccess: (res) => {
            if (res?.status !== "success") return;
            setSessionResult({
              output: res.output,
              context: res.context ?? {},
            });
            onTrySuccess?.(step?.uiId, {
              data,
              context: context ?? {},
              output: res.wireOutput ?? res.output,
              resultContext: res.wireContext ?? res.context ?? {},
            });
          },
        },
      );
      return;
    }
    if (!existing.data?.content) {
      setParseError("could not load script source");
      return;
    }
    dryRun.mutate(
      {
        name: script,
        content: existing.data.content,
        data,
        context: context ?? {},
        config: runConfig,
        owner,
      },
      {
        onSuccess: (res) => {
          if (res?.status !== "success") return;
          setSessionResult({
            output: res.output,
            context: res.context ?? {},
          });
          onTrySuccess?.(step?.uiId, {
            data,
            context: context ?? {},
            output: res.wireOutput ?? res.output,
            resultContext: res.wireContext ?? res.context ?? {},
          });
        },
      },
    );
  }

  function onApply() {
    setParseError(null);
    if (isSet) {
      onApplyConfig?.(expression);
      setBaselineExpression(expression);
      return;
    }
    let parsed;
    try {
      parsed = parseTryConfig();
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
      return;
    }
    const overlay = overlayFromMerged(inheritedConfig, parsed);
    onApplyConfig?.(overlay);
    setBaselineMerged(parsed);
  }

  const runDisabled =
    dryRun.isPending ||
    (!isSet && (existing.isLoading || !configParse.ok)) ||
    (isSet && !expression.trim());

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
            <h3 className="font-bold font-mono">{isSet ? "set" : script}</h3>
            <p className="text-sm opacity-70">
              {isSet
                ? "Dry-run this set with editable data, context, and expression. Does not create an event. Use Apply to card to write the expression back to the step."
                : "Dry-run this script with editable data, context, and config. Does not create an event. Use Apply to card to write config back to the step."}
            </p>
            {seedHint ? (
              <p className="text-xs opacity-60 mt-1">
                Seed: {seedHint}
                {isSet ? " · sets do not mutate context" : ""}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-square"
            title={expanded ? "Exit full screen" : "Full screen"}
            aria-label={expanded ? "Exit full screen" : "Full screen"}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <LuMinimize2 className="size-4" />
            ) : (
              <LuMaximize2 className="size-4" />
            )}
          </button>
        </div>
        {parseError ? (
          <p className="text-error text-sm mt-2 shrink-0">{parseError}</p>
        ) : null}
        {!isSet && !configParse.ok ? (
          <p className="text-error text-sm mt-2 shrink-0">
            {configParse.error}
          </p>
        ) : null}
        {dryRun.isError ? (
          <p className="text-error text-sm mt-2 shrink-0">
            {errorMessage(dryRun.error)}
          </p>
        ) : null}
        <div
          className={`grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 min-h-0 ${expanded ? "flex-1" : ""}`}
        >
          <div className={expanded ? "min-h-0 flex-1 h-full" : "h-48"}>
            <p className="text-xs opacity-60 mb-1">data</p>
            <div className={expanded ? "h-[calc(100%-1.25rem)]" : "h-full"}>
              <CodeEditor
                language="json"
                value={dataJson}
                onChange={setDataJson}
                height="100%"
              />
            </div>
          </div>
          <div className={expanded ? "min-h-0 flex-1 h-full" : "h-48"}>
            <p className="text-xs opacity-60 mb-1">context</p>
            <div className={expanded ? "h-[calc(100%-1.25rem)]" : "h-full"}>
              <CodeEditor
                language="json"
                value={contextJson}
                onChange={setContextJson}
                height="100%"
              />
            </div>
          </div>
          <div className={expanded ? "min-h-0 flex-1 h-full" : "h-48"}>
            <p className="text-xs opacity-60 mb-1">
              {isSet ? (
                "expression"
              ) : (
                <>
                  config
                  {inheritedConfig ? (
                    <span className="opacity-50">
                      {" "}
                      (merged; Apply writes overlay)
                    </span>
                  ) : null}
                </>
              )}
            </p>
            <div className={expanded ? "h-[calc(100%-1.25rem)]" : "h-full"}>
              {isSet ? (
                <CodeEditor
                  language="javascript"
                  value={expression}
                  onChange={setExpression}
                  height="100%"
                />
              ) : (
                <CodeEditor
                  language="json"
                  value={configJson}
                  onChange={setConfigJson}
                  height="100%"
                />
              )}
            </div>
          </div>
          <div className={expanded ? "min-h-0 flex-1 h-full" : "h-48"}>
            <p className="text-xs opacity-60 mb-1 flex items-center gap-2">
              result (output + context)
              {dryRun.data?.status ? (
                <StatusBadge status={dryRun.data.status} />
              ) : sessionResult && !dryRun.data ? (
                <span className="badge badge-ghost badge-xs">session</span>
              ) : null}
            </p>
            <div className={expanded ? "h-[calc(100%-1.25rem)]" : "h-full"}>
              {resultValue === undefined ? (
                <JsonTree
                  value={{}}
                  keyName="result"
                  className="h-full max-h-full"
                />
              ) : (
                <JsonTree
                  value={resultValue}
                  keyName="result"
                  className="h-full max-h-full"
                  shortenTextAfterLength={undefined}
                />
              )}
            </div>
          </div>
        </div>
        {dryRun.data?.logs?.length ? (
          <LogViewer
            logs={dryRun.data.logs}
            className={expanded ? "h-48 mt-2 shrink-0" : "h-36 mt-2"}
          />
        ) : null}
        <div className="modal-action shrink-0 flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <TryNavCluster
              direction="prev"
              neighbors={predecessors}
              pick={prevPick}
              onPick={setPrevPick}
              onGo={(uiId) => onNavigateTry?.(uiId)}
              disabled={!onNavigateTry}
            />
            <TryNavCluster
              direction="next"
              neighbors={successors}
              pick={nextPick}
              onPick={setNextPick}
              onGo={(uiId) => onNavigateTry?.(uiId)}
              disabled={!onNavigateTry}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn" onClick={onClose}>
              Close
            </button>
            <button
              type="button"
              className="btn"
              disabled={!canApply}
              onClick={onApply}
              title={
                disabled
                  ? "Card is read-only"
                  : isSet
                    ? !configDirty
                      ? "No expression changes to apply"
                      : "Write expression back to the workflow step"
                    : !configParse.ok
                      ? "Fix config JSON first"
                      : !configDirty
                        ? "No config changes to apply"
                        : "Write overlay back to the workflow step"
              }
            >
              Apply to card
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={runDisabled}
              onClick={onRun}
            >
              {dryRun.isPending ? (
                <span className="loading loading-spinner loading-xs" />
              ) : null}
              Run
            </button>
          </div>
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
