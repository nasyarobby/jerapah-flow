/**
 * @typedef {{ alias: string, from: string }} NeedEdge
 * @typedef {{
 *   script: string,
 *   config: unknown | null,
 *   id: string | null,
 *   needsKind: "none" | "list" | "map",
 *   needs: NeedEdge[],
 * }} ParsedStep
 * @typedef {ParsedStep & { index: number }} CompiledStep
 * @typedef {{
 *   dagMode: boolean,
 *   steps: CompiledStep[],
 *   order: number[],
 * }} CompiledScripts
 */

/**
 * @param {unknown} step
 * @returns {ParsedStep}
 */
export function parseScriptStep(step) {
  if (typeof step === "string") {
    return {
      script: step,
      config: null,
      id: null,
      needsKind: "none",
      needs: [],
    };
  }
  if (step?.script) {
    const { needsKind, needs } = parseNeeds(step.needs);
    return {
      script: step.script,
      config: step.config ?? null,
      id: parseOptionalId(step.id),
      needsKind,
      needs,
    };
  }
  throw new Error(`Invalid script step: ${JSON.stringify(step)}`);
}

/**
 * Resolve an HTTP path under the owner namespace: /notify -> /u/alice/notify
 * @param {string} owner
 * @param {string} triggerPath
 */
export function namespacedPath(owner, triggerPath) {
  const cleaned = String(triggerPath).replace(/^\/+/, "");
  return `/u/${owner}/${cleaned}`;
}

/**
 * Parse scripts, detect linear vs DAG mode, and return a topological order.
 * Linear mode (no `needs` on any step) keeps array order.
 * @param {unknown} scripts
 * @returns {CompiledScripts}
 */
export function compileWorkflowScripts(scripts) {
  if (scripts == null) {
    return { dagMode: false, steps: [], order: [] };
  }
  if (!Array.isArray(scripts)) {
    throw new Error("workflow scripts must be an array");
  }

  const steps = scripts.map((raw, index) => ({
    ...parseScriptStep(raw),
    index,
  }));

  const dagMode = steps.some((s) => s.needsKind !== "none");
  const ids = new Map();
  for (const step of steps) {
    if (!step.id) continue;
    if (ids.has(step.id)) {
      throw new Error(`Duplicate step id: ${step.id}`);
    }
    ids.set(step.id, step.index);
  }

  if (!dagMode) {
    return { dagMode: false, steps, order: steps.map((s) => s.index) };
  }

  for (const step of steps) {
    for (const edge of step.needs) {
      if (!ids.has(edge.from)) {
        const who = step.id ?? String(step.index);
        throw new Error(`Unknown needs id "${edge.from}" (referenced by step ${who})`);
      }
      if (ids.get(edge.from) === step.index) {
        throw new Error(`Step "${step.id ?? step.index}" cannot need itself`);
      }
    }
  }

  const n = steps.length;
  const indegree = Array(n).fill(0);
  const children = Array.from({ length: n }, () => []);

  for (const step of steps) {
    const parents = new Set(step.needs.map((e) => ids.get(e.from)));
    indegree[step.index] = parents.size;
    for (const p of parents) {
      children[p].push(step.index);
    }
  }

  /** @type {number[]} */
  const ready = [];
  for (let i = 0; i < n; i++) {
    if (indegree[i] === 0) ready.push(i);
  }

  const order = [];
  while (ready.length) {
    const i = ready.shift();
    order.push(i);
    const nexts = children[i].slice().sort((a, b) => a - b);
    for (const c of nexts) {
      indegree[c] -= 1;
      if (indegree[c] === 0) {
        insertSorted(ready, c);
      }
    }
  }

  if (order.length !== n) {
    throw new Error("Workflow has a cycle");
  }

  return { dagMode: true, steps, order };
}

/**
 * Prefer a script return's `.data`; otherwise treat the whole return as data.
 * @param {unknown} result
 */
export function extractStepData(result) {
  if (result && typeof result === "object" && !Array.isArray(result) && "data" in result) {
    return result.data;
  }
  return result ?? null;
}

/**
 * Build ctx.data for a step from upstream outputs (DAG mode).
 * @param {CompiledStep} step
 * @param {Map<string, unknown>} outputsById
 * @param {unknown} triggerData
 */
export function mergeStepData(step, outputsById, triggerData) {
  if (step.needsKind === "none" || step.needs.length === 0) {
    return triggerData;
  }
  if (step.needsKind === "list" && step.needs.length === 1) {
    return extractStepData(outputsById.get(step.needs[0].from));
  }
  /** @type {Record<string, unknown>} */
  const data = {};
  for (const { alias, from } of step.needs) {
    data[alias] = extractStepData(outputsById.get(from));
  }
  return data;
}

/**
 * @param {unknown} id
 * @returns {string | null}
 */
function parseOptionalId(id) {
  if (id == null || id === "") return null;
  if (typeof id !== "string") {
    throw new Error(`Invalid step id: ${JSON.stringify(id)}`);
  }
  return id;
}

/**
 * @param {unknown} needs
 * @returns {{ needsKind: ParsedStep["needsKind"], needs: NeedEdge[] }}
 */
function parseNeeds(needs) {
  if (needs == null) {
    return { needsKind: "none", needs: [] };
  }
  if (Array.isArray(needs)) {
    /** @type {NeedEdge[]} */
    const list = [];
    for (const item of needs) {
      if (typeof item !== "string" || item.length === 0) {
        throw new Error(`Invalid needs entry: ${JSON.stringify(item)}`);
      }
      list.push({ alias: item, from: item });
    }
    return { needsKind: "list", needs: list };
  }
  if (typeof needs === "object") {
    /** @type {NeedEdge[]} */
    const list = [];
    for (const [alias, from] of Object.entries(needs)) {
      if (
        typeof alias !== "string" ||
        alias.length === 0 ||
        typeof from !== "string" ||
        from.length === 0
      ) {
        throw new Error(`Invalid needs map: ${JSON.stringify(needs)}`);
      }
      list.push({ alias, from });
    }
    return { needsKind: "map", needs: list };
  }
  throw new Error(`Invalid needs: ${JSON.stringify(needs)}`);
}

/**
 * @param {number[]} arr
 * @param {number} value
 */
function insertSorted(arr, value) {
  for (let k = 0; k < arr.length; k++) {
    if (value < arr[k]) {
      arr.splice(k, 0, value);
      return;
    }
  }
  arr.push(value);
}
