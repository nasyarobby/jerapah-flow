/**
 * @param {import("knex").Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable("step_runs", (t) => {
    t.text("id").primary();
    t.text("run_id")
      .notNullable()
      .references("id")
      .inTable("workflow_runs")
      .onDelete("CASCADE");
    t.integer("step_index").notNullable();
    t.text("script").notNullable();
    t.text("config");
    t.text("status").notNullable();
    t.text("started_at").notNullable();
    t.text("finished_at");
    t.integer("duration_ms");
    t.text("output");
    t.text("error");
  });

  await knex.schema.raw(
    "CREATE INDEX step_runs_run_id_step_index_idx ON step_runs (run_id, step_index)",
  );
}

/**
 * @param {import("knex").Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists("step_runs");
}
