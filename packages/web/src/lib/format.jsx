export function formatTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export function StatusBadge({ status }) {
  const cls =
    status === "success"
      ? "badge-success"
      : status === "failed"
        ? "badge-error"
        : status === "running"
          ? "badge-warning"
          : status === "skipped"
            ? "badge-info"
            : "badge-ghost";
  return <span className={`badge badge-sm ${cls}`}>{status ?? "—"}</span>;
}

/** Config load + last-run health for the workflows list. */
export function WorkflowStatusBadge({ workflow }) {
  if (workflow.loadError) {
    return (
      <span className="badge badge-error badge-sm" title={workflow.loadError}>
        broken
      </span>
    );
  }
  if (!workflow.enabled) {
    return <span className="badge badge-ghost badge-sm">disabled</span>;
  }
  if (workflow.lastStatus === "failed") {
    return <span className="badge badge-error badge-sm">failed</span>;
  }
  if (workflow.lastStatus === "running") {
    return <span className="badge badge-warning badge-sm">running</span>;
  }
  if (workflow.lastStatus === "success") {
    return <span className="badge badge-success badge-sm">working</span>;
  }
  return <span className="badge badge-ghost badge-sm">never run</span>;
}

export function levelName(level) {
  if (level <= 10) return "trace";
  if (level <= 20) return "debug";
  if (level <= 30) return "info";
  if (level <= 40) return "warn";
  if (level <= 50) return "error";
  return "fatal";
}
