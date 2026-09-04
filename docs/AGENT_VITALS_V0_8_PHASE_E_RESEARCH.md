# v0.8 Phase E —— 目录搬迁（apps/ packages/ integrations/ assets/）

> Phase D 的 crate 骨架（`vitals-core` ← `agent-vitals-domain` ← `agent-vitals-hosts`
> ← `agent-vitals-runtime` ← binary/wasm/src-tauri）已到位。Phase E 是**纯目录搬迁**，
> 零逻辑改动——但触到测试 harness 本身（每个 test 的路径、CI workflow、ClawHub 打包
> 清单、golden runner、Python import），所以每步必须一次性搬完（不能半新半旧）。
>
> 与 Phase C/D 同纪律：每 sub-step 独立小提交，全量门禁零漂移。

## Sub-step 分解

```
E1  dsh/ + dsh-client/ → integrations/       ✅ 完成（commit b2738ab）
E2  src-tauri/ → apps/desktop/src-tauri/     ✅ 完成（commit 6335d29）
E3  src/（binary）→ apps/cli/                ✅ 完成（本提交）
E4  scripts/agent_vitals/ → packages/agent-vitals-python/agent_vitals/   [高：~40 test 的 sys.path、scan.py、include_str!、ClawHub 清单]
E5  assets/ 归并（templates/icons/pricing → assets/）                   [中]
E6  CI workflows 路径同步（verify.yml / release.yml / package-clawhub.yml） [低，跟随]
```

### E1 完成记录（2026-09-04）

`git mv dsh integrations/dsh` + `git mv dsh-client integrations/dsh-client`。

- `.gitignore`：`dsh-client/node_modules/` → `integrations/dsh-client/node_modules/`（+ dsh 同）。
- `tests/test_pricing_lockstep.py` / `test_timeline_lockstep.py`：`REPO / "dsh-client"` →
  `REPO / "integrations" / "dsh-client"`；内嵌路径字符串 `dsh-client/pricing.json` /
  `dsh-client/src/…` 同步。
- `tests/test_dsh_bundle.py`：`DSH = ROOT / "dsh"` → `ROOT / "integrations" / "dsh"`；
  `"dsh/SKILL.md"` 字面量 → `"integrations/dsh/SKILL.md"`。
- `.github/workflows/verify-dsh-client.yml`：`dsh-client/**` path filter +
  `working-directory` + `dsh-client/scripts/` → `integrations/dsh-client/…`。
- `README.md`：`[dsh/README.md]` 链接 → `integrations/dsh/README.md`。
- **wasm 拷贝目标**：`wasm-pack build` 后的 `.js`/`.wasm`/`.d.ts` 现在拷进
  `integrations/dsh-client/`（committed build artifact，宿主 `readFileSync` 用）。
- **门禁全绿**：cargo test 32 binary（Rust 无 `dsh-client/` 硬引用）、
  `integrations/dsh-client/scripts/verify{,-host,-timeline}.mjs`、
  python 1145/226 skip、golden 15+15。

### E2 完成记录（2026-09-04）

`git mv src-tauri apps/desktop/src-tauri`（spec §11：`src-tauri` → `apps/desktop/src-tauri`）。

- `apps/desktop/src-tauri/Cargo.toml`：`path = "../crates/…"` → `"../../../crates/…"`（深两级）。
- `tauri.conf.json`：`resources` 里的 `"../target/release/agent-vitals"` →
  `"../../../target/release/agent-vitals"`（CLI 二进制 bundle 成资源，根 `target/` 现在深两级）。
- `crates/vitals-core/tests/dependency_boundary.rs`：跨 workspace 边界检查
  `../../src-tauri/Cargo.toml` → `../../apps/desktop/src-tauri/Cargo.toml`。
- ~8 处 test/script 路径：`tests/test_{host_contract,timeline_lockstep,state_history_rotate}.py`、
  `scripts/{make_menubar_icon,verify-timeline-geometry,verify-codex-session-timeline,
  verify-workbench-fold-bridge}.mjs` 的 `src-tauri/` / `../src-tauri/` → `apps/desktop/src-tauri/`。
- `src-tauri/.gitignore`（`target/` + `gen/`）随目录一起走，无需改。
- **门禁全绿**：cargo test 32 binary、clippy -D warnings、`apps/desktop/src-tauri cargo check`、
  `scripts/verify-*.mjs` 3 个、python 1145/226 skip、golden 15+15。

### E3 完成记录（2026-09-04）

`git mv src apps/cli/src`（spec §11：`src/` → `apps/cli`）。二进制包从根
`[package]` 拆成独立 crate `apps/cli`；根 `Cargo.toml` 退成纯 `[workspace]`
manifest（`[profile.release]` 仍只能在 workspace 根声明，留在根）。

- `apps/cli/Cargo.toml`：新文件，承接根原来的 `[package]`+`[[bin]]`+`[dependencies]`+
  `[dev-dependencies]`；`path = "crates/…"` → `"../../crates/…"`（深两级）。
- `include_str!` 深度 +1（`src/` → `apps/cli/src/`）：`main.rs` 的 calendar 模板
  （`../scripts/…` → `../../scripts/…`）、`codex_cost.rs`/`codex_session_audit.rs`
  的 `../../scripts/…` → `../../../scripts/…`（这两个在 `src/agent/`，深度 +1 更多）。
- `r2a_store.rs` 6 处 `env!("CARGO_MANIFEST_DIR")).join("fixtures")`（fixture 路径）
  插 `.join("../..")`——`CARGO_MANIFEST_DIR` 现在是 `apps/cli/`，仓库根 `fixtures/`
  深两级。
- `crates/agent-vitals-domain/tests/host_contract.rs`：G2 三处源码自扫描的
  `"src/main.rs"` → `"apps/cli/src/main.rs"`。
- Python：`test_classification.py::RS_SRC` = `ROOT / "apps" / "cli" / "src"`；
  `test_host_contract.py::_SCAN_CLI_LOCATIONS` 同款路径。
- **未迁**：`r2a_store.rs`（2708 行）+ `discovery.rs`（733 行）仍在 `apps/cli/src/agent/`
  ——spec §11 说它们该进 `agent-vitals-runtime/state/`，但两者与 CLI 成本/审计
  handler（`codex_session_audit`/`codex_cost`/`claude_cost`）深度交织，强行现在拆
  只会多造 re-export 层。留在 `apps/cli` 是合法终态（它们本来就是 CLI 用的
  「读证据 → 调纯计算 → 出报告」handler），不是欠债——D6 已把真正的**纯 state/ledger**
  层（state/budget/takeover/session_sources）迁进 runtime。
- **门禁全绿**：cargo build/test 32 binary、clippy -D warnings、wasm check、
  `apps/desktop/src-tauri` check、python 1145/226 skip、golden 15+15（workspace
  `target/` 目录不变，golden runner 的 `AGENT_VITALS_BIN=./target/release/agent-vitals`
  路径零改动）。

## 明确不做（同 D 的边界）

v0.7 延期写盘 / migration 框架 / watcher —— 那是功能，不是目录搬迁。
