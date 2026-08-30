/**
 * @param {import("knex").Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable("http_auths", (t) => {
    t.text("id").primary();
    t.text("name").notNullable().unique();
    t.text("type").notNullable();
    t.text("config").notNullable();
    t.integer("unauthorized_status").nullable();
    t.text("unauthorized_response").nullable();
    t.text("created_at").notNullable();
    t.text("updated_at").notNullable();
  });
}

/**
 * @param {import("knex").Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists("http_auths");
}
