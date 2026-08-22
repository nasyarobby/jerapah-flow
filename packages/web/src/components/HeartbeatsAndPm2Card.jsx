import { useState } from "react";
import { errorMessage } from "../api/client.js";
import { HeartbeatsToolbar } from "./HeartbeatsToolbar.jsx";
import { useNotifications } from "../notifications.jsx";
import { formatBytes, formatCpu, formatDuration } from "../lib/format";

const MAX_WORKERS = 32;

export function HeartbeatsAndPm2Card({
  data,
  children,
  restart,
  processRestart,
  workerCount,
  desiredWorkers,
  onDecreaseWorkers,
  onIncreaseWorkers,
  onScale,
  scalePending = false,
  onReload,
  reloadPending = false,
}) {
  const { notify } = useNotifications();
  const [forceRestart, setForceRestart] = useState(false);
  const [pendingPmId, setPendingPmId] = useState(null);

  async function onRestartAll() {
    const label = forceRestart ? "Force restart" : "Restart";
    if (
      forceRestart &&
      !window.confirm("Force restart will interrupt active jobs. Continue?")
    ) {
      return;
    }

    try {
      await restart.mutateAsync({ force: forceRestart });
      notify.success(`${label} ok`);
    } catch (e) {
      notify.error(errorMessage(e, `${label} failed`));
    }
  }

  async function onProcessRestart(pmId) {
    const id = Number(pmId);
    setPendingPmId(id);
    try {
      await processRestart.mutateAsync({ pmId: id });
      notify.success("Process restart ok");
    } catch (e) {
      notify.error(errorMessage(e, "Process restart failed"));
    } finally {
      setPendingPmId(null);
    }
  }

  const heartbeats = data?.heartbeats ?? [];
  const httpChildren = children?.http ?? [];
  const workerChildren = children?.workers ?? [];
  const pm2Children = [...httpChildren, ...workerChildren];
  const heartbeatByPid = new Map();
  for (const h of heartbeats) {
    if (!heartbeatByPid.has(h.pid)) heartbeatByPid.set(h.pid, h);
  }

  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body gap-4">
        <h2 className="card-title text-lg">Heartbeats</h2>

        <HeartbeatsToolbar
          forceRestart={forceRestart}
          onForceRestartChange={setForceRestart}
          onRestartAll={onRestartAll}
          restartPending={restart.isPending}
          workerCount={workerCount}
          desiredWorkers={desiredWorkers}
          onDecreaseWorkers={onDecreaseWorkers}
          onIncreaseWorkers={onIncreaseWorkers}
          onScale={onScale}
          scalePending={scalePending}
          onReload={onReload}
          reloadPending={reloadPending}
          maxWorkers={MAX_WORKERS}
        />

        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Role</th>
                <th>Name</th>
                <th>PM ID</th>
                <th>Status</th>
                <th>PID</th>
                <th>Generation</th>
                <th>Uptime</th>
                <th>Memory</th>
                <th>CPU</th>
                <th>Restarts</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pm2Children.map((p) => {
                const pid = p.pid ?? null;
                const hb = pid != null ? heartbeatByPid.get(pid) : undefined;
                const role =
                  hb?.role ??
                  (p.name === "jflow-http"
                    ? "http"
                    : p.name === "jflow-worker"
                      ? "worker"
                      : p.name ?? "unknown");
                const generation = hb?.generation ?? p.generation ?? "—";
                const uptimeMs =
                  p.uptime != null
                    ? Math.max(0, Date.now() - Number(p.uptime))
                    : hb
                      ? Math.max(0, Date.now() - hb.ts)
                      : null;

                return (
                  <tr key={p.pmId}>
                    <td>{role}</td>
                    <td className="font-mono">{p.name}</td>
                    <td className="font-mono">{p.pmId}</td>
                    <td>{p.status}</td>
                    <td className="font-mono">{pid ?? "—"}</td>
                    <td className="font-mono">{generation}</td>
                    <td className="font-mono" title={uptimeMs != null ? `${uptimeMs}ms` : undefined}>
                      {formatDuration(uptimeMs)}
                    </td>
                    <td className="font-mono">{formatBytes(p.memory)}</td>
                    <td className="font-mono">{formatCpu(p.cpu)}</td>
                    <td className="font-mono">{p.restarts ?? 0}</td>
                    <td className="text-end">
                      <button
                        type="button"
                        className="btn btn-xs"
                        disabled={
                          processRestart.isPending && pendingPmId === p.pmId
                        }
                        onClick={() => onProcessRestart(p.pmId)}
                      >
                        Restart
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!pm2Children.length ? (
                <tr>
                  <td colSpan={11} className="opacity-60">
                    No PM2 children
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
