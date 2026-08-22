import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { LuPencil, LuPlus, LuTrash2 } from "react-icons/lu";
import { errorMessage } from "../api/client.js";
import { useDeleteProfile, useProfileUsage, useProfiles } from "../api/hooks.js";
import { Modal } from "../components/Modal.jsx";
import { ProfileEditorModal } from "../components/ProfileEditorModal.jsx";
import { ScriptIcon } from "../components/ScriptIcon.jsx";
import { useRouteDrivenModal } from "../hooks/useRouteDrivenModal.js";
import { formatTime } from "../lib/format";
import { DEFAULT_OWNER } from "../lib/tenant.js";

function previewConfig(config) {
  if (!config || typeof config !== "object") return "";
  if (typeof config.url === "string" && config.url) return config.url;
  const first = Object.entries(config).find(
    ([, v]) => v != null && (typeof v === "string" || typeof v === "number" || typeof v === "boolean"),
  );
  if (!first) return "";
  return `${first[0]}=${String(first[1])}`;
}

function formatUsage(usages) {
  const names = (usages ?? []).map((u) => u.name);
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} uses this.`;
  if (names.length === 2) return `${names[0]} and ${names[1]} use this.`;
  const rest = names.length - 2;
  return `${names[0]}, ${names[1]}, and ${rest} other workflow${rest === 1 ? "" : "s"} use this.`;
}

export function ProfilesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { owner: routeOwner, name: routeName } = useParams();
  const [params] = useSearchParams();
  const isNewRoute = /\/profiles\/new\/?$/.test(location.pathname);
  const isEditRoute = Boolean(routeOwner && routeName);

  const { data: profiles = [], isLoading } = useProfiles();
  const del = useDeleteProfile();
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [highlightName, setHighlightName] = useState(() => routeName || "");
  const highlightRef = useRef(null);

  const listPath = "/profiles";

  const { editor, closeEditor } = useRouteDrivenModal({
    isNewRoute,
    isEditRoute,
    listPath,
    newRouteKey: () => `new:${params.get("name") || ""}:${params.get("script") || ""}`,
    canOpenNew: () => true,
    buildNewEditor: () => ({
      mode: "add",
      initial: {
        owner: DEFAULT_OWNER,
        name: params.get("name") || "",
        script: params.get("script") || "",
        config: {},
        description: "",
      },
    }),
    editRouteKey: () => `edit:${routeOwner}/${routeName}`,
    canOpenEdit: () => !isLoading,
    onOpenEdit: () => setHighlightName(routeName),
    buildEditEditor: () => {
      const row = profiles.find((p) => p.owner === routeOwner && p.name === routeName);
      if (row) {
        return {
          mode: "edit",
          initial: {
            owner: row.owner,
            name: row.name,
            script: row.script,
            config: row.config,
            description: row.description,
          },
          usageCount: row.usageCount ?? 0,
        };
      }
      return {
        mode: "add",
        initial: {
          owner: routeOwner || DEFAULT_OWNER,
          name: routeName,
          script: "",
          config: {},
          description: "",
        },
      };
    },
    newDeps: [params],
    editDeps: [routeOwner, routeName, isLoading, profiles],
  });

  useEffect(() => {
    if (!highlightName || isLoading) return;
    highlightRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlightName, isLoading, profiles]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Profiles</h1>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => navigate("/profiles/new")}
        >
          <LuPlus className="size-4" />
          Add
        </button>
      </div>

      <p className="text-sm opacity-70">
        A profile is saved config for one script. Workflow steps can use it as initial config;
        local keys override. Changing a profile updates every workflow that references it.
      </p>

      {isLoading ? (
        <span className="loading loading-spinner" />
      ) : profiles.length === 0 ? (
        <p className="text-sm opacity-60">No profiles yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {profiles.map((row) => {
            const highlighted =
              highlightName &&
              row.name === highlightName &&
              (!routeOwner || row.owner === routeOwner);
            const preview = previewConfig(row.config);
            return (
              <article
                key={row.id}
                ref={highlighted ? highlightRef : undefined}
                className={`card bg-base-100 border border-accent ${
                  highlighted ? "outline outline-2 outline-accent" : ""
                }`}
              >
                <div className="card-body p-4 gap-2">
                  <div className="flex items-start gap-2">
                    <ScriptIcon name={row.script} className="size-10 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <h2 className="font-mono font-semibold truncate" title={row.name}>
                        {row.name}
                      </h2>
                    </div>
                  </div>
                  <p className="text-xs font-mono opacity-80 truncate" title={row.script}>
                    {row.script}
                  </p>
                  {row.description ? (
                    <p className="text-sm opacity-80 line-clamp-2">{row.description}</p>
                  ) : null}
                  {preview ? (
                    <p className="text-xs font-mono opacity-60 truncate" title={preview}>
                      {preview}
                    </p>
                  ) : null}
                  <p className="text-xs opacity-50">
                    {row.usageCount
                      ? `${row.usageCount} workflow${row.usageCount === 1 ? "" : "s"}`
                      : "unused"}
                    {row.updated_at ? ` · ${formatTime(row.updated_at)}` : ""}
                  </p>
                  <div className="card-actions justify-end">
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      title="Edit"
                      aria-label="Edit"
                      onClick={() =>
                        navigate(
                          `/profiles/${encodeURIComponent(row.owner)}/${encodeURIComponent(row.name)}/edit`,
                        )
                      }
                    >
                      <LuPencil className="size-4" />
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs text-error"
                      title="Delete"
                      aria-label="Delete"
                      onClick={() => setConfirmDelete({ ...row, force: false })}
                    >
                      <LuTrash2 className="size-4" />
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editor ? (
        <ProfileEditorModal
          mode={editor.mode}
          initial={editor.initial}
          usageCount={editor.usageCount ?? 0}
          onClose={closeEditor}
          onSaved={(saved) => {
            setHighlightName(saved?.name || editor.initial.name);
          }}
        />
      ) : null}

      {confirmDelete ? (
        <DeleteProfileDialog
          profile={confirmDelete}
          del={del}
          onClose={() => {
            del.reset();
            setConfirmDelete(null);
          }}
        />
      ) : null}
    </div>
  );
}

function DeleteProfileDialog({ profile, del, onClose }) {
  const [force, setForce] = useState(false);
  const usage = useProfileUsage(profile.id, true);
  const usages = usage.data ?? [];
  const used = usages.length > 0;
  const title = `Delete ${profile.name}?`;

  return (
    <Modal open onClose={onClose} boxClassName="max-w-md" aria-label={title}>
      <h3 className="font-bold">{title}</h3>
      {usage.isLoading ? (
        <p className="text-sm mt-2 opacity-70">Checking workflow usage…</p>
      ) : used ? (
        <>
          <p className="text-sm mt-2">{formatUsage(usages)}</p>
          <ul className="mt-2 max-h-40 overflow-auto text-sm font-mono">
            {usages.map((u) => (
              <li key={u.file}>
                {u.name}
                {u.file !== u.name ? ` (${u.file})` : ""}
              </li>
            ))}
          </ul>
          {force ? (
            <p className="text-warning text-sm mt-2">
              Workflows that still reference this profile will fail until you fix them.
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-sm mt-2">This cannot be undone.</p>
      )}
      {del.isError ? (
        <p className="text-error text-sm mt-2">{errorMessage(del.error)}</p>
      ) : null}
      <div className="modal-action">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        {used && !force ? (
          <button type="button" className="btn btn-warning" onClick={() => setForce(true)}>
            Force delete
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-error"
            disabled={del.isPending || usage.isLoading}
            onClick={() =>
              del.mutate({ id: profile.id, force: used }, { onSuccess: () => onClose() })
            }
          >
            {del.isPending ? <span className="loading loading-spinner loading-xs" /> : null}
            Delete
          </button>
        )}
      </div>
    </Modal>
  );
}
