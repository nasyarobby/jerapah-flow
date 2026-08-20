import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { LuActivity, LuCopy, LuPencil, LuPlay, LuPlus, LuRefreshCw, LuTrash2, LuTriangleAlert } from "react-icons/lu";
import { errorMessage } from "../api/client.js";
import {
  useDeleteWorkflow,
  useReregisterWorkflows,
  useRunWorkflow,
  useSetWorkflowEnabled,
  useWorkflows,
} from "../api/hooks.js";
import { DuplicateWorkflowDialog } from "../components/DuplicateWorkflowDialog.jsx";
import { WorkflowFileIcon } from "../components/WorkflowFileIcon.jsx";
import { formatTime, WorkflowStatusBadge } from "../lib/format.jsx";

export function WorkflowsPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editParam = params.get("edit");
  const { data: workflows = [], isLoading } = useWorkflows();
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [duplicateSource, setDuplicateSource] = useState(null);
  const [runError, setRunError] = useState(null);
  const del = useDeleteWorkflow();
  const run = useRunWorkflow();
  const setEnabled = useSetWorkflowEnabled();
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
  const togglingKey =
    setEnabled.isPending && setEnabled.variables
      ? `${setEnabled.variables.owner}/${setEnabled.variables.file}`
      : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Workflows</h1>
        <div className="flex items-center gap-2">
          <Link to="/workflows/trash" className="btn btn-ghost btn-sm">
            <LuTrash2 className="size-4" />
            Trash
          </Link>
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
      {setEnabled.isError ? (
        <p className="text-error text-sm">{errorMessage(setEnabled.error)}</p>
      ) : null}

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
                      className="link inline-flex items-center gap-2"
                      to={`/workflows/${encodeURIComponent(w.owner)}/${encodeURIComponent(w.file)}/edit`}
                    >
                      <WorkflowFileIcon className="size-7 shrink-0" />
                      {w.name}
                      <span className="block font-mono text-xs opacity-50">{w.file}</span>
                    </Link>
                    {!w.registered ? (
                      <span
                        className="text-warning ml-1 inline-flex align-middle"
                        title="Not listed in registers.yaml"
                      >
                        <LuTriangleAlert className="size-3.5" />
                      </span>
                    ) : null}
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
                    <label className="inline-flex items-center mr-1" title={w.enabled ? "Disable" : "Enable"}>
                      <input
                        type="checkbox"
                        className="toggle toggle-success toggle-xs"
                        checked={Boolean(w.enabled)}
                        disabled={Boolean(w.loadError) || togglingKey === w.key}
                        onChange={() =>
                          setEnabled.mutate({
                            owner: w.owner,
                            file: w.file,
                            enabled: !w.enabled,
                          })
                        }
                      />
                    </label>
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
                      className="btn btn-ghost btn-xs"
                      title="Duplicate"
                      disabled={Boolean(w.loadError)}
                      onClick={() => setDuplicateSource(w)}
                    >
                      <LuCopy className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs text-error"
                      title="Move to trash"
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

      {duplicateSource ? (
        <DuplicateWorkflowDialog
          source={duplicateSource}
          onClose={() => setDuplicateSource(null)}
          onDuplicated={(data) => {
            setDuplicateSource(null);
            navigate(
              `/workflows/${encodeURIComponent(data.owner)}/${encodeURIComponent(data.file)}/edit`,
            );
          }}
        />
      ) : null}

      {confirmDelete ? (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold">Move {confirmDelete.key} to trash?</h3>
            <p className="mt-2 text-sm opacity-70">
              The workflow is removed from the list but kept in trash for 7 days. Revision history
              is preserved.
            </p>
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
                Move to trash
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
