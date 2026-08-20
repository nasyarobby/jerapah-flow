import { useState } from "react";
import {
  useOpsBumpGeneration,
  useOpsHttpStart,
  useOpsHttpStop,
  useOpsPause,
  useOpsReload,
  useOpsRestart,
  useOpsResume,
  useOpsScale,
  useOpsStatus,
} from "../api/hooks.js";
import { errorMessage } from "../api/client.js";

function Stat({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide opacity-60">{label}</span>
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
  const bump = useOpsBumpGeneration();
  const [workerCount, setWorkerCount] = useState("");
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const unavailable =
    status.isError &&
    (status.error?.code === "ERR_NETWORK" ||
      status.error?.response?.status === 404 ||
      status.error?.message?.includes("Network"));

  function run(label, mutateAsync, args) {
    setMsg(null);
    setErr(null);
    mutateAsync(args)
      .then((data) => {
        setMsg(`${label} ok`);
        return data;
      })
      .catch((e) => setErr(errorMessage(e, `${label} failed`)));
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

  const data = status.data;
  const desired = data?.desired;
  const queue = data?.queue;
  const children = data?.children;

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

      {msg ? (
        <div className="alert alert-success text-sm">
          <span>{msg}</span>
        </div>
      ) : null}
      {err ? (
        <div className="alert alert-error text-sm">
          <span>{err}</span>
        </div>
      ) : null}

      {status.isLoading && !data ? (
        <span className="loading loading-spinner" />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="HTTP desired" value={desired?.http ?? "—"} />
            <Stat label="Workers desired" value={desired?.workers ?? "—"} />
            <Stat label="Generation" value={desired?.generation ?? "—"} />
            <Stat
              label="Queue"
              value={queue?.paused ? "paused" : "running"}
            />
            <Stat
              label="Active jobs"
              value={queue?.counts?.active ?? "—"}
            />
            <Stat
              label="Waiting jobs"
              value={queue?.counts?.waiting ?? "—"}
            />
            <Stat
              label="HTTP online"
              value={children?.httpOnline ? "yes" : "no"}
            />
            <Stat
              label="Workers online"
              value={children?.workerOnlineCount ?? "—"}
            />
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-medium">Queue</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`btn btn-sm ${queue?.paused ? "btn-disabled" : ""}`}
                disabled={pause.isPending || Boolean(queue?.paused)}
                onClick={() => run("Pause", pause.mutateAsync)}
              >
                Pause workers
              </button>
              <button
                type="button"
                className={`btn btn-sm ${!queue?.paused ? "btn-disabled" : ""}`}
                disabled={resume.isPending || !queue?.paused}
                onClick={() => run("Resume", resume.mutateAsync)}
              >
                Resume workers
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={reload.isPending}
                onClick={() => run("Reload", reload.mutateAsync)}
              >
                Reload workflows
              </button>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-medium">HTTP process</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={httpStart.isPending}
                onClick={() => run("HTTP start", httpStart.mutateAsync)}
              >
                Start HTTP
              </button>
              <button
                type="button"
                className="btn btn-sm btn-warning"
                disabled={httpStop.isPending}
                onClick={() => run("HTTP stop", httpStop.mutateAsync)}
              >
                Stop HTTP
              </button>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-medium">Workers</h2>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                min={0}
                max={32}
                className="input input-bordered input-sm w-24"
                placeholder={String(desired?.workers ?? 1)}
                value={workerCount}
                onChange={(e) => setWorkerCount(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-sm"
                disabled={scale.isPending || workerCount === ""}
                onClick={() =>
                  run("Scale", scale.mutateAsync, {
                    workers: Number(workerCount),
                    force: false,
                  })
                }
              >
                Scale (drain)
              </button>
              <button
                type="button"
                className="btn btn-sm btn-warning"
                disabled={scale.isPending || workerCount === ""}
                onClick={() =>
                  run("Scale force", scale.mutateAsync, {
                    workers: Number(workerCount),
                    force: true,
                  })
                }
              >
                Scale (force)
              </button>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-medium">Restart HTTP + workers</h2>
            <p className="text-sm opacity-70">
              Pauses the queue, waits until active jobs are 0, migrates DB, then
              recreates PM2 processes. Force skips the wait (may interrupt runs).
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={restart.isPending}
                onClick={() => run("Restart", restart.mutateAsync, { force: false })}
              >
                Drain restart
              </button>
              <button
                type="button"
                className="btn btn-sm btn-error"
                disabled={restart.isPending}
                onClick={() => {
                  if (
                    !window.confirm(
                      "Force restart will interrupt active jobs. Continue?",
                    )
                  ) {
                    return;
                  }
                  run("Force restart", restart.mutateAsync, { force: true });
                }}
              >
                Force restart
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={bump.isPending}
                onClick={() =>
                  run("Bump generation", bump.mutateAsync, "manual test flag")
                }
              >
                Flag restart-needed
              </button>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-medium">Heartbeats</h2>
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>PID</th>
                    <th>Generation</th>
                    <th>Age (ms)</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.heartbeats ?? []).map((h) => (
                    <tr key={h.field}>
                      <td>{h.role}</td>
                      <td className="font-mono">{h.pid}</td>
                      <td className="font-mono">{h.generation}</td>
                      <td className="font-mono">
                        {Math.max(0, Date.now() - h.ts)}
                      </td>
                    </tr>
                  ))}
                  {!data?.heartbeats?.length ? (
                    <tr>
                      <td colSpan={4} className="opacity-60">
                        No live heartbeats yet
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-medium">PM2 children</h2>
            <pre className="bg-base-200 max-h-64 overflow-auto rounded-lg p-3 text-xs">
              {JSON.stringify(children ?? {}, null, 2)}
            </pre>
          </section>
        </>
      )}
    </div>
  );
}
