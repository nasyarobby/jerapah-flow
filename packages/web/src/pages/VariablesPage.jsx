import { useState } from "react";
import { LuPencil, LuPlus, LuTrash2, LuX } from "react-icons/lu";
import { errorMessage } from "../api/client.js";
import {
  useDeleteVariable,
  useOwners,
  useUpsertVariable,
  useVariables,
} from "../api/hooks.js";
import { formatTime } from "../lib/format.jsx";

const TYPES = ["string", "number", "boolean"];

function defaultValue(type) {
  if (type === "boolean") return false;
  if (type === "number") return "";
  return "";
}

function displayValue(value) {
  if (typeof value === "string") return value === "" ? '""' : value;
  return String(value);
}

export function VariablesPage() {
  const { data: owners = [] } = useOwners();
  const [ownerFilter, setOwnerFilter] = useState("");
  const { data: variables = [], isLoading } = useVariables(ownerFilter || undefined);
  const upsert = useUpsertVariable();
  const del = useDeleteVariable();
  const [mode, setMode] = useState(null);
  const [form, setForm] = useState({
    owner: "",
    name: "",
    type: "string",
    value: "",
  });
  const [formError, setFormError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  function openAdd() {
    setMode("add");
    setFormError(null);
    setForm({
      owner: ownerFilter || owners[0] || "default",
      name: "",
      type: "string",
      value: "",
    });
  }

  function openEdit(row) {
    setMode("edit");
    setFormError(null);
    setForm({
      owner: row.owner,
      name: row.name,
      type: row.type,
      value: row.type === "number" ? String(row.value) : row.value,
    });
  }

  function closeForm() {
    setMode(null);
    setFormError(null);
    setForm({ owner: "", name: "", type: "string", value: "" });
  }

  function onTypeChange(type) {
    setForm({ ...form, type, value: defaultValue(type) });
  }

  function onSubmit(e) {
    e.preventDefault();
    let value = form.value;
    if (form.type === "number") {
      value = Number(form.value);
      if (!Number.isFinite(value)) {
        setFormError("value must be a finite number");
        return;
      }
    }
    if (form.type === "boolean") {
      value = form.value === true;
    }
    setFormError(null);
    upsert.mutate(
      { owner: form.owner, name: form.name, type: form.type, value },
      { onSuccess: closeForm },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Variables</h1>
        <div className="flex gap-2">
          <select
            className="select select-sm"
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
          >
            <option value="">all owners</option>
            {owners.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-primary btn-sm" onClick={openAdd}>
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
              {variables.map((row) => (
                <tr key={row.id} className="hover">
                  <td className="font-mono">{row.owner}</td>
                  <td className="font-mono">{row.name}</td>
                  <td className="font-mono text-xs">{row.type}</td>
                  <td className="font-mono text-xs max-w-xs truncate" title={displayValue(row.value)}>
                    {displayValue(row.value)}
                  </td>
                  <td className="whitespace-nowrap">{formatTime(row.updated_at)}</td>
                  <td className="text-right whitespace-nowrap">
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      title="Edit"
                      onClick={() => openEdit(row)}
                    >
                      <LuPencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs text-error"
                      title="Delete"
                      onClick={() => setConfirmDelete(row)}
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
          className="fieldset bg-base-100 border-base-300 rounded-box max-w-md border p-4"
        >
          <div className="flex items-center justify-between">
            <legend className="fieldset-legend">
              {mode === "add" ? "New variable" : `Edit ${form.owner}/${form.name}`}
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
          {mode === "add" ? (
            <>
              <label className="label">Owner</label>
              {owners.length > 0 ? (
                <select
                  className="select w-full"
                  value={form.owner}
                  onChange={(e) => setForm({ ...form, owner: e.target.value })}
                  required
                >
                  {owners.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="input w-full"
                  value={form.owner}
                  onChange={(e) => setForm({ ...form, owner: e.target.value })}
                  required
                />
              )}
              <label className="label">Name</label>
              <input
                className="input w-full font-mono"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                pattern="[A-Za-z0-9._-]+"
                title="Letters, numbers, dots, underscores, hyphens"
              />
            </>
          ) : null}
          <label className="label">Type</label>
          <select
            className="select w-full"
            value={form.type}
            onChange={(e) => onTypeChange(e.target.value)}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <label className="label">Value</label>
          {form.type === "boolean" ? (
            <select
              className="select w-full"
              value={form.value === true ? "true" : "false"}
              onChange={(e) => setForm({ ...form, value: e.target.value === "true" })}
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : form.type === "number" ? (
            <input
              type="number"
              className="input w-full font-mono"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              required
              step="any"
            />
          ) : (
            <textarea
              className="textarea w-full font-mono min-h-24"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              spellCheck={false}
            />
          )}
          <p className="text-xs opacity-60 mt-1">
            Stored in plaintext. Use Secrets for credentials. In workflows use{" "}
            <span className="font-mono">$VAR_name</span> as a whole field.
          </p>
          {formError ? <p className="text-error text-sm">{formError}</p> : null}
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
            <h3 className="font-bold">
              Delete {confirmDelete.owner}/{confirmDelete.name}?
            </h3>
            <p className="text-sm mt-2">
              This cannot be undone. Workflows that reference $VAR_{confirmDelete.name} will fail.
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
