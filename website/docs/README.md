# Oh Agent Documentation Site

Starlight (Astro) documentation site for Oh Agent, served at `ohagent.ai/docs`.

## Structure

- `src/content/docs/`: English pages (root locale `/docs/...`)
- `src/content/docs/zh/`: Simplified Chinese pages (`/docs/zh/...`)
- `public/`: llms.txt and llms-full.txt (copied to site root during deployment)
- `tools/`: Python scripts for generating privacy pages and llms-full.txt

## Building

```bash
npm install
npm run build    # Output: dist/
npm run dev      # Local dev server
```

## Deployment

Not automated yet. The docs site is designed to be deployed alongside the landing site at `website/landing/` under the same Cloudflare Pages project.

To deploy:
1. Build the docs: `cd website/docs && npm run build`
2. Merge the output with the landing site, excluding conflicting files (404.html, root index.html)
3. Serve `/docs` subpath from the docs output
4. Copy `public/llms.txt` and `public/llms-full.txt` to the site root

See `docs-center-plan.md` (attached to the PR) for the complete deployment plan.

## Content Updates

- Edit page sources in `src/content/docs/` (English) and `src/content/docs/zh/` (Chinese)
- Edit `sidebar.mjs` to update navigation
- Run `python3 tools/build_llms_full.py` to regenerate llms-full.txt after content changes
- Privacy pages: edit `tools/gen_privacy_*.py`, not the generated .md files

## Configuration

- `astro.config.mjs`: Main Astro config
- `sidebar.mjs`: Sidebar navigation structure (imported by astro.config.mjs)
- `src/content.config.ts`: Content collections config (auto-generated schema from Starlight)

## Known Issues

- Mermaid diagrams in architecture pages render as code blocks (no plugin configured yet)
- i18n collection warning during build (expected - no custom i18n overrides needed)

## Base Commit

These docs describe the `dev` branch at commit `bf7196a` (2026-10-21), updated to match `4cc8155b` where necessary.
