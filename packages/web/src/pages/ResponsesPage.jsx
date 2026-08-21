import { useState } from "react";
import { LuPencil, LuPlus, LuTrash2, LuX } from "react-icons/lu";
import { errorMessage } from "../api/client.js";
import {
  useDeleteHttpPage,
  useHttpPages,
  useUpsertHttpPage,
} from "../api/hooks.js";
import { ConfirmDialog } from "../components/ConfirmDialog.jsx";
import { formatTime } from "../lib/format.jsx";

const emptyForm = {
  name: "",
  content: "",
  mime: "html",
  status: 200,
  kind: "response",
};

function kindLabel(kind) {
  return kind === "template" ? "HTML template" : "HTTP response";
}

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
      kind: p.kind ?? "response",
      system: Boolean(p.system),
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
        mime: form.kind === "template" ? "html" : form.mime,
        status: Number(form.status) || 200,
        kind: form.kind,
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
        Named HTML/JSON pages for HTTP trigger responses, or HTML templates for Mustache
        rendering in workflows. HTTP responses use{" "}
        <code className="font-mono text-xs">response: name</code>; templates use{" "}
        <code className="font-mono text-xs">render-template.js</code> with{" "}
        <code className="font-mono text-xs">config.template: name</code>.
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
                <th>Kind</th>
                <th>Mime</th>
                <th>Status</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.id} className="hover">
                  <td className="font-mono">
                    {p.name}
                    {p.system ? (
                      <span className="badge badge-ghost badge-xs ml-2">system</span>
                    ) : null}
                  </td>
                  <td>{kindLabel(p.kind ?? "response")}</td>
                  <td>{p.mime}</td>
                  <td>{p.kind === "template" ? "—" : p.status}</td>
                  <td className="whitespace-nowrap">{formatTime(p.updated_at)}</td>
                  <td className="text-right whitespace-nowrap">
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      title="Edit"
                      aria-label="Edit"
                      onClick={() => openEdit(p)}
                    >
                      <LuPencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs text-error"
                      title={p.system ? "System pages cannot be deleted" : "Delete"}
                      aria-label={p.system ? "System pages cannot be deleted" : "Delete"}
                      disabled={p.system}
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
              {mode === "add" ? "New page" : `Edit ${form.name}`}
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
          <label className="label">Kind</label>
          <select
            className="select w-full"
            value={form.kind}
            onChange={(e) =>
              setForm({
                ...form,
                kind: e.target.value,
                mime: e.target.value === "template" ? "html" : form.mime,
              })
            }
            disabled={mode === "edit" && form.system}
          >
            <option value="response">HTTP response</option>
            <option value="template">HTML template</option>
          </select>
          {form.kind === "template" ? (
            <p className="text-xs opacity-70">
              Templates use Mustache syntax (<code>{"{{title}}"}</code>,{" "}
              <code>{"{{#items}}"}</code>) and are rendered by{" "}
              <code className="font-mono">render-template.js</code>.
            </p>
          ) : null}
          {form.kind === "response" ? (
            <>
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
            </>
          ) : null}
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

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={confirmDelete ? `Delete ${confirmDelete.name}?` : ""}
        message="Workflows that reference this page will fail validation on next save."
        error={del.isError ? errorMessage(del.error) : null}
        loading={del.isPending}
        confirmDisabled={Boolean(confirmDelete?.system)}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() =>
          del.mutate(confirmDelete.id, { onSuccess: () => setConfirmDelete(null) })
        }
      />
    </div>
  );
}
