/**
 * @param {import("knex").Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable("workflow_revisions", (t) => {
    t.text("id").primary();
    t.text("workflow_id").notNullable();
    t.text("owner").notNullable();
    t.text("file").notNullable();
    t.integer("revision").notNullable();
    t.text("content_sha").notNullable();
    t.text("content").notNullable();
    t.text("reason");
    t.text("meta");
    t.text("created_at").notNullable();
  });

  await knex.schema.raw(
    "CREATE UNIQUE INDEX workflow_revisions_workflow_id_revision_idx ON workflow_revisions (workflow_id, revision)",
  );
  await knex.schema.raw(
    "CREATE INDEX workflow_revisions_workflow_id_created_at_idx ON workflow_revisions (workflow_id, created_at DESC)",
  );
}

/**
 * @param {import("knex").Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists("workflow_revisions");
}
