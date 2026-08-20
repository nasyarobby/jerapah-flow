import { useEffect, useState } from "react";
import {
  useOpsHttpStart,
  useOpsHttpStop,
  useOpsPause,
  useOpsProcessRestart,
  useOpsReload,
  useOpsRestart,
  useOpsResume,
  useOpsScale,
  useOpsStatus,
} from "../api/hooks.js";
import { errorMessage } from "../api/client.js";
import { HttpProcessCard } from "../components/HttpProcessCard.jsx";
import { QueueCard } from "../components/QueueCard.jsx";
import { ProcessResourcesCard } from "../components/ProcessResourcesCard.jsx";
import { HeartbeatsAndPm2Card } from "../components/HeartbeatsAndPm2Card.jsx";
import { useNotifications } from "../notifications.jsx";

const MAX_WORKERS = 32;

function Stat({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide opacity-60">
        {label}
      </span>
      <span className="font-mono text-sm">{value}</span>
    </div>
  );
}

export function OpsPage() {
  const status = useOpsStatus(true);
  const pause = useOpsPause();
  const resume = useOpsResume();
  const reload = useOpsReload();
  const restart = useOpsRestart();
  const scale = useOpsScale();
  const httpStart = useOpsHttpStart();
  const httpStop = useOpsHttpStop();
  const processRestart = useOpsProcessRestart();
  const { notify } = useNotifications();
  const [workerCount, setWorkerCount] = useState(1);
  const [workerInit, setWorkerInit] = useState(false);

  const unavailable =
    status.isError &&
    (status.error?.code === "ERR_NETWORK" ||
      status.error?.response?.status === 404 ||
      status.error?.message?.includes("Network"));

  const data = status.data;
  const desired = data?.desired;
  const queue = data?.queue;
  const children = data?.children;
  const httpOnline = Boolean(children?.httpOnline);

  useEffect(() => {
    if (!workerInit && desired?.workers != null) {
      setWorkerCount(desired.workers);
      setWorkerInit(true);
    }
  }, [desired?.workers, workerInit]);

  function run(label, mutateAsync, args) {
    const call = args === undefined ? mutateAsync() : mutateAsync(args);
    call
      .then((result) => {
        notify.success(`${label} ok`);
        return result;
      })
      .catch((e) => notify.error(errorMessage(e, `${label} failed`)));
  }

  function scaleWorkers() {
    run("Scale", scale.mutateAsync, {
      workers: workerCount,
      force: false,
    });
  }

  if (unavailable) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">Manage</h1>
        <div className="alert alert-warning">
          <span>
            Control plane is not reachable on <code>/ops</code>. Use{" "}
            <code>pnpm dev:pm2</code> (Vite :8500, control :8600, HTTP :8700) to
            manage processes. Plain <code>pnpm dev</code> runs the monolith and
            has no control API.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Manage</h1>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => status.refetch()}
        >
          Refresh
        </button>
      </div>

      {desired?.restartNeeded ? (
        <div className="alert alert-warning">
          <span>
            Restart needed (generation {desired.generation})
            {desired.restartReason ? `: ${desired.restartReason}` : ""}. Use
            Drain restart after install/config changes.
          </span>
        </div>
      ) : null}

      {status.isLoading && !data ? (
        <span className="loading loading-spinner" />
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-3">
            <HttpProcessCard
              httpOnline={httpOnline}
              startPending={httpStart.isPending}
              stopPending={httpStop.isPending}
              onStart={() => run("HTTP start", httpStart.mutateAsync)}
              onStop={() => run("HTTP stop", httpStop.mutateAsync)}
            />
            <QueueCard
              paused={Boolean(queue?.paused)}
              workersOnline={Number(children?.workerOnlineCount) || 0}
              activeJobs={Number(queue?.counts?.active) || 0}
              queuedJobs={
                (Number(queue?.counts?.waiting) || 0) +
                (Number(queue?.counts?.delayed) || 0)
              }
              pausePending={pause.isPending}
              resumePending={resume.isPending}
              onPause={() => run("Pause", pause.mutateAsync)}
              onResume={() => run("Resume", resume.mutateAsync)}
            />
            <ProcessResourcesCard children={children} />
          </div>

          <HeartbeatsAndPm2Card
            data={data}
            children={children}
            restart={restart}
            processRestart={processRestart}
            workerCount={workerCount}
            desiredWorkers={Number(desired?.workers) || 0}
            onDecreaseWorkers={() => setWorkerCount((n) => Math.max(0, n - 1))}
            onIncreaseWorkers={() =>
              setWorkerCount((n) => Math.min(MAX_WORKERS, n + 1))
            }
            onScale={scaleWorkers}
            scalePending={scale.isPending}
            onReload={() => run("Reload", reload.mutateAsync)}
            reloadPending={reload.isPending}
          />
        </>
      )}
    </div>
  );
}
