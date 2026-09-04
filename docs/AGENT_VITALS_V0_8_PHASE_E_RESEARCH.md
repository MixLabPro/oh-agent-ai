# v0.8 Phase E —— 目录搬迁（apps/ packages/ integrations/ assets/）

> Phase D 的 crate 骨架（`vitals-core` ← `agent-vitals-domain` ← `agent-vitals-hosts`
> ← `agent-vitals-runtime` ← binary/wasm/src-tauri）已到位。Phase E 是**纯目录搬迁**，
> 零逻辑改动——但触到测试 harness 本身（每个 test 的路径、CI workflow、ClawHub 打包
> 清单、golden runner、Python import），所以每步必须一次性搬完（不能半新半旧）。
>
> 与 Phase C/D 同纪律：每 sub-step 独立小提交，全量门禁零漂移。

## Sub-step 分解

```
E1  dsh/ + dsh-client/ → integrations/       ✅ 完成（本提交）
E2  src-tauri/ → apps/desktop/               [中：Cargo.toml 相对路径 + CI]
E3  src/（binary）→ apps/cli/src/            [中：根 Cargo.toml [[bin]] path + r2a_store/discovery 迁 runtime]
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

## 明确不做（同 D 的边界）

v0.7 延期写盘 / migration 框架 / watcher —— 那是功能，不是目录搬迁。
