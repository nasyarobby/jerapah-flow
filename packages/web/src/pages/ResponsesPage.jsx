import { useState } from "react";
import { LuPencil, LuPlus, LuTrash2, LuX } from "react-icons/lu";
import { errorMessage } from "../api/client.js";
import {
  useDeleteHttpPage,
  useHttpPages,
  useUpsertHttpPage,
} from "../api/hooks.js";
import { formatTime } from "../lib/format.jsx";

const emptyForm = {
  name: "",
  content: "",
  mime: "html",
  status: 200,
};

export function ResponsesPage() {
  const { data: pages = [], isLoading } = useHttpPages();
  const upsert = useUpsertHttpPage();
  const del = useDeleteHttpPage();
  const [mode, setMode] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmDelete, setConfirmDelete] = useState(null);

  function openAdd() {
    setMode("add");
    setForm(emptyForm);
  }

  function openEdit(p) {
    setMode("edit");
    setForm({
      name: p.name,
      content: p.content,
      mime: p.mime,
      status: p.status,
    });
  }

  function closeForm() {
    setMode(null);
    setForm(emptyForm);
  }

  function onSubmit(e) {
    e.preventDefault();
    upsert.mutate(
      {
        name: form.name,
        content: form.content,
        mime: form.mime,
        status: Number(form.status) || 200,
      },
      { onSuccess: closeForm },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Responses</h1>
        <button type="button" className="btn btn-primary btn-sm" onClick={openAdd}>
          <LuPlus className="size-4" />
          Add
        </button>
      </div>
      <p className="text-sm opacity-70">
        Named HTML/JSON pages for HTTP trigger success or unauthorized responses. Reference them in
        YAML as <code className="font-mono text-xs">response: name</code>.
      </p>

      {isLoading ? (
        <span className="loading loading-spinner" />
      ) : pages.length === 0 ? (
        <p className="text-sm opacity-60">No response pages yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Name</th>
                <th>Mime</th>
                <th>Status</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.id} className="hover">
                  <td className="font-mono">{p.name}</td>
                  <td>{p.mime}</td>
                  <td>{p.status}</td>
                  <td className="whitespace-nowrap">{formatTime(p.updated_at)}</td>
                  <td className="text-right whitespace-nowrap">
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      title="Edit"
                      onClick={() => openEdit(p)}
                    >
                      <LuPencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs text-error"
                      title="Delete"
                      onClick={() => setConfirmDelete(p)}
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
        <form
          onSubmit={onSubmit}
          className="fieldset bg-base-100 border-base-300 rounded-box max-w-2xl border p-4"
        >
          <div className="flex items-center justify-between">
            <legend className="fieldset-legend">
              {mode === "add" ? "New response page" : `Edit ${form.name}`}
            </legend>
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-square"
              onClick={closeForm}
              aria-label="Close"
            >
              <LuX className="size-4" />
            </button>
          </div>
          <label className="label">Name</label>
          <input
            className="input w-full font-mono"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            pattern="[A-Za-z0-9._-]+"
            title="Letters, numbers, dots, underscores, hyphens"
            disabled={mode === "edit"}
          />
          <label className="label">Mime</label>
          <select
            className="select w-full"
            value={form.mime}
            onChange={(e) => setForm({ ...form, mime: e.target.value })}
          >
            <option value="html">html</option>
            <option value="json">json</option>
          </select>
          <label className="label">HTTP status</label>
          <input
            type="number"
            className="input w-full"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
            min={100}
            max={599}
            required
          />
          <label className="label">Content</label>
          <textarea
            className="textarea w-full font-mono text-sm min-h-40"
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            required
          />
          {upsert.isError ? (
            <p className="text-error text-sm">{errorMessage(upsert.error)}</p>
          ) : null}
          <button type="submit" className="btn btn-primary mt-2" disabled={upsert.isPending}>
            Save
          </button>
        </form>
      ) : null}

      {confirmDelete ? (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold">Delete {confirmDelete.name}?</h3>
            <p className="text-sm mt-2">
              Workflows that reference this page will fail validation on next save.
            </p>
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
