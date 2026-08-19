import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { LuArrowLeft, LuCopy, LuPlay, LuSave } from "react-icons/lu";
import { errorMessage } from "../api/client.js";
import {
  useCreatePlugin,
  useForkScript,
  useSaveScript,
  useScript,
} from "../api/hooks.js";
import { CodeEditor } from "../components/CodeEditor.jsx";
import { ScriptIcon } from "../components/ScriptIcon.jsx";
import { ScriptMetaPanel } from "../components/ScriptMetaPanel.jsx";
import { NEW_SCRIPT_TEMPLATE } from "../lib/script.js";
import { useNotifications } from "../notifications.jsx";

function normalizePluginId(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.js$/i, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function ScriptNewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [id, setId] = useState("");
  const [content, setContent] = useState(
    location.state?.content ?? NEW_SCRIPT_TEMPLATE,
  );
  const create = useCreatePlugin();
  const { notify } = useNotifications();

  function onSave(e) {
    e.preventDefault();
    const pluginId = normalizePluginId(id);
    if (!pluginId) return;
    create.mutate(
      { id: pluginId, content },
      {
        onSuccess: (data) => {
          notify.success("Plugin created — drain-restart to load workers");
          navigate(`/scripts/${encodeURIComponent(data.scriptRef)}/edit`);
        },
      },
    );
  }

  function openDryRun() {
    const pluginId = normalizePluginId(id);
    if (!pluginId) return;
    navigate(`/scripts/${encodeURIComponent(`plugin/${pluginId}`)}/dry-run`, {
      state: { content },
    });
  }

  return (
    <div className="flex h-[calc(100vh-5rem)] min-h-[32rem] flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Link to="/scripts" className="btn btn-ghost btn-sm btn-square" aria-label="Back">
          <LuArrowLeft className="size-4" />
        </Link>
        <h1 className="text-xl font-semibold">New plugin</h1>
        <div className="flex-1" />
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={!normalizePluginId(id)}
          onClick={openDryRun}
        >
          <LuPlay className="size-4" />
          Dry run
        </button>
        <button
          type="submit"
          form="script-edit-form"
          className="btn btn-primary btn-sm"
          disabled={create.isPending || !normalizePluginId(id)}
        >
          <LuSave className="size-4" />
          Create
        </button>
      </div>

      <div className="alert alert-warning text-sm py-2">
        <span>
          User scripts are plugins (<code>plugin/&lt;id&gt;</code>). Core scripts
          are read-only — fork them instead. Installing plugins runs code as the
          JerapahFlow process user.
        </span>
      </div>

      <form id="script-edit-form" onSubmit={onSave} className="flex min-h-0 flex-1 flex-col gap-3">
        <input
          className="input input-sm w-full max-w-md shrink-0 font-mono"
          placeholder="my-script (becomes plugin/my-script)"
          value={id}
          onChange={(e) => setId(e.target.value)}
          required
        />
        <div className="min-h-0 flex-1">
          <CodeEditor language="javascript" value={content} onChange={setContent} height="100%" />
        </div>
        {create.isError ? (
          <p className="text-error text-sm shrink-0">{errorMessage(create.error)}</p>
        ) : null}
      </form>
    </div>
  );
}

export function ScriptEditPage() {
  const { name: rawName } = useParams();
  const name = decodeURIComponent(rawName ?? "");
  const navigate = useNavigate();
  const { notify } = useNotifications();
  const existing = useScript(name);
  const save = useSaveScript();
  const fork = useForkScript();
  const [content, setContent] = useState("");
  const [contentReady, setContentReady] = useState(false);
  const [forkId, setForkId] = useState("");

  const isCore = existing.data?.kind === "core" || existing.data?.editable === false;

  useEffect(() => {
    if (existing.isLoading) return;
    if (existing.data?.content != null) {
      setContent(existing.data.content);
      setContentReady(true);
    }
  }, [existing.data, existing.isLoading]);

  function onSave(e) {
    e.preventDefault();
    if (isCore) return;
    save.mutate(
      { name, content },
      { onSuccess: () => notify.success("Plugin saved") },
    );
  }

  function openDryRun() {
    navigate(`/scripts/${encodeURIComponent(name)}/dry-run`, {
      state: { content },
    });
  }

  function onFork(e) {
    e.preventDefault();
    const id = normalizePluginId(forkId);
    if (!id) return;
    fork.mutate(
      { name, id },
      {
        onSuccess: (data) => {
          notify.success("Forked to plugin — drain-restart recommended");
          navigate(`/scripts/${encodeURIComponent(data.scriptRef)}/edit`);
        },
      },
    );
  }

  if (existing.isLoading) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (existing.isError) {
    return (
      <div className="space-y-3">
        <Link to="/scripts" className="btn btn-ghost btn-sm">
          <LuArrowLeft className="size-4" />
          Back
        </Link>
        <p className="text-error">Script not found</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-5rem)] min-h-[32rem] flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Link to="/scripts" className="btn btn-ghost btn-sm btn-square" aria-label="Back">
          <LuArrowLeft className="size-4" />
        </Link>
        <ScriptIcon name={name} hasIcon={existing.data?.hasIcon} className="size-8 shrink-0" />
        <h1 className="truncate font-mono text-xl font-semibold">{name}</h1>
        <span className={`badge badge-sm ${isCore ? "badge-info" : "badge-accent"}`}>
          {isCore ? "core" : "plugin"}
        </span>
        <div className="flex-1" />
        <button type="button" className="btn btn-outline btn-sm" onClick={openDryRun}>
          <LuPlay className="size-4" />
          Dry run
        </button>
        {!isCore ? (
          <button
            type="submit"
            form="script-edit-form"
            className="btn btn-primary btn-sm"
            disabled={save.isPending || !contentReady}
          >
            <LuSave className="size-4" />
            Save
          </button>
        ) : null}
      </div>

      {isCore ? (
        <div className="alert alert-info text-sm py-2">
          <span>Core scripts are read-only. Fork to create an editable plugin copy.</span>
        </div>
      ) : null}

      {isCore ? (
        <form onSubmit={onFork} className="flex flex-wrap items-center gap-2">
          <input
            className="input input-sm font-mono w-56"
            placeholder="fork id (e.g. fetch-http-copy)"
            value={forkId}
            onChange={(e) => setForkId(e.target.value)}
          />
          <button
            type="submit"
            className="btn btn-sm"
            disabled={fork.isPending || !normalizePluginId(forkId)}
          >
            <LuCopy className="size-4" />
            Fork to plugin
          </button>
          {fork.isError ? (
            <span className="text-error text-sm">{errorMessage(fork.error)}</span>
          ) : null}
        </form>
      ) : null}

      <form id="script-edit-form" onSubmit={onSave} className="min-h-0 flex-1">
        <CodeEditor
          language="javascript"
          value={content}
          onChange={isCore ? () => {} : setContent}
          height="100%"
          readOnly={isCore}
        />
      </form>

      <details className="collapse collapse-arrow shrink-0 border border-base-300 bg-base-100">
        <summary className="collapse-title min-h-0 py-2 text-sm font-semibold">
          Input / output
        </summary>
        <div className="collapse-content">
          <ScriptMetaPanel meta={existing.data?.meta} metaError={existing.data?.metaError} />
        </div>
      </details>

      {save.isError ? (
        <p className="text-error text-sm shrink-0">{errorMessage(save.error)}</p>
      ) : null}
    </div>
  );
}
