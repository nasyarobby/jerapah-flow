import fs from "fs";
import path from "path";
import { DATA_DIR, SERVER_ROOT } from "./paths.js";

const defaultNew = path.join(DATA_DIR, "jerapah-flow.db");
const defaultLegacy = path.join(DATA_DIR, "scrunner.db");
const dbPath =
  process.env.JERAPAH_FLOW_DB_PATH ??
  process.env.SCRUNNER_DB_PATH ??
  (fs.existsSync(defaultLegacy) && !fs.existsSync(defaultNew) ? defaultLegacy : defaultNew);
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
