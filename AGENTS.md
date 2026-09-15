# Repository Guidelines

## Project Structure & Module Organization

Agent Vitals maintains a Python compatibility implementation and a Rust workspace. The Rust CLI lives in `apps/cli/`; reusable logic is split across `crates/agent-vitals-{data,domain,hosts,runtime}` and `crates/vitals-core`. Python code is under `packages/agent-vitals-python/agent_vitals/`, with entry scripts in `scripts/`. Tests are in `tests/` for Python and beside each Rust crate in `tests/` modules. Golden outputs and fixtures live in `golden/` and `fixtures/`. Desktop Tauri code is in `apps/desktop/src-tauri/`, integrations in `integrations/`, shared runtime data in `assets/`, and design/specification material in `docs/`.

## Build, Test, and Development Commands

- `python3 -m unittest discover tests -v` runs the full Python suite.
- `python3 tests/golden_runner.py --diff` verifies byte-for-byte golden output. Use `--update` only for reviewed, intentional contract changes.
- `cargo test --release` runs the default Rust workspace tests.
- `cargo clippy --release --all-targets -- -D warnings` enforces the CI lint gate.
- `cargo build --release` builds `target/release/agent-vitals`.
- `AGENT_VITALS_BIN="$PWD/target/release/agent-vitals" python3 tests/golden_runner.py --diff` checks Rust/Python output parity.
- `cargo run -- --help` runs the CLI during development.
- `cd integrations/dsh-client && npm test` builds and verifies the DSH client when that integration changes.
- Desktop (Tauri) tray checks must go through the bundle: `cd apps/desktop/src-tauri && cargo tauri build --bundles app`, then `open target/release/bundle/macos/agent-vitals.app`. Never run `target/{debug,release}/agent-vitals-menubar` directly — macOS 26 never places a status item for a bare binary (sandboxed or not), and every bare-run path leaves a junk entry in System Settings › Menu Bar (the 2026-09-14 "tray vanished" incident). Keep `set_activation_policy(Accessory)` in code; tao resets the policy to Regular at launch, so `LSUIElement` in Info.plist alone is not enough.
- **2026-09-15 follow-up, same failure mode, one layer deeper.** A bare run from an agent shell (Codex, Claude Code, or Terminal) does not just fail to show a status item — macOS 26 attributes the status item to *whoever launched the process*, not to the item's own bundle id. The launcher's own entry in the "Allow in the Menu Bar" registry gets `agent-vitals-menubar` appended to its `menuItemLocations`, and since that launcher (Codex/Claude Code/Terminal) is normally toggled off there, the icon is swallowed. Only `open .app` makes the app itself the responsible process, landing it under its own `com.mixlabpro.agent-vitals` entry (toggled on) where it actually renders. The registry lives at `~/Library/Group Containers/group.com.apple.controlcenter/Library/Preferences/group.com.apple.controlcenter.plist`, top-level key `trackedApplications` — a *nested* binary plist (the outer XML stores it as an opaque `<data>` blob; `plutil -p` alone won't show its contents, you need `plistlib.loads()` twice). It is a flat list of (identity, record) pairs: identity is `{"bundle":{"_0": "<id>"}}` or `{"adhocBinary":{"_0":{"relative":"file://<path>"}}}`; record is `{"location", "menuItemLocations":[...], "isAllowed"}`. Every bare-run path (`target/debug`, `target/release`, a temp bundle dir) leaves its own `adhocBinary` ghost entry. **Editing this file directly races `cfprefsd`, which caches it in memory** — if the app is still running when you edit, ControlCenter/cfprefsd can flush its stale in-memory copy back over your edit (this survives a plain machine restart, since shutdown itself triggers a cfprefsd flush). Correct sequence: `pkill -f agent-vitals-menubar` (quit first, no live process to race) → `killall cfprefsd` (drop stale cache) → edit the file → `killall cfprefsd` again (force a fresh read) → `killall ControlCenter` → quit System Settings if it's open (it caches the list in its own process) → **remember to `open` the app again** — the cleanup's first step just killed it, and forgetting this step looks exactly like the icon-missing bug recurring. A verified read/preview/apply script for this exists at `~/cc_tracked.py` on this machine (not checked into the repo — it edits a machine-local plist, not project state).

## Coding Style & Naming Conventions

Do not run `rustfmt`, and do not run any auto-formatting command on an individual Rust file. This has previously reformatted hundreds of unrelated lines and obscured a small functional change. For Rust edits, preserve the surrounding formatting, inspect `git diff --stat` and the full diff immediately after editing, and use targeted manual formatting. A repository-wide formatter check may be used only as a read-only check (`cargo fmt --all -- --check`); it must not rewrite files unless the user explicitly requests a formatting-only change.

Rust modules and functions use `snake_case`; types use `PascalCase`. Python uses four-space indentation, `snake_case`, standard-library-first solutions, and compatibility with Python 3.9 CI. Keep host-specific I/O in adapters/host crates and deterministic policy logic in core/domain modules. Preserve explicit JSON field ordering where output participates in golden tests.

## Testing Guidelines

Name Python tests `test_*.py` and `unittest.TestCase` classes descriptively. Add Rust integration tests under the affected crate’s `tests/` directory. There is no numeric coverage threshold; regression fixtures, malformed-input degradation tests, host contract tests, and Python/Rust lockstep checks are the acceptance criteria. Never refresh snapshots merely to silence a failure.

## Data Integrity Watchlist

Codex session logs can carry `model_provider` and a routed endpoint such as
`https://router.cogfoundry.ai/api/v1`. The emitter now preserves `provider_raw`,
`provider_id`, `billing_source`, and billing basis through Python/Rust parity and
SQLite ingestion. The generic authority query
`facts_by_hour_model_provider(host, window)` must remain host-agnostic; adding a host
must not require a new provider-specific SQL query. Reprocess affected Codex logs
before reconciling costs. Current evidence for September 9, 2026 shows
`openai/gpt-5.6-sol` and `openai/gpt-5.6-luna` in `model_provider=custom` sessions,
while `gpt-5.6-terra` appears in `model_provider=openai` sessions.
Explicit `model_provider=openai` wins over a current custom endpoint hint. Facts with
no provider marker may use the current endpoint only as `route-config-fallback`; older
facts that cannot be safely enriched remain under `<unknown>` and must be reported as
metered estimates, never silently assigned to OpenAI.

Cross-host audit status: DSH already persists provider evidence (`provider_raw` and the
provider/billing fields); Claude Code still has a similar unresolved route-evidence gap
because its emitter intentionally keeps only `model_raw`. Treat Claude provider/billing
classification as unavailable unless the source log contains explicit route evidence.

Billing fallback rule: a host or model may be classified as `subscription` only when
there is explicit evidence for an official subscription route and the applicable
subscription scope. Custom endpoints, non-official routes, third-party gateways, and
missing or conflicting route evidence must default to `metered_estimate` for reporting,
with `has_unresolved=true` and a visible route/provider uncertainty reason. Never drop
such usage, turn it into zero, or treat an API-equivalent estimate as an actual bill.

## Commit & Pull Request Guidelines

History follows Conventional Commit-style subjects such as `feat(v0.10.0): ...`, `fix(v0.10): ...`, `test(...): ...`, and `docs: ...`. Keep commits scoped and imperative. Pull requests should explain behavior and contract changes, link the relevant issue/spec, list commands run, and include screenshots for desktop or integration UI changes. Call out golden-file updates, schema changes, degradation behavior, and any intentionally unavailable evidence.
