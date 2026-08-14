import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { parse as parseYaml } from "yaml";
import { LuArrowLeft, LuSave } from "react-icons/lu";
import { errorMessage } from "../api/client.js";
import { useOwners, useSaveWorkflow, useWorkflow } from "../api/hooks.js";
import { CodeEditor } from "../components/CodeEditor.jsx";
import { MermaidDiagram } from "../components/MermaidDiagram.jsx";
import { workflowToFlowchart } from "../lib/workflow-mermaid.js";

const NEW_YAML = `name: new workflow
scripts:
  - get-current-time.js
triggers:
  - type: HTTP
    method: POST
    path: /new
`;

function useYamlPreview(content) {
  return useMemo(() => {
    try {
      const parsedYaml = parseYaml(content);
      return {
        parsed: parsedYaml,
        parseError: null,
        mermaid: workflowToFlowchart(parsedYaml),
      };
    } catch (err) {
      return {
        parsed: null,
        parseError: err instanceof Error ? err.message : String(err),
        mermaid: { chart: "", scriptIds: {} },
      };
    }
  }, [content]);
}

function WorkflowEditorLayout({
  title,
  backTo = "/workflows",
  savePending,
  saveDisabled,
  saveError,
  saveSuccess,
  formId,
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
        <button
          type="submit"
          form={formId}
          className="btn btn-primary btn-sm"
          disabled={savePending || saveDisabled}
        >
          <LuSave className="size-4" />
          Save
        </button>
      </div>
      {children}
      {saveError ? (
        <p className="text-error text-sm shrink-0">{saveError}</p>
      ) : null}
      {saveSuccess ? (
        <p className="text-success text-sm shrink-0">Workflow saved</p>
      ) : null}
    </div>
  );
}

function WorkflowYamlAndDiagram({ content, onChange, parseError, mermaid, parsed }) {
  return (
    <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
      <div className="min-h-0">
        <CodeEditor language="yaml" value={content} onChange={onChange} height="100%" />
      </div>
      <div className="min-h-0 overflow-auto">
        {parseError ? (
          <p className="text-error text-sm">{parseError}</p>
        ) : (
          <MermaidDiagram chart={mermaid.chart} scriptIds={mermaid.scriptIds} />
        )}
        {parsed?.name ? (
          <p className="text-sm opacity-70 mt-2">{parsed.name}</p>
        ) : null}
      </div>
    </div>
  );
}

export function WorkflowNewPage() {
  const navigate = useNavigate();
  const { data: owners = [] } = useOwners();
  const [owner, setOwner] = useState("");
  const [file, setFile] = useState("");
  const [content, setContent] = useState(NEW_YAML);
  const save = useSaveWorkflow();
  const { parsed, parseError, mermaid } = useYamlPreview(content);

  useEffect(() => {
    if (!owner && owners[0]) setOwner(owners[0]);
  }, [owner, owners]);

  function onSave(e) {
    e.preventDefault();
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
      formId="workflow-edit-form"
      savePending={save.isPending}
      saveDisabled={!owner || !file}
      saveError={save.isError ? errorMessage(save.error) : null}
    >
      <form
        id="workflow-edit-form"
        onSubmit={onSave}
        className="flex min-h-0 flex-1 flex-col gap-3"
      >
        <div className="flex shrink-0 flex-col sm:flex-row gap-2">
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
        </div>
        <WorkflowYamlAndDiagram
          content={content}
          onChange={setContent}
          parseError={parseError}
          mermaid={mermaid}
          parsed={parsed}
        />
      </form>
    </WorkflowEditorLayout>
  );
}

export function WorkflowEditPage() {
  const { owner: rawOwner, file: rawFile } = useParams();
  const owner = decodeURIComponent(rawOwner ?? "");
  const file = decodeURIComponent(rawFile ?? "");
  const existing = useWorkflow(owner, file);
  const save = useSaveWorkflow();
  const [content, setContent] = useState("");
  const [contentReady, setContentReady] = useState(false);
  const { parsed, parseError, mermaid } = useYamlPreview(content);

  useEffect(() => {
    if (existing.isLoading) return;
    if (existing.data?.content != null) {
      setContent(existing.data.content);
      setContentReady(true);
    }
  }, [existing.data, existing.isLoading]);

  function onSave(e) {
    e.preventDefault();
    save.mutate({ owner, file, content });
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

  return (
    <WorkflowEditorLayout
      title={`${owner}/${file}`}
      formId="workflow-edit-form"
      savePending={save.isPending}
      saveDisabled={!contentReady}
      saveError={save.isError ? errorMessage(save.error) : null}
      saveSuccess={save.isSuccess}
    >
      <form id="workflow-edit-form" onSubmit={onSave} className="flex min-h-0 flex-1 flex-col">
        <WorkflowYamlAndDiagram
          content={content}
          onChange={setContent}
          parseError={parseError}
          mermaid={mermaid}
          parsed={parsed}
        />
      </form>
    </WorkflowEditorLayout>
  );
}
