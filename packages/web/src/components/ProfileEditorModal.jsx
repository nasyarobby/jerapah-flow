import { useState } from "react";
import { errorMessage } from "../api/client.js";
import { useScripts, useUpsertProfile } from "../api/hooks.js";
import { FormInput, FormSelect } from "./FormControls.jsx";
import { ConfigFields } from "./workflow/ConfigFields.jsx";
import { DEFAULT_OWNER } from "../lib/tenant.js";

/**
 * @param {"add" | "edit"} mode
 * @param {{
 *   owner: string,
 *   name?: string,
 *   script?: string,
 *   config?: Record<string, unknown>,
 *   description?: string,
 * }} initial
 * @param {number} [usageCount]
 */
export function ProfileEditorModal({ mode, initial, onClose, onSaved, usageCount = 0 }) {
  const { data: scripts = [] } = useScripts();
  const upsert = useUpsertProfile();
  const [form, setForm] = useState(() => ({
    owner: initial.owner || DEFAULT_OWNER,
    name: initial.name || "",
    script: initial.script || "",
    config:
      initial.config && typeof initial.config === "object" && !Array.isArray(initial.config)
        ? { ...initial.config }
        : {},
    description: initial.description || "",
  }));
  const [formError, setFormError] = useState(null);
  const [confirmScript, setConfirmScript] = useState(false);

  const scriptChanged = mode === "edit" && form.script !== (initial.script || "");
  const listed = scripts.find((s) => (typeof s === "string" ? s : s.name) === form.script);
  const meta = listed && typeof listed === "object" ? listed.meta : null;

  function submit() {
    setFormError(null);
    if (!form.name.trim()) {
      setFormError("name is required");
      return;
    }
    if (!form.script.trim()) {
      setFormError("script is required");
      return;
    }
    upsert.mutate(
      {
        owner: form.owner,
        name: form.name,
        script: form.script,
        config: form.config,
        description: form.description,
      },
      {
        onSuccess: (data) => {
          onSaved?.(data?.profile ?? data);
          onClose();
        },
      },
    );
  }

  function onSubmit(e) {
    e.preventDefault();
    if (scriptChanged && usageCount > 0 && !confirmScript) {
      setConfirmScript(true);
      return;
    }
    submit();
  }

  const title = mode === "add" ? "New profile" : `Edit ${form.name}`;

  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-lg">
        <h3 className="font-bold">{title}</h3>
        <form className="mt-3 space-y-2" onSubmit={onSubmit}>
          {mode === "add" ? (
            <label className="form-control w-full">
              <span className="label py-0 text-sm">Name</span>
              <FormInput
                className="w-full font-mono"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                pattern="[A-Za-z0-9._-]+"
                title="Letters, numbers, dots, underscores, hyphens. Cannot be changed later."
              />
              <span className="label-text-alt opacity-60">
                YAML id. Locked after create so live workflow refs stay valid.
              </span>
            </label>
          ) : (
            <p className="text-sm opacity-70">
              <span className="font-mono">{form.name}</span>
              <span className="ml-2 opacity-60">(name cannot be changed)</span>
            </p>
          )}
          <label className="form-control w-full">
            <span className="label py-0 text-sm">Script</span>
            <FormSelect
              className="w-full font-mono"
              value={form.script}
              onChange={(e) => {
                setForm({ ...form, script: e.target.value });
                setConfirmScript(false);
              }}
              required
            >
              <option value="">Select script</option>
              {scripts.map((s) => {
                const name = typeof s === "string" ? s : s.name;
                return (
                  <option key={name} value={name}>
                    {name}
                  </option>
                );
              })}
              {form.script && !scripts.some((s) => (typeof s === "string" ? s : s.name) === form.script) ? (
                <option value={form.script}>{form.script}</option>
              ) : null}
            </FormSelect>
          </label>
          {scriptChanged && usageCount > 0 ? (
            <p className="text-warning text-sm">
              Changing the script updates {usageCount} workflow
              {usageCount === 1 ? "" : "s"} that use this profile
              {confirmScript ? ". Save to apply." : "."}
            </p>
          ) : null}
          <label className="form-control w-full">
            <span className="label py-0 text-sm">Description</span>
            <FormInput
              className="w-full"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              maxLength={500}
            />
          </label>
          <div>
            <p className="text-sm mb-1">Config (defaults for every step that uses this profile)</p>
            <ConfigFields
              script={form.script}
              config={form.config}
              meta={meta}
              owner={form.owner}
              onChange={(config) => setForm({ ...form, config })}
            />
          </div>
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
              {scriptChanged && usageCount > 0 && !confirmScript ? "Confirm script change" : "Save"}
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
