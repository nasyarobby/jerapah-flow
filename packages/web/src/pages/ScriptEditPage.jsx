import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { LuArrowLeft, LuPlay, LuSave } from "react-icons/lu";
import { errorMessage } from "../api/client.js";
import { useSaveScript, useScript } from "../api/hooks.js";
import { CodeEditor } from "../components/CodeEditor.jsx";
import { ScriptIcon } from "../components/ScriptIcon.jsx";
import { ScriptMetaPanel } from "../components/ScriptMetaPanel.jsx";
import { NEW_SCRIPT_TEMPLATE, normalizeScriptName } from "../lib/script.js";
import { useNotifications } from "../notifications.jsx";

export function ScriptNewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [name, setName] = useState("");
  const [content, setContent] = useState(
    location.state?.content ?? NEW_SCRIPT_TEMPLATE,
  );
  const save = useSaveScript();

  function onSave(e) {
    e.preventDefault();
    const file = normalizeScriptName(name);
    if (!file) return;
    save.mutate(
      { name: file, content },
      {
        onSuccess: () => navigate(`/scripts/${encodeURIComponent(file)}/edit`),
      },
    );
  }

  function openDryRun() {
    const file = normalizeScriptName(name);
    if (!file) return;
    navigate(`/scripts/${encodeURIComponent(file)}/dry-run`, {
      state: { content },
    });
  }

  return (
    <div className="flex h-[calc(100vh-5rem)] min-h-[32rem] flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Link to="/scripts" className="btn btn-ghost btn-sm btn-square" aria-label="Back">
          <LuArrowLeft className="size-4" />
        </Link>
        <h1 className="text-xl font-semibold">New script</h1>
        <div className="flex-1" />
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={!normalizeScriptName(name)}
          onClick={openDryRun}
        >
          <LuPlay className="size-4" />
          Dry run
        </button>
        <button
          type="submit"
          form="script-edit-form"
          className="btn btn-primary btn-sm"
          disabled={save.isPending || !normalizeScriptName(name)}
        >
          <LuSave className="size-4" />
          Save
        </button>
      </div>

      <form id="script-edit-form" onSubmit={onSave} className="flex min-h-0 flex-1 flex-col gap-3">
        <input
          className="input input-sm w-full max-w-md shrink-0"
          placeholder="name.js"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <div className="min-h-0 flex-1">
          <CodeEditor language="javascript" value={content} onChange={setContent} height="100%" />
        </div>
        {save.isError ? (
          <p className="text-error text-sm shrink-0">{errorMessage(save.error)}</p>
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
  const [content, setContent] = useState("");
  const [contentReady, setContentReady] = useState(false);

  useEffect(() => {
    if (existing.isLoading) return;
    if (existing.data?.content != null) {
      setContent(existing.data.content);
      setContentReady(true);
    }
  }, [existing.data, existing.isLoading]);

  function onSave(e) {
    e.preventDefault();
    save.mutate(
      { name, content },
      { onSuccess: () => notify.success("Script saved") },
    );
  }

  function openDryRun() {
    navigate(`/scripts/${encodeURIComponent(name)}/dry-run`, {
      state: { content },
    });
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
        <div className="flex-1" />
        <button type="button" className="btn btn-outline btn-sm" onClick={openDryRun}>
          <LuPlay className="size-4" />
          Dry run
        </button>
        <button
          type="submit"
          form="script-edit-form"
          className="btn btn-primary btn-sm"
          disabled={save.isPending || !contentReady}
        >
          <LuSave className="size-4" />
          Save
        </button>
      </div>

      <form id="script-edit-form" onSubmit={onSave} className="min-h-0 flex-1">
        <CodeEditor language="javascript" value={content} onChange={setContent} height="100%" />
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
