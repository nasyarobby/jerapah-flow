import knex from "knex";
import config from "./knexfile.js";

export const db = knex(config);

/**
 * Apply pending migrations. Call once before registering workflows.
 */
export async function migrate() {
  await db.migrate.latest();
}
