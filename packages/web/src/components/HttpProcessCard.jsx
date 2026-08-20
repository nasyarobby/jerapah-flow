import { LuCircleCheck, LuCircleX } from "react-icons/lu";

export function HttpProcessCard({
  httpOnline,
  onStart,
  onStop,
  startPending = false,
  stopPending = false,
}) {
  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body gap-4">
        <h2 className="card-title text-lg">HTTP process</h2>
        <div className="flex items-center gap-2">
          {httpOnline ? (
            <LuCircleCheck className="size-6 text-success" aria-hidden />
          ) : (
            <LuCircleX className="size-6 text-error" aria-hidden />
          )}
          <span>{httpOnline ? "Running" : "Stopped"}</span>
        </div>
        <div className="card-actions justify-start px-0">
          {httpOnline ? (
            <button
              type="button"
              className="btn btn-sm btn-warning"
              disabled={stopPending}
              onClick={onStop}
            >
              Stop HTTP
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={startPending}
              onClick={onStart}
            >
              Start HTTP
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
