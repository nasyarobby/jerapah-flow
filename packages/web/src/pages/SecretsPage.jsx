import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { LuPencil, LuPlus, LuTrash2 } from "react-icons/lu";
import { errorMessage } from "../api/client.js";
import { useDeleteSecret, useOwners, useSecrets } from "../api/hooks.js";
import { ConfirmDialog } from "../components/ConfirmDialog.jsx";
import { FormSelect } from "../components/FormControls.jsx";
import { SecretEditorModal } from "../components/SecretEditorModal.jsx";
import { formatTime } from "../lib/format.jsx";

export function SecretsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { owner: routeOwner, name: routeName } = useParams();
  const [params] = useSearchParams();
  const isNewRoute = /\/secrets\/new\/?$/.test(location.pathname);
  const isEditRoute = Boolean(routeOwner && routeName);

  const { data: owners = [] } = useOwners();
  const [ownerFilter, setOwnerFilter] = useState(
    () => routeOwner || params.get("owner") || "",
  );
  const { data: secrets = [], isLoading } = useSecrets(ownerFilter || undefined);
  const del = useDeleteSecret();
  const [editor, setEditor] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [highlightName, setHighlightName] = useState(() => routeName || "");
  const highlightRef = useRef(null);
  const openedRouteKey = useRef(null);

  const listPath = ownerFilter
    ? `/secrets?owner=${encodeURIComponent(ownerFilter)}`
    : "/secrets";

  function closeEditor() {
    setEditor(null);
    openedRouteKey.current = null;
    if (isNewRoute || isEditRoute) {
      navigate(listPath, { replace: true });
    }
  }

  useEffect(() => {
    if (!isNewRoute) return;
    const key = `new:${params.get("owner") || ""}:${params.get("name") || ""}`;
    if (openedRouteKey.current === key) return;
    if (!params.get("owner") && !ownerFilter && owners.length === 0) return;
    const owner = params.get("owner") || ownerFilter || owners[0] || "default";
    if (params.get("owner")) setOwnerFilter(params.get("owner"));
    openedRouteKey.current = key;
    setEditor({
      mode: "add",
      initial: { owner, name: params.get("name") || "" },
    });
  }, [isNewRoute, params, owners, ownerFilter]);

  useEffect(() => {
    if (!isEditRoute) {
      if (!isNewRoute) openedRouteKey.current = null;
      return;
    }
    if (ownerFilter !== routeOwner) {
      setOwnerFilter(routeOwner);
      return;
    }
    const key = `edit:${routeOwner}/${routeName}`;
    if (openedRouteKey.current === key) return;
    openedRouteKey.current = key;
    setHighlightName(routeName);
    setEditor({
      mode: "replace",
      initial: { owner: routeOwner, name: routeName },
    });
  }, [isEditRoute, isNewRoute, routeOwner, routeName, ownerFilter]);

  useEffect(() => {
    if (!highlightName || isLoading) return;
    highlightRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlightName, isLoading, secrets]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Secrets</h1>
        <div className="flex gap-2">
          <FormSelect
            value={ownerFilter}
            onChange={(e) => {
              setOwnerFilter(e.target.value);
              setHighlightName("");
              navigate(
                e.target.value
                  ? `/secrets?owner=${encodeURIComponent(e.target.value)}`
                  : "/secrets",
                { replace: true },
              );
            }}
          >
            <option value="">all owners</option>
            {owners.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </FormSelect>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() =>
              navigate(
                ownerFilter
                  ? `/secrets/new?owner=${encodeURIComponent(ownerFilter)}`
                  : "/secrets/new",
              )
            }
          >
            <LuPlus className="size-4" />
            Add
          </button>
        </div>
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
                <th>Owner</th>
                <th>Name</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {secrets.map((s) => {
                const highlighted =
                  highlightName &&
                  s.name === highlightName &&
                  (!ownerFilter || s.owner === ownerFilter);
                return (
                  <tr
                    key={s.id}
                    ref={highlighted ? highlightRef : undefined}
                    className={`hover ${highlighted ? "bg-primary/10 outline outline-1 outline-primary/40" : ""}`}
                  >
                    <td className="font-mono">{s.owner}</td>
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
        title={confirmDelete ? `Delete ${confirmDelete.owner}/${confirmDelete.name}?` : ""}
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
