import { startApp } from "./start-app.js";

// Monolith / local `pnpm dev`: API + worker + migrate in one process.
await startApp({
  role: process.env.JFLOW_ROLE || "all",
  migrate: true,
  serveStaticUi: true,
});
