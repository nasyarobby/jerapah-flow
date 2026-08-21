import { LuCircleCheck, LuCirclePause } from "react-icons/lu";
import { OpsStatusCard } from "./OpsStatusCard.jsx";

export function QueueCard({
  paused = false,
  workersOnline = 0,
  queuedJobs = 0,
  activeJobs = 0,
  onPause,
  onResume,
  pausePending = false,
  resumePending = false,
}) {
  return (
    <OpsStatusCard
      title="Queue"
      actions={
        paused ? (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={resumePending}
            onClick={onResume}
          >
            Resume workers
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-sm btn-warning"
            disabled={pausePending}
            onClick={onPause}
          >
            Pause workers
          </button>
        )
      }
    >
      <div className="flex items-center gap-2">
        {paused ? (
          <LuCirclePause className="size-6 text-warning" aria-hidden />
        ) : (
          <LuCircleCheck className="size-6 text-success" aria-hidden />
        )}
        <span>
          {paused
            ? "Paused"
            : `Running (${workersOnline} worker${workersOnline === 1 ? "" : "s"})`}
        </span>
      </div>
      <div className="space-y-1 text-sm tabular-nums">
        <p>
          {activeJobs} running job{activeJobs === 1 ? "" : "s"}
        </p>
        <p>
          {queuedJobs} queued job{queuedJobs === 1 ? "" : "s"}
        </p>
      </div>
    </OpsStatusCard>
  );
}
