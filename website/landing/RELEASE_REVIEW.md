# City-first landing implementation review

## Post-domain UX polish (2026-10-16)

- Clarified the bilingual hero: a private Mac app for Claude Code/Codex history. Preserved the brand headline; changed ambiguous app CTAs to release status and rewrote insight headlines as user questions. Download remains explicitly unavailable: no invented release, signup service or source link.
- Reduced desktop scene height to 420px and phone height to 360px. Phone idle/loading/error previews hide inactive toolbar controls and keep the real city poster visible behind a compact entry prompt.
- Rebuilt City from the current checkout after its newer City commits. Added closer, center-oriented framing only for embedded `presentation=landing`; native and standalone views keep their existing camera. Updated the fallback image from the rendered mock scene. Still 2000 synthetic sessions; no real records or new networking.
- City production build, typecheck, camera interaction regressions (including native/standalone isolation), landing checks and whitespace checks passed. Browser confirmed ready desktop scene and 390px mobile width without document overflow; phone cold load creates no iframe before entry.
- Screenshots: `docs/assets/oh-agent-2026-10-16/polish-desktop-en.jpg` and `polish-mobile-en.jpg`. These are local preview checks, not a production deployment or broad device/performance certification.

## City bundle source update (2026-10-16)

- Rebuilt the embedded City from local main `744f926ae82e1ef5eb5e5cb910303b08b725e712`, using an isolated source snapshot. Applied only the existing landing presentation adaptations in `CityApp.tsx` and `CityExperience.tsx`; the native app bundle is unchanged.
- Retained 2000 deterministic mock sessions, Oh Agent copy and the fixture-only host boundary. Browser reached `ready` and displayed 2000 sessions / 27.86亿 tokens. Screenshot: `docs/assets/oh-agent-2026-10-16/city-main-744f926a-zh.jpg`.
- City typecheck, production build and landing regression checks passed. The builder now accepts `--source-root=<path>` so an explicitly selected source snapshot can be built without switching the dirty checkout. Default builds still use the current checkout; do not use that default to reproduce this main-based artifact from an older branch. The selected snapshot must also include the two landing presentation adaptations.

## Density update: 2000 mock sessions (2026-10-16)

- Increased the deterministic landing fixture to **2000 sessions** in the default 30-day view; the 7-day view contains 469. This supersedes the sample counts in earlier verification records below.
- The production City render cap is 4000, so this fixture is below the aggregation threshold. Native authority query limits and real-data access are unchanged.
- Browser verification reached `ready`; the production City summary displayed **2000 sessions / 27.86亿 tokens**. Evidence: `docs/assets/oh-agent-2026-10-16/hero-2000-zh.jpg`.
- `node website/landing/tools/verify-landing.mjs` and `git diff --check`: PASS. Regression checks assert 2000 returned sessions with no truncation and 469 sessions for seven days.

## Current revision: Oh Agent (2026-10-16)

The user confirmed **Oh Agent** as the product name. This revision supersedes the initial preview's brand, hero screenshot placement, loading strategy and sample counts described in the historical review below.

