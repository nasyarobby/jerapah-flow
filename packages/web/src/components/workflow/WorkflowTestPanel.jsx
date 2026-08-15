import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LuMaximize2, LuMinimize2, LuPlay } from "react-icons/lu";
import { errorMessage } from "../../api/client.js";
import { useRunWorkflow } from "../../api/hooks.js";
import { CodeEditor } from "../CodeEditor.jsx";
import { StatusBadge } from "../../lib/format.jsx";
import { prettyJson } from "../../lib/script.js";

export function WorkflowTestPanel({
  owner,
  file,
  defaultData,
  disabled,
  disabledReason,
  open,
  onClose,
}) {
  const run = useRunWorkflow();
  const [dataJson, setDataJson] = useState(() => prettyJson(defaultData ?? {}));
  const [parseError, setParseError] = useState(null);
  const [last, setLast] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setDataJson(prettyJson(defaultData ?? {}));
  }, [defaultData]);

  function onRun() {
    setParseError(null);
    let data;
    try {
      data = JSON.parse(dataJson || "null");
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
      return;
    }
    run.mutate(
      { owner, file, data },
      {
        onSuccess: (res) => {
          setLast({
            status: res.status ?? "success",
            runId: res.runId ?? null,
            result: res.result,
            error: null,
          });
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

  function close() {
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
              Runs the <strong>saved</strong> YAML and writes an Event. Manual run works even when
              the workflow is disabled. Save before testing unsaved edits.
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
            <p className="text-xs opacity-60 mb-1">data</p>
            <div className={expanded ? "h-[calc(100%-1.25rem)]" : "h-[calc(100%-1.25rem)]"}>
              <CodeEditor language="json" value={dataJson} onChange={setDataJson} height="100%" />
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
            disabled={disabled || run.isPending}
            onClick={onRun}
          >
            {run.isPending ? (
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
