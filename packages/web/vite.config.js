import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** In dev:pm2, control (:8600) serves auth so login works when HTTP is stopped. */
const authProxyTarget =
  process.env.JFLOW_AUTH_PROXY ?? "http://127.0.0.1:8700";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 8500,
    proxy: {
      "/api/auth": { target: authProxyTarget, changeOrigin: true },
      "/api": { target: "http://127.0.0.1:8700", changeOrigin: true },
      "/admin": { target: "http://127.0.0.1:8700", changeOrigin: true },
      "/u": { target: "http://127.0.0.1:8700", changeOrigin: true },
      "/ops": { target: "http://127.0.0.1:8600", changeOrigin: true },
    },
  },
});
