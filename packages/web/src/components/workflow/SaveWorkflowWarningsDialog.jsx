import { errorMessage } from "../../api/client.js";

export function SaveWorkflowWarningsDialog({ warnings, pending, onCancel, onSaveAnyway }) {
  if (!warnings?.length) return null;

  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-lg">
        <h3 className="font-bold">Save with warnings?</h3>
        <p className="mt-2 text-sm opacity-70">
          The workflow has issues that may prevent it from running correctly. You can fix them
          first, or save anyway.
        </p>
        <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto text-sm">
          {warnings.map((w, i) => (
            <li key={i} className="rounded-box bg-base-200 px-3 py-2">
              <span className="badge badge-warning badge-xs mr-2">{w.code}</span>
              {w.message}
              {w.path ? (
                <span className="mt-1 block font-mono text-xs opacity-60">{w.path}</span>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="modal-action">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-warning"
            disabled={pending}
            onClick={onSaveAnyway}
          >
            {pending ? <span className="loading loading-spinner loading-xs" /> : null}
            Save anyway
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="button" onClick={onCancel}>
          close
        </button>
      </form>
    </dialog>
  );
}

/**
 * Extract validation warnings from a failed save mutation error.
 * @param {unknown} error
 */
export function saveWarningsFromError(error) {
  const warnings = error?.response?.data?.warnings;
  return Array.isArray(warnings) ? warnings : null;
}

export function isSaveWarningsError(error) {
  return error?.response?.status === 422 && saveWarningsFromError(error);
}

export function saveErrorMessage(error) {
  if (isSaveWarningsError(error)) {
    return "Workflow has validation warnings";
  }
  return errorMessage(error);
}
