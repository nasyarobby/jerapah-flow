import { useState } from "react";
import { LuDownload, LuUpload } from "react-icons/lu";
import { errorMessage } from "../api/client.js";
import {
  useDownloadWorkflowBackup,
  useRestoreWorkflowBackup,
} from "../api/hooks.js";
import { useNotifications } from "../notifications.jsx";

export function BackupPage() {
  const backup = useDownloadWorkflowBackup();
  const restoreBackup = useRestoreWorkflowBackup();
  const { notify } = useNotifications();
  const [restoreMode, setRestoreMode] = useState("merge");
  const [pendingFile, setPendingFile] = useState(null);

  function download() {
    backup.mutate(undefined, {
      onSuccess: () => notify.success("Backup downloaded"),
      onError: (err) => notify.error(errorMessage(err)),
    });
  }

  function restore(file, mode) {
    restoreBackup.mutate(
      { file, mode },
      {
        onSuccess: (data) => {
          notify.success("Backup restored");
          if (data.warnings?.length) {
            notify.warning(data.warnings.join("; "));
          }
        },
        onError: (err) => notify.error(errorMessage(err)),
        onSettled: () => setPendingFile(null),
      },
    );
  }

  function onPickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (restoreMode === "replace") {
      setPendingFile(file);
      return;
    }
    restore(file, restoreMode);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Backup</h1>
        <p className="text-sm opacity-70">
          Download or restore workflows and installed plugins as a zip archive.
        </p>
      </div>

      <section className="card bg-base-100 border border-base-300">
        <div className="card-body gap-3">
          <h2 className="card-title text-base">Download</h2>
          <p className="text-sm opacity-70">
            Includes workflow YAML and installed plugins. Use this to copy the
            setup to another machine or keep a snapshot before a restore.
          </p>
          <div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={backup.isPending}
              onClick={download}
            >
              {backup.isPending ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <LuDownload className="size-4" />
              )}
              Download backup
            </button>
          </div>
        </div>
      </section>

      <section className="card bg-base-100 border border-base-300">
        <div className="card-body gap-3">
          <h2 className="card-title text-base">Restore</h2>
          <p className="text-sm opacity-70">
            Merge keeps existing files and overwrites matches from the zip.
            Replace deletes current workflows and plugins first.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="select select-bordered select-sm"
              value={restoreMode}
              onChange={(e) => setRestoreMode(e.target.value)}
              aria-label="Restore mode"
            >
              <option value="merge">Merge</option>
              <option value="replace">Replace</option>
            </select>
            <label
              className={`btn btn-sm ${restoreBackup.isPending ? "btn-disabled" : ""}`}
            >
              {restoreBackup.isPending ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <LuUpload className="size-4" />
              )}
              Restore from zip
              <input
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                disabled={restoreBackup.isPending}
                onChange={onPickFile}
              />
            </label>
          </div>
        </div>
      </section>

      {pendingFile ? (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold">Replace with this backup?</h3>
            <p className="mt-2 text-sm opacity-70">
              Current workflows and plugins will be deleted, then{" "}
              <span className="font-mono">{pendingFile.name}</span> will be
              restored. This cannot be undone from this page.
            </p>
            <div className="modal-action">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setPendingFile(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-error"
                disabled={restoreBackup.isPending}
                onClick={() => restore(pendingFile, "replace")}
              >
                Replace
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button type="button" onClick={() => setPendingFile(null)}>
              close
            </button>
          </form>
        </dialog>
      ) : null}
    </div>
  );
}
