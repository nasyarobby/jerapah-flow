import { LuMinus, LuPlus } from "react-icons/lu";

export function HeartbeatsToolbar({
  forceRestart,
  onForceRestartChange,
  onRestartAll,
  restartPending = false,
  workerCount,
  desiredWorkers,
  onDecreaseWorkers,
  onIncreaseWorkers,
  onScale,
  scalePending = false,
  onReload,
  reloadPending = false,
  minWorkers = 0,
  maxWorkers = 32,
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="label cursor-pointer gap-2 px-0">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={forceRestart}
            onChange={(e) => onForceRestartChange(e.target.checked)}
          />
          <span className="label-text">Force</span>
        </label>
        <button
          type="button"
          className={`btn btn-sm ${forceRestart ? "btn-error" : "btn-primary"}`}
          disabled={restartPending}
          onClick={onRestartAll}
        >
          Restart all
        </button>

        <div className="divider divider-horizontal mx-1" />

        <button
          type="button"
          className="btn btn-circle btn-sm"
          aria-label="Decrease workers"
          disabled={workerCount <= minWorkers}
          onClick={onDecreaseWorkers}
        >
          <LuMinus className="size-4" />
        </button>
        <span className="min-w-20 text-center text-sm tabular-nums">
          {workerCount} worker{workerCount === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          className="btn btn-circle btn-sm"
          aria-label="Increase workers"
          disabled={workerCount >= maxWorkers}
          onClick={onIncreaseWorkers}
        >
          <LuPlus className="size-4" />
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={scalePending || workerCount === desiredWorkers}
          onClick={onScale}
        >
          Scale
        </button>

        <div className="divider divider-horizontal mx-1" />

        <button
          type="button"
          className="btn btn-sm"
          disabled={reloadPending}
          onClick={onReload}
        >
          Reload workflows
        </button>
      </div>

      <div className="divider my-0" />
    </div>
  );
}
