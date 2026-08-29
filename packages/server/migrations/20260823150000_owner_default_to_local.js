/**
 * No-op Knex marker: owner + config-ref migrate runs in owner-migrate.js at startup
 * (needs filesystem + DB together). Kept so deploy tooling sees a versioned step.
 *
 * @param {import("knex").Knex} _knex
 */
export async function up(_knex) {
  // Intentionally empty — see migrateDefaultOwnerIfNeeded().
}

/**
 * @param {import("knex").Knex} _knex
 */
export async function down(_knex) {
  // Irreversible data migrate.
}
