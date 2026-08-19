/**
 * @param {import("knex").Knex} knex
 */
export async function up(knex) {
  await knex.schema.alterTable("workflow_runs", (t) => {
    t.text("job_id");
    t.text("queued_at");
  });

  await knex.schema.raw(
    "CREATE INDEX workflow_runs_job_id_idx ON workflow_runs (job_id)",
  );
}

/**
 * @param {import("knex").Knex} knex
 */
export async function down(knex) {
  await knex.schema.raw("DROP INDEX IF EXISTS workflow_runs_job_id_idx");
  await knex.schema.alterTable("workflow_runs", (t) => {
    t.dropColumn("job_id");
    t.dropColumn("queued_at");
  });
}
