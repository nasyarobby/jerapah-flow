import { isDagDoc, isEmptyNeeds, needsMode, nextStepId } from "./workflow-doc.js";

export const STEP_NODE_PREFIX = "step:";
export const TRIGGER_NODE_PREFIX = "trig:";

export function stepNodeId(uiId) {
  return `${STEP_NODE_PREFIX}${uiId}`;
}

export function triggerNodeId(uiId) {
  return `${TRIGGER_NODE_PREFIX}${uiId}`;
}

export function parseGraphNodeId(id) {
  if (typeof id !== "string") return null;
  if (id.startsWith(STEP_NODE_PREFIX)) {
    return { kind: "step", uiId: id.slice(STEP_NODE_PREFIX.length) };
  }
  if (id.startsWith(TRIGGER_NODE_PREFIX)) {
    return { kind: "trigger", uiId: id.slice(TRIGGER_NODE_PREFIX.length) };
  }
  return null;
}

export function parentIdsFromNeeds(needs) {
  if (needs == null) return [];
  if (Array.isArray(needs)) {
    return needs.filter((x) => typeof x === "string" && x.length > 0);
  }
  if (typeof needs === "object") {
    return Object.values(needs).filter((x) => typeof x === "string" && x.length > 0);
  }
  return [];
}

export function triggerSummary(trigger, owner) {
  const type = String(trigger?.type ?? "").toLowerCase();
  if (type === "cron") return trigger.schedule || "cron";
  if (type === "workflow") return "callable";
  const method = trigger?.method || "POST";
  const path = trigger?.path || "/";
  if (owner) return `${method} /u/${owner}${path.startsWith("/") ? path : `/${path}`}`;
  return `${method} ${path}`;
}

export function stepLabel(step) {
  if (step?.kind === "set") return step.id ? `${step.id}: set` : "set";
  const target = step?.profile ? `profile ${step.profile}` : step?.script || "untitled";
  return step?.id ? `${step.id}: ${target}` : target;
}

export function layoutKeyForTrigger(index) {
  return `t:${index}`;
}

export function layoutKeyForStep(step, index) {
  if (step?.id) return `s-id:${step.id}`;
  return `s:${index}`;
}

export function docHasWhen(doc) {
  return (doc?.scripts ?? []).some((s) => typeof s.when === "string" && s.when.trim());
}

function cloneScripts(doc) {
  return (doc?.scripts ?? []).map((s) => ({ ...s }));
}

function usedIds(scripts) {
  return new Set(scripts.map((s) => s.id).filter(Boolean));
}

function ensureStepId(step, used) {
  if (step.id) {
    used.add(step.id);
    return step;
  }
  const id = nextStepId(used);
  used.add(id);
  return { ...step, id };
}

export function stripWhenFromScripts(scripts) {
  return scripts.map((s) => (s.when ? { ...s, when: "" } : s));
}

/**
 * Turn implicit linear order into list `needs` (and assign missing ids).
 * Callers must strip `when` when entering DAG.
 */
export function materializeLinearNeeds(scripts) {
  if (scripts.length === 0) return scripts;
  const used = usedIds(scripts);
  const next = scripts.map((s) => ensureStepId({ ...s }, used));
  for (let i = 1; i < next.length; i++) {
    const parentId = next[i - 1].id;
    next[i] = { ...next[i], needs: [parentId], when: "" };
  }
  next[0] = { ...next[0], when: "" };
  return next;
}

function adjacencyFromScripts(scripts) {
  const byId = new Map();
  for (const s of scripts) {
    if (s.id) byId.set(s.id, s.uiId);
  }
  /** @type {Map<string, string[]>} */
  const children = new Map();
  for (const s of scripts) children.set(s.uiId, []);
  const dag = scripts.some((s) => !isEmptyNeeds(s.needs));
  if (dag) {
    for (const s of scripts) {
      for (const pid of parentIdsFromNeeds(s.needs)) {
        const fromUi = byId.get(pid);
        if (fromUi) children.get(fromUi)?.push(s.uiId);
      }
    }
  } else {
    for (let i = 1; i < scripts.length; i++) {
      children.get(scripts[i - 1].uiId)?.push(scripts[i].uiId);
    }
  }
  return children;
}

/** Outgoing neighbors (linear next, or DAG children). */
export function stepSuccessors(scripts, uiId) {
  return adjacencyFromScripts(scripts ?? []).get(uiId) ?? [];
}

/** Incoming neighbors (linear previous, or DAG parents). */
export function stepPredecessors(scripts, uiId) {
  const children = adjacencyFromScripts(scripts ?? []);
  /** @type {string[]} */
  const out = [];
  for (const [from, tos] of children) {
    if (tos.includes(uiId)) out.push(from);
  }
  return out;
}

