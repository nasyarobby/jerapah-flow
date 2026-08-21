import { useState } from "react";
import { errorMessage } from "../api/client.js";
import { useOwners, useUpsertVariable } from "../api/hooks.js";
import { FormInput, FormSelect, FormTextarea } from "./FormControls.jsx";

const TYPES = ["string", "number", "boolean"];

function defaultValue(type) {
  if (type === "boolean") return false;
  if (type === "number") return "";
  return "";
}

/**
 * Add / edit a plaintext workflow variable.
 * Reusable: mount when open; parent supplies mode + initial fields.
 *
 * @param {"add" | "edit"} mode
 * @param {{ owner: string, name?: string, type?: string, value?: string | number | boolean }} initial
 * @param {() => void} onClose
 * @param {(saved: unknown) => void} [onSaved]
 * @param {boolean} [lockOwner] When true, owner cannot be changed (add mode).
 */
export function VariableEditorModal({
  mode,
  initial,
  onClose,
  onSaved,
  lockOwner = false,
}) {
  const { data: owners = [] } = useOwners();
  const upsert = useUpsertVariable();
  const [form, setForm] = useState(() => ({
    owner: initial.owner || owners[0] || "default",
    name: initial.name || "",
    type: initial.type || "string",
    value:
      initial.type === "number"
        ? String(initial.value ?? "")
        : initial.value !== undefined
          ? initial.value
          : defaultValue(initial.type || "string"),
  }));
  const [formError, setFormError] = useState(null);

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
      {
        onSuccess: (data) => {
          onSaved?.(data?.variable ?? data);
          onClose();
        },
      },
    );
  }

  const title = mode === "add" ? "New variable" : `Edit ${form.owner}/${form.name}`;

  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-md">
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
            <span className="label py-0 text-sm">Type</span>
            <FormSelect
              className="w-full"
              value={form.type}
              onChange={(e) => onTypeChange(e.target.value)}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </FormSelect>
          </label>
          <label className="form-control w-full">
            <span className="label py-0 text-sm">Value</span>
            {form.type === "boolean" ? (
              <FormSelect
                className="w-full"
                value={form.value === true ? "true" : "false"}
                onChange={(e) => setForm({ ...form, value: e.target.value === "true" })}
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </FormSelect>
            ) : form.type === "number" ? (
              <FormInput
                type="number"
                className="w-full font-mono"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                required
                step="any"
              />
            ) : (
              <FormTextarea
                className="w-full font-mono min-h-24"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                spellCheck={false}
              />
            )}
          </label>
          <p className="text-xs opacity-60">
            Stored in plaintext. Use Secrets for credentials. In workflows use{" "}
            <span className="font-mono">$VAR_name</span> as a whole field.
          </p>
          {formError ? <p className="text-error text-sm">{formError}</p> : null}
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
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="button" onClick={onClose}>
          close
        </button>
      </form>
    </dialog>
  );
}
