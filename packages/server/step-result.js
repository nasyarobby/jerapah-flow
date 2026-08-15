/**
 * Step return contract: `{ output, context?, skipRemaining? }`.
 */

/**
 * @param {unknown} value
 */
export function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
export function normalizeContext(value) {
  return isPlainObject(value) ? /** @type {Record<string, unknown>} */ (value) : {};
}

/**
 * @typedef {{
 *   output: unknown,
 *   context: Record<string, unknown>,
 *   skipRemaining: boolean,
 * }} StepResult
 */

/**
 * @param {unknown} raw
 * @param {unknown} incomingContext
 * @param {string} [label]
 * @returns {StepResult}
 */
export function normalizeStepResult(raw, incomingContext, label = "script") {
  const incoming = normalizeContext(incomingContext);
  if (!isPlainObject(raw)) {
    const got = raw == null ? String(raw) : typeof raw;
    throw new Error(`${label} must return { output, context }. Got ${got}`);
  }
  if (!("output" in raw) && ("data" in raw || "config" in raw)) {
    throw new Error(
      `${label} must return { output, context }. Returning the full ctx is no longer valid.`,
    );
  }

  let context = incoming;
  if ("context" in raw) {
    if (raw.context == null) {
      context = incoming;
    } else if (!isPlainObject(raw.context)) {
      throw new Error(`${label} returned a non-object context`);
    } else {
      context = /** @type {Record<string, unknown>} */ (raw.context);
    }
  }

  return {
    output: "output" in raw ? raw.output : null,
    context,
    skipRemaining: raw.skipRemaining === true,
  };
}

/**
 * Persistable envelope (omit skipRemaining unless set).
 * @param {StepResult} result
 */
export function storedEnvelope(result) {
  /** @type {{ output: unknown, context: Record<string, unknown>, skipRemaining?: true }} */
  const out = { output: result.output, context: result.context };
  if (result.skipRemaining) out.skipRemaining = true;
  return out;
}

/**
 * Next step ctx (without config).
 * @param {StepResult} result
 */
export function chainCtx(result) {
  return { data: result.output, context: result.context };
}

/**
 * Shallow-merge sibling context diffs vs a shared snapshot.
 * Fails if two siblings change the same key.
 *
 * @param {unknown} snapshot
 * @param {Array<{ id: string, context: unknown }>} patches
 * @returns {Record<string, unknown>}
 */
export function mergeContextWave(snapshot, patches) {
  const base = normalizeContext(snapshot);
  /** @type {Map<string, string>} */
  const writers = new Map();
  /** @type {Map<string, { deleted: true } | { value: unknown }>} */
  const changes = new Map();

  for (const patch of patches) {
    const who = patch.id;
    const next = normalizeContext(patch.context);
    const keys = new Set([...Object.keys(base), ...Object.keys(next)]);
    for (const key of keys) {
      const inBase = Object.prototype.hasOwnProperty.call(base, key);
      const inNext = Object.prototype.hasOwnProperty.call(next, key);
      if (inBase && inNext && Object.is(base[key], next[key])) continue;
      if (!inBase && !inNext) continue;
      if (inBase && !inNext) {
        rememberChange(writers, changes, key, who, { deleted: true });
        continue;
      }
      if (!inBase || !Object.is(base[key], next[key])) {
        rememberChange(writers, changes, key, who, { value: next[key] });
      }
    }
  }

  const merged = { ...base };
  for (const [key, spec] of changes) {
    if ("deleted" in spec) delete merged[key];
    else merged[key] = spec.value;
  }
  return merged;
}

/**
 * @param {Map<string, string>} writers
 * @param {Map<string, { deleted: true } | { value: unknown }>} changes
 * @param {string} key
 * @param {string} who
 * @param {{ deleted: true } | { value: unknown }} spec
 */
function rememberChange(writers, changes, key, who, spec) {
  const previous = writers.get(key);
  if (previous != null && previous !== who) {
    throw new Error(
      `DAG context key conflict: "${key}" written by "${previous}" and "${who}"`,
    );
  }
  writers.set(key, who);
  changes.set(key, spec);
}
