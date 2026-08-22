/**
 * Client-side Try session helpers (hybrid seed for ScriptTryDialog).
 * Mirrors server chainCtx / mergeStepData without importing server modules.
 */

import { contextFromMeta } from "./script.js";
import { isDagDoc, isEmptyNeeds, needsMode } from "./workflow-doc.js";

/**
 * @typedef {{
 *   data: unknown,
 *   context: Record<string, unknown>,
 *   output: unknown,
 *   resultContext: Record<string, unknown>,
 *   at: number,
 * }} TryStepRecord
 *
 * @typedef {{
 *   byStep: Record<string, TryStepRecord>,
 *   lastTriedUiId: string | null,
 * }} TrySession
 *
 * @typedef {{
 *   data: unknown,
 *   context: Record<string, unknown>,
 *   source: string,
 *   lastResult?: { output: unknown, context: Record<string, unknown> },
 * }} TrySeed
 */

/** @returns {TrySession} */
export function emptyTrySession() {
  return { byStep: {}, lastTriedUiId: null };
}

/**
 * @param {TrySession} session
 * @param {string} uiId
 * @param {{ data: unknown, context: unknown, output: unknown, resultContext: unknown }} result
 * @returns {TrySession}
 */
export function recordTrySuccess(session, uiId, result) {
  const context =
    result.context != null &&
    typeof result.context === "object" &&
    !Array.isArray(result.context)
      ? /** @type {Record<string, unknown>} */ (result.context)
      : {};
  const resultContext =
    result.resultContext != null &&
    typeof result.resultContext === "object" &&
    !Array.isArray(result.resultContext)
      ? /** @type {Record<string, unknown>} */ (result.resultContext)
      : {};
  return {
    byStep: {
      ...session.byStep,
      [uiId]: {
        data: result.data,
        context,
        output: result.output,
        resultContext,
        at: Date.now(),
      },
    },
    lastTriedUiId: uiId,
  };
}

/**
 * Drop records for removed steps.
 * @param {TrySession} session
 * @param {Array<{ uiId: string }>} steps
 * @returns {TrySession}
 */
export function pruneTrySession(session, steps) {
  const keep = new Set((steps ?? []).map((s) => s.uiId));
  /** @type {Record<string, TryStepRecord>} */
  const byStep = {};
  for (const [id, rec] of Object.entries(session.byStep ?? {})) {
    if (keep.has(id)) byStep[id] = rec;
  }
  const lastTriedUiId =
    session.lastTriedUiId && keep.has(session.lastTriedUiId)
      ? session.lastTriedUiId
      : null;
  return { byStep, lastTriedUiId };
}

/**
 * Human-readable step label for seed hints.
 * @param {{ index?: number, kind?: string, script?: string, profile?: string, id?: string }} step
 * @param {number} [index]
 */
export function stepTryLabel(step, index) {
  const n = index != null ? index + 1 : (step.index ?? 0) + 1;
  const id = typeof step.id === "string" && step.id.trim() ? step.id.trim() : null;
  const name =
    step.kind === "set"
      ? "set"
      : step.profile || step.script || "step";
  if (id) return `step ${n} / ${id} (${name})`;
  return `step ${n} / ${name}`;
}

/**
 * Build data from needs the way the runner does (mergeStepData).
 * @param {unknown} needs
 * @param {Map<string, TryStepRecord>} byId — keyed by step.id
 * @returns {{ ok: true, data: unknown, labels: string[] } | { ok: false }}
 */
