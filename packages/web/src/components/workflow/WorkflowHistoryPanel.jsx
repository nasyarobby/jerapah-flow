import { useState } from "react";
import { LuHistory, LuRotateCcw } from "react-icons/lu";
import { errorMessage } from "../../api/client.js";
import {
  useRevertWorkflowRevision,
  useWorkflowRevisions,
} from "../../api/hooks.js";
import { formatTime } from "../../lib/format.jsx";
import { useNotifications } from "../../notifications.jsx";
import {
  SaveWorkflowWarningsDialog,
  isSaveWarningsError,
  saveWarningsFromError,
} from "./SaveWorkflowWarningsDialog.jsx";

function reasonLabel(reason, meta) {
  if (reason === "duplicated" && meta?.from) return `duplicated from ${meta.from}`;
  if (reason === "revert" && meta?.fromRevision != null) {
    return `reverted from #${meta.fromRevision}`;
  }
  if (reason === "restored-from-trash") return "restored from trash";
  return reason ?? "save";
}

export function WorkflowHistoryPanel({ owner, file, onReverted }) {
  const { notify } = useNotifications();
  const revisions = useWorkflowRevisions(owner, file);
  const revert = useRevertWorkflowRevision();
  const [pendingRevision, setPendingRevision] = useState(null);
  const [warnings, setWarnings] = useState(null);

  function doRevert(revision, saveAnyway = false) {
    setPendingRevision(revision);
    revert.mutate(
      { owner, file, revision, saveAnyway },
      {
        onSuccess: (data) => {
          setWarnings(null);
          setPendingRevision(null);
          notify.success(`Restored revision #${revision}`);
          onReverted?.(data);
        },
        onError: (err) => {
          setPendingRevision(null);
          if (isSaveWarningsError(err)) {
            setWarnings({ revision, items: saveWarningsFromError(err) });
            return;
          }
          notify.error(errorMessage(err));
        },
      },
    );
  }

  const items = revisions.data?.revisions ?? [];

  return (
    <div className="border-base-300 flex h-full min-h-0 flex-col rounded-box border bg-base-100">
      <div className="border-base-300 flex items-center gap-2 border-b px-3 py-2">
        <LuHistory className="size-4 opacity-70" />
        <span className="text-sm font-medium">History</span>
        <span className="text-xs opacity-50">({items.length} / 50)</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {revisions.isLoading ? (
          <div className="flex justify-center p-4">
            <span className="loading loading-spinner loading-sm" />
          </div>
        ) : !items.length ? (
          <p className="p-3 text-sm opacity-50">No revisions yet.</p>
        ) : (
          <ul className="space-y-1">
            {items.map((rev) => (
              <li
                key={rev.id}
                className="hover:bg-base-200 flex items-start justify-between gap-2 rounded-lg px-2 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">#{rev.revision}</div>
                  <div className="text-xs opacity-60">{formatTime(rev.created_at)}</div>
                  <div className="text-xs opacity-70">
                    {reasonLabel(rev.reason, rev.meta)}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs shrink-0"
                  title="Revert to this revision"
                  disabled={revert.isPending}
                  onClick={() => doRevert(rev.revision)}
                >
                  {pendingRevision === rev.revision && revert.isPending ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <LuRotateCcw className="size-3.5" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {warnings ? (
        <SaveWorkflowWarningsDialog
          warnings={warnings.items}
          pending={revert.isPending}
          onCancel={() => setWarnings(null)}
          onSaveAnyway={() => doRevert(warnings.revision, true)}
        />
      ) : null}
    </div>
  );
}
