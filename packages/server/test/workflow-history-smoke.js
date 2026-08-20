/**
 * Smoke: workflow revisions, SHA dedup, trash, restore, purge.
 *
 * Run: pnpm --dir packages/server test:workflow-history
 */
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db, migrate } from "../db.js";
import { WORKFLOWS_DIR } from "../paths.js";
import * as fsStore from "../fs-store.js";
import {
  workflowContentSha,
  workflowIdFromFile,
  newWorkflowFilename,
} from "../workflow-normalize.js";
import {
  recordRevision,
  listRevisions,
  getLatestRevision,
  deleteRevisionHistory,
} from "../workflow-history.js";
import {
  moveWorkflowToTrash,
  listTrash,
  restoreFromTrash,
  purgeTrashItem,
  TRASH_WORKFLOWS_DIR,
} from "../workflow-trash.js";
import { collectWorkflowWarnings } from "../workflow-validate-warnings.js";

const owner = "__workflow_history_smoke__";
const file = newWorkflowFilename();
const workflowId = workflowIdFromFile(file);
const ownerDir = path.join(WORKFLOWS_DIR, owner);
const trashPath = path.join(TRASH_WORKFLOWS_DIR, owner, file);

function cleanup() {
  if (fs.existsSync(trashPath)) fs.unlinkSync(trashPath);
  if (fs.existsSync(ownerDir)) fs.rmSync(ownerDir, { recursive: true, force: true });
}

cleanup();
await migrate();

const yamlV1 = `name: smoke test
scripts:
  - plugin/get-current-time
triggers:
  - type: HTTP
    method: POST
    path: /smoke
`;

fsStore.writeWorkflowYaml(owner, file, yamlV1);
fsStore.writeRegisters(owner, [file]);

assert.equal(workflowContentSha(yamlV1), workflowContentSha(`${yamlV1}\n\n`));

const rev1 = await recordRevision({
  workflowId,
  owner,
  file,
  content: yamlV1,
  reason: "create",
  force: true,
});
assert.equal(rev1.skipped, false);
assert.equal(rev1.revision, 1);

const revDup = await recordRevision({
  workflowId,
  owner,
  file,
  content: `${yamlV1}\n\n`,
  reason: "save",
});
assert.equal(revDup.skipped, true, "normalized SHA should dedupe blank lines");

const yamlV2 = yamlV1.replace("smoke test", "smoke test v2");
const rev2 = await recordRevision({
  workflowId,
  owner,
  file,
  content: yamlV2,
  reason: "save",
});
assert.equal(rev2.revision, 2);
assert.equal((await listRevisions(workflowId)).length, 2);

const warnings = collectWorkflowWarnings(
  `name: bad\nscripts:\n  - unknown-script-xyz\n`,
);
assert.ok(warnings.warnings.some((w) => w.code === "unknown_script"));

const trashed = await moveWorkflowToTrash({
  workflowId,
  owner,
  file,
  name: "smoke test v2",
});
assert.ok(trashed.id);
assert.equal(fsStore.readWorkflowYaml(owner, file), null);
assert.ok(fs.existsSync(trashPath));

const restored = await restoreFromTrash(trashed.id);
assert.equal(restored.file, file);
assert.ok(fsStore.readWorkflowYaml(owner, file));

await moveWorkflowToTrash({ workflowId, owner, file, name: "smoke test v2" });
const trashAgain = (await listTrash()).find((t) => t.file === file);
assert.ok(trashAgain);
await purgeTrashItem(trashAgain.id);
assert.ok(!(await listTrash()).some((t) => t.file === file));

await deleteRevisionHistory(workflowId);
cleanup();

console.log("workflow-history-smoke: ok");
await db.destroy();
