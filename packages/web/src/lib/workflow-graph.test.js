import assert from "node:assert/strict";
import test from "node:test";
import { isDagDoc, nextStepId, withAllocatedStepId } from "./workflow-doc.js";
import {
  addStepEdge,
  canConnectSteps,
  enteringDagWouldStripWhen,
  removeStepEdge,
  wouldCreateCycle,
} from "./workflow-graph.js";

function step(uiId, extra = {}) {
  return {
    uiId,
    kind: "script",
    script: uiId,
    profile: "",
    config: {},
    id: extra.id ?? "",
    when: extra.when ?? "",
    needs: extra.needs ?? null,
  };
}

test("nextStepId skips taken ids", () => {
  assert.equal(nextStepId([]), "step-1");
  assert.equal(nextStepId(["step-1", "step-2"]), "step-3");
  assert.equal(nextStepId(["step-1", "step-3"]), "step-2");
});

test("withAllocatedStepId leaves existing id", () => {
  const s = withAllocatedStepId(step("a", { id: "weather" }), []);
  assert.equal(s.id, "weather");
});

test("addStepEdge materializes linear chain then adds the extra edge", () => {
  const doc = { scripts: [step("a"), step("b"), step("c")] };
  const scripts = addStepEdge(doc, "a", "c");
  assert.equal(isDagDoc({ scripts }), true);
  assert.equal(scripts[0].id, "step-1");
  assert.equal(scripts[1].id, "step-2");
  assert.equal(scripts[2].id, "step-3");
  assert.deepEqual(scripts[1].needs, ["step-1"]);
  assert.deepEqual(scripts[2].needs, ["step-2", "step-1"]);
});

test("addStepEdge strips when when entering DAG", () => {
  const doc = {
    scripts: [step("a", { when: "true" }), step("b", { when: "false" })],
  };
  assert.equal(enteringDagWouldStripWhen(doc), true);
  const scripts = addStepEdge(doc, "a", "b");
  assert.equal(scripts[0].when, "");
  assert.equal(scripts[1].when, "");
});

test("canConnectSteps blocks cycles and map targets", () => {
  const linear = { scripts: [step("a"), step("b"), step("c")] };
  assert.equal(canConnectSteps(linear, "a", "c"), true);
  assert.equal(canConnectSteps(linear, "c", "a"), false);
  const dag = {
    scripts: [
      step("a", { id: "a" }),
      step("b", { id: "b", needs: ["a"] }),
      step("c", { id: "c", needs: ["b"] }),
    ],
  };
  assert.equal(wouldCreateCycle(dag.scripts, "c", "a"), true);
  assert.equal(canConnectSteps(dag, "c", "a"), false);
  const mapped = {
    scripts: [
      step("a", { id: "a" }),
      step("b", { id: "b", needs: { current: "a" } }),
    ],
  };
  assert.equal(canConnectSteps(mapped, "a", "b"), false);
});

test("removeStepEdge drops a list dependency", () => {
  const doc = {
    scripts: [
      step("a", { id: "a" }),
      step("b", { id: "b", needs: ["a"] }),
    ],
  };
  const scripts = removeStepEdge(doc, "a", "b");
  assert.equal(scripts[1].needs, null);
  assert.equal(isDagDoc({ scripts }), false);
});
