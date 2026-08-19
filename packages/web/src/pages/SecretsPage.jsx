import { useState } from "react";
import { LuPencil, LuPlus, LuTrash2, LuX } from "react-icons/lu";
import { errorMessage } from "../api/client.js";
import {
  useDeleteSecret,
  useOwners,
  useSecrets,
  useUpsertSecret,
} from "../api/hooks.js";
import { formatTime } from "../lib/format.jsx";

export function SecretsPage() {
  const { data: owners = [] } = useOwners();
  const [ownerFilter, setOwnerFilter] = useState("");
  const { data: secrets = [], isLoading } = useSecrets(ownerFilter || undefined);
  const upsert = useUpsertSecret();
  const del = useDeleteSecret();
  const [mode, setMode] = useState(null);
  const [form, setForm] = useState({
    owner: "",
    name: "",
    value: "",
  });
  const [confirmDelete, setConfirmDelete] = useState(null);

  function openAdd() {
    setMode("add");
    setForm({
      owner: ownerFilter || owners[0] || "default",
      name: "",
      value: "",
    });
  }

  function openReplace(s) {
    setMode("replace");
    setForm({ owner: s.owner, name: s.name, value: "" });
  }

  function closeForm() {
    setMode(null);
    setForm({ owner: "", name: "", value: "" });
  }

  function onSubmit(e) {
    e.preventDefault();
    upsert.mutate(
      { owner: form.owner, name: form.name, value: form.value },
      { onSuccess: closeForm },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Secrets</h1>
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
      ) : secrets.length === 0 ? (
        <p className="text-sm opacity-60">No secrets yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Owner</th>
                <th>Name</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {secrets.map((s) => (
                <tr key={s.id} className="hover">
                  <td className="font-mono">{s.owner}</td>
                  <td className="font-mono">{s.name}</td>
                  <td className="whitespace-nowrap">{formatTime(s.updated_at)}</td>
                  <td className="text-right whitespace-nowrap">
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      title="Replace value"
                      onClick={() => openReplace(s)}
                    >
                      <LuPencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs text-error"
                      title="Delete"
                      onClick={() => setConfirmDelete(s)}
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
              {mode === "add" ? "New secret" : `Replace ${form.owner}/${form.name}`}
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
          <label className="label">Value</label>
          <input
            type="password"
            className="input w-full"
            value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value })}
            required
            autoComplete="new-password"
          />
          <p className="text-xs opacity-60 mt-1">
            Values are encrypted at rest and never shown again after save.
            Values shorter than 8 characters are not redacted from logs.
          </p>
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
            <p className="text-sm mt-2">This cannot be undone. Workflows that retrieve this name will fail.</p>
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
