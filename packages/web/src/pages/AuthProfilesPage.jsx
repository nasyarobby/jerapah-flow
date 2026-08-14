import { useState } from "react";
import { LuPencil, LuPlus, LuTrash2, LuX } from "react-icons/lu";
import { errorMessage } from "../api/client.js";
import {
  useDeleteHttpAuth,
  useHttpAuths,
  useHttpPages,
  useUpsertHttpAuth,
} from "../api/hooks.js";
import { formatTime } from "../lib/format.jsx";

function emptyCred(source = "literal") {
  return { source, value: "", kv: "", namespace: "", secret: "" };
}

function credFromPublic(field) {
  if (!field || field.source === "missing") return emptyCred("literal");
  if (field.source === "kv") {
    return {
      source: "kv",
      value: "",
      kv: field.kv ?? "",
      namespace: field.namespace ?? "",
      secret: "",
    };
  }
  if (field.source === "secret") {
    return {
      source: "secret",
      value: "",
      kv: "",
      namespace: "",
      secret: field.secret ?? "",
    };
  }
  // literal — already set; keep marker so we don't require re-entry on edit
  return {
    source: "literal",
    value: "",
    kv: "",
    namespace: "",
    secret: "",
    keep: field.set === true,
  };
}

function toApiField(cred, { required = true } = {}) {
  if (cred.source === "kv") {
    const out = { kv: cred.kv };
    if (cred.namespace) out.namespace = cred.namespace;
    return out;
  }
  if (cred.source === "secret") {
    return { secret: cred.secret };
  }
  if (cred.value) return cred.value;
  if (cred.keep) return { keep: true };
  if (!required) return "";
  return null;
}

function sourceLabel(field) {
  if (!field || field.source === "missing") return "—";
  if (field.source === "kv") {
    return field.namespace ? `kv:${field.namespace}/${field.kv}` : `kv:${field.kv}`;
  }
  if (field.source === "secret") return `secret:${field.secret}`;
  if (field.source === "literal") return "literal";
  return "—";
}

function CredentialFields({ label, cred, onChange, allowEmpty }) {
  return (
    <div className="space-y-1 border-base-300 border rounded-box p-3">
      <label className="label py-0">{label}</label>
      <select
        className="select select-sm w-full"
        value={cred.source}
        onChange={(e) => onChange({ ...cred, source: e.target.value, keep: false })}
      >
        <option value="literal">Plain text</option>
        <option value="kv">From KV</option>
        <option value="secret">From secret</option>
      </select>
      {cred.source === "literal" ? (
        <>
          <input
            type="password"
            className="input input-sm w-full"
            value={cred.value}
            onChange={(e) => onChange({ ...cred, value: e.target.value, keep: false })}
            placeholder={cred.keep ? "(unchanged — leave blank to keep)" : ""}
            required={!allowEmpty && !cred.keep}
            autoComplete="new-password"
          />
          {cred.keep ? (
            <p className="text-xs opacity-60">A value is already set. Enter a new one to replace it.</p>
          ) : null}
        </>
      ) : null}
      {cred.source === "kv" ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="input input-sm w-full font-mono"
            placeholder="namespace (optional)"
            value={cred.namespace}
            onChange={(e) => onChange({ ...cred, namespace: e.target.value })}
          />
          <input
            className="input input-sm w-full font-mono"
            placeholder="key"
            value={cred.kv}
            onChange={(e) => onChange({ ...cred, kv: e.target.value })}
            required
          />
        </div>
      ) : null}
      {cred.source === "secret" ? (
        <input
          className="input input-sm w-full font-mono"
          placeholder="secret name"
          value={cred.secret}
          onChange={(e) => onChange({ ...cred, secret: e.target.value })}
          required
          pattern="[A-Za-z0-9._-]+"
        />
      ) : null}
    </div>
  );
}

const emptyForm = () => ({
  name: "",
  type: "bearer",
  token: emptyCred(),
  user: emptyCred(),
  password: emptyCred(),
  header: "",
  value: emptyCred(),
  unauthorized_status: "",
  unauthorized_response: "",
});

