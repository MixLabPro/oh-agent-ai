# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

This repo **is** an Agent Skill (`SKILL.md` at the root), not a library that ships one.
It health-checks the *other* skills installed on the machine. There are now **two
implementations kept in lockstep** (permanent, see §Architecture): a Python scanner
(`scripts/`) and a Rust binary + shared lib + wasm build (`src/` + `crates/`). The
Python scanner is stdlib-only — no dependencies, no network calls; the Rust side has
normal crates.io deps (clap/regex/serde/serde_json/sha2/walkdir) and the wasm crate adds
wasm-bindgen. The "no network, no third-party supply chain" constraint still holds for
what is *distributed* as the in-host skill: a skill that audits skills for supply-chain
risk cannot itself pull third-party code at scan time.

There is also a **DeepSeek Harness (DSH) integration**: `dsh/` (the installable profile
bundle) and `dsh-client/` (a dual-face plugin whose host half folds session events
through the Rust behavior rules compiled to wasm, and whose client half renders an
「审计」tab). See `docs/DSH_INTEGRATION.md` and `docs/AGENT_BEHAVIOR_AUDIT.md`.

Documentation is bilingual. `SKILL.md` (the agent-facing instructions) is English, with
`references/guide.zh-CN.md` as the complete Chinese equivalent; `README.md` is English
first, then a Chinese section anchored at `#中文`. When editing behaviour, both
`README.md` sections usually need the same change, and a change to the workflow in
`SKILL.md` needs the matching change in `guide.zh-CN.md`.

## Repo layout

```
Cargo.toml                  # [workspace]: "." + crates/skill-vitals-core + crates/skill-vitals-wasm
src/                        # Rust binary (the `skill-vitals` CLI) — ~21 modules
crates/skill-vitals-core/   # lib crate: the PURE computation (behavior rules etc.), single source of truth
crates/skill-vitals-wasm/   # cdylib: wasm-bindgen wrapper over core (audit_events), built with wasm-pack
scripts/scan.py             # thin entrypoint; the scanner lives in scripts/skill_vitals/ (~26 modules)
scripts/probe_logs.py       # legacy fallback (not in the default flow)
SKILL.md                    # agent-facing driver: routes to doctor, names the SV codes
references/                 # hosts.md (per-host evidence), judgment.md, guide.zh-CN.md
docs/                       # design docs (ENGINEERING, DSH_INTEGRATION, AGENT_BEHAVIOR_AUDIT, …)
dsh/                        # DSH-1 profile bundle (registers skill-vitals as a DSH skill)
dsh-client/                 # dual-face audit plugin (host projection + wasm + client tab)
fixtures/ + golden/         # test corpus + byte-for-byte scanner snapshots
tests/                      # 18 Python test files
.github/workflows/          # verify.yml, release.yml, package-clawhub.yml
```

The **core crate is the single source of truth for pure rules**. `src/behavior.rs` in the
binary is now a thin wrapper that re-exports `skill_vitals_core::behavior::*` and keeps
only the I/O entry (`audit_session_log`). The wasm crate wraps the same core, so the
browser/Node runs the exact same rules as the CLI — never a second copy.

## Commands

