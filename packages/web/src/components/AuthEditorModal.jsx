import { useEffect, useState } from "react";
import { LuEye, LuEyeOff } from "react-icons/lu";
import { errorMessage } from "../api/client.js";
import {
  fetchHttpAuthLiterals,
  useHttpPages,
  useUpsertHttpAuth,
} from "../api/hooks.js";
import { FormInput, FormSelect } from "./FormControls.jsx";

function emptyCred(source = "literal") {
  return { source, value: "", kv: "", namespace: "", secret: "" };
}

function credFromPublic(field, literalValue) {
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
  if (typeof literalValue === "string") {
    return {
      source: "literal",
      value: literalValue,
      kv: "",
      namespace: "",
      secret: "",
      keep: true,
    };
  }
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

function emptyForm() {
  return {
    id: null,
    name: "",
    type: "bearer",
    token: emptyCred(),
    user: emptyCred(),
    password: emptyCred(),
    header: "",
    value: emptyCred(),
    unauthorized_status: "",
    unauthorized_response: "",
  };
}

function formFromAuth(auth, literals = {}) {
  const cfg = auth.config ?? {};
  return {
    id: auth.id,
    name: auth.name,
    type: auth.type,
    token: credFromPublic(cfg.token, literals.token),
    user: credFromPublic(cfg.user, literals.user),
    password: credFromPublic(cfg.password, literals.password),
    header: cfg.header ?? "",
    value: credFromPublic(cfg.value, literals.value),
    unauthorized_status: auth.unauthorized_status ?? "",
    unauthorized_response: auth.unauthorized_response ?? "",
  };
}

function Field({ label, children, hint }) {
  return (
    <div className="form-control w-full">
      <div className="label py-1">
        <span className="label-text text-sm font-medium">{label}</span>
      </div>
      {children}
      {hint ? (
        <div className="label py-1">
          <span className="label-text-alt opacity-60">{hint}</span>
        </div>
      ) : null}
    </div>
  );
}

function CredentialFields({ label, cred, onChange, allowEmpty, masked }) {
  const [show, setShow] = useState(false);

  return (
    <div className="space-y-3 rounded-box border border-base-300 p-3">
      <p className="text-sm font-medium">{label}</p>
      <Field label="Source">
        <FormSelect
          className="w-full"
          value={cred.source}
          onChange={(e) => onChange({ ...cred, source: e.target.value, keep: false })}
        >
          <option value="literal">Plain text</option>
          <option value="kv">From KV</option>
          <option value="secret">From secret</option>
        </FormSelect>
      </Field>
      {cred.source === "literal" ? (
        <Field
          label="Value"
          hint={
            cred.keep && !cred.value
              ? "A value is already set. Enter a new one to replace it."
              : null
          }
        >
          <div className="flex w-full gap-1">
            <FormInput
              type={masked && !show ? "password" : "text"}
              className="w-full font-mono"
              value={cred.value}
              onChange={(e) => onChange({ ...cred, value: e.target.value, keep: false })}
              placeholder={
                cred.keep && !cred.value ? "(unchanged — leave blank to keep)" : ""
              }
              required={!allowEmpty && !cred.keep && !cred.value}
              autoComplete="off"
            />
            {masked ? (
              <button
                type="button"
                className="btn btn-ghost btn-square shrink-0"
                title={show ? "Hide" : "Reveal"}
                aria-label={show ? "Hide value" : "Reveal value"}
                onClick={() => setShow((v) => !v)}
              >
                {show ? <LuEyeOff className="size-4" /> : <LuEye className="size-4" />}
              </button>
            ) : null}
          </div>
        </Field>
      ) : null}
      {cred.source === "kv" ? (
        <>
          <Field label="Namespace (optional)">
            <FormInput
              className="w-full font-mono"
              placeholder="namespace"
              value={cred.namespace}
              onChange={(e) => onChange({ ...cred, namespace: e.target.value })}
            />
          </Field>
          <Field label="Key">
            <FormInput
              className="w-full font-mono"
              placeholder="key"
              value={cred.kv}
              onChange={(e) => onChange({ ...cred, kv: e.target.value })}
              required
            />
          </Field>
        </>
      ) : null}
      {cred.source === "secret" ? (
        <Field
          label="Secret name"
          hint="Encrypted secret — value is never shown here. Manage it on the Secrets page."
        >
          <FormInput
            className="w-full font-mono"
            placeholder="secret name"
            value={cred.secret}
            onChange={(e) => onChange({ ...cred, secret: e.target.value })}
            required
            pattern="[A-Za-z0-9._-]+"
          />
        </Field>
      ) : null}
    </div>
  );
}

/**
 * Add / edit an HTTP trigger auth profile.
 * Reusable: mount when open; pass `auth` for edit (literals loaded inside).
 *
 * @param {"add" | "edit"} mode
 * @param {object} [auth] Public auth row when mode is "edit"
 * @param {() => void} onClose
 * @param {(saved: unknown) => void} [onSaved]
 */
export function AuthEditorModal({ mode, auth, onClose, onSaved }) {
  const { data: pages = [] } = useHttpPages();
  const upsert = useUpsertHttpAuth();
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(mode === "edit");

  useEffect(() => {
    if (mode !== "edit" || !auth?.id) {
      setForm(emptyForm());
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      /** @type {Record<string, string>} */
      let literals = {};
      try {
        const data = await fetchHttpAuthLiterals(auth.id);
        literals = data.literals ?? {};
      } catch {
        // Form still works with keep markers
      }
      if (cancelled) return;
      setForm(formFromAuth(auth, literals));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, auth]);

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
        id: form.id,
        name: form.name,
        type: form.type,
        config,
        unauthorized_status:
          form.unauthorized_status === "" ? null : Number(form.unauthorized_status),
        unauthorized_response: form.unauthorized_response || null,
      },
      {
        onSuccess: (data) => {
          onSaved?.(data?.auth ?? data);
          onClose();
        },
      },
    );
  }

  const title = mode === "add" ? "New auth profile" : `Edit ${form.name || auth?.name || ""}`;

  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-xl">
        <h3 className="font-bold">{title}</h3>
        {loading ? (
          <div className="flex justify-center py-10">
            <span className="loading loading-spinner" />
          </div>
        ) : (
          <form className="mt-3 space-y-4" onSubmit={onSubmit}>
            <Field label="Name">
              <FormInput
                className="w-full font-mono"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                pattern="[A-Za-z0-9._-]+"
                autoComplete="off"
              />
            </Field>

            <Field label="Type">
              <FormSelect
                className="w-full"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="bearer">bearer</option>
                <option value="basic">basic</option>
                <option value="header">header</option>
              </FormSelect>
            </Field>

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
                  masked
                />
              </>
            ) : null}
            {form.type === "header" ? (
              <>
                <Field label="Header name">
                  <FormInput
                    className="w-full font-mono"
                    value={form.header}
                    onChange={(e) => setForm({ ...form, header: e.target.value })}
                    required
                    placeholder="X-Webhook-Secret"
                  />
                </Field>
                <CredentialFields
                  label="Header value"
                  cred={form.value}
                  onChange={(value) => setForm({ ...form, value })}
                />
              </>
            ) : null}

            <Field label="Unauthorized status (optional)">
              <FormInput
                type="number"
                className="w-full"
                value={form.unauthorized_status}
                onChange={(e) => setForm({ ...form, unauthorized_status: e.target.value })}
                min={100}
                max={599}
                placeholder="401"
              />
            </Field>

            <Field label="Unauthorized response page (optional)">
              <FormSelect
                className="w-full"
                value={form.unauthorized_response}
                onChange={(e) => setForm({ ...form, unauthorized_response: e.target.value })}
              >
                <option value="">(default JSON)</option>
                {pages.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </FormSelect>
            </Field>

            {upsert.isError ? (
              <p className="text-error text-sm">{errorMessage(upsert.error)}</p>
            ) : null}
            <div className="modal-action">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={upsert.isPending}>
                {upsert.isPending ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : null}
                Save
              </button>
            </div>
          </form>
        )}
        {loading ? (
          <div className="modal-action">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
          </div>
        ) : null}
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="button" onClick={onClose}>
          close
        </button>
      </form>
    </dialog>
  );
}
