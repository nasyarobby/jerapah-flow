import { useState } from "react";
import { errorMessage } from "../api/client.js";
import { useCreateUser, useUpdateUser } from "../api/hooks.js";
import { FormInput, FormSelect } from "./FormControls.jsx";

/**
 * Add / edit a local user.
 * Reusable: mount when open; pass `user` for edit.
 *
 * @param {"add" | "edit"} mode
 * @param {{ id: string, username: string, role: string }} [user]
 * @param {() => void} onClose
 * @param {(saved: unknown) => void} [onSaved]
 */
export function UserEditorModal({ mode, user, onClose, onSaved }) {
  const create = useCreateUser();
  const update = useUpdateUser();
  const [form, setForm] = useState(() => ({
    username: user?.username || "",
    password: "",
    role: user?.role || "operator",
    id: user?.id || null,
  }));

  const mutation = mode === "add" ? create : update;

  function onSubmit(e) {
    e.preventDefault();
    if (mode === "add") {
      create.mutate(
        {
          username: form.username,
          password: form.password,
          role: form.role,
        },
        {
          onSuccess: (data) => {
            onSaved?.(data?.user ?? data);
            onClose();
          },
        },
      );
      return;
    }
    const body = { id: form.id, role: form.role };
    if (form.password) body.password = form.password;
    update.mutate(body, {
      onSuccess: (data) => {
        onSaved?.(data?.user ?? data);
        onClose();
      },
    });
  }

  const title = mode === "add" ? "New user" : form.username;

  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-md">
        <h3 className="font-bold">{title}</h3>
        <form className="mt-3 space-y-2" onSubmit={onSubmit}>
          {mode === "add" ? (
            <label className="form-control w-full">
              <span className="label py-0 text-sm">Username</span>
              <FormInput
                className="w-full"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
            </label>
          ) : null}
          <label className="form-control w-full">
            <span className="label py-0 text-sm">
              {mode === "add" ? "Password" : "New password"}
            </span>
            <FormInput
              type="password"
              className="w-full"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required={mode === "add"}
              minLength={mode === "add" ? 8 : undefined}
              placeholder={mode === "edit" ? "leave blank to keep" : ""}
            />
          </label>
          <label className="form-control w-full">
            <span className="label py-0 text-sm">Role</span>
            <FormSelect
              className="w-full"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="operator">operator</option>
              <option value="admin">admin</option>
            </FormSelect>
          </label>
          {mutation.isError ? (
            <p className="text-error text-sm">{errorMessage(mutation.error)}</p>
          ) : null}
          <div className="modal-action">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <span className="loading loading-spinner loading-xs" />
              ) : null}
              Save
            </button>
          </div>
        </form>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="button" onClick={onClose}>
          close
        </button>
      </form>
    </dialog>
  );
}
