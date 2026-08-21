import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { LuPencil, LuPlus, LuTrash2 } from "react-icons/lu";
import { errorMessage } from "../api/client.js";
import { useDeleteUser, useUsers } from "../api/hooks.js";
import { ConfirmDialog } from "../components/ConfirmDialog.jsx";
import { UserEditorModal } from "../components/UserEditorModal.jsx";

export function UsersPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { username: routeUsername } = useParams();
  const isNewRoute = /\/users\/new\/?$/.test(location.pathname);
  const isEditRoute = Boolean(routeUsername) && !isNewRoute;

  const { data: users = [], isLoading } = useUsers();
  const del = useDeleteUser();
  const [editor, setEditor] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const openedRouteKey = useRef(null);

  function closeEditor() {
    setEditor(null);
    openedRouteKey.current = null;
    if (isNewRoute || isEditRoute) {
      navigate("/users", { replace: true });
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
    const key = `edit:${routeUsername}`;
    if (openedRouteKey.current === key) return;
    openedRouteKey.current = key;
    const user = users.find((u) => u.username === routeUsername);
    if (!user) {
      setEditor({ mode: "add" });
      return;
    }
    setEditor({ mode: "edit", user });
  }, [isEditRoute, isNewRoute, routeUsername, isLoading, users]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Users</h1>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => navigate("/users/new")}
        >
          <LuPlus className="size-4" />
          Add
        </button>
      </div>

      {isLoading ? (
        <span className="loading loading-spinner" />
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="hover">
                  <td>{u.username}</td>
                  <td>
                    <span className="badge badge-sm">{u.role}</span>
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      title="Edit"
                      aria-label="Edit"
                      onClick={() =>
                        navigate(`/users/${encodeURIComponent(u.username)}/edit`)
                      }
                    >
                      <LuPencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs text-error"
                      title="Delete"
                      aria-label="Delete"
                      onClick={() => setConfirmDelete(u)}
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
        <UserEditorModal
          mode={editor.mode}
          user={editor.user}
          onClose={closeEditor}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={confirmDelete ? `Delete ${confirmDelete.username}?` : ""}
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
