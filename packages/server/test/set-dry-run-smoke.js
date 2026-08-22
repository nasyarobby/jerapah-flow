/**
 * Smoke: set dry-run path (evaluateJsonata + envelope), mirrors
 * POST /scripts/set/dry-run in src/api/scripts.js.
 */
import assert from "node:assert/strict";
import { evaluateJsonata, SET_STEP_SCRIPT } from "../workflow-parse.js";
import { normalizeStepResult } from "../step-result.js";
import { safeSerialize } from "../src/api/dry-run-logger.js";

assert.equal(SET_STEP_SCRIPT, "set");

async function dryRunSet({ expression, data, context = {} }) {
  if (typeof expression !== "string" || !expression.trim()) {
    throw new Error("expression is required");
  }
  const incomingContext =
    context != null && typeof context === "object" && !Array.isArray(context)
      ? context
      : {};
  const config = { expression };
  const ctx = { data: data ?? null, context: incomingContext, config };
  const value = await evaluateJsonata(expression, ctx);
  const result = normalizeStepResult(
    { output: value, context: incomingContext, skipRemaining: false },
    incomingContext,
    SET_STEP_SCRIPT,
  );
  return {
    status: "success",
    output: safeSerialize(result.output),
    context: safeSerialize(result.context),
    skipRemaining: result.skipRemaining,
  };
}

{
  const res = await dryRunSet({
    expression: '{"title": data.title, "ok": true}',
    data: { title: "Hello" },
    context: { runId: "dry" },
  });
  assert.equal(res.status, "success");
  assert.deepEqual(res.output, { title: "Hello", ok: true });
  assert.deepEqual(res.context, { runId: "dry" });
  assert.equal(res.skipRemaining, false);
}

{
  const res = await dryRunSet({
    expression: "data.count + 1",
    data: { count: 41 },
    context: { token: "abc" },
  });
  assert.equal(res.output, 42);
  // Sets never mutate context
  assert.deepEqual(res.context, { token: "abc" });
}

{
  let hit = false;
  try {
    await dryRunSet({ expression: "  ", data: {} });
  } catch (err) {
    hit = true;
    assert.match(String(err.message), /expression is required/);
  }
  assert.equal(hit, true);
}

{
  let hit = false;
  try {
    await dryRunSet({ expression: "data.{" , data: {} });
  } catch (err) {
    hit = true;
    assert.ok(err instanceof Error);
  }
  assert.equal(hit, true);
}

console.log("set-dry-run-smoke: ok");
