import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { LuArrowLeft, LuPause, LuPlay, LuSave } from "react-icons/lu";
import { errorMessage } from "../api/client.js";
import {
  useOwners,
  useSaveWorkflow,
  useSetWorkflowEnabled,
  useWorkflow,
} from "../api/hooks.js";
import { WorkflowVisualEditor } from "../components/workflow/WorkflowVisualEditor.jsx";
import { NEW_WORKFLOW_YAML, parseWorkflowYaml } from "../lib/workflow-doc.js";

function WorkflowEditorLayout({
  title,
  backTo = "/workflows",
  savePending,
  saveDisabled,
  saveError,
  saveSuccess,
  onSave,
  onTest,
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
      {saveSuccess ? <p className="text-success text-sm shrink-0">Workflow saved</p> : null}
    </div>
  );
}

export function WorkflowNewPage() {
  const navigate = useNavigate();
  const { data: owners = [] } = useOwners();
  const [owner, setOwner] = useState("");
  const [file, setFile] = useState("");
  const [content, setContent] = useState(NEW_WORKFLOW_YAML);
  const [savedYaml] = useState(NEW_WORKFLOW_YAML);
  const save = useSaveWorkflow();

  useEffect(() => {
    if (!owner && owners[0]) setOwner(owners[0]);
  }, [owner, owners]);

  function onSave() {
    const yamlFile = file.endsWith(".yaml") || file.endsWith(".yml") ? file : `${file}.yaml`;
    save.mutate(
      { owner, file: yamlFile, content },
      {
        onSuccess: () =>
          navigate(
            `/workflows/${encodeURIComponent(owner)}/${encodeURIComponent(yamlFile)}/edit`,
          ),
      },
    );
  }

  return (
    <WorkflowEditorLayout
      title="New workflow"
      onSave={onSave}
      savePending={save.isPending}
      saveDisabled={!owner || !file}
      saveError={save.isError ? errorMessage(save.error) : null}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <WorkflowVisualEditor
          yaml={content}
          onYamlChange={setContent}
          owner={owner}
          file={file}
          savedYaml={savedYaml}
          showTest={false}
          extraChrome={
            <>
              <input
                className="input input-sm w-full sm:max-w-xs"
                placeholder="owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                required
              />
              <input
                className="input input-sm w-full sm:max-w-xs"
                placeholder="file.yaml"
                value={file}
                onChange={(e) => setFile(e.target.value)}
                required
              />
            </>
          }
        />
      </div>
    </WorkflowEditorLayout>
  );
}

export function WorkflowEditPage() {
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

  useEffect(() => {
    if (existing.isLoading) return;
    if (!contentReady && existing.data?.content != null) {
      setContent(existing.data.content);
      setSavedYaml(existing.data.content);
      setContentReady(true);
    }
  }, [existing.data, existing.isLoading, contentReady]);

  function onSave() {
    save.mutate(
      { owner, file, content },
      {
        onSuccess: () => setSavedYaml(content),
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
  const pageTitle = workflowName ? `${workflowName} (${file})` : file;

  return (
    <WorkflowEditorLayout
      title={pageTitle}
      savePending={save.isPending}
      saveDisabled={!contentReady}
      saveError={save.isError ? errorMessage(save.error) : null}
      saveSuccess={save.isSuccess}
      onSave={onSave}
      onTest={() => setTestOpen(true)}
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
      <div className="flex min-h-0 flex-1 flex-col gap-3">
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
    </WorkflowEditorLayout>
  );
}
