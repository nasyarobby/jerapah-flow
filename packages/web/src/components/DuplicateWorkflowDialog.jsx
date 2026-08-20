import { useState } from "react";
import { errorMessage } from "../api/client.js";
import { useDuplicateWorkflow, useOwners } from "../api/hooks.js";
import { useNotifications } from "../notifications.jsx";

export function DuplicateWorkflowDialog({ source, warnUnsaved, onClose, onDuplicated }) {
  const { notify } = useNotifications();
  const { data: owners = [] } = useOwners();
  const duplicate = useDuplicateWorkflow();
  const [destOwner, setDestOwner] = useState(source.owner);

  function onSubmit(e) {
    e.preventDefault();
    if (destOwner === source.owner && duplicate.isPending) return;
    duplicate.mutate(
      {
        owner: source.owner,
        file: source.file,
        destOwner,
      },
      {
        onSuccess: (data) => {
          notify.success(`Duplicated to ${data.owner}/${data.file}`);
          onDuplicated?.(data);
        },
      },
    );
  }

  return (
    <dialog className="modal modal-open">
      <div className="modal-box">
        <h3 className="font-bold">Duplicate {source.key}?</h3>
        <p className="mt-2 text-sm opacity-70">
          A new UUID filename is assigned automatically. The copy starts disabled. HTTP paths are
          rewritten when staying under the same owner so triggers do not collide.
        </p>
        {warnUnsaved ? (
          <p className="text-warning mt-2 text-sm">
            The copy uses the last saved YAML, not unsaved edits.
          </p>
        ) : null}
        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <label className="form-control w-full">
            <span className="label py-0 text-sm">Owner</span>
            <input
              className="input input-sm w-full"
              list="duplicate-workflow-owners"
              value={destOwner}
              onChange={(e) => setDestOwner(e.target.value)}
              required
            />
            <datalist id="duplicate-workflow-owners">
              {owners.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </label>
          {duplicate.isError ? (
            <p className="text-error text-sm">{errorMessage(duplicate.error)}</p>
          ) : null}
          <div className="modal-action">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={duplicate.isPending}>
              {duplicate.isPending ? (
                <span className="loading loading-spinner loading-xs" />
              ) : null}
              Duplicate
            </button>
          </div>
        </form>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="button" onClick={onClose}>
          close
        </button>
      </form>
    </dialog>
  );
}
