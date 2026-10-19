#!/bin/bash
# Deploy the Oh Agent landing page to Cloudflare Pages (project: oh-agent-landing).
# Production: https://ohagent.ai (custom domains pre-bound) / https://oh-agent-landing.pages.dev
#
# Stages only the files the site actually references (excludes internal docs,
# dev tooling and legacy scripts), verifies, then uploads with wrangler.
# One-time setup: npx wrangler login
set -euo pipefail
cd "$(dirname "$0")"

echo "== verify =="
node tools/verify-landing.mjs

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

cp index.html styles.css exploration.css app.js i18n.js city-host.js robots.txt sitemap.xml 404.html "$STAGE"/
rsync -a --exclude=".DS_Store" --exclude="shots/" assets/ "$STAGE"/assets/
rsync -a --exclude=".DS_Store" city3d/ "$STAGE"/city3d/

echo "== deploy =="
npx wrangler pages deploy "$STAGE" --project-name=oh-agent-landing --branch=main
