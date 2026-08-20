import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LuArrowLeft, LuRotateCcw, LuTrash2 } from "react-icons/lu";
import { errorMessage } from "../api/client.js";
import {
  usePurgeWorkflowTrash,
  useRestoreWorkflowTrash,
  useWorkflowTrash,
} from "../api/hooks.js";
import { formatTime } from "../lib/format.jsx";
import { useNotifications } from "../notifications.jsx";

function formatAge(ms) {
  if (ms == null || ms < 0) return "—";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function WorkflowTrashPage() {
  const navigate = useNavigate();
  const { notify } = useNotifications();
  const { data: items = [], isLoading } = useWorkflowTrash();
  const restore = useRestoreWorkflowTrash();
  const purge = usePurgeWorkflowTrash();
  const [confirmPurge, setConfirmPurge] = useState(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/workflows" className="btn btn-ghost btn-sm btn-square" aria-label="Back">
          <LuArrowLeft className="size-4" />
        </Link>
        <h1 className="text-xl font-semibold">Workflow trash</h1>
      </div>

      <p className="text-sm opacity-70">
        Deleted workflows are kept for 7 days. Restore to bring them back, or delete permanently
        to remove the file and revision history.
      </p>

      {restore.isError ? (
        <p className="text-error text-sm">{errorMessage(restore.error)}</p>
      ) : null}
      {purge.isError ? (
        <p className="text-error text-sm">{errorMessage(purge.error)}</p>
      ) : null}

      {isLoading ? (
        <span className="loading loading-spinner" />
      ) : !items.length ? (
        <p className="opacity-50">Trash is empty.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Name</th>
                <th>File</th>
                <th>Owner</th>
                <th>Deleted</th>
                <th>Age</th>
                <th>Purge in</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="hover">
                  <td>{item.name ?? "—"}</td>
                  <td className="font-mono text-xs">{item.file}</td>
                  <td className="font-mono text-xs">{item.owner}</td>
                  <td className="whitespace-nowrap">{formatTime(item.deleted_at)}</td>
                  <td>{formatAge(item.age_ms)}</td>
                  <td>
                    {item.days_until_purge <= 0 ? (
                      <span className="text-warning">soon</span>
                    ) : (
                      `${item.days_until_purge}d`
                    )}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      title="Restore"
                      disabled={restore.isPending}
                      onClick={() =>
                        restore.mutate(item.id, {
                          onSuccess: (data) => {
                            notify.success("Workflow restored");
                            navigate(
                              `/workflows/${encodeURIComponent(data.owner)}/${encodeURIComponent(data.file)}/edit`,
                            );
                          },
                        })
                      }
                    >
                      <LuRotateCcw className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs text-error"
                      title="Delete permanently"
                      onClick={() => setConfirmPurge(item)}
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

      {confirmPurge ? (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold">Delete permanently?</h3>
            <p className="mt-2 text-sm">
              {confirmPurge.name ?? confirmPurge.file} ({confirmPurge.owner}/{confirmPurge.file})
              will be removed forever, including revision history.
            </p>
            <div className="modal-action">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setConfirmPurge(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-error"
                disabled={purge.isPending}
                onClick={() =>
                  purge.mutate(confirmPurge.id, {
                    onSuccess: () => {
                      notify.success("Permanently deleted");
                      setConfirmPurge(null);
                    },
                  })
                }
              >
                Delete forever
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button type="button" onClick={() => setConfirmPurge(null)}>
              close
            </button>
          </form>
        </dialog>
      ) : null}
    </div>
  );
}
