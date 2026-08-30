/**
 * @param {import("knex").Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable("variables", (t) => {
    t.text("id").primary();
    t.text("owner").notNullable();
    t.text("name").notNullable();
    t.text("type").notNullable();
    t.text("value").notNullable();
    t.text("created_at").notNullable();
    t.text("updated_at").notNullable();
    t.unique(["owner", "name"]);
  });

  await knex.schema.raw(
    "CREATE INDEX variables_owner_name_idx ON variables (owner, name)",
  );
}

/**
 * @param {import("knex").Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists("variables");
}
