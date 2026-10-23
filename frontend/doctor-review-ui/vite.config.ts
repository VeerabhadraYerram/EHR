import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5188,
    strictPort: true,
    host: true,
    proxy: {
      "/api/v1/twin": { target: "http://127.0.0.1:8004", changeOrigin: true },
      "/api/v1/workflows": {
        target: "http://127.0.0.1:8005",
        changeOrigin: true,
      },
      "/api/v1/identity": {
        target: "http://127.0.0.1:8002",
        changeOrigin: true,
      },
      "/api/v1/fusion": { target: "http://127.0.0.1:8003", changeOrigin: true },
      "/terminology": { target: "http://127.0.0.1:8001", changeOrigin: true },
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/health": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
