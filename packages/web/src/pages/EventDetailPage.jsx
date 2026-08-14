import { Link, useParams } from "react-router-dom";
import { LuArrowLeft } from "react-icons/lu";
import { useRun } from "../api/hooks.js";
import { LogViewer } from "../components/LogViewer.jsx";
import { formatTime, StatusBadge } from "../lib/format.jsx";

function stepLabel(s) {
  if (s.script === "set") {
    return s.config?.as ? `set:${s.config.as}` : "set";
  }
  return s.script;
}

function isEditableScript(s) {
  return Boolean(s.script) && s.script !== "set";
}

export function EventDetailPage() {
  const { id } = useParams();
  const { data: run, isLoading, error } = useRun(id);

  if (isLoading) return <span className="loading loading-spinner loading-lg" />;
  if (error || !run) return <p className="text-error">Event not found</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/events" className="btn btn-ghost btn-sm btn-square" aria-label="Back">
          <LuArrowLeft className="size-4" />
        </Link>
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
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {(run.steps ?? []).map((s) => (
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
                  <td className="text-error text-xs">{s.error || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <LogViewer logs={run.logs ?? []} />
    </div>
  );
}
