import { Link } from "react-router-dom";
import {
  LuActivity,
  LuCode,
  LuGitBranch,
  LuTriangleAlert,
} from "react-icons/lu";
import { useDashboard } from "../api/hooks.js";
import { formatTime, StatusBadge } from "../lib/format";

export function HomePage() {
  const { data, isLoading, error } = useDashboard();

  if (isLoading) {
    return <span className="loading loading-spinner loading-lg" />;
  }
  if (error) {
    return <p className="text-error">Failed to load dashboard</p>;
  }

  const streaks = data.needsAttention?.consecutiveFailures ?? [];
  const streakCount = data.needsAttention?.consecutiveFailureCount ?? streaks.length;
  const broken = data.needsAttention?.brokenWorkflows ?? [];
  const failedEvents = data.failedEvents ?? [];

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
          <div className="stat-title">Active</div>
          <div className="stat-value text-2xl">{data.running?.length ?? 0}</div>
        </div>
        <div className="stat">
          <div className="stat-figure text-error">
            <LuTriangleAlert className="size-7" />
          </div>
          <div className="stat-title">Attention</div>
          <div className="stat-value text-2xl">{streakCount + broken.length}</div>
        </div>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-2">Queued / running</h2>
        <RunList runs={data.running} empty="None" />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="min-w-0">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">Needs attention</h2>
            <Link className="link link-hover text-sm" to="/failures">
              Show all
            </Link>
          </div>
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
          <StreakList streaks={streaks} empty={broken.length ? "" : "None"} />
        </section>

        <section className="min-w-0">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">Failed events</h2>
            <Link className="link link-hover text-sm" to="/events?status=failed">
              View all
            </Link>
          </div>
          <RunList runs={failedEvents} empty="None" />
        </section>

        <section className="min-w-0">
          <h2 className="text-lg font-semibold mb-2">Recent</h2>
          <RunList runs={data.recent} empty="None" />
        </section>
      </div>
    </div>
  );
}

function StreakList({ streaks, empty }) {
  if (!streaks?.length) {
    return empty ? <p className="opacity-60 text-sm">{empty}</p> : null;
  }
  return (
    <div className="overflow-x-auto">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>Streak</th>
            <th>Workflow</th>
            <th>Last failed</th>
          </tr>
        </thead>
        <tbody>
          {streaks.map((s) => (
            <tr key={`${s.workflow}\0${s.trigger_type}\0${s.trigger_detail ?? ""}`} className="hover">
              <td>
                <span className="badge badge-error badge-sm">{s.consecutiveFailures}</span>
              </td>
              <td>
                <Link className="link" to={`/events/${s.lastRun.id}`}>
                  {s.workflow_name || s.workflow}
                </Link>
              </td>
              <td className="whitespace-nowrap">{formatTime(s.lastRun.started_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
