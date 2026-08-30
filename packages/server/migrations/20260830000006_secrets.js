/**
 * @param {import("knex").Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable("secrets", (t) => {
    t.text("id").primary();
    t.text("owner").notNullable();
    t.text("name").notNullable();
    t.text("ciphertext").notNullable();
    t.text("iv").notNullable();
    t.text("auth_tag").notNullable();
    t.text("created_at").notNullable();
    t.text("updated_at").notNullable();
    t.unique(["owner", "name"]);
  });

  await knex.schema.raw(
    "CREATE INDEX secrets_owner_name_idx ON secrets (owner, name)",
  );
}

/**
 * @param {import("knex").Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists("secrets");
}
