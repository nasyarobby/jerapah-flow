import { useState } from "react";
import { LuChevronDown, LuCopy, LuGripVertical, LuTrash2 } from "react-icons/lu";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import cronstrue from "cronstrue";
import { namespacedPath, HTTP_METHODS, triggerDestinations } from "../../lib/workflow-doc.js";
import { CRON_CUSTOM, CRON_PRESETS, matchCronPreset, scheduleForPreset } from "../../lib/cron-presets.js";
import { FormInput, FormSelect } from "../FormControls.jsx";
import { AuthPicker } from "./AuthPicker.jsx";

export function TriggerCard(props) {
  if (props.sortable === false) {
    return <TriggerCardView {...props} drag={null} />;
  }
  return <TriggerCardSortable {...props} />;
}

function TriggerCardSortable(props) {
  const drag = useSortable({
    id: props.trigger.uiId,
    disabled: props.disabled,
  });
  return <TriggerCardView {...props} drag={drag} />;
}

function TriggerCardView({
  trigger,
  index,
  owner,
  onChange,
  onRemove,
  disabled,
  auths = [],
  pages = [],
  workflows = [],
  excludeFile,
  sortable = true,
  defaultExpanded = false,
  drag,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = drag ?? {
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
  const type = trigger.type;
  const [expanded, setExpanded] = useState(defaultExpanded);
  const alertDestinations = triggerDestinations(workflows, { owner, excludeFile });

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
          {sortable !== false ? (
            <button
              type="button"
              className="btn btn-ghost btn-xs btn-square cursor-grab active:cursor-grabbing"
              aria-label={`Drag trigger ${index + 1}`}
              disabled={disabled}
              {...attributes}
              {...listeners}
            >
              <LuGripVertical className="size-4 opacity-60" />
            </button>
          ) : null}
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => setExpanded((v) => !v)}
          >
            <h3 className="card-title text-base inline">{typeLabel(type)}</h3>
            <span className="ml-2 font-mono text-xs opacity-70">{triggerSummary(trigger, owner)}</span>
          </button>
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
        {expanded ? (
          <>
            {type === "HTTP" ? (
              <HttpFields
                trigger={trigger}
                owner={owner}
                disabled={disabled}
                onChange={onChange}
                auths={auths}
                pages={pages}
                alertDestinations={alertDestinations}
              />
            ) : null}
            {type === "cron" ? (
              <CronFields
                trigger={trigger}
                disabled={disabled}
                onChange={onChange}
                alertDestinations={alertDestinations}
              />
            ) : null}
            {type === "workflow" ? (
              <p className="text-sm opacity-80">
                Other workflows can call this one with <span className="font-mono">trigger-workflow.js</span>.
                No extra fields.
              </p>
            ) : null}
            {type !== "HTTP" && type !== "cron" && type !== "workflow" ? (
              <p className="text-sm opacity-70">Unknown trigger type. Edit it in the YAML tab.</p>
            ) : null}
          </>
        ) : null}
      </div>
    </article>
  );
}

function triggerSummary(trigger, owner) {
  const type = trigger?.type;
  /** @type {string[]} */
  const failureParts = [];
  if (trigger.onConsecutiveFailures && trigger.onFailureWorkflow) {
    failureParts.push(`onFailure@${trigger.onFailureWorkflow}`);
  }
  if (trigger.disableOnConsecutiveFailures) {
    failureParts.push("auto-disable");
  }
  const failure = failureParts.length ? ` · ${failureParts.join(", ")}` : "";
  if (type === "HTTP") {
    return `${trigger.method || "POST"} ${namespacedPath(owner || "owner", trigger.path || "/")}${failure}`;
  }
  if (type === "cron") {
    return `${trigger.schedule || ""}${failure}`;
  }
  if (type === "workflow") return "callable";
  return "";
}

function typeLabel(type) {
  if (type === "HTTP") return "HTTP";
  if (type === "cron") return "Cron";
  if (type === "workflow") return "Workflow";
  return type || "Trigger";
}

function Field({ label, children, hint }) {
  return (
    <div className="flex w-full flex-col gap-1">
      {label ? <span className="text-sm font-medium opacity-80">{label}</span> : null}
      {children}
      {hint ? <span className="text-xs opacity-60">{hint}</span> : null}
    </div>
  );
}

