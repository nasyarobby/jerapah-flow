/**
 * @param {import("knex").Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable("http_pages", (t) => {
    t.text("id").primary();
    t.text("name").notNullable().unique();
    t.text("content").notNullable();
    t.text("mime").notNullable(); // html | json
    t.integer("status").notNullable().defaultTo(200);
    t.text("created_at").notNullable();
    t.text("updated_at").notNullable();
  });

  await knex.schema.createTable("http_auths", (t) => {
    t.text("id").primary();
    t.text("name").notNullable().unique();
    t.text("type").notNullable(); // bearer | basic | header
    t.text("config").notNullable(); // JSON
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
  await knex.schema.dropTableIfExists("http_pages");
}
