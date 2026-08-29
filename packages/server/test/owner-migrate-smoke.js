import { rewriteLegacyConfigRefsInText } from "../config-ref-rewrite.js";
import { migrateDefaultOwnerIfNeeded } from "../owner-migrate.js";
import { migrate, db } from "../db.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

{
  const { text, changed } = rewriteLegacyConfigRefsInText(
    "a: $VAR_x\nb: $SECRET_y\nc: $CONTEXT_z\nd: passwordSecret: gmail_app",
  );
  assert(changed, "detects legacy");
  assert(text.includes("{{ vars.x }}"), "var rewrite");
  assert(text.includes("{{ secrets.y }}"), "secret rewrite");
  assert(text.includes("{{ context.z }}"), "context rewrite");
  assert(text.includes("passwordSecret: gmail_app"), "bare secret name untouched");
}

await migrate();
const first = await migrateDefaultOwnerIfNeeded();
const second = await migrateDefaultOwnerIfNeeded();
assert(second.secrets.moved === 0, "second pass moves no secrets");
assert(second.runs.moved === 0, "second pass moves no runs");
await db.destroy();

console.log("owner-migrate smoke passed", {
  firstSecretsMoved: first.secrets.moved,
  secondSecretsMoved: second.secrets.moved,
});
