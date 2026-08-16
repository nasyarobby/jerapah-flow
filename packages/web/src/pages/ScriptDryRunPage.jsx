import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { LuArrowLeft, LuPlay, LuSave } from "react-icons/lu";
import { errorMessage } from "../api/client.js";
import {
  useDryRunScript,
  useOwners,
  useSaveScript,
  useScript,
} from "../api/hooks.js";
import { CodeEditor } from "../components/CodeEditor.jsx";
import { LogViewer } from "../components/LogViewer.jsx";
import { ScriptIcon } from "../components/ScriptIcon.jsx";
import { ScriptMetaPanel } from "../components/ScriptMetaPanel.jsx";
import { StatusBadge } from "../lib/format.jsx";
import {
  DEFAULT_INPUT_CONTEXT,
  NEW_SCRIPT_TEMPLATE,
  contextFromMeta,
  prettyJson,
} from "../lib/script.js";
import { useNotifications } from "../notifications.jsx";

export function ScriptDryRunPage() {
  const { notify } = useNotifications();
  const { name: rawName } = useParams();
  const name = decodeURIComponent(rawName ?? "");
  const location = useLocation();
  const stateContent = location.state?.content;

  const existing = useScript(name, stateContent == null);
  const dryRun = useDryRunScript();
  const save = useSaveScript();
  const { data: owners = [] } = useOwners();
  const [owner, setOwner] = useState("default");

  const [content, setContent] = useState("");
  const [inputJson, setInputJson] = useState(DEFAULT_INPUT_CONTEXT);
  const [inputTouched, setInputTouched] = useState(false);
  const [outputJson, setOutputJson] = useState("");
  const [logs, setLogs] = useState([]);
  const [runStatus, setRunStatus] = useState(null);
  const [parseError, setParseError] = useState(null);
  const [contentReady, setContentReady] = useState(false);

  useEffect(() => {
    if (stateContent != null) {
      setContent(stateContent);
      setContentReady(true);
      return;
    }
    if (existing.isLoading) return;
    if (existing.data?.content != null) {
      setContent(existing.data.content);
      setContentReady(true);
      return;
    }
    if (existing.isError) {
      setContent(NEW_SCRIPT_TEMPLATE);
      setContentReady(true);
    }
  }, [stateContent, existing.data, existing.isLoading, existing.isError]);

  const backHref = `/scripts/${encodeURIComponent(name)}/edit`;

  const lastRun = dryRun.data;
  const meta = lastRun?.meta ?? existing.data?.meta ?? null;
  const metaError = lastRun?.metaError ?? existing.data?.metaError ?? null;

  useEffect(() => {
    if (inputTouched) return;
    if (!existing.data?.meta) return;
    setInputJson(prettyJson(contextFromMeta(existing.data.meta)));
  }, [existing.data?.meta, inputTouched]);

  useEffect(() => {
    if (!lastRun) return;
    setRunStatus(lastRun.status);
    setLogs(lastRun.logs ?? []);
    if (lastRun.status === "success") {
      const envelope = { output: lastRun.output, context: lastRun.context };
      if (lastRun.skipRemaining) envelope.skipRemaining = true;
      setOutputJson(prettyJson(envelope));
    } else {
      setOutputJson(prettyJson({ error: lastRun.error ?? "run failed" }));
    }
  }, [lastRun]);

  const runDisabledReason = useMemo(() => {
    if (!contentReady) return "loading script";
    if (!name) return "missing script name";
    if (dryRun.isPending) return "running";
    return null;
  }, [contentReady, name, dryRun.isPending]);

  function parseInputContext() {
    let parsed;
    try {
      parsed = JSON.parse(inputJson);
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "invalid JSON");
    }
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error('input must be a JSON object with "data", "context", and/or "config"');
    }
    return {
      data: "data" in parsed ? parsed.data : null,
      context: "context" in parsed ? parsed.context : {},
      config: "config" in parsed ? parsed.config : null,
    };
  }

  function onRun() {
    setParseError(null);
    let ctx;
    try {
      ctx = parseInputContext();
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
      return;
    }

    dryRun.mutate({
      name,
      content,
      data: ctx.data,
      context: ctx.context,
      config: ctx.config,
      owner,
    });
  }

  function onSave() {
    save.mutate(
      { name, content },
      { onSuccess: () => notify.success("Script saved") },
    );
  }

  return (
    <div className="flex h-[calc(100vh-5rem)] min-h-[32rem] flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Link to={backHref} className="btn btn-ghost btn-sm btn-square" aria-label="Back">
          <LuArrowLeft className="size-4" />
        </Link>
        <ScriptIcon name={name} hasIcon={existing.data?.hasIcon} className="size-8 shrink-0" />
        <h1 className="truncate font-mono text-lg font-semibold">{name}</h1>
        <span className="badge badge-ghost badge-sm">dry run</span>
        {runStatus ? <StatusBadge status={runStatus} /> : null}
        {lastRun?.durationMs != null ? (
          <span className="text-sm opacity-60">{lastRun.durationMs}ms</span>
        ) : null}
        <div className="flex-1" />
        <label className="flex items-center gap-1 text-sm">
          <span className="opacity-60 hidden sm:inline">Owner</span>
          <select
            className="select select-sm"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
          >
            {owners.includes(owner) ? null : <option value={owner}>{owner}</option>}
            {owners.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={Boolean(runDisabledReason)}
          onClick={onRun}
        >
          {dryRun.isPending ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            <LuPlay className="size-4" />
          )}
          Run
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={save.isPending || !contentReady}
          onClick={onSave}
        >
          <LuSave className="size-4" />
          Save
        </button>
      </div>

      {parseError ? (
        <p className="text-error text-sm shrink-0">{parseError}</p>
      ) : null}
      {dryRun.isError ? (
        <p className="text-error text-sm shrink-0">{errorMessage(dryRun.error)}</p>
      ) : null}
      {save.isError ? (
        <p className="text-error text-sm shrink-0">{errorMessage(save.error)}</p>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-3">
        <section className="flex min-h-0 flex-col gap-1">
          <h2 className="shrink-0 text-sm font-semibold opacity-70">Input context</h2>
          <div className="min-h-0 flex-1">
            <CodeEditor
              language="json"
              value={inputJson}
              onChange={(value) => {
                setInputTouched(true);
                setInputJson(value);
              }}
              height="100%"
            />
          </div>
        </section>

        <section className="flex min-h-0 flex-col gap-1">
          <h2 className="shrink-0 text-sm font-semibold opacity-70">Script</h2>
          <div className="min-h-0 flex-1">
            {!contentReady ? (
              <div className="flex h-full items-center justify-center rounded-box border border-base-300">
                <span className="loading loading-spinner" />
              </div>
            ) : (
              <CodeEditor
                language="javascript"
                value={content}
                onChange={setContent}
                height="100%"
              />
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col gap-1">
          <h2 className="shrink-0 text-sm font-semibold opacity-70">Result (output + context)</h2>
          <div className="min-h-0 flex-1">
            <CodeEditor
              language="json"
              value={outputJson}
              onChange={() => {}}
              readOnly
              height="100%"
            />
          </div>
        </section>
      </div>

      <details className="collapse collapse-arrow shrink-0 border border-base-300 bg-base-100">
        <summary className="collapse-title min-h-0 py-2 text-sm font-semibold">
          Input / output
        </summary>
        <div className="collapse-content">
          <ScriptMetaPanel meta={meta} metaError={metaError} />
        </div>
      </details>

      <LogViewer logs={logs} className="h-48 shrink-0 lg:h-56" />
    </div>
  );
}