- Header, footer, bilingual copy, accessible home label, browser title and social copy now use Oh Agent. The headline is “Your agents work. Your world grows.” / “Agent 在工作，你的世界在生长。” Privacy, actual billing uncertainty and release-preparation status remain explicit.
- The hero directly embeds **the production frontend from `apps/agent-city/ui`**. There is one City instance, using the existing SDK and a synthetic `city:v2` projection from `city-host.js`. No separate mock city renderer is used. Default 30 days has **360 mock sessions**; 7 days has **84**. No real user history is read.
- Visible desktop/tablet views over 600 CSS px start automatically, unless reduced motion or data saving is requested. Phones retain a deliberate entry button. The initial window is passed to the frontend so the landing does not first construct the native 366-day scene and immediately rebuild it. Startup timeout is 20 seconds; a subsequent window-change timeout remains 10 seconds. Closing does not automatically restart the demo.
- `city-preview-live.jpg` and `city-building-live.jpg` were captured directly from the current running frontend with mock data. `oh-agent-preview.jpg` is the new branded share preview. The old static hero is removed; only the fallback and explanation use images.
- Browser verification: Chinese automatic startup reached ready and showed 360 sessions. Keyboard selection opened a real mock building showing 1,029,413 tokens and 81 events. English branding and the 7-day window (84 sessions) were checked. Both languages passed the final narrow-view check at the browser's reported 400 CSS px width, with no document overflow; no iframe existed before entry. Manual entry reached ready with 360 sessions, and Close removed the iframe. Local host regression verifies 84/360 sessions, automatic desktop start, explicit reduced-motion entry and the existing origin/request/lifecycle boundaries.
- `npm --prefix apps/agent-city/ui run typecheck`, production City build, `node website/landing/tools/verify-landing.mjs`, and whitespace checks passed for this revision. Final responsive screenshots are under `docs/assets/oh-agent-2026-10-16/`.

Repository/deployment paths remain compatible with the existing project. This landing rename does not change native application identifiers, register a domain or publish the site. The public download blocker and remaining launch checks below still apply.

## Historical initial preview review

Date: 2026-10-16 (Asia/Shanghai). Status: **local preview implemented and browser-checked; public launch pending**.

Scope: `website/landing`, its generated City bundle, build helper, documentation and a small presentation-only adaptation in `CityExperience.tsx`. The embedded `presentation=landing` mode hides game/seed/export settings and avoids audio warmup; the normal desktop presentation is unchanged. This flag is not an authorization boundary; the landing host independently enforces its fixture/method allowlist. No desktop database, cost algorithm, native grants, game implementation or user-record access changed. Native app installation is outside this check.

## Changes and evidence

| Area | Result | Evidence |
| --- | --- | --- |
| Positioning | City is the first product experience; diagnostics/accounting become supporting analysis | Hero, city section before insights, matching English/Chinese copy |
| Visual design | Dark green, mint, large typographic hierarchy, actual product imagery; static first view | `index.html`, `styles.css`, screenshots below |
| City integration | Upgraded landing fixture from `city:v1` to `city:v2`, adding public harness identities | `city-host.js`; rebuilt `city3d/index.html` and assets |
| Intent-based loading | No iframe before entering sample; close removes it | Browser DOM: 0 → 1 → 0 iframes |
| Actual renderer readiness | First usable production toolbar message replaces fixed-delay reveal | Host regression; browser `data-city-state=ready` |
| Data windows | 7 days = 21 sessions / 25.67M tokens; 30 days = 84 / 115.47M | Actual production-plugin summary in browser; synthetic values only |
| Session selection | City settings → keyboard selector → Claude Code sample building | Actual detail showed 1,029,413 tokens and 81 events |
| Sample details | Input 823,530 / output 205,883; host full-session button disabled | Actual session dialog; no excerpts included in fixture |
| Playback | Timeline → Play → Pause changed controls and time cursor | Actual production-plugin browser interaction |
| State boundary | Fixed synthetic data, request-instance/origin/version checks, declared method allowlist | Host regressions reject foreign origins and host-session requests |
| Privacy and costs | On-device claim, public-resource exception, unknown costs and estimate distinction | English/Chinese content; local checks |
| Public download | Preparation state, no broken external CTA | Anonymous repository URL and GitHub Releases API returned 404 on review date |

The secondary analysis area uses labeled illustrations, not newly captured desktop analysis screenshots. It explicitly describes a separate desktop analysis view; it does not claim those figures appear in City. New analysis screenshots and the optional export showcase are deferred until suitable version-matched material is verified.

## Asset provenance

