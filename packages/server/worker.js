process.env.JFLOW_ROLE = "worker";

import { startApp } from "./start-app.js";

// BullMQ worker only. Schema migrations are owned by control.
await startApp({
  role: "worker",
  migrate: false,
  serveStaticUi: false,
});
