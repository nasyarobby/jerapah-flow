/**
 * @param {import("knex").Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable("users", (t) => {
    t.text("id").primary();
    t.text("username").notNullable().unique();
    t.text("password_hash").notNullable();
    t.text("role").notNullable();
    t.text("created_at").notNullable();
    t.text("updated_at").notNullable();
  });
}

/**
 * @param {import("knex").Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists("users");
}
