import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { LuPencil, LuPlay, LuPlus, LuSearch, LuTrash2 } from "react-icons/lu";
import { errorMessage } from "../api/client.js";
import { useDeleteScript, useScripts } from "../api/hooks.js";
import { ScriptIcon } from "../components/ScriptIcon.jsx";
import { TagBadge } from "../components/TagBadge.jsx";
import { scriptTags } from "../lib/script.js";

export function ScriptsPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const editName = params.get("edit");
  const { data: scripts = [], isLoading } = useScripts();
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [query, setQuery] = useState("");
  const del = useDeleteScript();

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return scripts;
    return scripts.filter((s) => {
      const name = typeof s === "string" ? s : s.name ?? "";
      const description = typeof s === "string" ? "" : s.meta?.description ?? "";
      const tags = typeof s === "string" ? [] : scriptTags(s.meta);
      return (
        name.toLowerCase().includes(term) ||
        description.toLowerCase().includes(term) ||
        tags.some((t) => t.toLowerCase().includes(term))
      );
    });
  }, [scripts, query]);

  if (editName) {
    return <Navigate to={`/scripts/${encodeURIComponent(editName)}/edit`} replace />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Scripts</h1>
        <div className="flex items-center gap-2">
          <label className="input input-sm w-48 sm:w-64">
            <LuSearch className="size-4 opacity-60" />
            <input
              type="search"
              className="grow"
              placeholder="Search scripts"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <Link to="/scripts/new" className="btn btn-primary btn-sm">
            <LuPlus className="size-4" />
            Add
          </Link>
        </div>
      </div>

      {isLoading ? (
        <span className="loading loading-spinner" />
      ) : scripts.length === 0 ? (
        <p className="text-sm opacity-50">No scripts yet.</p>
      ) : visible.length === 0 ? (
        <p className="text-sm opacity-50">No scripts match “{query.trim()}”.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {visible.map((s) => {
            const name = typeof s === "string" ? s : s.name;
            const description = typeof s === "string" ? "" : s.meta?.description;
            const metaError = typeof s === "string" ? null : s.metaError;
            const hasIcon = typeof s === "string" ? undefined : s.hasIcon;
            const tags = typeof s === "string" ? [] : scriptTags(s.meta);
            return (
              <article
                key={name}
                className="card bg-base-100 border border-base-300 w-60"
              >
                <div className="card-body p-4 gap-2">
                  <Link
                    to={`/scripts/${encodeURIComponent(name)}/edit`}
                    className="flex flex-col items-center gap-2 min-h-0"
                  >
                    <div className="flex h-20 w-full items-center justify-center rounded-box bg-base-200">
                      <ScriptIcon name={name} hasIcon={hasIcon} className="size-14" />
                    </div>
                    <h2 className="card-title font-mono text-sm justify-center text-center w-full">
                      <span className="truncate" title={name}>
                        {name}
                      </span>
                    </h2>
                  </Link>
                  <p className="text-xs opacity-80 line-clamp-2 min-h-8">
                    {metaError ? (
                      <span className="text-error">{metaError}</span>
                    ) : (
                      description || "—"
                    )}
                  </p>
                  {tags.length ? (
                    <div className="flex flex-wrap gap-1">
                      {tags.map((tag) => (
                        <TagBadge
                          key={tag}
                          tag={tag}
                          title={`Search ${tag}`}
                          onClick={() => setQuery(tag)}
                        />
                      ))}
                    </div>
                  ) : null}
                  <div className="card-actions justify-end mt-1">
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      title="Dry run"
                      onClick={() => navigate(`/scripts/${encodeURIComponent(name)}/dry-run`)}
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
                  </div>
                </div>
              </article>
            );
          })}
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
