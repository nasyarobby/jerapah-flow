import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { LuArrowLeft, LuFilter } from "react-icons/lu";
import { useRun } from "../api/hooks.js";
import { LogViewer } from "../components/LogViewer.jsx";
import { formatTime, StatusBadge } from "../lib/format.jsx";

function stepLabel(s) {
  if (s.script === "set") {
    return s.config?.as ? `set:${s.config.as}` : "set";
  }
  return s.script;
}

function filterLabel(s) {
  return `#${s.step_index} ${stepLabel(s)}`;
}

function isEditableScript(s) {
  return Boolean(s.script) && s.script !== "set";
}

export function EventDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: run, isLoading, error } = useRun(id);
  const [stepFilters, setStepFilters] = useState([]);

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
              {steps.map((s) => (
                <tr key={s.id}>
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
                    {s.error || ""}
                  </td>
                  <td className="text-right">
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
              ))}
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
