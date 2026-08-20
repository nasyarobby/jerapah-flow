import { useEffect, useMemo, useRef, useState } from "react";
import { LuChevronDown, LuCopy, LuGripVertical, LuTrash2, LuX } from "react-icons/lu";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import cronstrue from "cronstrue";
import { namespacedPath, HTTP_METHODS, triggerDestinations } from "../../lib/workflow-doc.js";
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
  workflows = [],
  excludeFile,
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
  const failure =
    trigger.onConsecutiveFailures && trigger.onFailureWorkflow
      ? ` · onFailure@${trigger.onFailureWorkflow}`
      : "";
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
        <select
          className="select select-bordered select-sm w-full"
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
      </Field>

      <Field label="Path">
        <input
          className="input input-bordered input-sm w-full font-mono"
          value={trigger.path ?? ""}
          disabled={disabled}
          onChange={(e) => onChange({ ...trigger, path: e.target.value })}
          placeholder="/hook"
        />
      </Field>

      <Field label="URL">
        <div className="flex w-full items-center gap-1">
          <input
            className="input input-bordered input-sm w-full font-mono opacity-80"
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
        <select
          className="select select-bordered select-sm w-full"
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

/**
 * Searchable dropdown: pick an auth to add; chips with X to remove.
 * YAML stores profile UUIDs; UI shows names.
 */
function AuthPicker({ auths, selectedIds, inlineCount, disabled, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const byId = useMemo(() => new Map(auths.map((a) => [a.id, a])), [auths]);

  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return auths
      .filter((a) => !selectedSet.has(a.id))
      .filter((a) => {
        if (!q) return true;
        return (
          a.name.toLowerCase().includes(q) ||
          String(a.type).toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q)
        );
      });
  }, [auths, selectedSet, query]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function addAuth(id) {
    if (selectedSet.has(id)) return;
    onChange([...selectedIds, id]);
    setQuery("");
    setOpen(false);
  }

  function removeAuth(id) {
    onChange(selectedIds.filter((x) => x !== id));
  }

  return (
    <div className="flex w-full flex-col gap-1" ref={rootRef}>
      <span className="text-sm font-medium opacity-80">Auth (any of)</span>

      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedIds.map((id) => {
            const auth = byId.get(id);
            return (
              <span
                key={id}
                className="badge badge-outline gap-1 h-7 px-2 font-normal"
                title={id}
              >
                <span className="max-w-[10rem] truncate">
                  {auth ? (
                    <>
                      {auth.name}
                      <span className="opacity-60"> · {auth.type}</span>
                    </>
                  ) : (
                    <span className="opacity-60">missing</span>
                  )}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs btn-square -mr-1"
                  title="Remove"
                  aria-label={`Remove ${auth?.name ?? id}`}
                  disabled={disabled}
                  onClick={() => removeAuth(id)}
                >
                  <LuX className="size-3.5" />
                </button>
              </span>
            );
          })}
        </div>
      ) : null}

      <div className="relative w-full">
        <div className="join w-full">
          <input
            ref={inputRef}
            type="search"
            className="input input-bordered input-sm join-item w-full min-w-0"
            placeholder={auths.length === 0 ? "No auth profiles yet" : "Add auth…"}
            value={query}
            disabled={disabled || auths.length === 0}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                setQuery("");
                inputRef.current?.blur();
              }
              if (e.key === "Enter") {
                e.preventDefault();
                if (available[0]) addAuth(available[0].id);
              }
            }}
          />
          <button
            type="button"
            className="btn btn-sm join-item btn-square"
            disabled={disabled || auths.length === 0}
            aria-label="Open auth list"
            onClick={() => {
              setOpen((v) => !v);
              if (!open) inputRef.current?.focus();
            }}
          >
            <LuChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
        {open && !disabled && auths.length > 0 ? (
          <ul className="menu menu-sm absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-box border border-base-300 bg-base-100 shadow-lg p-1">
            {available.length === 0 ? (
              <li className="disabled">
                <span className="opacity-60">
                  {query.trim() ? "No matches" : "All profiles selected"}
                </span>
              </li>
            ) : (
              available.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => addAuth(a.id)}>
                    <span className="font-mono text-sm">{a.name}</span>
                    <span className="opacity-60 text-xs">{a.type}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>

      {inlineCount > 0 ? (
        <span className="text-xs opacity-60">
          + {inlineCount} inline auth{inlineCount === 1 ? "" : "s"} (edit in YAML)
        </span>
      ) : null}
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
        <input
          className="input input-bordered input-sm w-full"
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
        <select
          className="select select-bordered select-sm w-full"
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
        </select>
      </Field>
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
