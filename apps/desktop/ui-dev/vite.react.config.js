import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const here = path.dirname(fileURLToPath(import.meta.url));

// Phase 1 deliberately has its own config and output. The existing static
// Workbench remains the production Tauri entry until the React pages pass the
// real-app gates described in WORKBENCH_REACT_MIGRATION_SPEC.md.
export default defineConfig({
  root: path.resolve(here, "react"),
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: path.resolve(here, "dist-react"),
    emptyOutDir: true,
  },
});