export function wouldCreateCycle(scripts, fromUiId, toUiId) {
  if (fromUiId === toUiId) return true;
  const children = adjacencyFromScripts(scripts);
  const stack = [...(children.get(toUiId) ?? [])];
  const seen = new Set();
  while (stack.length) {
    const cur = stack.pop();
    if (cur === fromUiId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const n of children.get(cur) ?? []) stack.push(n);
  }
  return false;
}

export function canConnectSteps(doc, fromUiId, toUiId) {
  const scripts = doc?.scripts ?? [];
  const from = scripts.find((s) => s.uiId === fromUiId);
  const to = scripts.find((s) => s.uiId === toUiId);
  if (!from || !to) return false;
  if (fromUiId === toUiId) return false;
  if (needsMode(to.needs) === "map") return false;
  if (wouldCreateCycle(scripts, fromUiId, toUiId)) return false;
  return true;
}

export function addStepEdge(doc, fromUiId, toUiId) {
  if (!canConnectSteps(doc, fromUiId, toUiId)) return doc?.scripts ?? [];
  let scripts = cloneScripts(doc);
  if (!isDagDoc({ scripts })) {
    scripts = materializeLinearNeeds(scripts);
  }
  const from = scripts.find((s) => s.uiId === fromUiId);
  const toIndex = scripts.findIndex((s) => s.uiId === toUiId);
  if (!from || toIndex < 0) return scripts;
  const to = scripts[toIndex];
  if (needsMode(to.needs) === "map") return scripts;
  const used = usedIds(scripts);
  const source = ensureStepId(from, used);
  scripts = scripts.map((s) => (s.uiId === source.uiId ? source : s));
  const current = Array.isArray(to.needs) ? [...to.needs] : [];
  if (!current.includes(source.id)) current.push(source.id);
  scripts[toIndex] = { ...to, needs: current, when: "" };
  return stripWhenFromScripts(scripts);
}

export function removeStepEdge(doc, fromUiId, toUiId) {
  let scripts = cloneScripts(doc);
  if (!isDagDoc({ scripts })) {
    scripts = materializeLinearNeeds(scripts);
  }
  const from = scripts.find((s) => s.uiId === fromUiId);
  const toIndex = scripts.findIndex((s) => s.uiId === toUiId);
  if (!from?.id || toIndex < 0) return scripts;
  const to = scripts[toIndex];
  if (needsMode(to.needs) === "map") return scripts;
  if (!Array.isArray(to.needs)) return scripts;
  const nextNeeds = to.needs.filter((id) => id !== from.id);
  scripts[toIndex] = { ...to, needs: nextNeeds.length ? nextNeeds : null };
  return scripts;
}

export function enteringDagWouldStripWhen(doc) {
  return !isDagDoc(doc) && docHasWhen(doc);
}

/**
 * @returns {{ nodes: object[], edges: object[] }}
 */
