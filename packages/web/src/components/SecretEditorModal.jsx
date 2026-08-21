import { useState } from "react";
import { errorMessage } from "../api/client.js";
import { useOwners, useUpsertSecret } from "../api/hooks.js";
import { FormInput, FormSelect } from "./FormControls.jsx";
import { Modal } from "./Modal.jsx";

/**
 * Add / replace an encrypted secret.
 * Reusable: mount when open; parent supplies mode + initial fields.
 *
 * @param {"add" | "replace"} mode
 * @param {{ owner: string, name?: string }} initial
 * @param {() => void} onClose
 * @param {(saved: unknown) => void} [onSaved]
 * @param {boolean} [lockOwner]
 */
export function SecretEditorModal({
  mode,
  initial,
  onClose,
  onSaved,
  lockOwner = false,
}) {
  const { data: owners = [] } = useOwners();
  const upsert = useUpsertSecret();
  const [form, setForm] = useState(() => ({
    owner: initial.owner || owners[0] || "default",
    name: initial.name || "",
    value: "",
  }));

  function onSubmit(e) {
    e.preventDefault();
    upsert.mutate(
      { owner: form.owner, name: form.name, value: form.value },
      {
        onSuccess: (data) => {
          onSaved?.(data?.secret ?? data);
          onClose();
        },
      },
    );
  }

  const title = mode === "add" ? "New secret" : `Replace ${form.owner}/${form.name}`;

  return (
    <Modal open onClose={onClose} boxClassName="max-w-md" aria-label={title}>
      <h3 className="font-bold">{title}</h3>
      <form className="mt-3 space-y-2" onSubmit={onSubmit}>
        {mode === "add" ? (
          <>
            <label className="form-control w-full">
              <span className="label py-0 text-sm">Owner</span>
              {owners.length > 0 ? (
                <FormSelect
                  className="w-full"
                  value={form.owner}
                  onChange={(e) => setForm({ ...form, owner: e.target.value })}
                  required
                  disabled={lockOwner}
                >
                  {owners.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </FormSelect>
              ) : (
                <FormInput
                  className="w-full"
                  value={form.owner}
                  onChange={(e) => setForm({ ...form, owner: e.target.value })}
                  required
                  disabled={lockOwner}
                />
              )}
            </label>
            <label className="form-control w-full">
              <span className="label py-0 text-sm">Name</span>
              <FormInput
                className="w-full font-mono"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                pattern="[A-Za-z0-9._-]+"
                title="Letters, numbers, dots, underscores, hyphens"
              />
            </label>
          </>
        ) : null}
        <label className="form-control w-full">
          <span className="label py-0 text-sm">Value</span>
          <FormInput
            type="password"
            className="w-full"
            value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value })}
            required
            autoComplete="new-password"
          />
        </label>
        <p className="text-xs opacity-60">
          Values are encrypted at rest and never shown again after save. Values shorter than 8
          characters are not redacted from logs.
        </p>
        {upsert.isError ? (
          <p className="text-error text-sm">{errorMessage(upsert.error)}</p>
        ) : null}
        <div className="modal-action">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={upsert.isPending}>
            {upsert.isPending ? <span className="loading loading-spinner loading-xs" /> : null}
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
