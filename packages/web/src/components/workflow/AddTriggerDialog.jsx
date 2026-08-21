import { useState } from "react";

export function AddTriggerDialog({ open, onClose, onPick }) {
  const [kind, setKind] = useState("HTTP");
  if (!open) return null;

  return (
    <dialog className="modal modal-open">
      <div className="modal-box">
        <h3 className="font-bold text-lg">Add trigger</h3>
        <div className="form-control mt-3">
          <label className="label cursor-pointer justify-start gap-3">
            <input
              type="radio"
              name="trig-kind"
              className="radio radio-sm"
              checked={kind === "HTTP"}
              onChange={() => setKind("HTTP")}
            />
            <span>
              HTTP — webhook at <span className="font-mono">/u/owner/path</span>
            </span>
          </label>
          <label className="label cursor-pointer justify-start gap-3">
            <input
              type="radio"
              name="trig-kind"
              className="radio radio-sm"
              checked={kind === "cron"}
              onChange={() => setKind("cron")}
            />
            <span>Cron — run on a schedule</span>
          </label>
          <label className="label cursor-pointer justify-start gap-3">
            <input
              type="radio"
              name="trig-kind"
              className="radio radio-sm"
              checked={kind === "workflow"}
              onChange={() => setKind("workflow")}
            />
            <span>Workflow — callable by other workflows</span>
          </label>
        </div>
        <div className="modal-action">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onPick(kind);
              setKind("HTTP");
            }}
          >
            Add
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="button" onClick={onClose}>
          close
        </button>
      </form>
    </dialog>
  );
}
