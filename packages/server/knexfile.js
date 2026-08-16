import fs from "fs";
import path from "path";
import { DATA_DIR, SERVER_ROOT } from "./paths.js";

const dbPath =
  process.env.JFLOW_DB_PATH ?? path.join(DATA_DIR, "jerapah-flow.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

/** @type {import("knex").Knex.Config} */
const config = {
  client: "better-sqlite3",
  connection: {
    filename: dbPath,
  },
  useNullAsDefault: true,
  migrations: {
    directory: path.join(SERVER_ROOT, "migrations"),
    extension: "js",
    loadExtensions: [".js"],
  },
  pool: {
    afterCreate(conn, done) {
      try {
        conn.pragma("journal_mode = WAL");
        conn.pragma("busy_timeout = 5000");
        conn.pragma("foreign_keys = ON");
        done(null, conn);
      } catch (err) {
        done(err, conn);
      }
    },
  },
};

export default config;
