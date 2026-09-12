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

## 发布包安装与恢复

正式发布包应从可信 Release 页面下载 `.dmg` 或 `.app.zip`，不要从开发者工作目录
复制应用，也不需要另外安装 Python、CLI 或修改 shell `PATH`。应用内置的
`agent-vitals` 位于包的 `Contents/Resources/bin/`，工作台的诊断页会显示 App、CLI、
Engine、Authority schema、统计时区、价格和同步状态。

本地构建包仅用于开发验证：

```bash
# 从仓库根目录执行
node scripts/verify-macos-app-bundle.mjs

# 按当前机器/CI 目标架构做强校验（示例）
node scripts/verify-macos-app-bundle.mjs --require-architecture=arm64

# 正式发布门禁：要求 Developer ID 签名
node scripts/verify-macos-app-bundle.mjs --require-developer-id
```

前一个检查允许本地 ad-hoc 签名并只作诊断；后一个检查失败时不得宣称安装包已完成
发布。正式 Release 还必须通过 notarization ticket 校验，并附带 `SHA256SUMS`。
当前发布 workflow 的最低 macOS 版本为 11.0；Apple Silicon/Intel 只有在对应架构
产物完成构建和真机验证后才能列入支持矩阵。
当前证据与未支持组合见[macOS 桌面支持矩阵](./SUPPORT_MATRIX.md)。

升级前请保留数据根目录的备份。升级失败时应先保留原数据和诊断包，再回退到上一份
已验证的应用包；不要删除数据库后让应用静默重建。卸载应用本身不会自动删除数据，
如需删除数据必须在用户明确确认范围后单独删除数据根目录。

## 两分钟上手

1. 打开应用并等待工作台完成首轮整理；无需填写套餐、预算、邮箱或 API Key。
2. 在“总览”查看已观测用量、名义成本、来源状态和价格覆盖；没有记录时选择“其他位置”
   或查看演示样例。
3. 若看到“确认计费方式”，只确认你有把握的那一组用量；保存前先查看作用范围和金额变化，
   也可以选择“稍后”。不确认不会删除用量或把成本变成零。
4. 需要排查时打开“帮助与诊断”，保存脱敏诊断包或进入可信版本发布页；应用不会自动上传
   会话正文。

### 金额和状态术语

- **已观测用量**：从本机可读日志归一、去重后得到的 tokens/请求事实，不代表所有设备的用量。
- **名义成本**：使用适用的公共价格目录对已观测用量作参考计算，不等于实际账单。
- **按量估算**：可匹配计费方式和价格的参考金额；provider、路由或历史价格不确定时仍会带有
  不确定标记。
- **已确认支出**：用户提供的账单、付款记录或有明确范围的付款声明；不会由订阅合同自动推导。
- **未计价**：缺少模型、价格或必要计费维度；不等于免费，也不会静默变成零。

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
