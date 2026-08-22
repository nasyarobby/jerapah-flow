import { useState } from "react";
import { api, errorMessage } from "../api/client.js";
import { useWorkflowExamples } from "../api/hooks.js";

export const SKIP_NEW_WORKFLOW_PRESET_KEY = "jflow.skipNewWorkflowPreset";

export function shouldSkipNewWorkflowPreset() {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(SKIP_NEW_WORKFLOW_PRESET_KEY) === "1";
}

export function setSkipNewWorkflowPreset(skip) {
  if (typeof localStorage === "undefined") return;
  if (skip) localStorage.setItem(SKIP_NEW_WORKFLOW_PRESET_KEY, "1");
  else localStorage.removeItem(SKIP_NEW_WORKFLOW_PRESET_KEY);
}

/**
 * @param {{
 *   onChoose: (content: string) => void,
 *   onCancel: () => void,
 * }} props
 */
export function NewWorkflowPresetDialog({ onChoose, onCancel }) {
  const { data: examples = [], isLoading, isError, error } = useWorkflowExamples();
  const [mode, setMode] = useState(/** @type {"empty" | "example"} */ ("empty"));
  const [exampleId, setExampleId] = useState("");
  const [dontAsk, setDontAsk] = useState(false);
  const [pending, setPending] = useState(false);
  const [loadError, setLoadError] = useState(/** @type {string | null} */ (null));

  async function onContinue(e) {
    e.preventDefault();
    setLoadError(null);
    if (dontAsk) setSkipNewWorkflowPreset(true);

    if (mode === "empty") {
      onChoose(null);
      return;
    }

    if (!exampleId) {
      setLoadError("Select an example");
      return;
    }

    setPending(true);
    try {
      const { data } = await api.get(
        `/workflow-examples/${encodeURIComponent(exampleId)}`,
      );
      onChoose(typeof data?.content === "string" ? data.content : "");
    } catch (err) {
      setLoadError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-lg">
        <h3 className="font-bold text-lg">New workflow</h3>
        <p className="mt-2 text-sm opacity-70">
          Start empty, or copy a shipped example into the editor. Nothing is saved until you click
          Save.
        </p>
        <form className="mt-4 space-y-4" onSubmit={onContinue}>
          <fieldset className="space-y-2">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="radio"
                name="preset"
                className="radio radio-sm mt-1"
                checked={mode === "empty"}
                onChange={() => setMode("empty")}
              />
              <span>
                <span className="font-medium">Empty</span>
                <span className="block text-sm opacity-70">Blank name, no scripts or triggers</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="radio"
                name="preset"
                className="radio radio-sm mt-1"
                checked={mode === "example"}
                onChange={() => {
                  setMode("example");
                  if (!exampleId && examples[0]) setExampleId(examples[0].id);
                }}
              />
              <span>
                <span className="font-medium">Select example</span>
                <span className="block text-sm opacity-70">
                  Core-script starters from examples/workflows
                </span>
              </span>
            </label>
          </fieldset>

          {mode === "example" ? (
            <div className="space-y-2 pl-8">
              {isLoading ? <span className="loading loading-spinner loading-sm" /> : null}
              {isError ? (
                <p className="text-error text-sm">{errorMessage(error)}</p>
              ) : null}
              {!isLoading && !isError && examples.length === 0 ? (
                <p className="text-sm opacity-70">No examples available.</p>
              ) : null}
              {examples.map((ex) => (
                <label key={ex.id} className="flex cursor-pointer items-start gap-3">
                  <input
                    type="radio"
                    name="exampleId"
                    className="radio radio-sm mt-1"
                    checked={exampleId === ex.id}
                    onChange={() => setExampleId(ex.id)}
                  />
                  <span>
                    <span className="font-medium">{ex.name}</span>
                    {ex.description ? (
                      <span className="block text-sm opacity-70 line-clamp-2">
                        {ex.description}
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
          ) : null}

          <label className="label cursor-pointer justify-start gap-3 py-0">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={dontAsk}
              onChange={(e) => {
                const checked = e.target.checked;
                setDontAsk(checked);
                if (checked) setMode("empty");
              }}
            />
            <span className="label-text">Don&apos;t ask this. Always create empty workflow.</span>
          </label>

          {loadError ? <p className="text-error text-sm">{loadError}</p> : null}

          <div className="modal-action">
            <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={pending}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={pending || (mode === "example" && !exampleId)}
            >
              {pending ? <span className="loading loading-spinner loading-xs" /> : null}
              Continue
            </button>
          </div>
        </form>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="button" onClick={onCancel}>
          close
        </button>
      </form>
    </dialog>
  );
}
