// Oh Agent docs (Starlight)
// Mounted at https://ohagent.ai/docs  →  en: /docs/...   zh: /docs/zh/...
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { sidebar } from './sidebar.mjs';

// Note: Mermaid diagrams in architecture pages currently render as code blocks.
// TODO: Add mermaid rendering plugin (e.g., @beoe/rehype-mermaid with @astrojs/markdown-remark)

export default defineConfig({
  site: 'https://ohagent.ai',
  base: '/docs',
  trailingSlash: 'never',
  build: {
    format: 'file',        // /docs/city-guide.html → served as /docs/city-guide on Cloudflare Pages (verify on preview: no extra 308)
    assets: '_docs',       // keep clear of the landing site's root files
  },
  integrations: [
    starlight({
      title: 'Oh Agent Docs',
      description: 'Docs for Oh Agent, a local-first Mac app that turns Claude Code and Codex session history into a 3D city.',
      // Root locale = English (no prefix). Chinese lives under /docs/zh/.
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        zh: { label: '简体中文', lang: 'zh-CN' },
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/MixLabPro/oh-agent-ai' },
        { icon: 'x.com', label: 'X', href: 'https://x.com/ohagentai' },
      ],
      sidebar,
      lastUpdated: true,   // uses git history; needs full clone in CI (fetch-depth: 0)
      // Sitemap: Starlight enables @astrojs/sitemap automatically when `site` is set,
      // with hreflang alternates for the locales above. Output: /docs/sitemap-index.xml
      // → reference it from the landing's /sitemap.xml index (see docs-center-plan.md §8).
      head: [
        { tag: 'meta', attrs: { property: 'og:site_name', content: 'Oh Agent' } },
        { tag: 'link', attrs: { rel: 'alternate', type: 'text/plain', title: 'llms.txt', href: 'https://ohagent.ai/llms.txt' } },
      ],
      // TBD: Starlight renders English "fallback" pages for missing zh translations.
      // All 6 P0 pages ship in both languages, so no fallback should be generated.
      // If a page is ever en-only, add route middleware that sets noindex when
      // `starlightRoute.isFallback` is true (confirm API against current Starlight docs).
    }),
  ],
});
