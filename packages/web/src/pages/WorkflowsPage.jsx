import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { LuActivity, LuPencil, LuPlay, LuPlus, LuRefreshCw, LuTrash2 } from "react-icons/lu";
import { errorMessage } from "../api/client.js";
import {
  useDeleteWorkflow,
  useReregisterWorkflows,
  useRunWorkflow,
  useWorkflows,
} from "../api/hooks.js";
import { formatTime, WorkflowStatusBadge } from "../lib/format.jsx";

export function WorkflowsPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editParam = params.get("edit");
  const { data: workflows = [], isLoading } = useWorkflows();
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [runError, setRunError] = useState(null);
  const del = useDeleteWorkflow();
  const run = useRunWorkflow();
  const reregister = useReregisterWorkflows();

  if (editParam) {
    const slash = editParam.indexOf("/");
    if (slash !== -1) {
      const owner = editParam.slice(0, slash);
      const file = editParam.slice(slash + 1);
      return (
        <Navigate
          to={`/workflows/${encodeURIComponent(owner)}/${encodeURIComponent(file)}/edit`}
          replace
        />
      );
    }
  }

  function onRun(w) {
    setRunError(null);
    run.mutate(
      { owner: w.owner, file: w.file },
      {
        onSuccess: (data) => {
          if (data?.runId) navigate(`/events/${data.runId}`);
        },
        onError: (err) => {
          const runId = err?.response?.data?.runId;
          if (runId) {
            navigate(`/events/${runId}`);
            return;
          }
          setRunError(`${w.key}: ${errorMessage(err)}`);
        },
      },
    );
  }

  const runningKey =
    run.isPending && run.variables ? `${run.variables.owner}/${run.variables.file}` : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Workflows</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            title="Reregister workflows"
            disabled={reregister.isPending}
            onClick={() => reregister.mutate()}
          >
            {reregister.isPending ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <LuRefreshCw className="size-4" />
            )}
            Reregister
          </button>
          <Link to="/workflows/new" className="btn btn-primary btn-sm">
            <LuPlus className="size-4" />
            Add
          </Link>
        </div>
      </div>

      {reregister.isError ? (
        <p className="text-error text-sm">{errorMessage(reregister.error)}</p>
      ) : null}

      {runError ? <p className="text-error text-sm">{runError}</p> : null}

      {isLoading ? (
        <span className="loading loading-spinner" />
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Name</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Triggers</th>
                <th>Last run</th>
                <th>Runs</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {workflows.map((w) => (
                <tr key={w.key} className="hover">
                  <td>
                    <Link
                      className="link"
                      to={`/workflows/${encodeURIComponent(w.owner)}/${encodeURIComponent(w.file)}/edit`}
                    >
                      {w.name}
                    </Link>
                  </td>
                  <td className="font-mono text-xs">{w.owner}</td>
                  <td>
                    <WorkflowStatusBadge workflow={w} />
                  </td>
                  <td>
                    <TriggerList triggers={w.triggers} />
                  </td>
                  <td className="whitespace-nowrap">{formatTime(w.lastInvokedAt)}</td>
                  <td>{w.invocationCount}</td>
                  <td className="text-right whitespace-nowrap">
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      title="Run"
                      disabled={Boolean(w.loadError) || runningKey === w.key}
                      onClick={() => onRun(w)}
                    >
                      {runningKey === w.key ? (
                        <span className="loading loading-spinner loading-xs" />
                      ) : (
                        <LuPlay className="size-4" />
                      )}
                    </button>
                    <Link
                      className="btn btn-ghost btn-xs"
                      title="Events"
                      to={`/events?workflow=${encodeURIComponent(w.key)}`}
                    >
                      <LuActivity className="size-4" />
                    </Link>
                    <Link
                      className="btn btn-ghost btn-xs"
                      title="Edit"
                      to={`/workflows/${encodeURIComponent(w.owner)}/${encodeURIComponent(w.file)}/edit`}
                    >
                      <LuPencil className="size-4" />
                    </Link>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs text-error"
                      title="Delete"
                      onClick={() => setConfirmDelete(w)}
                    >
                      <LuTrash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmDelete ? (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold">Delete {confirmDelete.key}?</h3>
            {del.isError ? (
              <p className="text-error text-sm mt-2">{errorMessage(del.error)}</p>
            ) : null}
            <div className="modal-action">
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-error"
                disabled={del.isPending}
                onClick={() =>
                  del.mutate(
                    { owner: confirmDelete.owner, file: confirmDelete.file },
                    { onSuccess: () => setConfirmDelete(null) },
                  )
                }
              >
                Delete
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button type="button" onClick={() => setConfirmDelete(null)}>
              close
            </button>
          </form>
        </dialog>
      ) : null}
    </div>
  );
}

function triggerLabel(t) {
  const type = String(t?.type ?? "").toLowerCase();
  if (type === "cron") return t.schedule || "cron";
  if (type === "http") return t.path || "/";
  if (type === "workflow") return "";
  return t?.type ?? "—";
}

function triggerKind(t) {
  const type = String(t?.type ?? "").toLowerCase();
  if (type === "http") return t.method || "POST";
  if (type === "workflow") return "workflow";
  return t?.type ?? "—";
}

function TriggerList({ triggers }) {
  if (!triggers?.length) return <span className="opacity-50">—</span>;
  return (
    <ul className="space-y-0.5">
      {triggers.map((t, i) => (
        <li key={i} className="font-mono text-xs whitespace-nowrap">
          <span className="opacity-60">{triggerKind(t)}</span> {triggerLabel(t)}
        </li>
      ))}
    </ul>
  );
}
