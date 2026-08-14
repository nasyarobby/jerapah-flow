import { Link } from "react-router-dom";
import {
  LuActivity,
  LuCode,
  LuGitBranch,
  LuTriangleAlert,
} from "react-icons/lu";
import { useDashboard } from "../api/hooks.js";
import { formatTime, StatusBadge } from "../lib/format.jsx";

export function HomePage() {
  const { data, isLoading, error } = useDashboard();

  if (isLoading) {
    return <span className="loading loading-spinner loading-lg" />;
  }
  if (error) {
    return <p className="text-error">Failed to load dashboard</p>;
  }

  const failed = data.needsAttention?.failed ?? [];
  const broken = data.needsAttention?.brokenWorkflows ?? [];

  return (
    <div className="space-y-6">
      <div className="stats stats-vertical sm:stats-horizontal shadow w-full bg-base-100">
        <div className="stat">
          <div className="stat-figure text-primary">
            <LuGitBranch className="size-7" />
          </div>
          <div className="stat-title">Workflows</div>
          <div className="stat-value text-2xl">{data.workflowCount}</div>
          <div className="stat-desc">{data.enabledCount} enabled</div>
        </div>
        <div className="stat">
          <div className="stat-figure text-secondary">
            <LuCode className="size-7" />
          </div>
          <div className="stat-title">Scripts</div>
          <div className="stat-value text-2xl">{data.scriptCount}</div>
        </div>
        <div className="stat">
          <div className="stat-figure text-warning">
            <LuActivity className="size-7" />
          </div>
          <div className="stat-title">Running</div>
          <div className="stat-value text-2xl">{data.running?.length ?? 0}</div>
        </div>
        <div className="stat">
          <div className="stat-figure text-error">
            <LuTriangleAlert className="size-7" />
          </div>
          <div className="stat-title">Attention</div>
          <div className="stat-value text-2xl">
            {failed.length + broken.length}
          </div>
        </div>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-2">Running</h2>
        <RunList runs={data.running} empty="None" />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Needs attention</h2>
        {broken.length > 0 ? (
          <ul className="mb-3 space-y-1">
            {broken.map((w) => (
              <li key={w.key}>
                <Link
                  className="link link-error"
                  to={`/workflows/${encodeURIComponent(w.owner)}/${encodeURIComponent(w.file)}/edit`}
                >
                  {w.key}: {w.loadError}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <RunList runs={failed} empty={broken.length ? "" : "None"} />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Recent</h2>
        <RunList runs={data.recent} empty="None" />
      </section>
    </div>
  );
}

function RunList({ runs, empty }) {
  if (!runs?.length) {
    return empty ? <p className="opacity-60 text-sm">{empty}</p> : null;
  }
  return (
    <div className="overflow-x-auto">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>Status</th>
            <th>Workflow</th>
            <th>Started</th>
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
              <td className="whitespace-nowrap">{formatTime(r.started_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
