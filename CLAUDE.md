# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

This repo **is** an Agent Skill (`SKILL.md` at the root), not a library that ships one.
It health-checks the *other* skills installed on the machine. There are now **two
implementations kept in lockstep** (see §Architecture; the dual structure is being phased
down per `docs/TAURI_RUNTIME_WORKBENCH_SPEC.md` §7.1): a Python scanner
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
Cargo.toml                  # [workspace]: "." + crates/agent-vitals-core + crates/agent-vitals-wasm
src/                        # Rust binary (the `agent-vitals` CLI)
  skills/                   #   静态 SKILL.md 体检（analysis/security/doctor/discovery/…）
  agent/                    #   会话行为/成本审计（behavior/cost/codex_cost/codex_session）
  dsh.rs + util.rs          #   两世界共享，留顶层
crates/agent-vitals-core/   # lib crate: the PURE computation (behavior rules etc.), single source of truth
crates/agent-vitals-wasm/   # cdylib: wasm-bindgen wrapper over core (audit_events), built with wasm-pack
scripts/scan.py             # thin entrypoint; the scanner lives in scripts/agent_vitals/
scripts/agent_vitals/       # Python 包：同样拆 skills/（静态体检）+ agent/（会话/成本）子树；
                            #   adapters/（宿主适配器）与 cli/compat/util/paths 留顶层
scripts/probe_logs.py       # legacy fallback (not in the default flow)
SKILL.md                    # agent-facing driver: routes to doctor, names the SV codes
references/                 # hosts.md (per-host evidence), judgment.md, guide.zh-CN.md
docs/                       # design docs (ENGINEERING, DSH_INTEGRATION, AGENT_BEHAVIOR_AUDIT, …)
dsh/                        # DSH-1 profile bundle (registers agent-vitals as a DSH skill)
dsh-client/                 # dual-face audit plugin (host projection + wasm + client tab)
src-tauri/                  # 菜单栏 app（Tauri 2，**独立 workspace**，不入根 default-members）：
                            #   托盘 + 弹出面板展示 今日/本月/预算，计价全部委托 core::cost（不长第四份拷贝）
