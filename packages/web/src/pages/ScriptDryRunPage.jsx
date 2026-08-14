import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { LuArrowLeft, LuPlay, LuSave } from "react-icons/lu";
import { errorMessage } from "../api/client.js";
import {
  useDryRunScript,
  useSaveScript,
  useScript,
} from "../api/hooks.js";
import { CodeEditor } from "../components/CodeEditor.jsx";
import { LogViewer } from "../components/LogViewer.jsx";
import { StatusBadge } from "../lib/format.jsx";
import {
  DEFAULT_INPUT_CONTEXT,
  NEW_SCRIPT_TEMPLATE,
  normalizeScriptName,
  prettyJson,
} from "../lib/script.js";

export function ScriptDryRunPage() {
  const { name: rawName } = useParams();
  const name = decodeURIComponent(rawName ?? "");
  const location = useLocation();
  const stateContent = location.state?.content;

  const existing = useScript(name, stateContent == null);
  const dryRun = useDryRunScript();
  const save = useSaveScript();

  const [content, setContent] = useState("");
  const [inputJson, setInputJson] = useState(DEFAULT_INPUT_CONTEXT);
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

  useEffect(() => {
    if (!lastRun) return;
    setRunStatus(lastRun.status);
    setLogs(lastRun.logs ?? []);
    if (lastRun.status === "success") {
      setOutputJson(prettyJson(lastRun.output));
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
      throw new Error('input context must be a JSON object with "data" and/or "config"');
    }
    return {
      data: "data" in parsed ? parsed.data : null,
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
      config: ctx.config,
    });
  }

  function onSave() {
    save.mutate({ name, content });
  }

  return (
    <div className="flex h-[calc(100vh-5rem)] min-h-[32rem] flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Link to={backHref} className="btn btn-ghost btn-sm btn-square" aria-label="Back">
          <LuArrowLeft className="size-4" />
        </Link>
        <h1 className="truncate font-mono text-lg font-semibold">{name}</h1>
        <span className="badge badge-ghost badge-sm">dry run</span>
        {runStatus ? <StatusBadge status={runStatus} /> : null}
        {lastRun?.durationMs != null ? (
          <span className="text-sm opacity-60">{lastRun.durationMs}ms</span>
        ) : null}
        <div className="flex-1" />
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
      {save.isSuccess ? (
        <p className="text-success text-sm shrink-0">Script saved</p>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-3">
        <section className="flex min-h-0 flex-col gap-1">
          <h2 className="shrink-0 text-sm font-semibold opacity-70">Input context</h2>
          <div className="min-h-0 flex-1">
            <CodeEditor
              language="json"
              value={inputJson}
              onChange={setInputJson}
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
          <h2 className="shrink-0 text-sm font-semibold opacity-70">Output</h2>
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

      <LogViewer logs={logs} className="h-48 shrink-0 lg:h-56" />
    </div>
  );
}
