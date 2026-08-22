import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyTrySession,
  pruneTrySession,
  recordTrySuccess,
  seedTryDialog,
} from "./try-session.js";

function step(uiId, extra = {}) {
  return {
    uiId,
    kind: extra.kind ?? "script",
    script: extra.script ?? uiId,
    profile: "",
    config: {},
    id: extra.id ?? "",
    when: "",
    needs: extra.needs ?? null,
    expression: extra.expression,
  };
}

test("empty defaults when no session", () => {
  const seed = seedTryDialog({
    step: step("a"),
    index: 0,
    steps: [step("a")],
    session: emptyTrySession(),
    meta: null,
  });
  assert.deepEqual(seed.data, {});
  assert.deepEqual(seed.context, {});
  assert.equal(seed.source, "empty defaults");
});

test("restores self when already tried", () => {
  let session = emptyTrySession();
  session = recordTrySuccess(session, "a", {
    data: { in: 1 },
    context: { c: 1 },
    output: { out: 1 },
    resultContext: { c: 2 },
  });
  // Later try on b should not overwrite restore of a
  session = recordTrySuccess(session, "b", {
    data: { in: 9 },
    context: {},
    output: { out: 9 },
    resultContext: {},
  });
  const seed = seedTryDialog({
    step: step("a"),
    index: 0,
    steps: [step("a"), step("b")],
    session,
    meta: null,
  });
  assert.deepEqual(seed.data, { in: 1 });
  assert.deepEqual(seed.context, { c: 1 });
  assert.match(seed.source, /restored/);
  assert.deepEqual(seed.lastResult?.output, { out: 1 });
});

test("linear previous step seeds next", () => {
  let session = emptyTrySession();
  session = recordTrySuccess(session, "a", {
    data: {},
    context: {},
    output: { fromA: true },
    resultContext: { clip: 1 },
  });
  const seed = seedTryDialog({
    step: step("b"),
    index: 1,
    steps: [step("a"), step("b")],
    session,
    meta: null,
  });
  assert.deepEqual(seed.data, { fromA: true });
  assert.deepEqual(seed.context, { clip: 1 });
  assert.match(seed.source, /from step 1/);
});

test("needs merge when all upstream tried", () => {
  let session = emptyTrySession();
  session = recordTrySuccess(session, "a", {
    data: {},
    context: {},
    output: { a: 1 },
    resultContext: { x: 1 },
  });
  session = recordTrySuccess(session, "b", {
    data: {},
    context: {},
    output: { b: 2 },
    resultContext: { x: 2 },
  });
  const seed = seedTryDialog({
    step: step("c", { id: "c", needs: { left: "a", right: "b" } }),
    index: 2,
    steps: [
      step("a", { id: "a" }),
      step("b", { id: "b" }),
      step("c", { id: "c", needs: { left: "a", right: "b" } }),
    ],
    session,
    meta: null,
  });
  assert.deepEqual(seed.data, { left: { a: 1 }, right: { b: 2 } });
  assert.match(seed.source, /from needs/);
});

test("needs skips when upstream missing then falls back to last try", () => {
  let session = emptyTrySession();
  session = recordTrySuccess(session, "a", {
    data: {},
    context: {},
    output: { onlyA: true },
    resultContext: {},
  });
  const seed = seedTryDialog({
    step: step("c", { id: "c", needs: ["a", "b"] }),
    index: 2,
    steps: [
      step("a", { id: "a" }),
      step("b", { id: "b" }),
      step("c", { id: "c", needs: ["a", "b"] }),
    ],
    session,
    meta: null,
  });
  assert.deepEqual(seed.data, { onlyA: true });
  assert.match(seed.source, /from last try/);
});

test("script example when nothing tried", () => {
  const seed = seedTryDialog({
    step: step("a"),
    index: 0,
    steps: [step("a")],
    session: emptyTrySession(),
    meta: { example: { data: { hello: 1 }, context: { k: 2 } } },
  });
  assert.deepEqual(seed.data, { hello: 1 });
  assert.deepEqual(seed.context, { k: 2 });
  assert.equal(seed.source, "from script example");
});

test("pruneTrySession drops removed steps", () => {
  let session = emptyTrySession();
  session = recordTrySuccess(session, "a", {
    data: {},
    context: {},
    output: 1,
    resultContext: {},
  });
  session = recordTrySuccess(session, "b", {
    data: {},
    context: {},
    output: 2,
    resultContext: {},
  });
  const pruned = pruneTrySession(session, [step("a")]);
  assert.ok(pruned.byStep.a);
  assert.equal(pruned.byStep.b, undefined);
  assert.equal(pruned.lastTriedUiId, null);
});