```bash
# Python suite — everything (352 tests)
python3 -m unittest discover tests
python3 tests/test_regressions.py          # regression suite only
python3 tests/golden_runner.py             # golden diff (15 snapshots)
python3 tests/golden_runner.py --diff      # …and show the first mismatch
python3 tests/golden_runner.py --update    # re-freeze after an intended change (confirm first!)
python3 -m unittest tests.test_invariants  # the 12-invariant acceptance gate

# Rust — 144 tests (129 binary + 15 core). The wasm crate has no host-side tests;
# its build is wasm-pack (below), not `cargo test`.
cargo test                                 # 144 (default members: binary + core)
cargo clippy --release --all-targets -- -D warnings   # CI gate: scan path must not unwrap
cargo build --release                       # the CLI binary

# wasm — build the audit_events wasm + JS glue into crates/skill-vitals-wasm/pkg/
cargo install wasm-pack                     # one-time
(cd crates/skill-vitals-wasm && wasm-pack build --target web)
#   then copy pkg/skill_vitals_wasm.js + pkg/skill_vitals_wasm_bg.wasm into dsh-client/

# scanner CLI (Python implementation; the Rust binary is the same surface)
python3 scripts/scan.py                     # scan, print JSON to stdout
python3 scripts/scan.py --path <dir> --json out.json
python3 scripts/scan.py --redact --redact-names --json safe.json
python3 scripts/scan.py --baseline prev.json --json out.json

# CLI subcommands (both implementations): doctor · list · explain · overlap · snapshot · diff ·
#   behavior · skill-audit (Rust only — Python's `behavior --json` has the `skill` key but has
#   never had its own subcommand) · duration-audit
#   `behavior <session-log>` audits a DSH session log for SV601–SV614 findings（单事件规则 + 轨迹级检测器）.
#   `duration-audit <session-log>` audits execution duration（工具调用/turn/step/审批/hook 消费五路耗时，
#   D1-D4 的 core 纯函数）；`--json` 输出与 `behavior --json` 的 `duration` 键是同一份数据。
```

`tests/test_properties.py` needs `hypothesis`, which is **optional** — the suite skips it
when absent, so the repo stays dependency-free. To run it:
`python3 -m venv .venv && .venv/bin/python -m pip install hypothesis`, then
`.venv/bin/python -m unittest discover tests` (more tests than without).

## Architecture

The load-bearing split: **`scan.py` measures, `SKILL.md` judges.** The scanner emits one
deterministic JSON document and deliberately refuses to decide whether something is
*good*; the agent-facing procedure supplies that judgment (checks 2.1–2.7, report format,
interaction rules). Semantic overlap detection (check 2.3) is absent from the script
because it is not a regex problem — the model does it from the `description` fields.

### The distinction the whole design turns on: disk ≠ context

`total_skills_on_disk` and `loaded_skills` differ substantially. Disabled plugin copies,
the same plugin under `plugins/cache/` and `plugins/marketplaces/`, and other hosts'
skills all sit on disk while costing zero context. `classify()` → `loaded`/`loaded_reason`
decides this per skill by reading `enabledPlugins` from `~/.claude.json`. **Budget,
conflicts, and zombies are computed over `loaded` only.** `--all` exists purely to
diagnose "why did only 15 of my 70 skills load" — never write a report from its budget
numbers.

### Host-capability degradation

Three outputs require Claude Code's `~/.claude.json`: description budget (2.1),
loaded-vs-disk (`enabledPlugins`), and trigger data (2.5, `skillUsage`). On other hosts
these must report as unavailable. **Never substitute install time or mtime for a missing
trigger count** — a report missing a column is useful; a report with a fabricated one is
not. This principle extends to the behavior rules: when the workspace root is unknown,
SV605 degrades to the absolute-path heuristic rather than under-reporting.

### Security heuristics sort, they never acquit

`is_cited()` marks a finding as *looking* like a quoted example or defensive documentation.
It is an annotation for ordering only. `max_severity` is authoritative and includes cited
findings; `max_severity_uncited` exists solely to decide *what to read first*, never
*whether to read it*. Any change that lets a heuristic suppress a finding is a regression
regardless of how well it scores on samples. `security_scan()` early-returns
`self_excluded: True` for `SELF_SKILL_ROOT`.

### Cost accounting: four buckets, do not merge them

| Field | Meaning |
|---|---|
| `tier1_tokens` | frontmatter — resident in context at every startup |
| `tier2_core_tokens` | SKILL.md body — loaded **whenever** the skill triggers |
| `tier2_refs_tokens` | `.md` under `references/`/`docs/` or sibling to SKILL.md — on demand |
| `tier2_max_tokens` | core + refs — worst case when everything is read |

Split recommendations use **`tier2_core_tokens`, never line count**: measured density varied
>4× within one library. `.md` in other subdirectories is classified as data corpus; `REPO_META`
is excluded entirely.

### Other invariants with tests behind them

