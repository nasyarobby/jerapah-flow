/**
 * Reset (or create) the admin username and password.
 *
 * Usage:
 *   pnpm --dir packages/server reset-admin -- --username admin --password 'your-password'
 *
 * Uses JFLOW_DB_PATH like the app. Never prints the password.
 */
import bcrypt from "bcryptjs";
import { db, migrate } from "./db.js";
import * as store from "./store.js";
import { validateCredentials } from "./src/api/auth.js";

function parseArgs(argv) {
  /** @type {{ username?: string, password?: string }} */
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--username" || arg === "-u") {
      out.username = argv[++i];
      continue;
    }
    if (arg === "--password" || arg === "-p") {
      out.password = argv[++i];
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      out.help = true;
    }
  }
  return out;
}

function usage() {
  console.log(`Usage:
  pnpm --dir packages/server reset-admin -- --username <name> --password <secret>

Creates an admin if none exist; otherwise updates the oldest admin's
username and password. Credentials must match login rules
(username 3-32 [A-Za-z0-9_], password at least 8 characters).`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  const username = typeof args.username === "string" ? args.username.trim() : "";
  const password = typeof args.password === "string" ? args.password : "";
  if (!username || !password) {
    usage();
    process.exit(1);
  }

  const credErr = validateCredentials(username, password);
  if (credErr) {
    console.error(credErr);
    process.exit(1);
  }

  await migrate();

  const passwordHash = await bcrypt.hash(password, 10);
  const admins = await db("users")
    .where({ role: "admin" })
    .orderBy("created_at", "asc")
    .select("id", "username");

  if (admins.length === 0) {
    const user = await store.createUser({
      username,
      passwordHash,
      role: "admin",
    });
    console.log(`Created admin user "${user.username}" (${user.id})`);
    return;
  }

  const admin = admins[0];
  const taken = await store.getUserAuthByUsername(username);
  if (taken && taken.id !== admin.id) {
    console.error(`username "${username}" is already taken by another user`);
    process.exit(1);
  }

  const updated = await store.updateUser(admin.id, {
    username,
    passwordHash,
    role: "admin",
  });
  console.log(
    `Updated admin "${admin.username}" → "${updated.username}" (${updated.id})`,
  );
}

try {
  await main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
} finally {
  await db.destroy();
}
