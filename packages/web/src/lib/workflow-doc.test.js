import assert from "node:assert/strict";
import test from "node:test";
import {
  parseWorkflowYaml,
  stringifyWorkflowDoc,
  stepCustomName,
  stepDisplayName,
} from "./workflow-doc.js";

test("step name round-trips in yaml", () => {
  const { doc, parseError } = parseWorkflowYaml(`
name: demo
scripts:
  - name: Notify to channel
    script: ntfy.js
    config:
      url: https://ntfy.sh/demo
  - name: Transform
    set:
      expression: data
`);
  assert.equal(parseError, null);
  assert.equal(doc.scripts[0].name, "Notify to channel");
  assert.equal(doc.scripts[0].script, "ntfy.js");
  assert.equal(doc.scripts[0].extra, undefined);
  assert.equal(doc.scripts[1].name, "Transform");
  assert.equal(doc.scripts[1].kind, "set");

  const yaml = stringifyWorkflowDoc(doc);
  assert.match(yaml, /name: Notify to channel/);
  assert.match(yaml, /script: ntfy.js/);
  assert.match(yaml, /name: Transform/);
});

test("empty step name is omitted from yaml", () => {
  const { doc } = parseWorkflowYaml(`
scripts:
  - name: "  "
    script: ntfy.js
`);
  assert.equal(doc.scripts[0].name, "  ");
  assert.equal(stepCustomName(doc.scripts[0]), "");
  const yaml = stringifyWorkflowDoc(doc);
  assert.doesNotMatch(yaml, /^\s*name:/m);
  assert.match(yaml, /script: ntfy.js/);
});

test("stepDisplayName prefers custom name", () => {
  assert.equal(
    stepDisplayName({ kind: "script", script: "ntfy.js", name: "Notify to channel" }),
    "Notify to channel",
  );
  assert.equal(stepDisplayName({ kind: "script", script: "ntfy.js" }), "ntfy.js");
  assert.equal(stepDisplayName({ kind: "set" }), "set");
  assert.equal(
    stepDisplayName({ kind: "script", script: "ntfy.js" }, "fallback.js"),
    "fallback.js",
  );
});
