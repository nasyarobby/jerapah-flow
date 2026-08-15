import { useEffect, useMemo, useRef, useState } from "react";
import { errorMessage } from "../api/client.js";
import { useDuplicateWorkflow, useOwners, useWorkflows } from "../api/hooks.js";
import { ensureWorkflowFilename, suggestCopyFilename } from "../lib/workflow-doc.js";

const EMPTY_WORKFLOWS = [];

export function DuplicateWorkflowDialog({ source, warnUnsaved, onClose, onDuplicated }) {
  const { data: owners = [] } = useOwners();
  const { data: workflows = EMPTY_WORKFLOWS } = useWorkflows();
  const duplicate = useDuplicateWorkflow();
  const [destOwner, setDestOwner] = useState(source.owner);
  const [destFile, setDestFile] = useState(() => suggestCopyFilename(source.file));
  const fileTouched = useRef(false);

  const existingFiles = useMemo(
    () => workflows.filter((w) => w.owner === destOwner).map((w) => w.file),
    [workflows, destOwner],
  );

  useEffect(() => {
    if (fileTouched.current) return;
    setDestFile(suggestCopyFilename(source.file, existingFiles));
  }, [source.file, existingFiles]);

  const yamlFile = ensureWorkflowFilename(destFile);
  const sameAsSource = destOwner === source.owner && yamlFile === source.file;
  const exists = existingFiles.includes(yamlFile);
  const canSubmit = Boolean(destOwner && yamlFile) && !sameAsSource && !exists && !duplicate.isPending;

  function onSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    duplicate.mutate(
      {
        owner: source.owner,
        file: source.file,
        destOwner,
        destFile: yamlFile,
      },
      {
        onSuccess: (data) => {
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
          The copy starts disabled. HTTP paths are rewritten when staying under the same owner so
          triggers do not collide.
        </p>
        {warnUnsaved ? (
          <p className="text-warning mt-2 text-sm">The copy uses the last saved YAML, not unsaved edits.</p>
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
          <label className="form-control w-full">
            <span className="label py-0 text-sm">File</span>
            <input
              className="input input-sm w-full font-mono"
              placeholder="file.yaml"
              value={destFile}
              onChange={(e) => {
                fileTouched.current = true;
                setDestFile(e.target.value);
              }}
              required
            />
          </label>
          {sameAsSource ? (
            <p className="text-error text-sm">Choose a different owner or filename.</p>
          ) : exists ? (
            <p className="text-error text-sm">{destOwner}/{yamlFile} already exists.</p>
          ) : null}
          {duplicate.isError ? (
            <p className="text-error text-sm">{errorMessage(duplicate.error)}</p>
          ) : null}
          <div className="modal-action">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
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
