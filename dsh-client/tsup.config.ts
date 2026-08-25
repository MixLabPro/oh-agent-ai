import { defineConfig } from 'tsup'

export default defineConfig([
  // ── Host bundle (Node.js, ESM) ──────────────────────────────────────────
  {
    entry: { index: 'src/host/index.ts' },
    format: 'esm',
    platform: 'node',
    target: 'node18',
    outDir: 'lib',
    external: ['zod', '@deepseek-ai/dsh-session'],
    dts: false,
    clean: true,
  },
  // ── Client bundle (browser, CJS + __ModuleLoader__ handoff) ─────────────
  {
    entry: { client: 'src/client/index.cts' },
    format: 'cjs',
    platform: 'browser',
    target: 'es2020',
    outDir: 'lib',
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
    banner: {
      js: `window.__ModuleLoader__.load({id:"dsh-skill-vitals-audit",factory:(require)=>{var module={exports:{}};var exports=module.exports;`,
    },
    footer: {
      js: `return module.exports;}})`,
    },
    dts: false,
  },
])
