/**
 * @param {import("knex").Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable("profiles", (t) => {
    t.text("id").primary();
    t.text("owner").notNullable();
    t.text("name").notNullable();
    t.text("script").notNullable();
    t.text("config").notNullable();
    t.text("description").notNullable().defaultTo("");
    t.text("created_at").notNullable();
    t.text("updated_at").notNullable();
    t.unique(["owner", "name"]);
  });

  await knex.schema.raw(
    "CREATE INDEX profiles_owner_name_idx ON profiles (owner, name)",
  );
}

/**
 * @param {import("knex").Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists("profiles");
}
