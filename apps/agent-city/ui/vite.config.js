import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => ({
  root: here,
  plugins: [react()],
  base: "./",
  build: {
    sourcemap: mode === "debug",
    outDir: path.join(here, "dist"),
    emptyOutDir: true,
  },
}));
