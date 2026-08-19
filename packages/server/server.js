process.env.JFLOW_ROLE = "api";

import { startApp } from "./start-app.js";

// HTTP API + cron enqueue only. Schema migrations are owned by control.
await startApp({
  role: "api",
  migrate: false,
  // In PM2/split mode the Vite/control process serves the SPA.
  serveStaticUi: process.env.JFLOW_SERVE_UI === "1",
});
