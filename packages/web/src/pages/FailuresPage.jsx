import { Link } from "react-router-dom";
import { useConsecutiveFailures } from "../api/hooks.js";
import { formatTime } from "../lib/format";

export function FailuresPage() {
  const { data, isLoading, error } = useConsecutiveFailures();
  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Failures</h1>
      <p className="opacity-70 text-sm">
        Workflows that have failed 4 or more times in a row for the same trigger.
      </p>
      {isLoading ? (
        <span className="loading loading-spinner" />
      ) : error ? (
        <p className="text-error">Failed to load consecutive failures</p>
      ) : items.length === 0 ? (
        <p className="opacity-60 text-sm">None</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Streak</th>
                <th>Workflow</th>
                <th>Trigger</th>
                <th>Last error</th>
                <th>Last failed</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr
                  key={`${s.workflow}\0${s.trigger_type}\0${s.trigger_detail ?? ""}`}
                  className="hover"
                >
                  <td>
                    <span className="badge badge-error badge-sm">{s.consecutiveFailures}</span>
                  </td>
                  <td>
                    <Link className="link" to={`/events/${s.lastRun.id}`}>
                      {s.workflow_name || s.workflow}
                    </Link>
                  </td>
                  <td className="text-xs">
                    {s.trigger_type}
                    {s.trigger_detail ? ` · ${s.trigger_detail}` : ""}
                  </td>
                  <td className="max-w-md truncate text-xs" title={s.lastRun.error ?? ""}>
                    {s.lastRun.error || "—"}
                  </td>
                  <td className="whitespace-nowrap">{formatTime(s.lastRun.started_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
