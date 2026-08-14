import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { LuArrowLeft } from "react-icons/lu";
import { useRun } from "../api/hooks.js";
import { formatTime, levelName, StatusBadge } from "../lib/format.jsx";

export function EventDetailPage() {
  const { id } = useParams();
  const { data: run, isLoading, error } = useRun(id);
  const [wordWrap, setWordWrap] = useState(true);

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
                    <Link className="link" to={`/scripts?edit=${encodeURIComponent(s.script)}`}>
                      {s.script}
                    </Link>
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

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-semibold">Logs</h2>
          <label className="label cursor-pointer gap-2 py-0">
            <span className="label-text text-sm">Word wrap</span>
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={wordWrap}
              onChange={(e) => setWordWrap(e.target.checked)}
            />
          </label>
        </div>
        <div className="mockup-code text-xs max-h-[50vh] overflow-auto">
          {(run.logs ?? []).length === 0 ? (
            <div className="flex gap-3 px-5 py-0.5 font-mono opacity-50">
              <span className="w-12 shrink-0 text-right">—</span>
              <span>no logs</span>
            </div>
          ) : (
            run.logs.map((l) => (
              <div key={l.id} className="flex gap-3 px-5 py-0.5 font-mono">
                <span className="w-12 shrink-0 text-right opacity-50">
                  {levelName(l.level)}
                </span>
                <span
                  className={
                    wordWrap
                      ? "min-w-0 flex-1 whitespace-pre-wrap break-words"
                      : "whitespace-pre"
                  }
                >
                  {l.ts} {l.msg ?? ""}
                  {l.payload ? ` ${JSON.stringify(l.payload)}` : ""}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
