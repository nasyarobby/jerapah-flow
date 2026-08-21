import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LuMaximize2, LuMinimize2, LuPlay } from "react-icons/lu";
import { api, errorMessage } from "../../api/client.js";
import { useRunWorkflow } from "../../api/hooks.js";
import { CodeEditor } from "../CodeEditor.jsx";
import { StatusBadge } from "../../lib/format";
import { prettyJson } from "../../lib/script.js";
import {
  overlayWorkflowTestData,
  readWorkflowTestData,
  writeWorkflowTestData,
} from "../../lib/workflow-test-storage.js";
import { SchemaTooltip } from "./FieldHelp.jsx";

const SAVE_DEBOUNCE_MS = 300;
const POLL_MS = 1500;

function initialDataJson(owner, file, defaultData) {
  return prettyJson(overlayWorkflowTestData(defaultData, readWorkflowTestData(owner, file)));
}

function isTerminalStatus(status) {
  return status === "success" || status === "failed";
}

async function waitForRun(runId, { signal } = {}) {
  while (!signal?.aborted) {
    const run = (await api.get(`/runs/${encodeURIComponent(runId)}`)).data;
    if (isTerminalStatus(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error("polling aborted");
}

export function WorkflowTestPanel({
  owner,
  file,
  defaultData,
  inputFields,
  disabled,
  disabledReason,
  open,
  onClose,
}) {
  const run = useRunWorkflow();
  const [dataJson, setDataJson] = useState(() => initialDataJson(owner, file, defaultData));
  const [inputTouched, setInputTouched] = useState(() => readWorkflowTestData(owner, file) != null);
  const [parseError, setParseError] = useState(null);
  const [last, setLast] = useState(null);
  const [polling, setPolling] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const saveTimer = useRef(null);
  const pollAbort = useRef(null);

  const seedJson = prettyJson(
    overlayWorkflowTestData(defaultData, readWorkflowTestData(owner, file)),
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      pollAbort.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (inputTouched) return;
    setDataJson(seedJson);
  }, [seedJson, inputTouched]);

  function persist(data) {
    writeWorkflowTestData(owner, file, data);
  }

  function onDataChange(value) {
    setDataJson(value);
    setInputTouched(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        persist(JSON.parse(value || "null"));
      } catch {
        // skip invalid JSON
      }
    }, SAVE_DEBOUNCE_MS);
  }

  function onRun() {
    setParseError(null);
    let data;
    try {
      data = JSON.parse(dataJson || "null");
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
      return;
    }
    persist(data);
    pollAbort.current?.abort();
    const controller = new AbortController();
    pollAbort.current = controller;

    run.mutate(
      { owner, file, data },
      {
        onSuccess: async (res) => {
          const runId = res.runId ?? null;
          setLast({
            status: res.status ?? "queued",
            runId,
            result: null,
            error: null,
          });
          if (!runId) return;
          setPolling(true);
          try {
            const finished = await waitForRun(runId, { signal: controller.signal });
            setLast({
              status: finished.status,
              runId,
              result: finished.output,
              error: finished.error ?? null,
            });
          } catch (err) {
            if (controller.signal.aborted) return;
            setLast({
              status: "failed",
              runId,
              result: null,
              error: errorMessage(err),
            });
          } finally {
            if (!controller.signal.aborted) setPolling(false);
          }
        },
        onError: (err) => {
          const runId = err?.response?.data?.runId;
          setLast({
            status: "failed",
            runId: runId ?? null,
            result: null,
            error: errorMessage(err),
          });
        },
      },
    );
  }

  const resultJson = last
    ? prettyJson(last.error ? { error: last.error } : last.result)
    : "";

  const busy = run.isPending || polling;

  function close() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    pollAbort.current?.abort();
    setPolling(false);
    try {
      persist(JSON.parse(dataJson || "null"));
    } catch {
      // skip invalid
    }
    setExpanded(false);
    onClose?.();
  }

  return (
    <dialog className={`modal ${open ? "modal-open" : ""}`}>
      <div
        className={
          expanded
            ? "modal-box flex h-dvh max-h-dvh w-dvw max-w-none flex-col rounded-none"
            : "modal-box flex max-w-5xl flex-col"
        }
      >
        <div className="flex shrink-0 items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-lg">Test workflow</h3>
            <p className="text-sm opacity-70">
              Enqueues the <strong>saved</strong> YAML and polls the Event until it finishes.
              Manual run works even when the workflow is disabled. Save before testing unsaved edits.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-square"
            title={expanded ? "Exit full screen" : "Full screen"}
            aria-label={expanded ? "Exit full screen" : "Full screen"}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <LuMinimize2 className="size-4" /> : <LuMaximize2 className="size-4" />}
          </button>
        </div>
        {disabledReason ? (
          <p className="text-warning text-xs mt-2 shrink-0">{disabledReason}</p>
        ) : null}
        {parseError ? <p className="text-error text-sm mt-2 shrink-0">{parseError}</p> : null}
        <div
          className={`grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 min-h-0 ${expanded ? "flex-1" : ""}`}
        >
          <div className={expanded ? "min-h-0 h-full" : "min-h-64 h-64"}>
            <p className="text-xs opacity-60 mb-1 flex items-center gap-2">
              data
              <SchemaTooltip label="Input" fields={inputFields} />
            </p>
            <div className={expanded ? "h-[calc(100%-1.25rem)]" : "h-[calc(100%-1.25rem)]"}>
              <CodeEditor language="json" value={dataJson} onChange={onDataChange} height="100%" />
            </div>
          </div>
          <div className={expanded ? "min-h-0 h-full" : "min-h-64 h-64"}>
            <p className="text-xs opacity-60 mb-1 flex items-center gap-2">
              result
              {last?.status ? <StatusBadge status={last.status} /> : null}
              {last?.runId ? (
                <Link className="link text-xs" to={`/events/${last.runId}`}>
                  {last.runId}
                </Link>
              ) : null}
            </p>
            <div className={expanded ? "h-[calc(100%-1.25rem)]" : "h-[calc(100%-1.25rem)]"}>
              <CodeEditor
                language="json"
                value={resultJson}
                onChange={() => {}}
                readOnly
                height="100%"
              />
            </div>
          </div>
        </div>
        <div className="modal-action shrink-0">
          <button type="button" className="btn" onClick={close}>
            Close
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={disabled || busy}
            onClick={onRun}
          >
            {busy ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <LuPlay className="size-4" />
            )}
            Run
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="button" onClick={close}>
          close
        </button>
      </form>
    </dialog>
  );
}
