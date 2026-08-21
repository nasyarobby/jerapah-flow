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
import { ConfirmDialog } from "../ConfirmDialog.jsx";

function reasonLabel(reason, meta) {
  if (reason === "duplicated" && meta?.from) return `duplicated from ${meta.from}`;
  if (reason === "revert" && meta?.fromRevision != null) {
    return `reverted from #${meta.fromRevision}`;
  }
  if (reason === "restored-from-trash") return "restored from trash";
  return reason ?? "save";
}

export function WorkflowHistoryPanel({
  owner,
  file,
  previewRevision,
  onSelectRevision,
  onReverted,
}) {
  const { notify } = useNotifications();
  const revisions = useWorkflowRevisions(owner, file);
  const revert = useRevertWorkflowRevision();
  const [pendingRevision, setPendingRevision] = useState(null);
  const [confirmRevision, setConfirmRevision] = useState(null);
  const [warnings, setWarnings] = useState(null);

  const items = revisions.data?.revisions ?? [];
  const latestRevision = items[0]?.revision ?? null;

  function doRevert(revision, saveAnyway = false) {
    setPendingRevision(revision);
    revert.mutate(
      { owner, file, revision, saveAnyway },
      {
        onSuccess: (data) => {
          setWarnings(null);
          setPendingRevision(null);
          setConfirmRevision(null);
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

  function onRowClick(rev) {
    if (rev.revision === latestRevision) {
      onSelectRevision?.(null);
      return;
    }
    onSelectRevision?.(rev.revision, rev);
  }

  const confirmRev = confirmRevision != null ? items.find((r) => r.revision === confirmRevision) : null;

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
            {items.map((rev, index) => {
              const isCurrent = index === 0;
              const isSelected =
                previewRevision === rev.revision || (previewRevision == null && isCurrent);
              return (
                <li
                  key={rev.id}
                  className={`hover:bg-base-200 flex cursor-pointer items-start justify-between gap-2 rounded-lg px-2 py-2 ${
                    isSelected ? "bg-base-200 ring-base-content/10 ring-1" : ""
                  }`}
                  onClick={() => onRowClick(rev)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onRowClick(rev);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <span>#{rev.revision}</span>
                      {isCurrent ? (
                        <span className="badge badge-primary badge-xs">Current</span>
                      ) : null}
                    </div>
                    <div className="text-xs opacity-60">{formatTime(rev.created_at)}</div>
                    <div className="text-xs opacity-70">
                      {reasonLabel(rev.reason, rev.meta)}
                    </div>
                  </div>
                  {!isCurrent ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs shrink-0"
                      title="Revert to this revision"
                      aria-label="Revert to this revision"
                      disabled={revert.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmRevision(rev.revision);
                      }}
                    >
                      {pendingRevision === rev.revision && revert.isPending ? (
                        <span className="loading loading-spinner loading-xs" />
                      ) : (
                        <LuRotateCcw className="size-3.5" />
                      )}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {confirmRev ? (
        <ConfirmDialog
          open
          title={`Revert to revision #${confirmRev.revision}?`}
          message={`This replaces the live workflow with revision #${confirmRev.revision} from ${formatTime(confirmRev.created_at)} and creates a new revision.`}
          confirmLabel="Revert"
          confirmClass="btn-warning"
          pending={revert.isPending}
          onCancel={() => setConfirmRevision(null)}
          onConfirm={() => doRevert(confirmRev.revision, false)}
        />
      ) : null}
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
