import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { LuPencil, LuPlay, LuPlus, LuTrash2 } from "react-icons/lu";
import { errorMessage } from "../api/client.js";
import { useDeleteScript, useScripts } from "../api/hooks.js";

export function ScriptsPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const editName = params.get("edit");
  const { data: scripts = [], isLoading } = useScripts();
  const [confirmDelete, setConfirmDelete] = useState(null);
  const del = useDeleteScript();

  if (editName) {
    return <Navigate to={`/scripts/${encodeURIComponent(editName)}/edit`} replace />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Scripts</h1>
        <Link to="/scripts/new" className="btn btn-primary btn-sm">
          <LuPlus className="size-4" />
          Add
        </Link>
      </div>

      {isLoading ? (
        <span className="loading loading-spinner" />
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody>
              {scripts.map((s) => {
                const name = typeof s === "string" ? s : s.name;
                const description = typeof s === "string" ? "" : s.meta?.description;
                const metaError = typeof s === "string" ? null : s.metaError;
                return (
                <tr key={name} className="hover">
                  <td className="font-mono">
                    <Link className="link" to={`/scripts/${encodeURIComponent(name)}/edit`}>
                      {name}
                    </Link>
                  </td>
                  <td className="max-w-xl truncate text-sm opacity-80">
                    {metaError ? (
                      <span className="text-error">{metaError}</span>
                    ) : (
                      description || "—"
                    )}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      title="Dry run"
                      onClick={() =>
                        navigate(`/scripts/${encodeURIComponent(name)}/dry-run`)
                      }
                    >
                      <LuPlay className="size-4" />
                    </button>
                    <Link
                      to={`/scripts/${encodeURIComponent(name)}/edit`}
                      className="btn btn-ghost btn-xs"
                      title="Edit"
                    >
                      <LuPencil className="size-4" />
                    </Link>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs text-error"
                      title="Delete"
                      onClick={() => setConfirmDelete(name)}
                    >
                      <LuTrash2 className="size-4" />
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {confirmDelete ? (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold">Delete {confirmDelete}?</h3>
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
                  del.mutate(confirmDelete, {
                    onSuccess: () => setConfirmDelete(null),
                  })
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
