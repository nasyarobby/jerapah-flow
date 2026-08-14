import { useState } from "react";
import { LuPencil, LuPlus, LuTrash2, LuX } from "react-icons/lu";
import { errorMessage } from "../api/client.js";
import {
  useCreateUser,
  useDeleteUser,
  useUpdateUser,
  useUsers,
} from "../api/hooks.js";

export function UsersPage() {
  const { data: users = [], isLoading } = useUsers();
  const create = useCreateUser();
  const update = useUpdateUser();
  const del = useDeleteUser();
  const [mode, setMode] = useState(null);
  const [form, setForm] = useState({
    username: "",
    password: "",
    role: "operator",
    id: null,
  });
  const [confirmDelete, setConfirmDelete] = useState(null);

  function openAdd() {
    setMode("add");
    setForm({ username: "", password: "", role: "operator", id: null });
  }

  function openEdit(u) {
    setMode("edit");
    setForm({ username: u.username, password: "", role: u.role, id: u.id });
  }

  function closeForm() {
    setMode(null);
  }

  function onSubmit(e) {
    e.preventDefault();
    if (mode === "add") {
      create.mutate(
        {
          username: form.username,
          password: form.password,
          role: form.role,
        },
        { onSuccess: closeForm },
      );
    } else {
      const body = { id: form.id, role: form.role };
      if (form.password) body.password = form.password;
      update.mutate(body, { onSuccess: closeForm });
    }
  }

  const mutation = mode === "add" ? create : update;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Users</h1>
        <button type="button" className="btn btn-primary btn-sm" onClick={openAdd}>
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
                      onClick={() => openEdit(u)}
                    >
                      <LuPencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs text-error"
                      title="Delete"
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

      {mode ? (
        <form onSubmit={onSubmit} className="fieldset bg-base-100 border-base-300 rounded-box max-w-md border p-4">
          <div className="flex items-center justify-between">
            <legend className="fieldset-legend">
              {mode === "add" ? "New user" : form.username}
            </legend>
            <button type="button" className="btn btn-ghost btn-sm btn-square" onClick={closeForm} aria-label="Close">
              <LuX className="size-4" />
            </button>
          </div>
          {mode === "add" ? (
            <>
              <label className="label">Username</label>
              <input
                className="input w-full"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
            </>
          ) : null}
          <label className="label">{mode === "add" ? "Password" : "New password"}</label>
          <input
            type="password"
            className="input w-full"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required={mode === "add"}
            minLength={mode === "add" ? 8 : undefined}
            placeholder={mode === "edit" ? "leave blank to keep" : ""}
          />
          <label className="label">Role</label>
          <select
            className="select w-full"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            <option value="operator">operator</option>
            <option value="admin">admin</option>
          </select>
          {mutation.isError ? (
            <p className="text-error text-sm">{errorMessage(mutation.error)}</p>
          ) : null}
          <button type="submit" className="btn btn-primary mt-2" disabled={mutation.isPending}>
            Save
          </button>
        </form>
      ) : null}

      {confirmDelete ? (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold">Delete {confirmDelete.username}?</h3>
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
                  del.mutate(confirmDelete.id, { onSuccess: () => setConfirmDelete(null) })
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
