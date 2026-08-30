/**
 * @param {import("knex").Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable("logs", (t) => {
    t.increments("id").primary();
    t.text("run_id")
      .notNullable()
      .references("id")
      .inTable("workflow_runs")
      .onDelete("CASCADE");
    t.text("step_id");
    t.text("ts").notNullable();
    t.integer("level").notNullable();
    t.text("msg");
    t.text("payload");
  });

  await knex.schema.raw(
    "CREATE INDEX logs_run_id_ts_idx ON logs (run_id, ts)",
  );
}

/**
 * @param {import("knex").Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists("logs");
}
