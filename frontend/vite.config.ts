import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const backend = process.env.BACKEND_URL ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": { target: backend, changeOrigin: true } } },
  test: { environment: "node", setupFiles: ["./vitest.setup.ts"] },
});
