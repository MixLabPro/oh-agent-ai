# agent-vitals 菜单栏（Tauri 2）

macOS 菜单栏应用：托盘图标 + 弹出面板，展示当日/本月成本与预算。

- **后端**：`src/overview.rs` 读数据根的 `state/month.json` + `today.json` +
  `config.toml` 预算，喂给 `agent-vitals-core::cost` 的纯函数
  （`priced_day`/`month_cost`/`today_cost`/`bucket_cost`）。**计价一律在 core**，
  本 crate 不长第四份拷贝。托盘菜单和弹出面板读的是同一个 `read_overview`。
- **前端**：`ui/` 纯 HTML/CSS/JS（ADR-010），`withGlobalTauri: true` 提供
  `window.__TAURI__`，无构建链、无 npm 依赖。
- **交互**：左键单击托盘 → 切换面板（右上角）；右键 → 菜单（打开面板/刷新/退出）。

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

本机没有 `state/month.json`/`today.json` 时，面板显示「—」/「本月还没有数据」，
不摆全零结构；today.json 的 `date` 停在昨天时按「今天无数据」处理（core 的
`today_cost` 判，不是把昨天的账报成今天的）。
