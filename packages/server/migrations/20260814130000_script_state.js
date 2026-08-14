/**
 * @param {import("knex").Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable("script_state", (t) => {
    t.text("namespace").notNullable();
    t.text("key").notNullable();
    t.text("value").notNullable();
    t.text("updated_at").notNullable();
    t.text("expires_at");
    t.primary(["namespace", "key"]);
  });

  await knex.schema.raw(
    "CREATE INDEX script_state_namespace_updated_at_idx ON script_state (namespace, updated_at DESC)",
  );
}

/**
 * @param {import("knex").Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists("script_state");
}