fixtures/ + golden/         # test corpus + byte-for-byte scanner snapshots
tests/                      # 28 Python test files（含分类守卫 tests/test_classification.py）
.github/workflows/          # verify.yml, release.yml, package-clawhub.yml
```

**两个子树的分界**（`tests/test_classification.py` 用显式清单钉死）：`skills/` 是
**skill 体检**——静态扫 SKILL.md/目录/触发数据；`agent/` 是 **skill 执行 + 成本**——
审计一次会话里 skill 被调用得好不好（读运行证据，不是 SKILL.md 文本）。名字像
扫描器的 `skill.py`/`skill.rs` 属 agent 家族（会话执行），**不进 skills/**；`codex.py`
（安装时宿主扫描证据源）进 skills/，`codex_session.py`（会话读取）留 adapters/。
Python 与 Rust 两侧同构，模块清单见 tests/test_classification.py 的家族 set。

The **core crate is the single source of truth for pure rules**. `src/behavior.rs` in the
binary is now a thin wrapper that re-exports `agent_vitals_core::behavior::*` and keeps
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

# wasm — build the audit_events wasm + JS glue into crates/agent-vitals-wasm/pkg/
cargo install wasm-pack                     # one-time
(cd crates/agent-vitals-wasm && wasm-pack build --target web)
#   then copy pkg/agent_vitals_wasm.js + pkg/agent_vitals_wasm_bg.wasm into dsh-client/

# scanner CLI (Python implementation; the Rust binary is the same surface)
python3 scripts/scan.py                     # scan, print JSON to stdout
python3 scripts/scan.py --path <dir> --json out.json
python3 scripts/scan.py --redact --redact-names --json safe.json
python3 scripts/scan.py --baseline prev.json --json out.json

# CLI subcommands (both implementations): doctor · list · explain · overlap · snapshot · diff ·
#   plan · behavior · skill-audit (Rust only — Python's `behavior --json` has the `skill` key but has
#   never had its own subcommand) · duration-audit
#   `plan` turns the scan report into a ranked savings plan（zombie/oversized/trim-description/
#   shadow → 每条点名 skill、标 risk、给测量的 token 节省与 SV 码；诚实性规则见
#   `crates/agent-vitals-core/src/plan.rs` docstring）。
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

Python and Rust are **currently parallel implementations under a differential gate** —
but this is not an immutable hard limit. It is a clause this repo is revising: per
`docs/TAURI_RUNTIME_WORKBENCH_SPEC.md` §7.1 (Phased Python Diminishment RFC), the
structure is phased down — orchestration/IO (Tauri, IPC, watchers) is Rust-only from
tier 1; pure rules migrate into the Rust core one rule at a time, each removed from
Python only after the lockstep gate passes; the Python distribution form retires only
when the tier-3 exit conditions hold. While a rule's Python implementation still
exists, divergence must not survive one CI run: both implementations run the same
goldens byte-for-byte, and the `differential` job turns red the day they disagree.
Rust serves the binary channels (npm/brew/cargo/Release); Python serves the ClawHub
in-host skill form and cross-language readers. See `docs/ENGINEERING.md` §6.8.

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
the single-source `scripts/agent_vitals/pricing.json` (Rust embeds the source via
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

### Codex 行为检测：2026-08 起原生填 timeline，SV 规则部分可跑

Codex 会话解析（`adapters/codex_session.py`）对齐了**三套 schema 里的两套**：cost
（`codex_usage.py` 的 5 桶读 `last_token_usage` + 按 `total_token_usage` 签名去重，
`:9-15` 明写故意不同于 DSH 的 4 桶 + `(turn, step)` 去重）和 evidence（`codex_evidence.rs`
的 19 信号覆盖计数）。behavior 层的历史分两段，都是被真机证据纠正的假结论：

- **曾以为「Codex wire 格式凑不齐 boundary-event payload、硬填即编造零、timeline 恒为
  空」**——基于旧 fixture，被真实 rollout 推翻：Paginated 线格式其实能原生填满 4 条
  timeline（approvals 除外）。`custom_tool_call{exec}` 与 `CommandExecution` 是同一逻辑
  exec 的两份影子（`call_id` 与 item `id` 无 join key），以 `CommandExecution` 为主源、
  跳过影子，否则双重计数会破坏 SV611 的重复检测。`sandbox_policy` 线格式漂移（真实对象
  `{type}` vs 旧 fixture 字符串）两态都认——P4.5 RolloutItem schema-drift sentinel
  （§14.4）早该抓到的 drift。
- **门控一度读覆盖计数**（`s.coverage.get(**sig).total() == 0`）而 detector 主体读边界
  事件流（`detect_sv612` 按 turn 分组迭代）。DSH 上两者同源；Codex 上分叉——
  `derive_coverage` 把 `task_started` 等数成非零 measured、timeline 恒空（当时的真实
  状态），读计数会让门控放行、主体空转，产出 **MeasuredZero** 而非诚实的 Unavailable
  （`evidence.rs`「adapter 不得用读不到的东西刷覆盖」的镜像面）。现门控改读
  `CanonicalSession::timeline_is_empty`（`evidence.rs`，requires 信号映射到对应 timeline
  的非空性），单测
  `empty_timeline_with_nonzero_coverage_is_unavailable_not_measured_zero`
  钉住「覆盖非零 + 时间线为空 → Unavailable」。

**`TurnBoundaries` 是撞车名**：evidence 侧（`codex_evidence.rs`，`task_started`/`task_complete`
即 bump measured）是覆盖**计数**；detector 侧（`trajectory.rs`，SV612/613 的 `requires`）是
边界**事件流**的门槛。这正是「coverage 里 Codex 的 TurnBoundaries 是绿的、behavior 层却
一行不跑」的历史来源。

**当前真值表**（`populate_codex_timelines` 填充，真值表单测钉住），按线格式分两栏：
- **Paginated**（有 CommandExecution）：SV601/602/603（exec→bash，命中 rm/sudo/curl|sh 类）、
  SV610（sandbox_policy→sandbox_modes，danger-full-access）、SV611/612/613
  （tool_calls/turns/tool_results 非空）、SV614c（OR 门控：approvals 空但 sandbox 非空）
  **可跑**；SV604/605/606（Codex 没有 write/edit/web_fetch 工具名）与 SV607/608
  （`exit_code:N` 合成码 ∉ DSH 码集）诚实报 **MeasuredZero**；SV609 / SV614a-b（approvals 空）
  报 **Unavailable**。
- **Legacy**（无 CommandExecution——真实 7/25 的 679 次工具执行全是 `custom_tool_call`，它是
  JS 沙箱工具、不一定是 shell）：`exec→bash` 只在能挖出字面量 `exec_command({cmd})` 的 input
  上发生（quote-aware 提取，实测 187/679），apply_patch 等非 shell 不误报；custom_tool_call
  路径不产 tool_results（无 exit/error 源），但 function_call_output 照常填（error 恒 null
  → None），所以 SV607/608 与 SV613(b) 报 **MeasuredZero**（规则照跑零命中）；SV612 因
  custom_tool_call 与 function_call 都无 turn_id、turn sig 恒空报 **MeasuredZero**；SV611 只
  在挖出的 bash 子集上跑。

`exec→bash`/`exit_code→error_code` 是 L2 适配器的宿主词表翻译（近似、可能误报）；「Codex
根本没有的维度 → MeasuredZero 而非 Unavailable」是已知代价，name-aware 门控是后续项。结构
对齐由 `tests/test_canonical_schema.py` 逐字段对账 Rust `CanonicalSession`；非空形状由
`test_populated_timelines_are_native_and_structured` 钉住，Legacy 回退由
`test_legacy_fallback_extracts_real_shell_cmds_only` 钉住。

## Six test layers, six different jobs

- `tests/test_regressions.py` — one case per **defect that actually shipped**.
- `tests/golden_runner.py` + `golden/*.json` — byte-for-byte snapshots. `AGENT_VITALS_BIN=<path>`
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
`SCAN_CMD` is the Rust binary when `AGENT_VITALS_BIN` is set, else the Python scanner.
`TestScannerExcludesItself.test_self_excluded` therefore passes `--self-root ROOT`
explicitly: the binary has no `__file__` to infer its own skill dir from, and without the
flag it used to silently scan itself (22 own-rule findings) under the differential
harness — the exact regression that test guards. Any failure in this file is real.

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
core crate (`crates/agent-vitals-core/`), the Python implementation
(`scripts/agent_vitals/agent/behavior.py`), and — for anything the DSH audit tab uses — the wasm
crate (rebuild + re-copy the `.wasm` into `dsh-client/`). The differential golden guard
catches Python↔Rust drift; the wasm↔CLI drift is caught only by re-running the wasm build
against the same fixtures, so verify that manually. The **trajectory detectors** (`trajectory.rs` ↔ `trajectory.py` ↔ wasm `audit_events` 合并 ↔ dsh 提取的 `turn/start·step/start·turn/end·step/end` 边界信号) are the same lockstep. The **cost fold** (`usage.rs` ↔
`usage.py` ↔ wasm `token_by_model` ↔ dsh adapter `usage_events`) is the same three-way
lockstep; its reconciliation invariant — bucket sums must equal DSH's `tokenUsage` — is
checked against a real session log in the CLI's `behavior` output.

**"Which events carry usage" is one predicate, and it was duplicated twelve times.** It
lives in `usage.rs::usage_sample` (the authority), mirrored in `usage.py::_usage_sample`,
and gated *earlier* by the DSH adapter (`dsh.rs`/`dsh.py::is_usage_event`) and *earlier
still* by eight `apply()` filters in `dsh-client/src/host/index.ts` (now collapsed into one
`carriesUsage()` helper). Each layer runs before the next, so **fixing the authority alone
fixes nothing** — an event dropped by the adapter never reaches the fold, and one dropped by
a projection's `apply()` never reaches wasm. That is exactly how `compaction/summary`'s real
token spend (it carries `data.usage` *and* its own `model`/`provider`, which differ from the
session's active model) went uncounted everywhere: it failed the type whitelist, and it has
no `turn`/`step` because compaction is command-triggered, not part of any turn
(`compaction_identity()` hashes `compactionId` into negative space to give it a dedup slot;
`request_metrics` reports its turn/step as `null` so that internal identity never leaks out
as a plausible-looking turn number).

The durable defense is not a longer whitelist but a **residual sentinel**: every fold reports
`unaccounted_usage` — events it did *not* consume whose payload nonetheless contains the very
token field names it knows how to read. It is the dual of `unreported_fields` ("the host never
reported this field" vs. "the host reported tokens and we failed to catch them"), and in the
evidence model it is `Signal::Usage`'s `unmetered` count — `evidence.rs` predicted this bug
verbatim: *adapters must not inflate their own coverage by not counting what they cannot read*.
Because of the layering, the sentinel is useless unless the layers above it are **permissive**:
adapter and projection filters keep anything usage-*shaped* (`usage_shaped_tokens` /
`looksUsageShaped`), while pricing stays strict (`usage_sample` only). Wide in, narrow out —
the machine finds, a human classifies. Never merge those two paths: structural detection alone
would double-count, since one logical charge appears in several events (that is what the
`(turn, step)` replacement dedup exists for). The sentinel initially reported *zero* gaps —
a false negative caused by the adapter filter sitting above it; treat a clean sentinel as
meaningful only once every layer above it is permissive.

**The same fold has a third projection, and it is load-bearing: `token_by_date_model`
(`usage.rs` ↔ `usage.py`).** The calendar and the DSH audit tab are not two features that
happen to both compute money — they are **one audit capability projected along two axes**:
the tab slices by session (`token_by_model`), the calendar slices by time
(`token_by_date_model`), and *the monthly token total and cost of the two must be equal*.
Nothing enforced that until 2026-08, when the calendar reported ¥2386 for a month whose
per-session recomputation was ¥1733 — found by hand, not by a test. The guards now are
`usage.rs::token_by_date_model_reconciles_with_token_by_model` (exact equality; the only
legitimate difference is untimed samples, which the date axis drops by design and which is
pinned by its own test) and a byte-for-byte Python↔Rust parity test on both sides. Do not
"simplify" the date axis into a Python-only helper: it fell outside the differential once
already, and the menu-bar work (Rust-Tauri) consumes this same fold.

**The same fold is also *resumable* (the watcher's incremental path, §10.2).** The fold's
cross-turn state lives in `UsageFoldState` (`usage.rs`) / `_usage_fold_default`+friends
(`usage.py`), and the contract `fold(events[0..n]) == fold_resume(checkpoint@k, events[k..n])`
for any **turn boundary** k is pinned byte-for-byte on both sides
(`usage_fold_resume_equals_full_fold_at_turn_boundaries` in Rust, `tests/test_resumability.py`
in Python, plus cross-language characterization on `usage_fold_resume` and
`usage_fold_checkpoint_json`). The `last` same-step dedup slot is deliberately **not** in the
checkpoint — a resume suffix starts at a turn boundary, so its first usage event is a new turn
and cannot collide with the prefix's final (turn, step); mid-turn checkpoints would need to
serialise that slot, and the contract does not promise them. Incremental folding is not a
separate fast path: `token_by_model` itself is `usage_fold_checkpoint` + `usage_fold_resume`,
so the two are equal by construction. In Python, `usage_fold_resume` deep-copies the state —
a resume that mutates the caller's checkpoint would silently double-count on reuse. (`state.py`'s `merge_today`/`merge_month`/
`rotate_today`/`read_month`/`list_months`, `budget.py`, `cli.py`'s `oneline`/`calendar`) is
the one place in this repo that accumulates *across* invocations, and its invariants are not
input→output but **cross-call**: every token lands in `month.json` exactly once
(`merge_month` owns that write — `rotate_today` must never also add, which is what silently
tripled 2026-08), a backfilled log attributes to *its own* date rather than `_today_key()`,
and a day whose `by_model` covers only part of its tokens must be labelled `partial`, never
priced as if exact — that check lives in exactly one place, `cost.py::priced_day`, because
the day it existed only inside the calendar's renderer, the calendar and the budget menu-bar
projection (same `month.json`, same month) silently disagreed with each other on the price of
that day. Tests here must start from *already-populated* state; every one of these bugs
survived a green suite because the tests began from an empty state directory — including one
introduced *while fixing another*: `priced_day` was added for the calendar and left
`budget.py` un-migrated for a turn, which a cross-projection-agreement test (`budget.py`'s
`test_month_and_calendar_agree_on_the_same_partial_coverage_day`) now pins directly, rather
than relying on each call site being individually correct.

`month.json` holds **only the current calendar month**; `merge_month` migrates any date that
has rolled out of it into `month-archive.json` (keyed `{"YYYY-MM": {"days": {...}}}`) before
writing new data, so that no reader of `month.json` needs to filter by date to get "this
month's" figure right — before this, nothing filtered, and a month.json carrying a couple of
leftover August rows reported a September total 201× too high. The migration write is a
per-day *replacement* (idempotent — crashing mid-migration and retrying re-copies the same
day, never doubles it); a *backfill* into an already-archived month is a per-day
*accumulation* instead, because that call is new evidence, not a re-run of the same migration.
Query a historical month with `state.read_month("YYYY-MM")` /
`agent-vitals budget show --month YYYY-MM`; `state.list_months()` /
`agent-vitals state months` enumerates what has data. The computation (`token_by_date_model`,
`priced_day`) is in the core crate / `cost.py` precisely so the Tauri menu bar and any future
month-query surface reuse it rather than growing a fourth copy. The DeepSeek **price
table** lives only in `scripts/agent_vitals/pricing.json` (CLI 两侧读它；`dsh-client/
pricing.json` 是 build 时复制出的运行时份，宿主 `costReport` 投影读它；`styles/index.ts`
另内嵌一份仅供展示用的模型短名副本——三处由 `tests/test_pricing_lockstep.py` 守）;
prices are business data, not rules — they change without a golden `--update`. The
**cost computation itself** (`cost_report`) is a fourth lockstep, one level up from the
price table: `crates/agent-vitals-core/src/cost.rs` ↔ `scripts/agent_vitals/agent/cost.py`
↔ `dsh-client/src/host/index.ts::costReportFrom` all implement the same
peak/off-peak-split pricing math over `{by_model, sequence}`; the CLI two-language parity
is caught by `test_cli_matrix.py`'s `both()` differential, the TS mirror by
`dsh-client/scripts/verify-host.mjs` asserting real numbers against the checked-in
`pricing.json`. (2026-08: cost 从二进制 `src/agent/cost.rs` 迁进 core crate —— preflight
Phase 0-1 —— 二进制侧退成 `pub use` 薄封装；`priced_day` 一并进 core
（`cost.rs::priced_day` ↔ `cost.py::priced_day`，`tests/test_cost_priced_day.py` 交叉锁定），
Tauri 菜单栏与未来按月查询 surface 直接 `use agent_vitals_core::cost`，不长第四份拷贝。)

Scan output must never be committed — `.gitignore` covers `skill-scan*.json`, `scan-*.json`,
`*.scan.json`, and now also the npm `node_modules/` of `dsh/`/`dsh-client/`. The committed
`dsh-client/agent_vitals_wasm_bg.wasm` and `dsh-client/pricing.json` are the deliberate
build-artifact exceptions: the host plugin `readFileSync`s both at runtime (the wasm binary
and the price table `costReport` prices against), `wasm-opt` is disabled so the wasm build
needs no network, and `pricing.json` is a plain `cp` from `scripts/agent_vitals/pricing.json`
— re-copy it by hand whenever the source changes; `tests/test_pricing_lockstep.py`'s
`HostPricingCopyLockstepTests` byte-compares them so a forgotten copy fails loudly instead
of silently pricing off stale numbers.