export function AuthProfilesPage() {
  const { data: auths = [], isLoading } = useHttpAuths();
  const { data: pages = [] } = useHttpPages();
  const upsert = useUpsertHttpAuth();
  const del = useDeleteHttpAuth();
  const [mode, setMode] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmDelete, setConfirmDelete] = useState(null);

  function openAdd() {
    setMode("add");
    setForm(emptyForm());
  }

  function openEdit(a) {
    setMode("edit");
    const cfg = a.config ?? {};
    setForm({
      name: a.name,
      type: a.type,
      token: credFromPublic(cfg.token),
      user: credFromPublic(cfg.user),
      password: credFromPublic(cfg.password),
      header: cfg.header ?? "",
      value: credFromPublic(cfg.value),
      unauthorized_status: a.unauthorized_status ?? "",
      unauthorized_response: a.unauthorized_response ?? "",
    });
  }

  function closeForm() {
    setMode(null);
    setForm(emptyForm());
  }

  function onSubmit(e) {
    e.preventDefault();
    /** @type {Record<string, unknown>} */
    let config = {};
    if (form.type === "bearer") {
      const token = toApiField(form.token);
      if (token == null) return;
      config = { token };
    } else if (form.type === "basic") {
      const user = toApiField(form.user);
      if (user == null) return;
      const password = toApiField(form.password, { required: false });
      config = { user, password: password ?? "" };
    } else {
      const value = toApiField(form.value);
      if (value == null) return;
      config = { header: form.header, value };
    }

    upsert.mutate(
      {
        name: form.name,
        type: form.type,
        config,
        unauthorized_status:
          form.unauthorized_status === "" ? null : Number(form.unauthorized_status),
        unauthorized_response: form.unauthorized_response || null,
      },
      { onSuccess: closeForm },
    );
  }

  function summarize(a) {
    const cfg = a.config ?? {};
    if (a.type === "bearer") return sourceLabel(cfg.token);
    if (a.type === "basic") {
      return `user=${sourceLabel(cfg.user)} pass=${sourceLabel(cfg.password)}`;
    }
    return `${cfg.header ?? "?"} = ${sourceLabel(cfg.value)}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Auth</h1>
        <button type="button" className="btn btn-primary btn-sm" onClick={openAdd}>
          <LuPlus className="size-4" />
          Add
        </button>
      </div>
      <p className="text-sm opacity-70">
        Named HTTP trigger auth profiles. Reference in YAML as{" "}
        <code className="font-mono text-xs">auth: name</code>. Secrets are managed on the Secrets
        page; KV values stay in KV.
      </p>

      {isLoading ? (
        <span className="loading loading-spinner" />
      ) : auths.length === 0 ? (
        <p className="text-sm opacity-60">No auth profiles yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Credentials</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {auths.map((a) => (
                <tr key={a.id} className="hover">
                  <td className="font-mono">{a.name}</td>
                  <td>{a.type}</td>
                  <td className="font-mono text-xs">{summarize(a)}</td>
                  <td className="whitespace-nowrap">{formatTime(a.updated_at)}</td>
                  <td className="text-right whitespace-nowrap">
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      title="Edit"
                      onClick={() => openEdit(a)}
                    >
                      <LuPencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs text-error"
                      title="Delete"
                      onClick={() => setConfirmDelete(a)}
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
          className="fieldset bg-base-100 border-base-300 rounded-box max-w-xl border p-4 space-y-2"
        >
          <div className="flex items-center justify-between">
            <legend className="fieldset-legend">
              {mode === "add" ? "New auth profile" : `Edit ${form.name}`}
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
            disabled={mode === "edit"}
          />
          <label className="label">Type</label>
          <select
            className="select w-full"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            <option value="bearer">bearer</option>
            <option value="basic">basic</option>
            <option value="header">header</option>
          </select>

          {form.type === "bearer" ? (
            <CredentialFields
              label="Token"
              cred={form.token}
              onChange={(token) => setForm({ ...form, token })}
            />
          ) : null}
          {form.type === "basic" ? (
            <>
              <CredentialFields
                label="User"
                cred={form.user}
                onChange={(user) => setForm({ ...form, user })}
              />
              <CredentialFields
                label="Password"
                cred={form.password}
                onChange={(password) => setForm({ ...form, password })}
                allowEmpty
              />
            </>
          ) : null}
          {form.type === "header" ? (
            <>
              <label className="label">Header name</label>
              <input
                className="input w-full font-mono"
                value={form.header}
                onChange={(e) => setForm({ ...form, header: e.target.value })}
                required
                placeholder="X-Webhook-Secret"
              />
              <CredentialFields
                label="Header value"
                cred={form.value}
                onChange={(value) => setForm({ ...form, value })}
              />
            </>
          ) : null}

          <label className="label">Unauthorized status (optional)</label>
          <input
            type="number"
            className="input w-full"
            value={form.unauthorized_status}
            onChange={(e) => setForm({ ...form, unauthorized_status: e.target.value })}
            min={100}
            max={599}
            placeholder="401"
          />
          <label className="label">Unauthorized response page (optional)</label>
          <select
            className="select w-full"
            value={form.unauthorized_response}
            onChange={(e) => setForm({ ...form, unauthorized_response: e.target.value })}
          >
            <option value="">(default JSON)</option>
            {pages.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>

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
              Workflows that reference this profile will fail auth until updated.
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
