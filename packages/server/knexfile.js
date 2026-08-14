import fs from "fs";
import path from "path";

const dbPath = process.env.SCRUNNER_DB_PATH ?? path.resolve("data/scrunner.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

/** @type {import("knex").Knex.Config} */
const config = {
  client: "better-sqlite3",
  connection: {
    filename: dbPath,
  },
  useNullAsDefault: true,
  migrations: {
    directory: "./migrations",
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
