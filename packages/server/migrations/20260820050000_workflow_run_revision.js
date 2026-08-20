/**
 * @param {import("knex").Knex} knex
 */
export async function up(knex) {
  await knex.schema.alterTable("workflow_runs", (t) => {
    t.integer("workflow_revision");
  });
  await knex.schema.raw(
    "CREATE INDEX workflow_runs_workflow_revision_idx ON workflow_runs (workflow, workflow_revision)",
  );
}

/**
 * @param {import("knex").Knex} knex
 */
export async function down(knex) {
  await knex.schema.raw("DROP INDEX IF EXISTS workflow_runs_workflow_revision_idx");
  await knex.schema.alterTable("workflow_runs", (t) => {
    t.dropColumn("workflow_revision");
  });
}
