/**
 * @param {import("knex").Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable("workflow_trash", (t) => {
    t.text("id").primary();
    t.text("workflow_id").notNullable();
    t.text("owner").notNullable();
    t.text("file").notNullable();
    t.text("name");
    t.text("deleted_at").notNullable();
    t.text("trash_path").notNullable();
  });

  await knex.schema.raw(
    "CREATE INDEX workflow_trash_deleted_at_idx ON workflow_trash (deleted_at ASC)",
  );
  await knex.schema.raw(
    "CREATE UNIQUE INDEX workflow_trash_owner_file_idx ON workflow_trash (owner, file)",
  );
}

/**
 * @param {import("knex").Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists("workflow_trash");
}
