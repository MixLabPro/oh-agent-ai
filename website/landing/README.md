# Oh Agent · City-first landing

Brand and copy updated to **Oh Agent** on 2026-10-16. Implemented against [the redesign spec](../../docs/LANDING_CITY_FIRST_REDESIGN_SPEC.md). English is the static default; `?lang=zh` selects Chinese. Language preference stays in localStorage. No analytics, accounts, uploaded sessions, external fonts or third-party scripts.

## Preview

From this directory:

```sh
python3 -m http.server 5180 --bind 127.0.0.1
```

Open `http://127.0.0.1:5180/?lang=zh` or `?lang=en`. The page is a static site; the interactive City requires HTTP serving. Opening `index.html` as a local file still offers product images and text, but cannot start the embedded application.

## Page and data

Hero with the production City frontend → data mapping → usage/cost/session illustrations → local privacy → FAQ → release status.

- The hero embeds the frontend built from `apps/agent-city/ui`. New fallback/building images and the share preview are captured from this frontend running mock sessions; no personal records are involved. Provenance is in [RELEASE_REVIEW.md](RELEASE_REVIEW.md).
- The visible desktop/tablet hero (over 600 CSS px) starts the real City frontend automatically, unless reduced motion or data saving is requested. Narrow phone views retain explicit entry. `city-host.js` serves deterministic synthetic `city:v2` projections through the production SDK's instance-scoped, same-origin message transport. Default 30 days contains 2000 mock sessions; 7 days contains 469. The frontend render cap is 4000, so this dataset does not trigger overflow aggregation; this does not change the native data projection's 500-session cap. No local authority, harness logs, generic IPC or SQL access is available.
- First usable toolbar publication confirms renderer readiness. A failed startup, unavailable renderer, missing build or 20-second startup timeout leaves the product preview and an explicit retry. Clicking Close removes the iframe. Hidden/offscreen views receive suspend messages.
- City settings enable keyboard session selection. The sample can show its bounded session fields; host full-session navigation is disabled for fixtures. The production component's `presentation=landing` mode hides game, export and seed controls, and avoids audio warmup. Synthetic seed state stays in memory. No native package install, raw-log access or file-save command is offered by this host.
- Amount cards are clearly labeled illustrations. Amounts stay in USD in both locales; language switching is not currency conversion. API-equivalent estimates, subscriptions and actual charges remain distinct. City currently does not project cost.
- Reduced-motion/narrow-view visitors can opt into City. Desktop uses one live City instance in the hero. Hidden/offscreen suspension and Close are available; no sound starts automatically.

## Build the optional City

```sh
node ../../tools/build-city3d.mjs
```

When dependencies are already installed:

```sh
node ../../tools/build-city3d.mjs --skip-install
```

The builder replaces the generated `city3d/` directory from the current production City source. Commit the rebuilt index and referenced assets together. Preserve generated third-party notices. Desktop requests the City bundle when the hero is visible; narrow/reduced-motion views request it on explicit entry. Passing the initial window to the frontend avoids building the scene twice.

## Verify

```sh
node tools/verify-landing.mjs
```

Checks cover actual translation keys, local assets, anchor targets, truthful sample/cost labels, script syntax, and a simulated host exercising the v2 contract, deterministic windows, origin/method rejection, readiness, timeout, stale responses, retry and teardown. This command is a local implementation check, **not** permission to publish and not a substitute for browser interaction or public-download verification.

The former `--allow-missing-shots` workflow belongs to the previous diagnostics-first design. Current evidence and pending work are tracked in [RELEASE_REVIEW.md](RELEASE_REVIEW.md).

Current brand captures are in `docs/assets/oh-agent-2026-10-16/` from repository root. The current share image is `assets/oh-agent-preview.jpg`; the deployment URL remains to be verified before launch. Oh Agent is the public-facing landing name; repository paths and native application identifiers retain project compatibility.

## Public release

On 2026-10-16 the configured public GitHub repository and releases API both returned 404 anonymously. The page therefore shows an explicit release-preparation state and does not link visitors to an unavailable download or source page. Before launch, verify repository visibility, downloadable assets, actual architecture/system requirements, signing and notarization; then update both locales and the verifier's release-state assertion. Nothing was published as part of this refactor.

Canonical and social metadata retain the existing configured GitHub Pages address. That deployment address must be verified or replaced before publication; it is not a claim that the preview is already live there.
