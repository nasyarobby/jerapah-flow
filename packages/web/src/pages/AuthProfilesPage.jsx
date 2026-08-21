import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { LuEye, LuEyeOff, LuPencil, LuPlus, LuTrash2 } from "react-icons/lu";
import { errorMessage } from "../api/client.js";
import {
  fetchHttpAuthLiterals,
  useDeleteHttpAuth,
  useHttpAuths,
} from "../api/hooks.js";
import { AuthEditorModal } from "../components/AuthEditorModal.jsx";
import { ConfirmDialog } from "../components/ConfirmDialog.jsx";
import { formatTime } from "../lib/format.jsx";

function CredDisplay({ field, fieldKey, authId, cache, onRevealed }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!field || field.source === "missing") {
    return <span className="opacity-50">—</span>;
  }

  if (field.source === "secret") {
    return (
      <span className="font-mono text-xs" title="Encrypted; cannot reveal">
        secret:{field.secret}
      </span>
    );
  }

  if (field.source === "kv") {
    const ref = field.namespace
      ? `kv:${field.namespace}/${field.kv}`
      : `kv:${field.kv}`;
    return <span className="font-mono text-xs">{ref}</span>;
  }

  const revealed = cache?.[fieldKey];
  const shown = open && typeof revealed === "string";

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    if (typeof revealed === "string") {
      setOpen(true);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHttpAuthLiterals(authId);
      onRevealed?.(data.literals ?? {});
      setOpen(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs">
      <span>{shown ? revealed : "***"}</span>
      <button
        type="button"
        className="btn btn-ghost btn-xs btn-square"
        title={shown ? "Hide" : "Reveal"}
        aria-label={shown ? "Hide" : "Reveal"}
        disabled={loading}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
      >
        {loading ? (
          <span className="loading loading-spinner loading-xs" />
        ) : shown ? (
          <LuEyeOff className="size-3.5" />
        ) : (
          <LuEye className="size-3.5" />
        )}
      </button>
      {error ? <span className="text-error text-[10px]">{error}</span> : null}
    </span>
  );
}

function CredentialsCell({ auth, cache, onRevealed }) {
  const cfg = auth.config ?? {};
  if (auth.type === "bearer") {
    return (
      <CredDisplay
        field={cfg.token}
        fieldKey="token"
        authId={auth.id}
        cache={cache}
        onRevealed={onRevealed}
      />
    );
  }
  if (auth.type === "basic") {
    return (
      <span className="inline-flex flex-wrap gap-x-3 gap-y-1 items-center">
        <span className="inline-flex items-center gap-1">
          <span className="opacity-60 text-xs">user</span>
          <CredDisplay
            field={cfg.user}
            fieldKey="user"
            authId={auth.id}
            cache={cache}
            onRevealed={onRevealed}
          />
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="opacity-60 text-xs">pass</span>
          <CredDisplay
            field={cfg.password}
            fieldKey="password"
            authId={auth.id}
            cache={cache}
            onRevealed={onRevealed}
          />
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap gap-x-2 gap-y-1 items-center">
      <span className="font-mono text-xs opacity-70">{cfg.header ?? "?"}</span>
      <CredDisplay
        field={cfg.value}
        fieldKey="value"
        authId={auth.id}
        cache={cache}
        onRevealed={onRevealed}
      />
    </span>
  );
}

export function AuthProfilesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { name: routeName } = useParams();
  const isNewRoute = /\/auth\/new\/?$/.test(location.pathname);
  const isEditRoute = Boolean(routeName) && !isNewRoute;

  const { data: auths = [], isLoading } = useHttpAuths();
  const del = useDeleteHttpAuth();
  const [editor, setEditor] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  /** @type {[Record<string, Record<string, string>>, Function]} */
  const [revealCache, setRevealCache] = useState({});
  const openedRouteKey = useRef(null);

  function closeEditor() {
    setEditor(null);
    openedRouteKey.current = null;
    if (isNewRoute || isEditRoute) {
      navigate("/auth", { replace: true });
    }
  }

  useEffect(() => {
    if (!isNewRoute) return;
    if (openedRouteKey.current === "new") return;
    openedRouteKey.current = "new";
    setEditor({ mode: "add" });
  }, [isNewRoute]);

  useEffect(() => {
    if (!isEditRoute) {
      if (!isNewRoute) openedRouteKey.current = null;
      return;
    }
    if (isLoading) return;
    const key = `edit:${routeName}`;
    if (openedRouteKey.current === key) return;
    openedRouteKey.current = key;
    const auth = auths.find((a) => a.name === routeName);
    if (!auth) {
      setEditor({ mode: "add" });
      return;
    }
    setEditor({ mode: "edit", auth });
  }, [isEditRoute, isNewRoute, routeName, isLoading, auths]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Auth</h1>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => navigate("/auth/new")}
        >
          <LuPlus className="size-4" />
          Add
        </button>
      </div>
      <p className="text-sm opacity-70">
        HTTP trigger auth profiles. Rename freely — workflows keep working via a stable id.
        Add them to a trigger from the workflow editor dropdown. Secrets are managed on the
        Secrets page; KV values stay in KV.
      </p>

      {isLoading ? (
        <span className="loading loading-spinner" />
      ) : auths.length === 0 ? (
        <p className="text-sm opacity-60">No auth profiles yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Credentials</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {auths.map((a) => (
                <tr key={a.id} className="hover">
                  <td className="font-mono">{a.name}</td>
                  <td>{a.type}</td>
                  <td>
                    <CredentialsCell
                      auth={a}
                      cache={revealCache[a.id]}
                      onRevealed={(literals) =>
                        setRevealCache((prev) => ({ ...prev, [a.id]: literals }))
                      }
                    />
                  </td>
                  <td className="whitespace-nowrap">{formatTime(a.updated_at)}</td>
                  <td className="text-right whitespace-nowrap">
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      title="Edit"
                      aria-label="Edit"
                      onClick={() => navigate(`/auth/${encodeURIComponent(a.name)}/edit`)}
                    >
                      <LuPencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs text-error"
                      title="Delete"
                      aria-label="Delete"
                      onClick={() => setConfirmDelete(a)}
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

      {editor ? (
        <AuthEditorModal
          mode={editor.mode}
          auth={editor.auth}
          onClose={closeEditor}
          onSaved={(saved) => {
            const id = saved?.id || editor.auth?.id;
            if (!id) return;
            setRevealCache((prev) => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={confirmDelete ? `Delete ${confirmDelete.name}?` : ""}
        message="Workflows that reference this profile will fail auth until updated."
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