- **Zombie verdicts need an age gate** (`zombie_min_age_days`, default 14).
- **Plugin skills are namespaced** — dedup key is `(namespace, name)` i.e. `<plugin>:<name>`.
- **Override precedence is `enterprise > personal > project > plugin`** — the home copy
  shadows the project one. This is why `conflicts` splits into `shadowed_newer`,
  `intentional_override`, and `redundant`.
- **Redaction must survive into paths and free text** — `--redact-names` collects every
  name first, then replaces longest-first; `description` is dropped wholesale. All
  statistics must remain identical after redaction.

### Dual implementation, differential guard (2026-08 revision)

Python and Rust are **permanently parallel** — there is no "Rust replaces Python" exit
point. Rust serves the binary channels (npm/brew/cargo/Release); Python serves the
ClawHub in-host skill form and cross-language readers. Divergence must not survive one
CI run: both implementations run the same goldens byte-for-byte, and the
`differential` job turns red the day they disagree. See `docs/ENGINEERING.md` §6.8.

### DSH audit: computation is host-side

The browser cannot read raw session events (the client `SessionFace` only exposes
projections, and approval/sandbox events are log-only). So behavior findings are
computed on the **host** via a `sessionProjections` projection whose `view` calls the
wasm `audit_events` over the raw event fold; the client reads `useProjection('behaviorFindings')`.
The cost side (per-model token buckets) folds through the same core — the `tokenByModel`
projection's `view` calls the wasm `token_by_model` — so the tab runs the *exact* engine the
CLI `behavior` command runs (never a second copy). Pricing those buckets into money is
*also* host-side now: the `costReport` projection (`dsh-client/src/host/index.ts`) reads
`tokenByModel`'s fold and prices it against `dsh-client/pricing.json` — a build-time copy of
the single-source `scripts/skill_vitals/pricing.json` (Rust embeds the source via
`include_str!`; Node can `readFileSync` its own copy directly, unlike the browser). The client
just renders `useProjection('costReport')`. `AuditView.tsx` keeps a second, *display-only*
baked `PRICING` copy in `styles/index.ts` — not for pricing math, only for the model
short-name lookup used in badges/chips — guarded by `tests/test_pricing_lockstep.py` (which
also byte-compares `dsh-client/pricing.json` against the source, catching a forgotten copy).
See `docs/AUDIT_TAB_DESIGN.md` for the current optimization backlog.

**The one exception to "computation is host-side": the timeline's geometry.** Turning
`requests[]` into an SVG path is presentation, not measurement, so it lives client-side in
`dsh-client/src/client/timeline.ts` — but as a *pure* module, exported through
`index.cts`'s `__pure` (test-only surface) and asserted directly by
`scripts/verify-timeline.mjs`. The reason it is isolated at all: a wrong scale factor
draws a wrong chart **without failing anything** — no exception, no red test, only a human
noticing the curve looks off. Two invariants have tests behind them: the curve may be
aggregated to display width but **event markers never are** (`eventsIn === eventsOut`),
and a bucket with no measured rows **breaks the line** rather than interpolating across a
gap that was never measured. The timeline deliberately has no "cost" mode: per-request
pricing needs each request's own peak/off-peak verdict, a rule that lives in the Rust core
and is exposed only through aggregates — reimplementing it in the browser would be a
fourth copy.

## Six test layers, six different jobs

- `tests/test_regressions.py` — one case per **defect that actually shipped**.
- `tests/golden_runner.py` + `golden/*.json` — byte-for-byte snapshots. `SKILL_VITALS_BIN=<path>`
  points it at the Rust binary; that env var is the whole Python→Rust test story.
- `tests/test_invariants.py` — asserts the 12 invariants by their discriminating values.
- `tests/test_characterization.py` — pins the pure functions (`est_tokens`,
  `parse_frontmatter`, `plugin_identity`, `lookup_usage`, `is_cited`, `days_since`,
  `redact`, `diff_against`) to exact values; these are the numbers a Rust `#[cfg(test)]`
  must reproduce.
- `tests/test_properties.py` (hypothesis, optional) — redaction leaves no real name in
  any field at any depth, and `est_tokens` is total over arbitrary Unicode.
- `tests/test_degradation.py` — malformed corpus must not abort the scan, and malformed
  entries must *surface* rather than vanish (explicitly bought in Rust).

