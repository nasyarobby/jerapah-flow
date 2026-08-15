import { useState } from "react";
import { LuChevronDown, LuCopy, LuGripVertical, LuTrash2 } from "react-icons/lu";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import cronstrue from "cronstrue";
import { namespacedPath, HTTP_METHODS } from "../../lib/workflow-doc.js";
import { CRON_CUSTOM, CRON_PRESETS, matchCronPreset, scheduleForPreset } from "../../lib/cron-presets.js";

export function TriggerCard({
  trigger,
  index,
  owner,
  onChange,
  onRemove,
  disabled,
  auths = [],
  pages = [],
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: trigger.uiId,
    disabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const type = trigger.type;
  const [expanded, setExpanded] = useState(false);

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
            aria-label={`Drag trigger ${index + 1}`}
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
              />
            ) : null}
            {type === "cron" ? (
              <CronFields trigger={trigger} disabled={disabled} onChange={onChange} />
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
  if (type === "HTTP") {
    return `${trigger.method || "POST"} ${namespacedPath(owner || "owner", trigger.path || "/")}`;
  }
  if (type === "cron") return trigger.schedule || "";
  if (type === "workflow") return "callable";
  return "";
}

function typeLabel(type) {
  if (type === "HTTP") return "HTTP";
  if (type === "cron") return "Cron";
  if (type === "workflow") return "Workflow";
  return type || "Trigger";
}

function HttpFields({ trigger, owner, disabled, onChange, auths, pages }) {
  const path = trigger.path || "/";
  const url = namespacedPath(owner || "owner", path);
  const authIsInline = trigger.auth != null && typeof trigger.auth === "object";
  const authSelect = authIsInline
    ? "__inline__"
    : typeof trigger.auth === "string" && trigger.auth
      ? trigger.auth
      : "";

  function copyUrl() {
    if (typeof navigator?.clipboard?.writeText === "function") {
      navigator.clipboard.writeText(url);
    }
  }

  return (
    <div className="space-y-2">
      <label className="form-control">
        <span className="label py-0 text-sm">Method</span>
        <select
          className="select select-sm"
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
        </select>
      </label>
      <label className="form-control">
        <span className="label py-0 text-sm">Path</span>
        <input
          className="input input-sm font-mono"
          value={trigger.path ?? ""}
          disabled={disabled}
          onChange={(e) => onChange({ ...trigger, path: e.target.value })}
          placeholder="/hook"
        />
      </label>
      <div className="flex items-center gap-2 text-xs font-mono opacity-80">
        <span className="truncate">{url}</span>
        <button type="button" className="btn btn-ghost btn-xs btn-square" title="Copy URL" onClick={copyUrl}>
          <LuCopy className="size-3.5" />
        </button>
      </div>
      <label className="form-control">
        <span className="label py-0 text-sm">Auth</span>
        <select
          className="select select-sm"
          value={authSelect}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "" || v === "__inline__") {
              onChange({ ...trigger, auth: v === "__inline__" ? trigger.auth : null });
            } else {
              onChange({ ...trigger, auth: v });
            }
          }}
        >
          <option value="">None</option>
          {auths.map((a) => (
            <option key={a.name} value={a.name}>
              {a.name}
            </option>
          ))}
          {authIsInline ? <option value="__inline__">Inline (edit in YAML)</option> : null}
        </select>
      </label>
      <label className="form-control">
        <span className="label py-0 text-sm">Response page</span>
        <select
          className="select select-sm"
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
        </select>
      </label>
    </div>
  );
}

function CronFields({ trigger, disabled, onChange }) {
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
        <select
          className="select select-sm"
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
        </select>
      </label>
      <label className="form-control">
        <span className="label py-0 text-sm">Schedule</span>
        <input
          className="input input-sm font-mono"
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
    </div>
  );
}

export function AddTriggerDialog({ open, onClose, onPick }) {
  const [kind, setKind] = useState("HTTP");
  if (!open) return null;

  return (
    <dialog className="modal modal-open">
      <div className="modal-box">
        <h3 className="font-bold text-lg">Add trigger</h3>
        <div className="form-control mt-3">
          <label className="label cursor-pointer justify-start gap-3">
            <input
              type="radio"
              name="trig-kind"
              className="radio radio-sm"
              checked={kind === "HTTP"}
              onChange={() => setKind("HTTP")}
            />
            <span>HTTP — webhook at <span className="font-mono">/u/owner/path</span></span>
          </label>
          <label className="label cursor-pointer justify-start gap-3">
            <input
              type="radio"
              name="trig-kind"
              className="radio radio-sm"
              checked={kind === "cron"}
              onChange={() => setKind("cron")}
            />
            <span>Cron — run on a schedule</span>
          </label>
          <label className="label cursor-pointer justify-start gap-3">
            <input
              type="radio"
              name="trig-kind"
              className="radio radio-sm"
              checked={kind === "workflow"}
              onChange={() => setKind("workflow")}
            />
            <span>Workflow — callable by other workflows</span>
          </label>
        </div>
        <div className="modal-action">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onPick(kind);
              setKind("HTTP");
            }}
          >
            Add
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