function HttpFields({ trigger, owner, disabled, onChange, auths, pages, alertDestinations }) {
  const path = trigger.path || "/";
  const url = namespacedPath(owner || "owner", path);
  const authEntries = Array.isArray(trigger.auth) ? trigger.auth : [];
  const selectedIds = authEntries.filter((e) => typeof e === "string" && e).map(String);
  const inlineEntries = authEntries.filter((e) => e && typeof e === "object");

  function setAuthIds(nextIds) {
    const next = [...nextIds, ...inlineEntries];
    onChange({ ...trigger, auth: next.length ? next : null });
  }

  function copyUrl() {
    if (typeof navigator?.clipboard?.writeText === "function") {
      navigator.clipboard.writeText(url);
    }
  }

  return (
    <div className="space-y-3">
      <Field label="Method">
        <FormSelect
          className="w-full"
          value={trigger.method || "POST"}
          disabled={disabled}
          onChange={(e) => onChange({ ...trigger, method: e.target.value })}
        >
          {HTTP_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
          {HTTP_METHODS.includes(trigger.method || "POST") ? null : (
            <option value={trigger.method}>{trigger.method}</option>
          )}
        </FormSelect>
      </Field>

      <Field label="Path">
        <FormInput
          className="w-full font-mono"
          value={trigger.path ?? ""}
          disabled={disabled}
          onChange={(e) => onChange({ ...trigger, path: e.target.value })}
          placeholder="/hook"
        />
      </Field>

      <Field label="URL">
        <div className="flex w-full items-center gap-1">
          <FormInput
            className="w-full font-mono opacity-80"
            value={url}
            readOnly
            tabIndex={-1}
          />
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-square shrink-0"
            title="Copy URL"
            onClick={copyUrl}
          >
            <LuCopy className="size-3.5" />
          </button>
        </div>
      </Field>

      <AuthPicker
        auths={auths}
        selectedIds={selectedIds}
        inlineCount={inlineEntries.length}
        disabled={disabled}
        onChange={setAuthIds}
      />

      <Field label="Response page">
        <FormSelect
          className="w-full"
          value={trigger.response ?? ""}
          disabled={disabled}
          onChange={(e) => onChange({ ...trigger, response: e.target.value })}
        >
          <option value="">JSON default</option>
          {pages.map((p) => (
            <option key={p.name ?? p.id} value={p.name}>
              {p.name}
            </option>
          ))}
          {trigger.response && !pages.some((p) => p.name === trigger.response) ? (
            <option value={trigger.response}>{trigger.response}</option>
          ) : null}
        </FormSelect>
      </Field>

      <FailureAlertFields
        trigger={trigger}
        disabled={disabled}
        onChange={onChange}
        alertDestinations={alertDestinations}
      />
    </div>
  );
}


function CronFields({ trigger, disabled, onChange, alertDestinations }) {
  const preset = matchCronPreset(trigger.schedule);
  let human = "";
  try {
    human = cronstrue.toString(trigger.schedule || "", { throwExceptionOnParseError: true });
  } catch {
    human = "Invalid cron expression";
  }

  return (
    <div className="space-y-2">
      <label className="form-control">
        <span className="label py-0 text-sm">Preset</span>
        <FormSelect
          value={preset}
          disabled={disabled}
          onChange={(e) => {
            const id = e.target.value;
            if (id === CRON_CUSTOM) return;
            const schedule = scheduleForPreset(id);
            if (schedule) onChange({ ...trigger, schedule });
          }}
        >
          {CRON_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          <option value={CRON_CUSTOM}>Custom</option>
        </FormSelect>
      </label>
      <label className="form-control">
        <span className="label py-0 text-sm">Schedule</span>
        <FormInput
          className="font-mono"
          value={trigger.schedule ?? ""}
          disabled={disabled}
          onChange={(e) => onChange({ ...trigger, schedule: e.target.value })}
          placeholder="* * * * *"
        />
      </label>
      <p className="text-xs opacity-70">{human}</p>
      <p className="text-xs opacity-60">
        Cron runs use this workflow&apos;s top-level <span className="font-mono">data</span> as the payload.
        Set it in YAML or the Test panel prefill.
      </p>
      <FailureAlertFields
        trigger={trigger}
        disabled={disabled}
        onChange={onChange}
        alertDestinations={alertDestinations}
      />
    </div>
  );
}

function FailureAlertFields({ trigger, disabled, onChange, alertDestinations }) {
  return (
    <div className="space-y-3 border-t border-base-300 pt-3">
      <p className="text-sm font-medium opacity-80">Failure alert</p>
      <Field label="Consecutive failures">
        <FormInput
          className="w-full"
          type="number"
          min="1"
          step="1"
          value={trigger.onConsecutiveFailures ?? ""}
          disabled={disabled}
          onChange={(e) =>
            onChange({ ...trigger, onConsecutiveFailures: e.target.value })
          }
          placeholder="e.g. 3"
        />
      </Field>
      <Field
        label="On failure, start"
        hint={
          <>
            After this many sequential failed runs for this trigger, JerapahFlow starts the
            selected workflow (it must declare a <span className="font-mono">workflow</span>{" "}
            trigger).
          </>
        }
      >
        <FormSelect
          className="w-full"
          value={trigger.onFailureWorkflow ?? ""}
          disabled={disabled}
          onChange={(e) => onChange({ ...trigger, onFailureWorkflow: e.target.value })}
        >
          <option value="">None</option>
          {alertDestinations.map((w) => (
            <option key={`${w.owner}/${w.file}`} value={w.name ?? w.file}>
              {w.name ?? w.file}
            </option>
          ))}
          {trigger.onFailureWorkflow &&
          !alertDestinations.some(
            (w) => (w.name ?? w.file) === trigger.onFailureWorkflow,
          ) ? (
            <option value={trigger.onFailureWorkflow}>{trigger.onFailureWorkflow}</option>
          ) : null}
        </FormSelect>
      </Field>
      <label className="label cursor-pointer justify-start gap-3 py-0">
        <input
          type="checkbox"
          className="checkbox checkbox-sm"
          checked={Boolean(trigger.disableOnConsecutiveFailures)}
          disabled={disabled}
          onChange={(e) =>
            onChange({ ...trigger, disableOnConsecutiveFailures: e.target.checked })
          }
        />
        <span className="label-text">
          Disable this workflow when the consecutive failure threshold is reached
        </span>
      </label>
    </div>
  );
}