- `assets/city-workspace.jpg`: copied from `docs/assets/city-ux-2026-10-08/default-en.jpg`. Existing product capture labeled Demo, 374 demonstration sessions. The image is archival demonstration material, not the landing's 21/84-session fixture; the captions identify a demo workspace rather than claiming counts match.
- `assets/city-building.jpg`: copied from `docs/assets/city-ux-2026-10-08/audit-building-details-en.jpg`. Selected demonstration building, 374,484 tokens, 42 events; the image contains no task excerpt, raw path or personal log text. Its visual progress percentage is a construction metaphor, not task success, as the adjacent copy explains.
- `assets/app-icon.png`: retained existing product asset.
- Generated `city3d/`: production Vite build from `apps/agent-city/ui`, including current SDK and third-party notices. Old unreferenced generated JS/CSS/worker files are replaced by the builder; source remains recoverable in Git.

## Checks run

- `npm --prefix apps/agent-city/ui run build`: PASS. Vite notes that the City entry chunk is approximately 2 MB before compression. It is fetched after explicit user intent, not on first page load.
- `npm --prefix apps/agent-city/ui run typecheck`: PASS after the presentation-only adaptation.
- `node tools/build-city3d.mjs --skip-install`: PASS; generated bundle refreshed, including notices.
- `node website/landing/tools/verify-landing.mjs`: PASS. Checks assets, bilingual keys, cost/privacy labels, lazy activation, deterministic fixture, origin rejection, unavailable method, genuine readiness, temporary rebuilding, range synchronization, teardown, missing bundle, timeout, stale response, retry and unavailable-renderer response.
- `node --check` for active landing scripts: PASS.
- `git diff --check`: PASS at review time.
- Browser: Codex in-app browser, 1440×900 desktop and 360×800 narrow viewport. Both English and Chinese showed document width equal to viewport width. All parent-page images loaded. Narrow-view imagery intentionally crops inside its container.
- Actual browser interactions: explicit start, 7/30-day changes, reset/settings, keyboard session selection, session dialog, playback/pause, close, locale switch and FAQ expansion checked. English City browser console inspection returned no error/warning entries during the initial interaction pass.
- Final build follow-up: simplified Chinese settings omit game, seed and export controls; changing the internal window to 90 days updates the outer selector to 90. The final sample reached ready with no browser console error entries. One browser-automation read exceeded its short evaluation timeout during cold renderer startup; a subsequent read confirmed the page itself reached ready within its startup handling.

No claim is made that all possible runtime network requests were captured. Active page scripts contain no telemetry or external resource endpoints; the integration fetches a same-origin build and its local assets. Browser fixtures cannot prove native real-data privacy or installation behavior.

## Browser screenshots

Stored under `docs/assets/landing-city-first-2026-10-16/`:

- [Desktop English Hero](../../docs/assets/landing-city-first-2026-10-16/hero-desktop-en.jpg)
- [Desktop Chinese Hero](../../docs/assets/landing-city-first-2026-10-16/hero-desktop-zh.jpg)
- [Mobile English Hero](../../docs/assets/landing-city-first-2026-10-16/hero-mobile-en.jpg)
- [Mobile Chinese Hero](../../docs/assets/landing-city-first-2026-10-16/hero-mobile-zh.jpg)
- [Chinese mobile City](../../docs/assets/landing-city-first-2026-10-16/city-mobile-zh.jpg)

## Remaining launch work

- [ ] Public repository/source/LICENSE access and actual download assets must be verified; current 404 prevents download conversion. Do not mark the page publicly launched while it shows preparation status.
- [ ] Verify or replace canonical, hreflang and OG deployment URLs using the final host.
- [ ] Verify supported chip/system combinations, signing, notarization and clean-machine installation against the actual release.
- [ ] Conduct the spec's 5-person comprehension/interaction study. This development browser review is not that study.
- [ ] Run the specified Lighthouse measurement; LCP/CLS targets are not measured or claimed here.
- [ ] Test actual WebGL-disabled/context-loss and reduced-motion environments. Host-level renderer failure is covered by simulation; CSS reduced-motion rules and static-first behavior are implemented, not a full browser emulation check.
- [ ] Add release-matched analysis screenshots if the illustration cards are replaced with product proof. Validate exports before adding the optional photo/film showcase.
- [ ] Publish only after the release and deployment checks above. This refactor did not deploy or upload anything.
