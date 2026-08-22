import { useEffect, useMemo, useState } from "react";
import { useHttpAuths, useHttpPages, useProfiles, useScripts, useWorkflows } from "../../api/hooks.js";
import { dataFromInputMeta, firstInputMeta } from "../../lib/script.js";
import {
  emptyTrySession,
  pruneTrySession,
  recordTrySuccess,
} from "../../lib/try-session.js";
import { parseWorkflowYaml, stringifyWorkflowDoc } from "../../lib/workflow-doc.js";
import { FormInput, FormTextarea } from "../FormControls.jsx";
import { GraphTab } from "./GraphTab.jsx";
import { ScriptsTab } from "./ScriptsTab.jsx";
import { TriggersTab } from "./TriggersTab.jsx";
import { YamlTab } from "./YamlTab.jsx";
import { WorkflowTestPanel } from "./WorkflowTestPanel.jsx";

export function WorkflowVisualEditor({
  yaml,
  onYamlChange,
  owner,
  file,
  extraChrome,
  showTest,
  savedYaml,
  testOpen,
  onTestClose,
}) {
  const [tab, setTab] = useState("graph");
  const [lastEdited, setLastEdited] = useState("yaml");
  const [doc, setDoc] = useState(() => parseWorkflowYaml(yaml).doc);
  const [trySession, setTrySession] = useState(emptyTrySession);
  const [tryFocusUiId, setTryFocusUiId] = useState(/** @type {string | null} */ (null));

  const parsedDoc = useMemo(() => parseWorkflowYaml(yaml), [yaml]);
  const displayDoc = lastEdited === "visual" && doc ? doc : parsedDoc.doc;
  const visualDisabled = !displayDoc;
  const parseError = parsedDoc.parseError;

  const { data: scripts = [] } = useScripts();
  const { data: profiles = [] } = useProfiles(owner || undefined, { enabled: Boolean(owner) });
  const { data: workflows = [] } = useWorkflows(owner || undefined);
  const { data: auths = [] } = useHttpAuths();
  const { data: allPages = [] } = useHttpPages();
  const pages = allPages.filter((p) => p.kind !== "template");

  const scriptCount = displayDoc?.scripts?.length ?? 0;
  const triggerCount = displayDoc?.triggers?.length ?? 0;
  const unsaved = savedYaml != null && yaml !== savedYaml;
  const trySessionCount = Object.keys(trySession.byStep ?? {}).length;

  useEffect(() => {
    setTrySession((prev) => {
      const next = pruneTrySession(prev, displayDoc?.scripts ?? []);
      const prevKeys = Object.keys(prev.byStep ?? {});
      const nextKeys = Object.keys(next.byStep ?? {});
      if (
        prevKeys.length === nextKeys.length &&
        prevKeys.every((k) => next.byStep[k]) &&
        prev.lastTriedUiId === next.lastTriedUiId
      ) {
        return prev;
      }
      return next;
    });
    const ids = new Set((displayDoc?.scripts ?? []).map((s) => s.uiId));
    setTryFocusUiId((cur) => (cur && !ids.has(cur) ? null : cur));
  }, [displayDoc?.scripts]);

  function onTrySuccess(uiId, result) {
    if (!uiId) return;
    setTrySession((prev) => recordTrySuccess(prev, uiId, result));
  }

  function onTryFocus(uiId) {
    setTryFocusUiId(uiId ?? null);
  }

  function clearTrySession() {
    setTrySession(emptyTrySession());
  }

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

  const scriptsByName = useMemo(() => {
    const map = new Map();
    for (const s of scripts) {
      const name = typeof s === "string" ? s : s.name;
      if (name) map.set(name, s);
    }
    return map;
  }, [scripts]);

  const profilesByName = useMemo(() => {
    const map = new Map();
    for (const p of profiles) {
      if (p?.name) map.set(p.name, p);
    }
    return map;
  }, [profiles]);

  const inputMeta = useMemo(
    () => firstInputMeta(displayDoc?.scripts, scriptsByName, profilesByName),
    [displayDoc?.scripts, scriptsByName, profilesByName],
  );

  const defaultData = useMemo(() => {
    const yamlData = displayDoc?.extra?.data;
    return dataFromInputMeta(inputMeta, yamlData);
  }, [displayDoc?.extra?.data, inputMeta]);

  const inputFields = inputMeta?.input;

  let testDisabledReason = null;
  if (visualDisabled) testDisabledReason = "Fix YAML before running.";
  else if (unsaved) testDisabledReason = "Save the workflow before running. Test uses the saved YAML.";

  const graphProps = {
    doc: displayDoc,
    onPatch: patchDoc,
    disabled: visualDisabled,
    scripts,
    profiles,
    workflows,
    owner,
    file,
    excludeFile: file,
    auths,
    pages,
    trySession,
    onTrySuccess,
    tryFocusUiId,
    onTryFocus,
  };

  return (
    <>
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {extraChrome}
        <FormInput
          className="sm:max-w-xs"
          placeholder="name"
          value={displayDoc?.name ?? ""}
          disabled={visualDisabled}
          onChange={(e) =>
            patchDoc((d) => {
              d.name = e.target.value;
            })
          }
        />
        <FormTextarea
          className="min-h-10 w-full sm:max-w-md"
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
        {trySessionCount > 0 ? (
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            title="Clear Try session (cached step outputs for seeding)"
            onClick={clearTrySession}
          >
            Clear try session ({trySessionCount})
          </button>
        ) : null}
      </div>

      <div role="tablist" className="tabs tabs-box shrink-0 w-full sm:w-auto">
        <button
          type="button"
          role="tab"
          className={`tab ${tab === "graph" ? "tab-active" : ""}`}
          onClick={() => selectTab("graph")}
        >
          Graph
        </button>
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

      {tab === "graph" ? <GraphTab {...graphProps} /> : null}
      {tab === "scripts" ? (
        <ScriptsTab
          doc={displayDoc}
          onPatch={patchDoc}
          disabled={visualDisabled}
          scripts={scripts}
          profiles={profiles}
          workflows={workflows}
          owner={owner}
          excludeFile={file}
          trySession={trySession}
          onTrySuccess={onTrySuccess}
          tryFocusUiId={tryFocusUiId}
          onTryFocus={onTryFocus}
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
          workflows={workflows}
          excludeFile={file}
        />
      ) : null}
      {tab === "yaml" ? (
        <YamlTab content={yaml} onChange={onYamlTabChange} parseError={parseError} />
      ) : null}

      {showTest && owner && file ? (
        <WorkflowTestPanel
          key={`${owner}/${file}`}
          owner={owner}
          file={file}
          defaultData={defaultData}
          inputFields={inputFields}
          disabled={Boolean(testDisabledReason)}
          disabledReason={testDisabledReason}
          open={testOpen}
          onClose={onTestClose}
        />
      ) : null}
    </>
  );
}
