# Agent Vitals 智能体监测 landing page

Standalone Chinese marketing page. No build step, external fonts, third-party scripts, cookies, analytics, or network API calls. External links only navigate on user action.

Preview from this directory:

```sh
python3 -m http.server 5180 --bind 127.0.0.1
```

Open http://127.0.0.1:5180/. The directory can also be deployed as a static site.

## Content and interactions

- Brand: **Agent Vitals 智能体监测**. Privacy promise: Sessions are analyzed offline on the user's Mac and are never uploaded to a cloud service. Public pricing-catalog and release checks may use the network but carry no Session data.
- Positioning: 你把工作交给 Agent，谁来检查 Agent？The category metaphor is a local “Agent work receipt”: usage, cost basis, failures, and session traces that supported hosts already leave on the machine. The page does not claim output-quality judgment, universal runtime coverage, measured savings, or automatic optimization.
- The product window and session dialog are explicitly labeled illustrative mock data, not screenshots of a released UI. Period buttons switch sample totals and charts; the session button opens a dismissible native dialog. FAQs use native details elements.
- Download CTA opens the project's desktop release listing. It does not claim a particular architecture, signature, release artifact, or system requirement; those must be verified against the published package before direct download links are added.
- Product icon copied from `apps/desktop/src-tauri/icons/128x128.png`.
- System fonts. Dark graphite base; mint means local/normal, amber means failure/estimate/needs checking — the two accents never swap roles. Mobile responsive, reduced-motion support, motion toggle in the hero window.
- Character scenes (`ascii-scenes.js`): text-grid art, no image assets shipped. Hero: the woodpecker climbs a trunk made of a scrolling session log and pecks failed calls, which turn amber (the static frame keeps the story readable when motion is off). Download: a work receipt prints line by line. Font size is fitted to the measured glyph width; narrow screens drop the log's target column. Animation runs only while on screen and the tab is visible.
- The woodpecker is converted from `tools/woodpecker-source.png` by `node tools/ascii-from-image.mjs [--cols 34] [--dry-run]`, which rewrites the `<generated:woodpecker>` block in `ascii-scenes.js`. Cells are classified by the flat palette in the script (crest, head, eye stripe, eye, beak, wing, chest, tail); edge cells get `/ \ ( ) _ '` from the fill direction. A replacement image needs flat colors, no gradients, a uniform background, the bird facing right with its beak touching a trunk at the right edge; if its colors differ, update `PALETTE`. `tools/` is a build aid and does not need to be deployed.

## Distribution decision (2026-09-30)

Beta distribution: Developer ID–signed (Team EUKB6WHY6Z) without notarization.
Notarization is a one-command follow-up once `xcrun notarytool store-credentials`
is run with the Apple ID app-specific password:
`xcrun notarytool submit <dmg> --wait && xcrun stapler staple <dmg>`.

## Before publishing

Verify the public desktop release, installation instructions, and supported host versions. If a production screenshot replaces the illustrative window, use redacted or dedicated demo data. No product event collection is authorized by this page.
