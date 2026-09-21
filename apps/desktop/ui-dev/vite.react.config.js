import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const here = path.dirname(fileURLToPath(import.meta.url));

// Phase 1 deliberately has its own config and output. The existing static
// Workbench remains the production Tauri entry until the React pages pass the
// real-app gates described in WORKBENCH_REACT_MIGRATION_SPEC.md. The output is
// placed beside the Tauri config so the candidate config can package exactly
// what the preflight verifies, without changing the production frontendDist.
export default defineConfig({
  root: path.resolve(here, "react"),
  plugins: [react(), tailwindcss(), {
    name: "agent-vitals-react-browser-tauri-mock",
    transformIndexHtml(html, ctx) {
      if (ctx.bundle) return html;
      return {
        html,
        tags: [{ tag: "script", attrs: { src: "/tauri-mock.js" }, injectTo: "head-prepend" }],
      };
    },
  }],
  publicDir: path.resolve(here, "public"),
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
  },
  base: "./",
  build: {
    outDir: path.resolve(here, "../src-tauri/ui-react-dist"),
    emptyOutDir: true,
  },
});
