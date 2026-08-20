import { LuCircleCheck, LuCirclePause } from "react-icons/lu";

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
    <div className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body gap-4">
        <h2 className="card-title text-lg">Queue</h2>
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
        <div className="card-actions justify-start px-0">
          {paused ? (
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
          )}
        </div>
      </div>
    </div>
  );
}
