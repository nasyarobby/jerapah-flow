import { useMemo, useState } from "react";
import { parse as parseYaml } from "yaml";
import { useHttpAuths, useHttpPages, useScripts, useWorkflows } from "../../api/hooks.js";
import { workflowToFlowchart } from "../../lib/workflow-mermaid.js";
import { parseWorkflowYaml, stringifyWorkflowDoc } from "../../lib/workflow-doc.js";
import { ScriptsTab } from "./ScriptsTab.jsx";
import { TriggersTab } from "./TriggersTab.jsx";
import { YamlTab } from "./YamlTab.jsx";
import { WorkflowTestPanel } from "./WorkflowTestPanel.jsx";

export function useYamlPreview(content) {
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

export function WorkflowVisualEditor({
  yaml,
  onYamlChange,
  owner,
  file,
  extraChrome,
  showTest,
  savedYaml,
  testKey,
}) {
  const [tab, setTab] = useState("scripts");
  const [lastEdited, setLastEdited] = useState("yaml");
  const [doc, setDoc] = useState(() => parseWorkflowYaml(yaml).doc);

  const { parsed, parseError, mermaid } = useYamlPreview(yaml);
  const parsedDoc = useMemo(() => parseWorkflowYaml(yaml), [yaml]);
  const displayDoc = lastEdited === "visual" && doc ? doc : parsedDoc.doc;
  const visualDisabled = !displayDoc;

  const { data: scripts = [] } = useScripts();
  const { data: workflows = [] } = useWorkflows(owner || undefined);
  const { data: auths = [] } = useHttpAuths();
  const { data: allPages = [] } = useHttpPages();
  const pages = allPages.filter((p) => p.kind !== "template");

  const scriptCount = displayDoc?.scripts?.length ?? 0;
  const triggerCount = displayDoc?.triggers?.length ?? 0;
  const unsaved = savedYaml != null && yaml !== savedYaml;

  function patchDoc(mutator) {
    const base = lastEdited === "visual" && doc ? doc : parsedDoc.doc;
    if (!base) return;
    const next = structuredClone(base);
    mutator(next);
    setDoc(next);
    onYamlChange(stringifyWorkflowDoc(next));
    setLastEdited("visual");
  }

  function onYamlTabChange(value) {
    setLastEdited("yaml");
    onYamlChange(value);
  }

  function selectTab(next) {
    if (next !== "yaml" && lastEdited === "yaml") {
      const { doc: d } = parseWorkflowYaml(yaml);
      if (d) setDoc(d);
    }
    setTab(next);
  }

  const defaultData = displayDoc?.extra?.data ?? {};
  let testDisabledReason = null;
  if (visualDisabled) testDisabledReason = "Fix YAML before running.";
  else if (unsaved) testDisabledReason = "Save the workflow before running. Test uses the saved YAML.";

  return (
    <>
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {extraChrome}
        <input
          className="input input-sm sm:max-w-xs"
          placeholder="name"
          value={displayDoc?.name ?? ""}
          disabled={visualDisabled}
          onChange={(e) =>
            patchDoc((d) => {
              d.name = e.target.value;
            })
          }
        />
        <textarea
          className="textarea textarea-sm min-h-10 w-full sm:max-w-md"
          placeholder="description"
          rows={1}
          value={displayDoc?.description ?? ""}
          disabled={visualDisabled}
          onChange={(e) =>
            patchDoc((d) => {
              d.description = e.target.value;
            })
          }
        />
        {unsaved ? <span className="badge badge-warning badge-sm">Unsaved</span> : null}
      </div>

      <div role="tablist" className="tabs tabs-box shrink-0 w-full sm:w-auto">
        <button
          type="button"
          role="tab"
          className={`tab ${tab === "scripts" ? "tab-active" : ""}`}
          onClick={() => selectTab("scripts")}
        >
          Scripts ({scriptCount})
        </button>
        <button
          type="button"
          role="tab"
          className={`tab ${tab === "triggers" ? "tab-active" : ""}`}
          onClick={() => selectTab("triggers")}
        >
          Triggers ({triggerCount})
        </button>
        <button
          type="button"
          role="tab"
          className={`tab ${tab === "yaml" ? "tab-active" : ""}`}
          onClick={() => selectTab("yaml")}
        >
          YAML
        </button>
      </div>

      {parseError && tab !== "yaml" ? (
        <p className="text-error text-sm shrink-0">
          YAML is invalid — switch to the YAML tab to fix it. Visual edits are disabled.
        </p>
      ) : null}

      {tab === "scripts" ? (
        <ScriptsTab
          doc={displayDoc}
          onPatch={patchDoc}
          disabled={visualDisabled}
          scripts={scripts}
          workflows={workflows}
          owner={owner}
          excludeFile={file}
        />
      ) : null}
      {tab === "triggers" ? (
        <TriggersTab
          doc={displayDoc}
          onPatch={patchDoc}
          disabled={visualDisabled}
          owner={owner}
          auths={auths}
          pages={pages}
        />
      ) : null}
      {tab === "yaml" ? (
        <YamlTab
          content={yaml}
          onChange={onYamlTabChange}
          parseError={parseError}
          mermaid={mermaid}
          parsed={parsed}
        />
      ) : null}

      {showTest && owner && file ? (
        <WorkflowTestPanel
          owner={owner}
          file={file}
          defaultData={defaultData}
          disabled={Boolean(testDisabledReason)}
          disabledReason={testDisabledReason}
          testKey={testKey}
        />
      ) : null}
    </>
  );
}
