import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
} from "@xyflow/react";
import { LuPlus, LuRotateCcw } from "react-icons/lu";
import { defaultConfigFromMeta } from "../../lib/script.js";
import {
  newCronTrigger,
  newHttpTrigger,
  newProfileStep,
  newScriptStep,
  newSetStep,
  newWorkflowTrigger,
  withAllocatedStepId,
} from "../../lib/workflow-doc.js";
import {
  addStepEdge,
  buildGraphElements,
  canConnectSteps,
  clearGraphLayout,
  enteringDagWouldStripWhen,
  parseGraphNodeId,
  readGraphLayout,
  removeStepEdge,
  stepNodeId,
  writeGraphLayout,
} from "../../lib/workflow-graph.js";
import { ConfirmDialog } from "../ConfirmDialog.jsx";
import { ScriptCard } from "./ScriptCard.jsx";
import { TriggerCard } from "./TriggerCard.jsx";
import { AddScriptDialog } from "./AddScriptDialog.jsx";
import { AddTriggerDialog } from "./AddTriggerDialog.jsx";
import { StepGraphNode, TriggerGraphNode } from "./graph/GraphNodes.jsx";

import "@xyflow/react/dist/style.css";

const nodeTypes = { trigger: TriggerGraphNode, step: StepGraphNode };

/** Two Control zoom-out steps from React Flow's default zoom (1). */
const INITIAL_ZOOM = 1 / 1.2 ** 2;
const FIT_VIEW = { padding: 0.2, maxZoom: INITIAL_ZOOM, duration: 200 };

export function GraphTab(props) {
  return (
    <ReactFlowProvider>
      <GraphTabInner {...props} />
    </ReactFlowProvider>
  );
}

