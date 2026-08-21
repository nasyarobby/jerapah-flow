import { useState } from "react";
import { LuHistory } from "react-icons/lu";
import { errorMessage } from "../../api/client.js";
import { useRevertWorkflowRevision } from "../../api/hooks.js";
import { formatTime } from "../../lib/format.jsx";
import { useNotifications } from "../../notifications.jsx";
import { ConfirmDialog } from "../ConfirmDialog.jsx";
import {
  SaveWorkflowWarningsDialog,
  isSaveWarningsError,
  saveWarningsFromError,
} from "./SaveWorkflowWarningsDialog.jsx";

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
        confirmClass="btn-warning"
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
