import { Link, useSearchParams } from "react-router-dom";
import { useRuns } from "../api/hooks.js";
import { formatTime, StatusBadge } from "../lib/format.jsx";

export function EventsPage() {
  const [params, setParams] = useSearchParams();
  const workflow = params.get("workflow") || "";
  const status = params.get("status") || "";
  const { data: runs = [], isLoading } = useRuns({
    workflow: workflow || undefined,
    status: status || undefined,
    limit: 100,
  });

  function update(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{status === "failed" ? "Failed events" : "Events"}</h1>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          className="input input-sm w-full sm:max-w-sm"
          placeholder="workflow key (* wildcard)"
          value={workflow}
          onChange={(e) => update("workflow", e.target.value)}
        />
        <select
          className="select select-sm w-full sm:max-w-xs"
          value={status}
          onChange={(e) => update("status", e.target.value)}
        >
          <option value="">all statuses</option>
          <option value="running">running</option>
          <option value="success">success</option>
          <option value="failed">failed</option>
          <option value="skipped">skipped</option>
        </select>
      </div>
      {isLoading ? (
        <span className="loading loading-spinner" />
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Status</th>
                <th>Workflow</th>
                <th>Trigger</th>
                <th>Started</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="hover">
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td>
                    <Link className="link" to={`/events/${r.id}`}>
                      {r.workflow_name || r.workflow}
                    </Link>
                  </td>
                  <td className="text-xs">
                    {r.trigger_type}
                    {r.trigger_detail ? ` · ${r.trigger_detail}` : ""}
                  </td>
                  <td className="whitespace-nowrap">{formatTime(r.started_at)}</td>
                  <td>{r.duration_ms != null ? `${r.duration_ms}ms` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
