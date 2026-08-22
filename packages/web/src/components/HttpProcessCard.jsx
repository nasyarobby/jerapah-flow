import { LuCircleCheck, LuCircleX } from "react-icons/lu";
import { OpsStatusCard } from "./OpsStatusCard.jsx";

export function HttpProcessCard({
  httpOnline,
  onStart,
  onStop,
  startPending = false,
  stopPending = false,
}) {
  return (
    <OpsStatusCard
      title="HTTP process"
      actions={
        httpOnline ? (
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
        )
      }
    >
      <div className="flex items-center gap-2">
        {httpOnline ? (
          <LuCircleCheck className="size-6 text-success" aria-hidden />
        ) : (
          <LuCircleX className="size-6 text-error" aria-hidden />
        )}
        <span>{httpOnline ? "Running" : "Stopped"}</span>
      </div>
    </OpsStatusCard>
  );
}
