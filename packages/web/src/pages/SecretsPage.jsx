import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { LuPencil, LuPlus, LuTrash2 } from "react-icons/lu";
import { errorMessage } from "../api/client.js";
import { useDeleteSecret, useSecrets } from "../api/hooks.js";
import { ConfirmDialog } from "../components/ConfirmDialog.jsx";
import { SecretEditorModal } from "../components/SecretEditorModal.jsx";
import { useRouteDrivenModal } from "../hooks/useRouteDrivenModal.js";
import { formatTime } from "../lib/format";
import { DEFAULT_OWNER } from "../lib/tenant.js";

export function SecretsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { owner: routeOwner, name: routeName } = useParams();
  const [params] = useSearchParams();
  const isNewRoute = /\/secrets\/new\/?$/.test(location.pathname);
  const isEditRoute = Boolean(routeOwner && routeName);

  const { data: secrets = [], isLoading } = useSecrets();
  const del = useDeleteSecret();
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [highlightName, setHighlightName] = useState(() => routeName || "");
  const highlightRef = useRef(null);

  const listPath = "/secrets";

  const { editor, closeEditor } = useRouteDrivenModal({
    isNewRoute,
    isEditRoute,
    listPath,
    newRouteKey: () => `new:${params.get("name") || ""}`,
    canOpenNew: () => true,
    buildNewEditor: () => ({
      mode: "add",
      initial: {
        owner: DEFAULT_OWNER,
        name: params.get("name") || "",
      },
    }),
    editRouteKey: () => `edit:${routeOwner}/${routeName}`,
    canOpenEdit: () => true,
    onOpenEdit: () => setHighlightName(routeName),
    buildEditEditor: () => ({
      mode: "replace",
      initial: { owner: routeOwner, name: routeName },
    }),
    newDeps: [params],
    editDeps: [routeOwner, routeName],
  });

  useEffect(() => {
    if (!highlightName || isLoading) return;
    highlightRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlightName, isLoading, secrets]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Secrets</h1>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => navigate("/secrets/new")}
        >
          <LuPlus className="size-4" />
          Add
        </button>
      </div>

      {isLoading ? (
        <span className="loading loading-spinner" />
      ) : secrets.length === 0 ? (
        <p className="text-sm opacity-60">No secrets yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Name</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {secrets.map((s) => {
                const highlighted =
                  highlightName && s.name === highlightName && s.owner === routeOwner;
                const highlightByNameOnly =
                  highlightName && s.name === highlightName && !routeOwner;
                const isHi = highlighted || highlightByNameOnly;
                return (
                  <tr
                    key={s.id}
                    ref={isHi ? highlightRef : undefined}
                    className={`hover ${isHi ? "bg-primary/10 outline outline-1 outline-primary/40" : ""}`}
                  >
                    <td className="font-mono">{s.name}</td>
                    <td className="whitespace-nowrap">{formatTime(s.updated_at)}</td>
                    <td className="text-right whitespace-nowrap">
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        title="Replace value"
                        aria-label="Replace value"
                        onClick={() =>
                          navigate(
                            `/secrets/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.name)}/edit`,
                          )
                        }
                      >
                        <LuPencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs text-error"
                        title="Delete"
                        aria-label="Delete"
                        onClick={() => setConfirmDelete(s)}
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

      {editor ? (
        <SecretEditorModal
          mode={editor.mode}
          initial={editor.initial}
          onClose={closeEditor}
          onSaved={(saved) => {
            setHighlightName(saved?.name || editor.initial.name);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={confirmDelete ? `Delete ${confirmDelete.name}?` : ""}
        message="This cannot be undone. Workflows that retrieve this name will fail."
        error={del.isError ? errorMessage(del.error) : null}
        loading={del.isPending}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() =>
          del.mutate(confirmDelete.id, { onSuccess: () => setConfirmDelete(null) })
        }
      />
    </div>
  );
}
