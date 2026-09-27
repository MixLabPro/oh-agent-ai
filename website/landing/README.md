# Agent Vitals landing page

Standalone Chinese marketing page. No build step, external fonts, third-party scripts, cookies, analytics, or network API calls. External links only navigate on user action.

Preview from this directory:

```sh
python3 -m http.server 5180 --bind 127.0.0.1
```

Open http://127.0.0.1:5180/. The directory can also be deployed as a static site.

## Content and interactions

- Positioning: AI 编程，少花冤枉钱。The page promises visibility and evidence, not measured savings or automatic optimization.
- The product window and session dialog are explicitly labeled illustrative mock data, not screenshots of a released UI. Period buttons switch sample totals and charts; the session button opens a dismissible native dialog. FAQs use native details elements.
- Download CTA opens the project's desktop release listing. It does not claim a particular architecture, signature, release artifact, or system requirement; those must be verified against the published package before direct download links are added.
- Product icon copied from `apps/desktop/src-tauri/icons/128x128.png`.
- System fonts; warm off-white, forest green, restrained native-window styling; mobile responsive layout and reduced-motion support.

## Before publishing

Verify the public desktop release, installation instructions, and supported host versions. If a production screenshot replaces the illustrative window, use redacted or dedicated demo data. No product event collection is authorized by this page.
