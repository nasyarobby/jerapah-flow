/**
 * @param {import("knex").Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable("workflow_runs", (t) => {
    t.text("id").primary();
    t.text("owner").notNullable();
    t.text("workflow").notNullable();
    t.text("workflow_name");
    t.text("trigger_type").notNullable();
    t.text("trigger_detail");
    t.text("status").notNullable();
    t.text("started_at").notNullable();
    t.text("finished_at");
    t.integer("duration_ms");
    t.text("input");
    t.text("output");
    t.text("error");
    t.text("parent_run_id").references("id").inTable("workflow_runs");
  });

  await knex.schema.raw(
    "CREATE INDEX workflow_runs_owner_started_at_idx ON workflow_runs (owner, started_at DESC)",
  );
  await knex.schema.raw(
    "CREATE INDEX workflow_runs_workflow_started_at_idx ON workflow_runs (workflow, started_at DESC)",
  );
  await knex.schema.raw(
    "CREATE INDEX workflow_runs_status_started_at_idx ON workflow_runs (status, started_at DESC)",
  );

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
  await knex.schema.dropTableIfExists("step_runs");
  await knex.schema.dropTableIfExists("workflow_runs");
}
