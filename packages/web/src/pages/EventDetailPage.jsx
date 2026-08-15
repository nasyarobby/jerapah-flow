import { useMemo, useState, Fragment } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { LuArrowLeft, LuFilter } from "react-icons/lu";
import { useRun } from "../api/hooks.js";
import { LogViewer } from "../components/LogViewer.jsx";
import { formatTime, StatusBadge } from "../lib/format.jsx";
import { prettyJson } from "../lib/script.js";

function stepLabel(s) {
  if (s.script === "set") return "set";
  return s.script;
}

function filterLabel(s) {
  return `#${s.step_index} ${stepLabel(s)}`;
}

function isEditableScript(s) {
  return Boolean(s.script) && s.script !== "set";
}

function JsonBlock({ title, value }) {
  if (value == null || value === "") return null;
  const text = prettyJson(value);
  if (!text) return null;
  return (
    <details className="collapse collapse-arrow border border-base-300 bg-base-100">
      <summary className="collapse-title min-h-0 py-2 text-sm font-semibold">{title}</summary>
      <div className="collapse-content">
        <pre className="max-h-80 overflow-auto rounded-box bg-base-200 p-3 font-mono text-xs">
          {text}
        </pre>
      </div>
    </details>
  );
}

function envelopeParts(raw) {
  if (raw != null && typeof raw === "object" && !Array.isArray(raw) && ("output" in raw || "context" in raw)) {
    return {
      output: "output" in raw ? raw.output : undefined,
      context: "context" in raw ? raw.context : undefined,
      skipRemaining: raw.skipRemaining === true,
    };
  }
  return { output: raw, context: undefined, skipRemaining: false };
}

export function EventDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: run, isLoading, error } = useRun(id);
  const [stepFilters, setStepFilters] = useState([]);
  const [openStep, setOpenStep] = useState(null);

  function goBack() {
    const idx = window.history.state?.idx;
    if (typeof idx === "number" && idx > 0) {
      navigate(-1);
      return;
    }
    navigate("/events");
  }

  const steps = run?.steps ?? [];
  const logs = run?.logs ?? [];
  const logFilters = useMemo(
    () =>
      stepFilters
        .map((stepId) => steps.find((s) => s.id === stepId))
        .filter(Boolean)
        .map((s) => ({ id: s.id, label: filterLabel(s) })),
    [stepFilters, steps],
  );
  const visibleLogs = useMemo(() => {
    if (stepFilters.length === 0) return logs;
    const ids = new Set(stepFilters);
    return logs.filter((l) => ids.has(l.step_id));
  }, [logs, stepFilters]);

  function toggleStepFilter(stepId) {
    setStepFilters((prev) =>
      prev.includes(stepId) ? prev.filter((id) => id !== stepId) : [...prev, stepId],
    );
  }

  if (isLoading) return <span className="loading loading-spinner loading-lg" />;
  if (error || !run) return <p className="text-error">Event not found</p>;

  const runParts = envelopeParts(run.output);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button type="button" className="btn btn-ghost btn-sm btn-square" aria-label="Back" onClick={goBack}>
          <LuArrowLeft className="size-4" />
        </button>
        <h1 className="text-xl font-semibold truncate">{run.workflow_name || run.workflow}</h1>
        <StatusBadge status={run.status} />
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <div>
          <dt className="opacity-60">Started</dt>
          <dd>{formatTime(run.started_at)}</dd>
        </div>
        <div>
          <dt className="opacity-60">Finished</dt>
          <dd>{formatTime(run.finished_at)}</dd>
        </div>
        <div>
          <dt className="opacity-60">Trigger</dt>
          <dd>
            {run.trigger_type}
            {run.trigger_detail ? ` · ${run.trigger_detail}` : ""}
          </dd>
        </div>
        <div>
          <dt className="opacity-60">Duration</dt>
          <dd>{run.duration_ms != null ? `${run.duration_ms}ms` : "—"}</dd>
        </div>
      </dl>

      {run.error ? (
        <div role="alert" className="alert alert-error text-sm">
          {run.error}
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <JsonBlock title="Run input (data)" value={run.input} />
        <JsonBlock title="Run output" value={runParts.output} />
        <JsonBlock title="Run context" value={runParts.context} />
      </div>
      {runParts.skipRemaining ? (
        <p className="text-sm opacity-70">This run stopped early (<span className="font-mono">skipRemaining</span>).</p>
      ) : null}

      <section>
        <h2 className="font-semibold mb-2">Steps</h2>
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>#</th>
                <th>Script</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Detail</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {steps.map((s) => {
                const parts = envelopeParts(s.output);
                const open = openStep === s.id;
                return (
                  <Fragment key={s.id}>
                    <tr>
                      <td>{s.step_index}</td>
                      <td className="font-mono">
                        {isEditableScript(s) ? (
                          <Link className="link" to={`/scripts/${encodeURIComponent(s.script)}/edit`}>
                            {stepLabel(s)}
                          </Link>
                        ) : (
                          stepLabel(s)
                        )}
                      </td>
                      <td>
                        <StatusBadge status={s.status} />
                      </td>
                      <td>{s.duration_ms != null ? `${s.duration_ms}ms` : "—"}</td>
                      <td
                        className={
                          s.status === "skipped" ? "opacity-60 text-xs" : "text-error text-xs"
                        }
                      >
                        {s.error || (parts.skipRemaining ? "skipRemaining" : "")}
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          onClick={() => setOpenStep(open ? null : s.id)}
                        >
                          I/O
                        </button>
                        <button
                          type="button"
                          className={`btn btn-ghost btn-xs btn-square ${stepFilters.includes(s.id) ? "btn-active" : ""}`}
                          aria-label={`Filter logs for ${filterLabel(s)}`}
                          aria-pressed={stepFilters.includes(s.id)}
                          onClick={() => toggleStepFilter(s.id)}
                        >
                          <LuFilter className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                    {open ? (
                      <tr>
                        <td colSpan={6} className="bg-base-200">
                          <div className="grid gap-2 p-2 sm:grid-cols-2">
                            <JsonBlock title="output" value={parts.output} />
                            <JsonBlock title="context" value={parts.context} />
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <LogViewer
        logs={visibleLogs}
        filters={logFilters}
        onRemoveFilter={(stepId) => toggleStepFilter(stepId)}
      />
    </div>
  );
}