function GraphTabInner({
  doc,
  onPatch,
  disabled,
  scripts = [],
  profiles = [],
  workflows = [],
  owner,
  file,
  excludeFile,
  auths = [],
  pages = [],
  trySession,
  onTrySuccess,
  tryFocusUiId,
  onTryFocus,
}) {
  const { fitView } = useReactFlow();
  const [addStepOpen, setAddStepOpen] = useState(false);
  const [addTriggerOpen, setAddTriggerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [pendingConnect, setPendingConnect] = useState(null);
  const [positions, setPositions] = useState(() => readGraphLayout(owner, file));
  const [nodes, setNodes] = useState([]);

  useEffect(() => {
    setPositions(readGraphLayout(owner, file));
    setSelectedId(null);
  }, [owner, file]);

  const steps = doc?.scripts ?? [];
  const triggers = doc?.triggers ?? [];

  const { edges } = useMemo(() => buildGraphElements(doc, positions), [doc, positions]);

  useEffect(() => {
    const built = buildGraphElements(doc, positions);
    setNodes((prev) => {
      const selected = new Set(prev.filter((n) => n.selected).map((n) => n.id));
      return built.nodes.map((n) => ({
        ...n,
        selected: selected.has(n.id),
        deletable: !disabled,
        draggable: !disabled,
      }));
    });
  }, [doc, disabled, positions]);

  useEffect(() => {
    const t = requestAnimationFrame(() => fitView(FIT_VIEW));
    return () => cancelAnimationFrame(t);
  }, [owner, file, fitView]);

  const selected = parseGraphNodeId(selectedId);

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

  const displayEdges = useMemo(
    () =>
      edges.map((e) => ({
        ...e,
        deletable: Boolean(e.deletable) && !disabled,
      })),
    [edges, disabled],
  );

  const persistPositions = useCallback(
    (next) => {
      setPositions(next);
      writeGraphLayout(owner, file, next);
    },
    [owner, file],
  );

  const onNodesChange = useCallback((changes) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  function patchSteps(next) {
    onPatch((d) => {
      d.scripts = next;
    });
  }

  function patchTriggers(next) {
    onPatch((d) => {
      d.triggers = next;
    });
  }

  function applyConnect(fromUiId, toUiId) {
    patchSteps(addStepEdge(doc, fromUiId, toUiId));
  }

  const isValidConnection = useCallback(
    (conn) => {
      if (disabled) return false;
      const from = parseGraphNodeId(conn.source);
      if (from?.kind !== "step") return false;
      if (!conn.target) return true;
      const to = parseGraphNodeId(conn.target);
      if (to?.kind !== "step") return false;
      return canConnectSteps(doc, from.uiId, to.uiId);
    },
    [doc, disabled],
  );

  function onConnect(conn) {
    const from = parseGraphNodeId(conn.source);
    const to = parseGraphNodeId(conn.target);
    if (from?.kind !== "step" || to?.kind !== "step") return;
    if (!canConnectSteps(doc, from.uiId, to.uiId)) return;
    if (enteringDagWouldStripWhen(doc)) {
      setPendingConnect({ fromUiId: from.uiId, toUiId: to.uiId });
      return;
    }
    applyConnect(from.uiId, to.uiId);
  }

  function onEdgesDelete(deleted) {
    if (disabled) return;
    for (const edge of deleted) {
      const kind = edge.data?.edgeKind;
      if (kind !== "list" && kind !== "linear") continue;
      const from = parseGraphNodeId(edge.source);
      const to = parseGraphNodeId(edge.target);
      if (from?.kind !== "step" || to?.kind !== "step") continue;
      if (enteringDagWouldStripWhen(doc) && kind === "linear") {
        setPendingConnect({ fromUiId: from.uiId, toUiId: to.uiId, remove: true });
        continue;
      }
      patchSteps(removeStepEdge(doc, from.uiId, to.uiId));
    }
  }

  function onNodesDelete(deleted) {
    if (disabled) return;
    const dropSteps = new Set();
    const dropTrigs = new Set();
    for (const n of deleted) {
      const parsed = parseGraphNodeId(n.id);
      if (parsed?.kind === "step") dropSteps.add(parsed.uiId);
      if (parsed?.kind === "trigger") dropTrigs.add(parsed.uiId);
    }
    if (dropSteps.size) patchSteps(steps.filter((s) => !dropSteps.has(s.uiId)));
    if (dropTrigs.size) patchTriggers(triggers.filter((t) => !dropTrigs.has(t.uiId)));
    setSelectedId(null);
  }

  function onNodeDragStop(_ev, node) {
    const key = node.data?.layoutKey;
    if (!key) return;
    persistPositions({ ...positions, [key]: { ...node.position } });
  }

  function resetLayout() {
    clearGraphLayout(owner, file);
    persistPositions({});
    requestAnimationFrame(() => fitView(FIT_VIEW));
  }

  const selectedStep = selected?.kind === "step" ? steps.find((s) => s.uiId === selected.uiId) : null;
  const selectedTrigger =
    selected?.kind === "trigger" ? triggers.find((t) => t.uiId === selected.uiId) : null;
  const selectedStepIndex = selectedStep ? steps.findIndex((s) => s.uiId === selectedStep.uiId) : -1;
  const selectedTriggerIndex = selectedTrigger
    ? triggers.findIndex((t) => t.uiId === selectedTrigger.uiId)
    : -1;

  return (
    <div className="flex min-h-0 flex-1 gap-3">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <p className="text-sm opacity-70 flex-1">
            Drag nodes to arrange. Connect steps to set list <span className="font-mono">needs</span>.
            Trigger links are automatic.
          </p>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={disabled}
            onClick={resetLayout}
            title="Reset layout"
          >
            <LuRotateCcw className="size-4" />
            Reset layout
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={disabled}
            onClick={() => setAddTriggerOpen(true)}
          >
            <LuPlus className="size-4" />
            Add trigger
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={disabled}
            onClick={() => setAddStepOpen(true)}
          >
            <LuPlus className="size-4" />
            Add step
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden rounded-box border border-base-300 bg-base-200">
          <ReactFlow
            className="workflow-graph"
            nodes={nodes}
            edges={displayEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onSelectionChange={({ nodes: selectedNodes }) => {
              const id = selectedNodes[0]?.id ?? null;
              setSelectedId((cur) => (cur === id ? cur : id));
            }}
            onNodeDragStop={onNodeDragStop}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            nodesConnectable={!disabled}
            nodesDraggable={!disabled}
            connectionRadius={80}
            defaultViewport={{ x: 0, y: 0, zoom: INITIAL_ZOOM }}
            defaultEdgeOptions={{ type: "smoothstep" }}
            proOptions={{ hideAttribution: false }}
          >
            <Background />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>
      </div>
      <aside className="flex w-full max-w-md shrink-0 flex-col gap-2 overflow-auto sm:w-96">
        {selectedStep && selectedStepIndex >= 0 ? (
          <ScriptCard
            key={selectedStep.uiId}
            step={selectedStep}
            index={selectedStepIndex}
            otherSteps={steps}
            scriptsByName={scriptsByName}
            profilesByName={profilesByName}
            disabled={disabled}
            workflows={workflows}
            owner={owner}
            excludeFile={excludeFile}
            sortable={false}
            defaultExpanded
            trySession={trySession}
            onTrySuccess={onTrySuccess}
            tryOpen={tryFocusUiId === selectedStep.uiId}
            onTryOpenChange={(open) => {
              onTryFocus?.(open ? selectedStep.uiId : null);
            }}
            onNavigateTry={(targetUiId) => {
              const id = stepNodeId(targetUiId);
              setSelectedId(id);
              setNodes((prev) =>
                prev.map((n) => ({ ...n, selected: n.id === id })),
              );
              onTryFocus?.(targetUiId);
            }}
            onChange={(next) => {
              const copy = [...steps];
              copy[selectedStepIndex] = next;
              patchSteps(copy);
            }}
            onRemove={() => {
              patchSteps(steps.filter((_, i) => i !== selectedStepIndex));
              setSelectedId(null);
              onTryFocus?.(null);
            }}
          />
        ) : selectedTrigger && selectedTriggerIndex >= 0 ? (
          <TriggerCard
            key={selectedTrigger.uiId}
            trigger={selectedTrigger}
            index={selectedTriggerIndex}
            owner={owner}
            auths={auths}
            pages={pages}
            workflows={workflows}
            excludeFile={excludeFile}
            disabled={disabled}
            sortable={false}
            defaultExpanded
            onChange={(next) => {
              const copy = [...triggers];
              copy[selectedTriggerIndex] = next;
              patchTriggers(copy);
            }}
            onRemove={() => {
              patchTriggers(triggers.filter((_, i) => i !== selectedTriggerIndex));
              setSelectedId(null);
            }}
          />
        ) : (
          <div className="rounded-box border border-dashed border-base-300 p-4 text-sm opacity-70">
            <p>Select a node to edit it. Add a trigger or step to grow the graph.</p>
            <p className="mt-2 text-xs">
              Named <span className="font-mono">needs</span> maps stay in the inspector; the canvas
              only edits list dependencies.
            </p>
          </div>
        )}
      </aside>
      <AddScriptDialog
        open={addStepOpen}
        owner={owner}
        onClose={() => setAddStepOpen(false)}
        onPick={(picked) => {
          let next;
          if (picked.kind === "set") next = newSetStep();
          else if (picked.kind === "profile") next = newProfileStep(picked.name, picked.script);
          else next = newScriptStep(picked.name, defaultConfigFromMeta(picked.meta));
          next = withAllocatedStepId(next, steps);
          patchSteps([...steps, next]);
          setSelectedId(`step:${next.uiId}`);
          setAddStepOpen(false);
        }}
      />
      <AddTriggerDialog
        open={addTriggerOpen}
        onClose={() => setAddTriggerOpen(false)}
        onPick={(kind) => {
          const next =
            kind === "cron"
              ? newCronTrigger()
              : kind === "workflow"
                ? newWorkflowTrigger()
                : newHttpTrigger();
          patchTriggers([...triggers, next]);
          setSelectedId(`trig:${next.uiId}`);
          setAddTriggerOpen(false);
        }}
      />
      <ConfirmDialog
        open={Boolean(pendingConnect)}
        title="Switch to DAG mode?"
        message="Connecting or removing a step edge writes needs and is not compatible with when. Existing when conditions on steps will be cleared."
        confirmLabel="Continue"
        confirmClass="btn-primary"
        onCancel={() => setPendingConnect(null)}
        onConfirm={() => {
          const pending = pendingConnect;
          setPendingConnect(null);
          if (!pending) return;
          if (pending.remove) patchSteps(removeStepEdge(doc, pending.fromUiId, pending.toUiId));
          else applyConnect(pending.fromUiId, pending.toUiId);
        }}
      />
    </div>
  );
}