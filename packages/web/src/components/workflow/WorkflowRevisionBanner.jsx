import { useState } from "react";
import { LuHistory } from "react-icons/lu";
import { errorMessage } from "../../api/client.js";
import { useRevertWorkflowRevision } from "../../api/hooks.js";
import { formatTime } from "../../lib/format.jsx";
import { useNotifications } from "../../notifications.jsx";
import {
  SaveWorkflowWarningsDialog,
  isSaveWarningsError,
  saveWarningsFromError,
} from "./SaveWorkflowWarningsDialog.jsx";

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  confirmClass = "btn-warning",
  pending,
  onCancel,
  onConfirm,
}) {
  if (!open) return null;
  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-md">
        <h3 className="font-bold">{title}</h3>
        <p className="mt-2 text-sm opacity-70">{message}</p>
        <div className="modal-action">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${confirmClass}`}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? <span className="loading loading-spinner loading-xs" /> : null}
            {confirmLabel}
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

export function WorkflowRevisionBanner({
  owner,
  file,
  revision,
  createdAt,
  onBackToCurrent,
  onReverted,
}) {
  const { notify } = useNotifications();
  const revert = useRevertWorkflowRevision();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [warnings, setWarnings] = useState(null);

  function doRevert(saveAnyway = false) {
    revert.mutate(
      { owner, file, revision, saveAnyway },
      {
        onSuccess: (data) => {
          setWarnings(null);
          setConfirmOpen(false);
          notify.success(`Restored revision #${revision}`);
          onReverted?.(data);
        },
        onError: (err) => {
          if (isSaveWarningsError(err)) {
            setWarnings({ items: saveWarningsFromError(err) });
            return;
          }
          notify.error(errorMessage(err));
        },
      },
    );
  }

  return (
    <>
      <div className="alert alert-warning shrink-0 py-2">
        <LuHistory className="size-4 shrink-0" />
        <span className="text-sm">
          Viewing revision <strong>#{revision}</strong> from {formatTime(createdAt)}
        </span>
        <div className="flex shrink-0 gap-2">
          <button type="button" className="btn btn-ghost btn-xs" onClick={onBackToCurrent}>
            Back to current
          </button>
          <button
            type="button"
            className="btn btn-warning btn-xs"
            disabled={revert.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            Revert
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title={`Revert to revision #${revision}?`}
        message={`This replaces the live workflow with revision #${revision} from ${formatTime(createdAt)} and creates a new revision.`}
        confirmLabel="Revert"
        pending={revert.isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => doRevert(false)}
      />
      {warnings ? (
        <SaveWorkflowWarningsDialog
          warnings={warnings.items}
          pending={revert.isPending}
          onCancel={() => setWarnings(null)}
          onSaveAnyway={() => doRevert(true)}
        />
      ) : null}
    </>
  );
}

export { ConfirmDialog };
