import jsonata from "jsonata";
export { namespacedPath } from "@jerapah-flow/shared";

export const SET_STEP_SCRIPT = "set";

/**
 * @typedef {{ alias: string, from: string }} NeedEdge
 * @typedef {{
 *   kind: "script",
   *   script: string,
   *   profile: string | null,
   *   config: unknown | null,
   *   expression?: undefined,
   *   id: string | null,
   *   needsKind: "none" | "list" | "map",
   *   needs: NeedEdge[],
   *   when: string | null,
   * }} ParsedScriptStep
 * @typedef {{
 *   kind: "set",
   *   script: typeof SET_STEP_SCRIPT,
   *   profile: null,
   *   config: { expression: string },
   *   expression: string,
   *   id: string | null,
 *   needsKind: "none" | "list" | "map",
 *   needs: NeedEdge[],
 *   when: string | null,
 * }} ParsedSetStep
 * @typedef {ParsedScriptStep | ParsedSetStep} ParsedStep
 * @typedef {ParsedStep & { index: number }} CompiledStep
 * @typedef {{
 *   dagMode: boolean,
 *   steps: CompiledStep[],
 *   order: number[],
 * }} CompiledScripts
 */

/**
 * Compile a JSONata source so save/load fails on syntax errors.
 * @param {string} source
 * @param {string} label
 */
export function compileJsonata(source, label) {
  try {
    return jsonata(source);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid ${label}: ${msg}`);
  }
}

/**
 * @param {unknown} value
 */
export function isJsonataTruthy(value) {
  if (value == null || value === false) return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

/**
 * Evaluate JSONata against the full ctx (jsonata 2 may return a Promise).
 * @param {string} source
 * @param {unknown} ctx
 */
export async function evaluateJsonata(source, ctx) {
  const result = compileJsonata(source, "expression").evaluate(ctx);
  return await result;
}

/**
 * @param {unknown} step
 * @returns {ParsedStep}
 */
export function parseScriptStep(step) {
  if (typeof step === "string") {
    return {
      kind: "script",
      script: step,
      profile: null,
      config: null,
      id: null,
      needsKind: "none",
      needs: [],
      when: null,
    };
  }
  if (step == null || typeof step !== "object" || Array.isArray(step)) {
    throw new Error(`Invalid script step: ${JSON.stringify(step)}`);
  }

  const hasScript = step.script != null && step.script !== "";
  const hasProfile = step.profile != null && step.profile !== "";
  const hasSet = step.set != null;

  if (hasScript && hasSet) {
    throw new Error("Step cannot have both script and set");
  }
  if (hasProfile && hasSet) {
    throw new Error("Step cannot have both profile and set");
  }

  if (hasSet) {
    return parseSetStep(step);
  }

  if (hasProfile && typeof step.profile !== "string") {
    throw new Error(`Invalid profile: ${JSON.stringify(step.profile)}`);
  }
  if (hasScript && typeof step.script !== "string") {
    throw new Error(`Invalid script step: ${JSON.stringify(step)}`);
  }

  if (hasScript || hasProfile) {
    const { needsKind, needs } = parseNeeds(step.needs);
    return {
      kind: "script",
      script: hasScript ? step.script : "",
      profile: hasProfile ? step.profile : null,
      config: step.config ?? null,
      id: parseOptionalId(step.id),
      needsKind,
      needs,
      when: parseWhen(step.when),
    };
  }

  throw new Error(`Invalid script step: ${JSON.stringify(step)}`);
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

  if (dagMode) {
    for (const step of steps) {
      const who = step.id ?? String(step.index);
      if (step.when) {
        throw new Error(`when is not allowed in DAG workflows (step ${who})`);
      }
    }
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
 * Upstream DAG output stored in outputsById (already the pipe value).
 * @param {unknown} result
 */
export function extractStepOutput(result) {
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
    return extractStepOutput(outputsById.get(step.needs[0].from));
  }
  /** @type {Record<string, unknown>} */
  const data = {};
  for (const { alias, from } of step.needs) {
    data[alias] = extractStepOutput(outputsById.get(from));
  }
  return data;
}

/**
 * @param {object} step
 * @returns {ParsedSetStep}
 */
function parseSetStep(step) {
  const spec = step.set;
  if (spec == null || typeof spec !== "object" || Array.isArray(spec)) {
    throw new Error(`Invalid set step: ${JSON.stringify(step)}`);
  }
  const expression = spec.expression;
  if (typeof expression !== "string" || !expression.trim()) {
    throw new Error("set.expression is required");
  }
  compileJsonata(expression, "set.expression");
  const { needsKind, needs } = parseNeeds(step.needs);
  return {
    kind: "set",
    script: SET_STEP_SCRIPT,
    profile: null,
    config: { expression },
    expression,
    id: parseOptionalId(step.id),
    needsKind,
    needs,
    when: parseWhen(step.when),
  };
}

/**
 * @param {unknown} when
 * @returns {string | null}
 */
function parseWhen(when) {
  if (when == null || when === "") return null;
  if (typeof when !== "string") {
    throw new Error(`Invalid when: ${JSON.stringify(when)}`);
  }
  compileJsonata(when, "when");
  return when;
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
 * @returns {{ needsKind: ParsedScriptStep["needsKind"], needs: NeedEdge[] }}
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
