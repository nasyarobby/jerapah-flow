import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { LuArrowLeft, LuCopy, LuPause, LuPlay, LuSave } from "react-icons/lu";
import { errorMessage } from "../api/client.js";
import {
  useCreateWorkflow,
  useOwners,
  useSaveWorkflow,
  useSetWorkflowEnabled,
  useWorkflow,
} from "../api/hooks.js";
import { DuplicateWorkflowDialog } from "../components/DuplicateWorkflowDialog.jsx";
import { WorkflowFileIcon } from "../components/WorkflowFileIcon.jsx";
import { WorkflowVisualEditor } from "../components/workflow/WorkflowVisualEditor.jsx";
import { WorkflowHistoryPanel } from "../components/workflow/WorkflowHistoryPanel.jsx";
import {
  SaveWorkflowWarningsDialog,
  isSaveWarningsError,
  saveErrorMessage,
  saveWarningsFromError,
} from "../components/workflow/SaveWorkflowWarningsDialog.jsx";
import { NEW_WORKFLOW_YAML, parseWorkflowYaml } from "../lib/workflow-doc.js";
import { useNotifications } from "../notifications.jsx";

function WorkflowEditorLayout({
  title,
  backTo = "/workflows",
  savePending,
  saveDisabled,
  saveError,
  onSave,
  onTest,
  onDuplicate,
  onToggleEnabled,
  enabled,
  enablePending,
  enableDisabled,
  enableError,
  children,
}) {
  return (
    <div className="flex h-[calc(100vh-5rem)] min-h-[32rem] flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Link to={backTo} className="btn btn-ghost btn-sm btn-square" aria-label="Back">
          <LuArrowLeft className="size-4" />
        </Link>
        <WorkflowFileIcon className="size-8 shrink-0" />
        <h1 className="truncate text-xl font-semibold">{title}</h1>
        <div className="flex-1" />
        {onToggleEnabled ? (
          <button
            type="button"
            className="btn btn-sm"
            disabled={enablePending || enableDisabled}
            onClick={onToggleEnabled}
          >
            {enablePending ? (
              <span className="loading loading-spinner loading-xs" />
            ) : enabled ? (
              <LuPause className="size-4" />
            ) : (
              <LuPlay className="size-4" />
            )}
            {enabled ? "Disable" : "Enable"}
          </button>
        ) : null}
        {onTest ? (
          <button type="button" className="btn btn-sm" onClick={onTest}>
            <LuPlay className="size-4" />
            Test
          </button>
        ) : null}
        {onDuplicate ? (
          <button type="button" className="btn btn-sm" onClick={onDuplicate}>
            <LuCopy className="size-4" />
            Duplicate
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={savePending || saveDisabled}
          onClick={onSave}
        >
          <LuSave className="size-4" />
          Save
        </button>
      </div>
      {children}
      {saveError ? <p className="text-error text-sm shrink-0">{saveError}</p> : null}
      {enableError ? <p className="text-error text-sm shrink-0">{enableError}</p> : null}
    </div>
  );
}

export function WorkflowNewPage() {
  const navigate = useNavigate();
  const { notify } = useNotifications();
  const { data: owners = [] } = useOwners();
  const [owner, setOwner] = useState("");
  const [content, setContent] = useState(NEW_WORKFLOW_YAML);
  const [savedYaml] = useState(NEW_WORKFLOW_YAML);
  const [saveWarnings, setSaveWarnings] = useState(null);
  const create = useCreateWorkflow();

  useEffect(() => {
    if (!owner && owners[0]) setOwner(owners[0]);
  }, [owner, owners]);

  function onSave(saveAnyway = false) {
    create.mutate(
      { owner, content, saveAnyway },
      {
        onSuccess: (data) => {
          setSaveWarnings(null);
          notify.success(`Created ${data.file}`);
          navigate(
            `/workflows/${encodeURIComponent(data.owner)}/${encodeURIComponent(data.file)}/edit`,
          );
        },
        onError: (err) => {
          if (isSaveWarningsError(err)) {
            setSaveWarnings(saveWarningsFromError(err));
            return;
          }
          notify.error(errorMessage(err));
        },
      },
    );
  }

  return (
    <>
      <WorkflowEditorLayout
        title="New workflow"
        onSave={() => onSave(false)}
        savePending={create.isPending}
        saveDisabled={!owner}
        saveError={create.isError && !saveWarnings ? errorMessage(create.error) : null}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <p className="text-sm opacity-70 shrink-0">
            A UUID filename is assigned on save (for example{" "}
            <span className="font-mono">a1b2c3d4-….yaml</span>). Edit the{" "}
            <span className="font-mono">name:</span> field for the display name.
          </p>
          <WorkflowVisualEditor
            yaml={content}
            onYamlChange={setContent}
            owner={owner}
            file=""
            savedYaml={savedYaml}
            showTest={false}
            extraChrome={
              <input
                className="input input-sm w-full sm:max-w-xs"
                placeholder="owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                required
              />
            }
          />
        </div>
      </WorkflowEditorLayout>
      {saveWarnings ? (
        <SaveWorkflowWarningsDialog
          warnings={saveWarnings}
          pending={create.isPending}
          onCancel={() => setSaveWarnings(null)}
          onSaveAnyway={() => onSave(true)}
        />
      ) : null}
    </>
  );
}

export function WorkflowEditPage() {
  const navigate = useNavigate();
  const { notify } = useNotifications();
  const { owner: rawOwner, file: rawFile } = useParams();
  const owner = decodeURIComponent(rawOwner ?? "");
  const file = decodeURIComponent(rawFile ?? "");
  const existing = useWorkflow(owner, file);
  const save = useSaveWorkflow();
  const setEnabled = useSetWorkflowEnabled();
  const [content, setContent] = useState("");
  const [savedYaml, setSavedYaml] = useState("");
  const [contentReady, setContentReady] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [saveWarnings, setSaveWarnings] = useState(null);
  const routeKey = `${owner}/${file}`;
  const [activeKey, setActiveKey] = useState(routeKey);

  if (activeKey !== routeKey) {
    setActiveKey(routeKey);
    setContent("");
    setSavedYaml("");
    setContentReady(false);
    setTestOpen(false);
    setDuplicateOpen(false);
  }

  useEffect(() => {
    if (existing.isLoading) return;
    if (!contentReady && existing.data?.content != null) {
      setContent(existing.data.content);
      setSavedYaml(existing.data.content);
      setContentReady(true);
    }
  }, [existing.data, existing.isLoading, contentReady]);

  function onSave(saveAnyway = false) {
    save.mutate(
      { owner, file, content, saveAnyway },
      {
        onSuccess: () => {
          setSavedYaml(content);
          setSaveWarnings(null);
          notify.success("Workflow saved");
        },
        onError: (err) => {
          if (isSaveWarningsError(err)) {
            setSaveWarnings(saveWarningsFromError(err));
            return;
          }
        },
      },
    );
  }

  if (existing.isLoading) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (existing.isError) {
    return (
      <div className="space-y-3">
        <Link to="/workflows" className="btn btn-ghost btn-sm">
          <LuArrowLeft className="size-4" />
          Back
        </Link>
        <p className="text-error">Workflow not found</p>
      </div>
    );
  }

  const parsedDoc = parseWorkflowYaml(content);
  const yamlOk = !parsedDoc.parseError;
  const workflowName = parsedDoc.doc?.name?.trim();
  const pageTitle = workflowName ? `${workflowName}` : file;

  return (
    <>
      <WorkflowEditorLayout
        title={
          <span className="flex min-w-0 flex-col items-start gap-0.5">
            <span className="truncate">{pageTitle}</span>
            <span className="text-xs font-normal font-mono opacity-50">{file}</span>
          </span>
        }
        savePending={save.isPending}
        saveDisabled={!contentReady}
        saveError={save.isError && !saveWarnings ? saveErrorMessage(save.error) : null}
        onSave={() => onSave(false)}
        onTest={() => setTestOpen(true)}
        onDuplicate={() => setDuplicateOpen(true)}
        onToggleEnabled={() =>
          setEnabled.mutate({
            owner,
            file,
            enabled: existing.data?.parsed?.enabled === false,
          })
        }
        enabled={existing.data?.parsed?.enabled !== false}
        enablePending={setEnabled.isPending}
        enableDisabled={!contentReady || Boolean(existing.data?.parseError) || !yamlOk}
        enableError={setEnabled.isError ? errorMessage(setEnabled.error) : null}
      >
        <div className="flex min-h-0 flex-1 gap-3">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <WorkflowVisualEditor
              yaml={content}
              onYamlChange={setContent}
              owner={owner}
              file={file}
              savedYaml={savedYaml}
              showTest
              testOpen={testOpen}
              onTestClose={() => setTestOpen(false)}
            />
          </div>
          <div className="hidden w-64 shrink-0 xl:block">
            <WorkflowHistoryPanel
                owner={owner}
                file={file}
                onReverted={() => {
                  existing.refetch().then((result) => {
                    const next = result.data?.content;
                    if (next != null) {
                      setContent(next);
                      setSavedYaml(next);
                    }
                  });
                }}
            />
          </div>
        </div>
      </WorkflowEditorLayout>
      {duplicateOpen ? (
        <DuplicateWorkflowDialog
          source={{ owner, file, key: `${owner}/${file}` }}
          warnUnsaved={contentReady && content !== savedYaml}
          onClose={() => setDuplicateOpen(false)}
          onDuplicated={(data) => {
            setDuplicateOpen(false);
            navigate(
              `/workflows/${encodeURIComponent(data.owner)}/${encodeURIComponent(data.file)}/edit`,
            );
          }}
        />
      ) : null}
      {saveWarnings ? (
        <SaveWorkflowWarningsDialog
          warnings={saveWarnings}
          pending={save.isPending}
          onCancel={() => setSaveWarnings(null)}
          onSaveAnyway={() => onSave(true)}
        />
      ) : null}
    </>
  );
}
