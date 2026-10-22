---
title: 如何安装 Oh Agent？系统要求与发布进度
description: Oh Agent 1.0.0-beta.2 首发会发布 Apple Silicon Mac、Intel Mac、Windows 和 Linux 安装包。这里说明进度、产物文件名、各平台成熟度和源码构建方法。
head:
  - tag: script
    attrs:
      type: application/ld+json
    content: |
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          {"@type": "ListItem", "position": 1, "name": "Oh Agent", "item": "https://ohagent.ai/"},
          {"@type": "ListItem", "position": 2, "name": "文档", "item": "https://ohagent.ai/docs/zh"},
          {"@type": "ListItem", "position": 3, "name": "安装", "item": "https://ohagent.ai/docs/zh/install"}
        ]
      }
---

现在还没有可以直接下载的 Oh Agent 安装包。1.0.0-beta.2 正在做发布准备，[GitHub Releases](https://github.com/MixLabPro/oh-agent-ai/releases) 目前是空的。**首次公开发布**计划提供 **Apple Silicon Mac、Intel Mac、Windows 和 Linux** 的安装包。目前验证最充分的是 Apple Silicon 上的 macOS；其余平台按早期 / 试验版发布。开发者现在就可以从源码自己构建。

:::caution[发布进度]
截至 2026 年 10 月，**还没有公开的、经过签名的安装包**。自己构建出来的只是本地开发版；在 macOS 上没有 Developer ID 签名，也没有经过公证。**待确认**：正式发布当天更新本页，补上各平台的下载链接和安装步骤。
:::

<!-- source: website/landing/README.md；2026-10-20 GitHub API releases 返回 [] -->
<!-- source: README.md（本地可构建不等于已完成签名、公证和正式发布） -->
<!-- 决策：Bear，2026-10-21 — 10/27 首发从 MixLabPro/oh-agent-ai 的 dev 分支发布 Apple Silicon Mac、Intel Mac、Windows、Linux 安装包 -->

## 关键事实

- **当前版本**：1.0.0-beta.2，尚未公开发布。
- **首发会发布的安装包**：Apple Silicon Mac、Intel Mac、Windows（x64）、Linux（x64）。
- **macOS**：11.0 及以上（`tauri.conf.json` 的 `minimumSystemVersion`）。
- **Apple Silicon（arm64）**：验证最充分；SUPPORT_MATRIX 状态是「候选验证中」。
- **Intel Mac（x86_64）、Windows、Linux**：发布流程会产出安装包，但 SUPPORT_MATRIX **仍未声明支持**。请按 **早期 / 试验版** 使用。**待确认**：各平台已知问题；真机验收后再更新。
- **价格**：免费，MIT 开源。
- **校验**：每次发布都会附带 `SHA256SUMS`。

<!-- source: apps/desktop/src-tauri/tauri.conf.json；apps/desktop/src-tauri/SUPPORT_MATRIX.md（对照 worktree bf7196a；矩阵文字落后于当前 CI/发布流程） -->
<!-- source: .github/workflows/release-desktop.yml；.github/workflows/desktop-platforms.yml -->

## 首发会发布哪些文件？

公开文件名来自发布流程（版本号 = 应用版本，不带 `app-v` 前缀，必须与 `tauri.conf.json` 一致）：

| 平台 | 公开产物名 |
| --- | --- |
| macOS Apple Silicon | `Oh-Agent-<版本>-macos-arm64.dmg` 和 `Oh-Agent-<版本>-macos-arm64.app.zip` |
| macOS Intel | `Oh-Agent-<版本>-macos-x64.dmg` 和 `Oh-Agent-<版本>-macos-x64.app.zip` |
| Windows x64 | `Oh-Agent-<版本>-windows-x64-setup.exe` |
| Linux x64 | `Oh-Agent-<版本>-linux-x64.deb` 和 `Oh-Agent-<版本>-linux-x64.AppImage` |
| 全部 | `SHA256SUMS` |

在 macOS 上，装好后的应用是 `Oh Agent.app`（bundle identifier 为 `ai.ohagent.desktop`）。Windows 的 NSIS 安装包在 CI 里会校验显示名以 `Oh Agent` 开头；Linux 的 `.desktop` 条目是 `Name=Oh Agent`。随包附带的命令行工具仍叫 `agent-vitals` / `agent-vitals.exe`。

<!-- source: .github/workflows/release-desktop.yml（约 233–259 行；注释引用 docs/OH_AGENT_BRAND_RENAME_PLAN.md §2） -->
<!-- source: .github/workflows/desktop-platforms.yml -->

## 各平台成熟度（重要）

`apps/desktop/src-tauri/SUPPORT_MATRIX.md` 只记录已有构建 **和** 验收证据的组合。文档对照的 worktree 提交是 `bf7196a`：

- **macOS 11+ / Apple Silicon（`arm64`）**：「候选验证中」——本地 `.app` 与随包 CLI 均为 arm64；架构预检、CLI `--version` 和 Vite/Workbench 验证已通过。正式发布仍需 Developer ID、公证、干净机安装 / 升级 / 恢复，以及资源性能验收。
- **macOS 11+ / Intel（`x86_64`）**：矩阵写 **未支持**（「尚无本机或 CI 产物证据」）。但发布流程已在 `macos-15-intel` runner 上构建并发布 `macos-x64` 产物，矩阵文字落后于 CI。在矩阵更新、真机验收完成前，文档按 **早期 / 试验版** 写。**待确认**：Intel 已知问题。
- **Windows / Linux**：矩阵明确 **不声明** 桌面版。`desktop-platforms.yml` 会构建并在 CI 里冒烟测试 NSIS / deb / AppImage，`release-desktop.yml` 会上传它们。文档按 **早期 / 试验版** 写。**待确认**：Windows、Linux 已知问题；除 Tauri 依赖外的系统版本下限。

不声明 universal binary。

<!-- source: apps/desktop/src-tauri/SUPPORT_MATRIX.md（全文） -->
<!-- source: .github/workflows/release-desktop.yml；.github/workflows/desktop-platforms.yml -->

## 安装包什么时候能下载？

**待确认。**要等签名（macOS 的 Developer ID 与公证）、打包，以及你关心的平台上的干净机检查通过后才会发布。想第一时间知道：

- 在 [GitHub](https://github.com/MixLabPro/oh-agent-ai) 上订阅 Releases（Watch → Custom → Releases）。
- 在 X 上关注 [@ohagentai](https://x.com/ohagentai)。
- 留意[下载区](https://ohagent.ai/#download)。

<!-- source: apps/desktop/src-tauri/SUPPORT_MATRIX.md（正式发布条件） -->

## 发布之后怎么安装？

从 Releases 页面下载与你的系统和 CPU 匹配的文件，再用 `SHA256SUMS` 校验。应用里自带 `agent-vitals` 命令行工具，不用另外装 Python 或命令行工具，也不用改 `PATH`（macOS 应用包有文档说明；Windows / Linux 除 CI 冒烟测试外 **待确认**）。**待确认**：各平台的分步说明和截图，要拿真实的发布包实际操作后再写。

<!-- source: apps/desktop/src-tauri/README.md；.github/workflows/desktop-platforms.yml -->

## 不安装能先试试吗？

可以，但只能体验一部分。[ohagent.ai 上的网页演示](https://ohagent.ai/)跑的是真实的城市前端，数据是 2000 条模拟会话（30 天范围）。它不读取你的日志，也隐藏了游戏、导出和种子相关的控件。

<!-- source: website/landing/README.md -->

## 开发者现在怎么从源码构建？

仓库里写得最清楚的是本地 **macOS** 构建。你需要较新的 Node.js 和 npm、稳定版 Rust、Tauri 的平台依赖，以及 Tauri CLI。在仓库根目录执行：

```sh
# 命令行工具
cargo build --release
./target/release/agent-vitals --help

# 本地构建 macOS .app
npm ci --prefix apps/desktop/ui-dev
npm ci --prefix apps/agent-city/ui
bash scripts/build-macos-react-app.sh

# 打开应用包（不要直接运行菜单栏的可执行文件）
open "apps/desktop/src-tauri/target/release/bundle/macos/Oh Agent.app"
```

构建出来的是本地签名的测试包，只能用于开发。更多细节见[桌面版 README](https://github.com/MixLabPro/oh-agent-ai/blob/dev/apps/desktop/src-tauri/README.md)。**待确认**：用同样清晰的方式补上 Windows / Linux 的本地构建步骤（CI 已在跑 `cargo tauri build`，bundle 为 `nsis` / `deb,appimage`）。

<!-- source: README.md；.github/workflows/desktop-platforms.yml -->
<!-- 注：apps/desktop/src-tauri/README.md 写的是 scripts/build-macos-app.sh，根 README 写的是 scripts/build-macos-react-app.sh，两个脚本都存在，请维护者确认以哪个为准 -->

## 为什么装好后还能看到 agent-vitals？

应用的显示名是 Oh Agent。随应用附带的命令行工具、部分内部路径和数据目录 `~/.agent-vitals/`（macOS / Linux）仍沿用早期名字 `agent-vitals`，不要手动改名。你的数据不和应用标识绑定，位置不变。

如果你装过名叫 `agent-vitals.app`（标识 `com.mixlabpro.agent-vitals`）的 macOS 预发布版本，请退出并删除它，否则菜单栏会出现两个图标。**待确认**：从旧版本升级还没在真机上测过；**待确认**：Windows / Linux 从旧包名升级的路径。

<!-- source: README.md；tauri.conf.json；CLAUDE.md；commit 5c29146 -->

## 打开之后呢？

Oh Agent 会直接读取各个 Agent 已有的日志，不用注册账号，也不用 API Key。系统可能会请你允许它读取相关目录。接下来可以看：

- [Claude Code 数据来源](/docs/zh/data-sources/claude-code) · [Codex 数据来源](/docs/zh/data-sources/codex)
- [Agent City 里的楼代表什么](/docs/zh/city-guide)
- [Oh Agent 会上传我的会话吗？](/docs/zh/privacy-and-data)
- [常见问题](https://ohagent.ai/#faq)
