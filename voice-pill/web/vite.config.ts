import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  // Relative asset paths so Electron file:// loads work on Windows.
  base: "./",
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/api": "http://127.0.0.1:9777",
      "/ws": { target: "ws://127.0.0.1:9777", ws: true },
    },
  },
  build: {
    cssCodeSplit: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        overlay: resolve(__dirname, "overlay.html"),
      },
    },
  },
});
