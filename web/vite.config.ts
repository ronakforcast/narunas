import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // relative base so the build works both at a domain root (narunas.io)
  // and under a sub-path (ronakforcast.github.io/narunas/)
  base: "./",
  server: {
    proxy: {
      "/api": "http://localhost:8765",
    },
  },
});