`--update` rewrites the oracle. Confirm the diff is intended first; a reflexive `--update`
turns the golden into a record of current behaviour and the test stops meaning anything.

### Tests read the real machine

`run_scan()` with no `--path` scans the actual host directories of whoever runs it.
Consequence: **`TestScannerExcludesItself.test_self_excluded` fails unless this repo is
checked out under a scanned root** (normally `~/.claude/skills/skill-vitals`). That single
failure is environmental; any *other* failure is real.

**`--path` does not isolate** — `main()` does `DEFAULT_ROOTS + [custom paths]`. Anything
needing reproducible output must set `HOME=<fixture root>` and `cwd=<fixture root>/workdir`.
On macOS `/tmp` is a symlink to `/private/tmp`; `classify()` prefix-compares an unresolved
`HOME_N` against `skill_dir.resolve()`, which silently demotes every `personal` skill to
`unknown`. `tests/golden_runner.py` handles all of this.

## Editing conventions

Comments in `scan.py`, `src/*.rs`, and the test docstrings are Chinese and explain *why the
obvious implementation was wrong*, usually citing the defect that shipped. Preserve that
register: when changing one of the invariants above, update the comment explaining the
trade-off, and add a regression test whose docstring says what actually broke.

When a rule changes, it changes in **three places that must stay in lockstep**: the Rust
core crate (`crates/skill-vitals-core/`), the Python implementation
(`scripts/skill_vitals/behavior.py`), and — for anything the DSH audit tab uses — the wasm
crate (rebuild + re-copy the `.wasm` into `dsh-client/`). The differential golden guard
catches Python↔Rust drift; the wasm↔CLI drift is caught only by re-running the wasm build
against the same fixtures, so verify that manually. The **trajectory detectors** (`trajectory.rs` ↔ `trajectory.py` ↔ wasm `audit_events` 合并 ↔ dsh 提取的 `turn/start·step/start·turn/end·step/end` 边界信号) are the same lockstep. The **cost fold** (`usage.rs` ↔
`usage.py` ↔ wasm `token_by_model` ↔ dsh adapter `usage_events`) is the same three-way
lockstep; its reconciliation invariant — bucket sums must equal DSH's `tokenUsage` — is
checked against a real session log in the CLI's `behavior` output. The DeepSeek **price
table** lives only in `scripts/skill_vitals/pricing.json` (CLI 两侧读它；`dsh-client/
pricing.json` 是 build 时复制出的运行时份，宿主 `costReport` 投影读它；`styles/index.ts`
另内嵌一份仅供展示用的模型短名副本——三处由 `tests/test_pricing_lockstep.py` 守）;
prices are business data, not rules — they change without a golden `--update`. The
**cost computation itself** (`cost_report`) is a fourth lockstep, one level up from the
price table: `src/cost.rs` ↔ `scripts/skill_vitals/cost.py` ↔ `dsh-client/src/host/
index.ts::costReportFrom` all implement the same peak/off-peak-split pricing math over
`{by_model, sequence}`; the CLI two-language parity is caught by `test_cli_matrix.py`'s
`both()` differential, the TS mirror by `dsh-client/scripts/verify-host.mjs` asserting
real numbers against the checked-in `pricing.json`.

Scan output must never be committed — `.gitignore` covers `skill-scan*.json`, `scan-*.json`,
`*.scan.json`, and now also the npm `node_modules/` of `dsh/`/`dsh-client/`. The committed
`dsh-client/skill_vitals_wasm_bg.wasm` and `dsh-client/pricing.json` are the deliberate
build-artifact exceptions: the host plugin `readFileSync`s both at runtime (the wasm binary
and the price table `costReport` prices against), `wasm-opt` is disabled so the wasm build
needs no network, and `pricing.json` is a plain `cp` from `scripts/skill_vitals/pricing.json`
— re-copy it by hand whenever the source changes; `tests/test_pricing_lockstep.py`'s
`HostPricingCopyLockstepTests` byte-compares them so a forgotten copy fails loudly instead
of silently pricing off stale numbers.
