# agent-vitals 菜单栏（Tauri 2）

macOS 菜单栏应用：托盘图标 + 工作台主窗口，展示当日/本月成本与预算。

- **后端**：`src/overview.rs` 读数据根的 `state/month.json` + `today.json` +
  `config.toml` 预算，喂给 `agent-vitals-core::cost` 的纯函数
  （`priced_day`/`month_cost`/`today_cost`/`bucket_cost`）。**计价一律在 core**，
  本 crate 不长第四份拷贝。托盘菜单和工作台"总览"tab 读的是同一个
  `read_overview`。
- **前端**：`ui/` 纯 HTML/CSS/JS（ADR-010），`withGlobalTauri: true` 提供
  `window.__TAURI__`，无构建链、无 npm 依赖。
- **交互**：左右键点托盘图标都弹同一个菜单（今日/本月/预算/打开工作台/立即
  同步/退出）——跟多数状态栏图标的通用手势一致，不再区分左右键语义。
  2026-09-01 之前这里还有一个独立的弹出小面板（`toggle_window`，右键单独弹、
  内容是"总览"tab 的严格子集）；面板本身对着菜单里的"打开工作台…"就已经冗余
  （内容更少），统一左右键手势之后它又连入口都没有了，所以连同
  `ui/index.html`/`main.js`/`style.css`、`hide_window` IPC、`tauri.conf.json`
  的 `overview` 窗口条目一起删除——只剩工作台一个窗口。

## 构建

```bash
# 图标：从 1024×1024 源图派生全部尺寸（icons/ 已提交，改源图后需重跑）
cargo tauri icon icons/icon-source.png

# 开发
cargo tauri dev

# 出仓：产出 .app / .dmg
cargo tauri build
# 产物在 target/release/bundle/ 下
```

菜单栏图标与 App Icon 分离：`icons/trayTemplate.svg` 是选定 Swept Crest 的
单色源图，导出为 22×18px / 44×36px PNG；Rust 内嵌 `trayTemplate@2x.png` 并开启
`icon_as_template(true)`，由 macOS 自动适配明暗、选中和辅助功能状态。

独立 workspace（`[workspace]` 空表 opt-out）：根仓库的 `cargo test`/`clippy`
不编译 tauri。数据根解析与北京日期键是管道（与 `paths.py`/`codex_cost.rs` 同 spec，
单测钉住），不是规则。

## 空态是诚实的

本机没有 `state/month.json`/`today.json` 时，工作台"总览"tab 显示「—」/
「本月还没有数据」，不摆全零结构；today.json 的 `date` 停在昨天时按「今天无
数据」处理（core 的 `today_cost` 判，不是把昨天的账报成今天的）。