function mergeNeedsFromTries(needs, byId) {
  const mode = needsMode(needs);
  if (mode === "none" || isEmptyNeeds(needs)) return { ok: false };

  if (mode === "list") {
    const list = /** @type {string[]} */ (needs);
    if (list.length === 1) {
      const rec = byId.get(list[0]);
      if (!rec) return { ok: false };
      return { ok: true, data: rec.output ?? null, labels: [list[0]] };
    }
    /** @type {Record<string, unknown>} */
    const data = {};
    const labels = [];
    for (const from of list) {
      const rec = byId.get(from);
      if (!rec) return { ok: false };
      data[from] = rec.output ?? null;
      labels.push(from);
    }
    return { ok: true, data, labels };
  }

  // map: { alias: fromId }
  const map = /** @type {Record<string, string>} */ (needs);
  /** @type {Record<string, unknown>} */
  const data = {};
  const labels = [];
  for (const [alias, from] of Object.entries(map)) {
    const rec = byId.get(from);
    if (!rec) return { ok: false };
    data[alias] = rec.output ?? null;
    labels.push(from);
  }
  return { ok: true, data, labels };
}

/**
 * Hybrid seed for opening Try on a step.
 *
 * @param {{
 *   step: { uiId: string, kind?: string, script?: string, profile?: string, id?: string, needs?: unknown },
 *   index: number,
 *   steps: Array<{ uiId: string, kind?: string, script?: string, profile?: string, id?: string, needs?: unknown }>,
 *   session: TrySession,
 *   meta?: unknown,
 * }} opts
 * @returns {TrySeed}
 */
export function seedTryDialog({ step, index, steps, session, meta }) {
  const byStep = session?.byStep ?? {};
  const self = byStep[step.uiId];
  if (self) {
    return {
      data: self.data,
      context: self.context ?? {},
      source: "restored from last try on this step",
      lastResult: {
        output: self.output,
        context: self.resultContext ?? {},
      },
    };
  }

  const dag = isDagDoc({ scripts: steps });

  if (!dag && index > 0) {
    const prev = steps[index - 1];
    const prevRec = prev ? byStep[prev.uiId] : null;
    if (prevRec) {
      return {
        data: prevRec.output ?? null,
        context: prevRec.resultContext ?? {},
        source: `from ${stepTryLabel(prev, index - 1)}`,
      };
    }
  }

  if (!isEmptyNeeds(step.needs)) {
    /** @type {Map<string, TryStepRecord>} */
    const byId = new Map();
    /** @type {Map<string, { step: typeof steps[0], index: number }>} */
    const stepById = new Map();
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (typeof s.id === "string" && s.id.trim()) {
        stepById.set(s.id, { step: s, index: i });
        const rec = byStep[s.uiId];
        if (rec) byId.set(s.id, rec);
      }
    }
    const merged = mergeNeedsFromTries(step.needs, byId);
    if (merged.ok) {
      // Context: use the most recently tried upstream among needs (shared clipboard).
      let context = {};
      let newestAt = -1;
      const labelParts = [];
      for (const id of merged.labels) {
        const info = stepById.get(id);
        const rec = byId.get(id);
        if (info) labelParts.push(stepTryLabel(info.step, info.index));
        if (rec && rec.at > newestAt) {
          newestAt = rec.at;
          context = rec.resultContext ?? {};
        }
      }
      return {
        data: merged.data,
        context,
        source: `from needs (${labelParts.join(", ")})`,
      };
    }
  }

  const lastId = session?.lastTriedUiId;
  if (lastId && byStep[lastId]) {
    const lastRec = byStep[lastId];
    const lastIndex = steps.findIndex((s) => s.uiId === lastId);
    const lastStep = lastIndex >= 0 ? steps[lastIndex] : null;
    return {
      data: lastRec.output ?? null,
      context: lastRec.resultContext ?? {},
      source: lastStep
        ? `from last try (${stepTryLabel(lastStep, lastIndex)})`
        : "from last try",
    };
  }

  const fromMeta = contextFromMeta(meta);
  return {
    data: fromMeta.data ?? {},
    context:
      fromMeta.context != null &&
      typeof fromMeta.context === "object" &&
      !Array.isArray(fromMeta.context)
        ? fromMeta.context
        : {},
    source: meta?.example ? "from script example" : "empty defaults",
  };
}
