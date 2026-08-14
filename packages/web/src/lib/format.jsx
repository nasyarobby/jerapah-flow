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
  const badges = [];

  if (!workflow.registered) {
    badges.push(
      <span
        key="unregistered"
        className="badge badge-warning badge-sm"
        title="Not listed in registers.yaml; HTTP/cron triggers are not loaded"
      >
        unregistered
      </span>,
    );
  }

  if (workflow.loadError) {
    badges.push(
      <span key="broken" className="badge badge-error badge-sm" title={workflow.loadError}>
        broken
      </span>,
    );
  } else if (!workflow.enabled) {
    badges.push(
      <span key="disabled" className="badge badge-ghost badge-sm">
        disabled
      </span>,
    );
  } else if (workflow.lastStatus === "failed") {
    badges.push(
      <span key="failed" className="badge badge-error badge-sm">
        failed
      </span>,
    );
  } else if (workflow.lastStatus === "running") {
    badges.push(
      <span key="running" className="badge badge-warning badge-sm">
        running
      </span>,
    );
  } else if (workflow.lastStatus === "success") {
    badges.push(
      <span key="working" className="badge badge-success badge-sm">
        working
      </span>,
    );
  } else if (workflow.registered) {
    badges.push(
      <span key="never" className="badge badge-ghost badge-sm">
        never run
      </span>,
    );
  }

  return <span className="inline-flex flex-wrap gap-1">{badges}</span>;
}

export function levelName(level) {
  if (level <= 10) return "trace";
  if (level <= 20) return "debug";
  if (level <= 30) return "info";
  if (level <= 40) return "warn";
  if (level <= 50) return "error";
  return "fatal";
}
