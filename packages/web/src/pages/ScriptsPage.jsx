import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { LuCopy, LuPencil, LuPlay, LuPlus, LuSearch, LuTrash2 } from "react-icons/lu";
import { errorMessage } from "../api/client.js";
import {
  useDeleteScript,
  useForkScript,
  useInstallPlugin,
  useScripts,
} from "../api/hooks.js";
import { ScriptIcon } from "../components/ScriptIcon.jsx";
import { TagBadge } from "../components/TagBadge.jsx";
import { scriptTags } from "../lib/script.js";
import { useNotifications } from "../notifications.jsx";

export function ScriptsPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const editName = params.get("edit");
  const { data: scripts = [], isLoading } = useScripts();
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [query, setQuery] = useState("");
  const [forkFor, setForkFor] = useState(null);
  const [forkId, setForkId] = useState("");
  const del = useDeleteScript();
  const fork = useForkScript();
  const install = useInstallPlugin();
  const { notify } = useNotifications();

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return scripts;
    return scripts.filter((s) => {
      const name = typeof s === "string" ? s : s.name ?? "";
      const description = typeof s === "string" ? "" : s.meta?.description ?? "";
      const tags = typeof s === "string" ? [] : scriptTags(s.meta);
      const kind = typeof s === "string" ? "" : s.kind ?? "";
      return (
        name.toLowerCase().includes(term) ||
        description.toLowerCase().includes(term) ||
        kind.toLowerCase().includes(term) ||
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
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={install.isPending}
            onClick={() =>
              install.mutate(
                { source: "example", exampleId: "get-current-time", overwrite: true },
                {
                  onSuccess: () =>
                    notify.success("Installed example plugin/get-current-time"),
                },
              )
            }
          >
            Install example
          </button>
          <Link to="/scripts/new" className="btn btn-primary btn-sm">
            <LuPlus className="size-4" />
            Add plugin
          </Link>
        </div>
      </div>

      {install.isError ? (
        <p className="text-error text-sm">{errorMessage(install.error)}</p>
      ) : null}

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
            const kind = typeof s === "string" ? "core" : s.kind ?? "core";
            const isCore = kind === "core";
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
                  <div className="flex justify-center">
                    <span
                      className={`badge badge-xs ${isCore ? "badge-info" : "badge-accent"}`}
                    >
                      {kind}
                    </span>
                  </div>
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
                      onClick={() =>
                        navigate(`/scripts/${encodeURIComponent(name)}/dry-run`)
                      }
                    >
                      <LuPlay className="size-4" />
                    </button>
                    {isCore ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        title="Fork"
                        onClick={() => {
                          setForkFor(name);
                          setForkId(
                            String(name)
                              .replace(/\.js$/i, "")
                              .toLowerCase() + "-copy",
                          );
                        }}
                      >
                        <LuCopy className="size-4" />
                      </button>
                    ) : (
                      <Link
                        to={`/scripts/${encodeURIComponent(name)}/edit`}
                        className="btn btn-ghost btn-xs"
                        title="Edit"
                      >
                        <LuPencil className="size-4" />
                      </Link>
                    )}
                    {!isCore ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs text-error"
                        title="Delete"
                        onClick={() => setConfirmDelete(name)}
                      >
                        <LuTrash2 className="size-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {forkFor ? (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-semibold">Fork {forkFor}</h3>
            <p className="text-sm opacity-70 py-2">
              Creates <code>plugin/&lt;id&gt;</code> from this core script.
            </p>
            <input
              className="input input-bordered input-sm w-full font-mono"
              value={forkId}
              onChange={(e) => setForkId(e.target.value)}
            />
            {fork.isError ? (
              <p className="text-error text-sm mt-2">{errorMessage(fork.error)}</p>
            ) : null}
            <div className="modal-action">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setForkFor(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={fork.isPending || !forkId.trim()}
                onClick={() =>
                  fork.mutate(
                    { name: forkFor, id: forkId.trim() },
                    {
                      onSuccess: (data) => {
                        setForkFor(null);
                        notify.success("Forked — drain-restart recommended");
                        navigate(
                          `/scripts/${encodeURIComponent(data.scriptRef)}/edit`,
                        );
                      },
                    },
                  )
                }
              >
                Fork
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button type="button" onClick={() => setForkFor(null)}>
              close
            </button>
          </form>
        </dialog>
      ) : null}

      {confirmDelete ? (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-semibold">Delete {confirmDelete}?</h3>
            <p className="text-sm opacity-70 py-2">This uninstalls the plugin.</p>
            {del.isError ? (
              <p className="text-error text-sm">{errorMessage(del.error)}</p>
            ) : null}
            <div className="modal-action">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-error btn-sm"
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
