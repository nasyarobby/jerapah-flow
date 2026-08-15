import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LuPlay } from "react-icons/lu";
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
  testKey = 0,
}) {
  const run = useRunWorkflow();
  const [dataJson, setDataJson] = useState(() => prettyJson(defaultData ?? {}));
  const [parseError, setParseError] = useState(null);
  const [last, setLast] = useState(null);

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

  return (
    <details
      key={testKey}
      className="collapse collapse-arrow border border-base-300 bg-base-100 shrink-0"
      open={testKey > 0 ? true : undefined}
    >
      <summary className="collapse-title min-h-0 py-2 text-sm font-semibold">
        Test
      </summary>
      <div className="collapse-content space-y-2">
        <p className="text-xs opacity-70">
          Runs the <strong>saved</strong> YAML and writes an Event. Manual run works even when the
          workflow is disabled. Save before testing unsaved edits.
        </p>
        {disabledReason ? <p className="text-warning text-xs">{disabledReason}</p> : null}
        {parseError ? <p className="text-error text-sm">{parseError}</p> : null}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="h-40">
            <p className="text-xs opacity-60 mb-1">data</p>
            <CodeEditor language="json" value={dataJson} onChange={setDataJson} height="100%" />
          </div>
          <div className="h-40">
            <p className="text-xs opacity-60 mb-1 flex items-center gap-2">
              result
              {last?.status ? <StatusBadge status={last.status} /> : null}
              {last?.runId ? (
                <Link className="link text-xs" to={`/events/${last.runId}`}>
                  {last.runId}
                </Link>
              ) : null}
            </p>
            <CodeEditor language="json" value={resultJson} onChange={() => {}} readOnly height="100%" />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            className="btn btn-primary btn-sm"
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
    </details>
  );
}