export function buildGraphElements(doc, positions = {}) {
  const scripts = doc?.scripts ?? [];
  const triggers = doc?.triggers ?? [];
  const dag = isDagDoc(doc);
  const byId = new Map();
  for (const s of scripts) {
    if (s.id) byId.set(s.id, s);
  }

  const auto = autoLayout(doc);
  const nodes = [];
  const edges = [];

  for (let i = 0; i < triggers.length; i++) {
    const t = triggers[i];
    const id = triggerNodeId(t.uiId);
    const layoutKey = layoutKeyForTrigger(i);
    nodes.push({
      id,
      type: "trigger",
      position: positions[layoutKey] ?? auto[layoutKey] ?? { x: 0, y: i * 96 },
      data: {
        layoutKey,
        label: triggerSummary(t),
        triggerType: t.type,
        uiId: t.uiId,
        index: i,
      },
    });
  }

  for (let i = 0; i < scripts.length; i++) {
    const s = scripts[i];
    const id = stepNodeId(s.uiId);
    const layoutKey = layoutKeyForStep(s, i);
    const mode = needsMode(s.needs);
    const parents = parentIdsFromNeeds(s.needs);
    const missing = parents.filter((pid) => !byId.has(pid));
    nodes.push({
      id,
      type: "step",
      position: positions[layoutKey] ?? auto[layoutKey] ?? { x: 280, y: i * 96 },
      data: {
        layoutKey,
        label: stepLabel(s),
        kind: s.kind,
        stepId: s.id || "",
        when: s.when || "",
        needsMode: mode,
        script: s.script || "",
        profile: s.profile || "",
        missingNeeds: missing,
        uiId: s.uiId,
        index: i,
      },
    });
  }

  /** @type {string[]} */
  const roots = [];
  if (dag) {
    for (const s of scripts) {
      const parents = parentIdsFromNeeds(s.needs);
      if (parents.length === 0) roots.push(s.uiId);
      const mode = needsMode(s.needs);
      if (mode === "map" && s.needs && typeof s.needs === "object" && !Array.isArray(s.needs)) {
        for (const [alias, pid] of Object.entries(s.needs)) {
          if (typeof pid !== "string" || !pid) continue;
          const from = byId.get(pid);
          if (!from) continue;
          edges.push({
            id: `e:map:${from.uiId}->${s.uiId}:${alias}`,
            source: stepNodeId(from.uiId),
            target: stepNodeId(s.uiId),
            deletable: false,
            selectable: false,
            data: { edgeKind: "map", alias },
            style: { strokeDasharray: "6 4" },
            label: alias,
          });
        }
      } else {
        for (const pid of parents) {
          const from = byId.get(pid);
          if (!from) continue;
          edges.push({
            id: `e:step:${from.uiId}->${s.uiId}`,
            source: stepNodeId(from.uiId),
            target: stepNodeId(s.uiId),
            deletable: true,
            selectable: true,
            data: { edgeKind: "list" },
          });
        }
      }
    }
  } else {
    if (scripts[0]) roots.push(scripts[0].uiId);
    for (let i = 1; i < scripts.length; i++) {
      const from = scripts[i - 1];
      const to = scripts[i];
      edges.push({
        id: `e:linear:${from.uiId}->${to.uiId}`,
        source: stepNodeId(from.uiId),
        target: stepNodeId(to.uiId),
        deletable: true,
        data: { edgeKind: "linear" },
      });
    }
  }

  for (const t of triggers) {
    for (const rid of roots) {
      edges.push({
        id: `e:trig:${t.uiId}->${rid}`,
        source: triggerNodeId(t.uiId),
        target: stepNodeId(rid),
        deletable: false,
        selectable: false,
        focusable: false,
        data: { edgeKind: "trigger" },
      });
    }
  }

  return { nodes, edges };
}

export function autoLayout(doc) {
  const scripts = doc?.scripts ?? [];
  const triggers = doc?.triggers ?? [];
  const dag = isDagDoc(doc);
  const colW = 240;
  const rowH = 96;
  const leftX = 24;
  const stepX0 = 280;

  /** @type {Record<string, { x: number, y: number }>} */
  const pos = {};
  for (let i = 0; i < triggers.length; i++) {
    pos[layoutKeyForTrigger(i)] = { x: leftX, y: 24 + i * rowH };
  }

  /** @type {number[]} */
  const ranks = scripts.map(() => 0);
  if (dag) {
    const byId = new Map();
    scripts.forEach((s, i) => {
      if (s.id) byId.set(s.id, i);
    });
    const visiting = new Set();
    const seen = new Set();
    function rankOf(i) {
      if (seen.has(i)) return ranks[i];
      if (visiting.has(i)) return 0;
      visiting.add(i);
      let r = 0;
      for (const pid of parentIdsFromNeeds(scripts[i].needs)) {
        const pi = byId.get(pid);
        if (pi == null) continue;
        r = Math.max(r, rankOf(pi) + 1);
      }
      visiting.delete(i);
      seen.add(i);
      ranks[i] = r;
      return r;
    }
    scripts.forEach((_, i) => rankOf(i));
  } else {
    scripts.forEach((_, i) => {
      ranks[i] = i;
    });
  }

  /** @type {Map<number, number>} */
  const rowAtRank = new Map();
  scripts.forEach((s, i) => {
    const rank = ranks[i];
    const row = rowAtRank.get(rank) ?? 0;
    rowAtRank.set(rank, row + 1);
    pos[layoutKeyForStep(s, i)] = {
      x: stepX0 + rank * colW,
      y: 24 + row * rowH,
    };
  });
  return pos;
}

const LAYOUT_PREFIX = "jerapah-flow.workflowGraphLayout:";

export function workflowGraphLayoutKey(owner, file) {
  return `${LAYOUT_PREFIX}${owner}/${file}`;
}

export function readGraphLayout(owner, file) {
  if (typeof localStorage === "undefined" || !owner || !file) return {};
  try {
    const raw = localStorage.getItem(workflowGraphLayoutKey(owner, file));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeGraphLayout(owner, file, positions) {
  if (typeof localStorage === "undefined" || !owner || !file) return;
  try {
    localStorage.setItem(workflowGraphLayoutKey(owner, file), JSON.stringify(positions));
  } catch {
    // quota / private mode
  }
}

export function clearGraphLayout(owner, file) {
  if (typeof localStorage === "undefined" || !owner || !file) return;
  try {
    localStorage.removeItem(workflowGraphLayoutKey(owner, file));
  } catch {
    // ignore
  }
}
