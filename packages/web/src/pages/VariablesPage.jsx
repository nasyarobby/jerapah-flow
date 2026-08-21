import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { LuPencil, LuPlus, LuTrash2 } from "react-icons/lu";
import { errorMessage } from "../api/client.js";
import { useDeleteVariable, useOwners, useVariables } from "../api/hooks.js";
import { ConfirmDialog } from "../components/ConfirmDialog.jsx";
import { FormSelect } from "../components/FormControls.jsx";
import { VariableEditorModal } from "../components/VariableEditorModal.jsx";
import { formatTime } from "../lib/format.jsx";

function displayValue(value) {
  if (typeof value === "string") return value === "" ? '""' : value;
  return String(value);
}

export function VariablesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { owner: routeOwner, name: routeName } = useParams();
  const [params] = useSearchParams();
  const isNewRoute = /\/variables\/new\/?$/.test(location.pathname);
  const isEditRoute = Boolean(routeOwner && routeName);

  const { data: owners = [] } = useOwners();
  const [ownerFilter, setOwnerFilter] = useState(
    () => routeOwner || params.get("owner") || "",
  );
  const { data: variables = [], isLoading } = useVariables(ownerFilter || undefined);
  const del = useDeleteVariable();
  const [editor, setEditor] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [highlightName, setHighlightName] = useState(() => routeName || "");
  const highlightRef = useRef(null);
  const openedRouteKey = useRef(null);

  const listPath = ownerFilter
    ? `/variables?owner=${encodeURIComponent(ownerFilter)}`
    : "/variables";

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
      initial: {
        owner,
        name: params.get("name") || "",
        type: "string",
        value: "",
      },
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
    if (isLoading) return;
    const key = `edit:${routeOwner}/${routeName}`;
    if (openedRouteKey.current === key) return;
    openedRouteKey.current = key;
    setHighlightName(routeName);
    const row = variables.find((v) => v.owner === routeOwner && v.name === routeName);
    if (row) {
      setEditor({
        mode: "edit",
        initial: {
          owner: row.owner,
          name: row.name,
          type: row.type,
          value: row.value,
        },
      });
      return;
    }
    setEditor({
      mode: "add",
      initial: {
        owner: routeOwner,
        name: routeName,
        type: "string",
        value: "",
      },
    });
  }, [isEditRoute, isNewRoute, routeOwner, routeName, ownerFilter, isLoading, variables]);

  useEffect(() => {
    if (!highlightName || isLoading) return;
    highlightRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlightName, isLoading, variables]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Variables</h1>
        <div className="flex gap-2">
          <FormSelect
            value={ownerFilter}
            onChange={(e) => {
              setOwnerFilter(e.target.value);
              setHighlightName("");
              navigate(
                e.target.value
                  ? `/variables?owner=${encodeURIComponent(e.target.value)}`
                  : "/variables",
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
                  ? `/variables/new?owner=${encodeURIComponent(ownerFilter)}`
                  : "/variables/new",
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
      ) : variables.length === 0 ? (
        <p className="text-sm opacity-60">No variables yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Owner</th>
                <th>Name</th>
                <th>Type</th>
                <th>Value</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {variables.map((row) => {
                const highlighted =
                  highlightName &&
                  row.name === highlightName &&
                  (!ownerFilter || row.owner === ownerFilter);
                return (
                  <tr
                    key={row.id}
                    ref={highlighted ? highlightRef : undefined}
                    className={`hover ${highlighted ? "bg-primary/10 outline outline-1 outline-primary/40" : ""}`}
                  >
                    <td className="font-mono">{row.owner}</td>
                    <td className="font-mono">{row.name}</td>
                    <td className="font-mono text-xs">{row.type}</td>
                    <td
                      className="font-mono text-xs max-w-xs truncate"
                      title={displayValue(row.value)}
                    >
                      {displayValue(row.value)}
                    </td>
                    <td className="whitespace-nowrap">{formatTime(row.updated_at)}</td>
                    <td className="text-right whitespace-nowrap">
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        title="Edit"
                        aria-label="Edit"
                        onClick={() =>
                          navigate(
                            `/variables/${encodeURIComponent(row.owner)}/${encodeURIComponent(row.name)}/edit`,
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
                        onClick={() => setConfirmDelete(row)}
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
        <VariableEditorModal
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
        message={
          confirmDelete
            ? `This cannot be undone. Workflows that reference $VAR_${confirmDelete.name} will fail.`
            : ""
        }
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
