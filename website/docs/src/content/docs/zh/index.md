---
title: Oh Agent 是什么？开源的 AI Agent 行为数据分析平台，附带 Agent City
description: Oh Agent 是免费开源的 AI Agent 行为数据分析平台，在你的电脑上本地运行。Agent Vitals 分析 Claude Code、Codex 等会话，Agent City 把它们变成一座 3D 城市，数据不上传。
head:
  - tag: script
    attrs:
      type: application/ld+json
    content: |
      {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "@id": "https://ohagent.ai/#software",
        "name": "Oh Agent",
        "inLanguage": "zh-CN",
        "applicationCategory": "DeveloperApplication",
        "operatingSystem": "macOS 11+、Windows、Linux",
        "softwareVersion": "1.0.0-beta.2",
        "isAccessibleForFree": true,
        "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
        "license": "https://opensource.org/licenses/MIT",
        "url": "https://ohagent.ai/",
        "sameAs": ["https://github.com/MixLabPro/oh-agent-ai", "https://x.com/ohagentai"],
        "description": "开源、本机运行的 AI Agent 行为数据分析平台。底层 Agent Vitals 在你的电脑上采集和分析 Claude Code、Codex 等 Agent 的会话；上层 Agent City 把它们变成一座可以探索的 3D 城市。"
      }
  - tag: script
    attrs:
      type: application/ld+json
    content: |
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          {"@type": "ListItem", "position": 1, "name": "Oh Agent", "item": "https://ohagent.ai/"},
          {"@type": "ListItem", "position": 2, "name": "文档", "item": "https://ohagent.ai/docs/zh"}
        ]
      }
---

Oh Agent 是一个免费开源的 AI Agent 行为数据分析平台。Agent 已经成了每个人工作和生活的一部分，Oh Agent 想让你的 Agent 更有价值。它以桌面应用的形式运行，构建在开源的 **Agent Vitals** 引擎之上，**Agent City** 是这个引擎上的第一个应用：

- **Agent Vitals（底层）**：本机优先的 Agent 行为数据引擎，作为库嵌在应用里（不是服务器，不常驻后台）。Claude Code、Codex 这些 Agent 本来就会在你电脑上留下会话记录。Agent Vitals 读取并解析这些记录，分析出活动、Token、费用估算和行为发现。
- **Agent City（上层）**：基于 Agent Vitals 的数据接口做成的数据可视化开放世界游戏。每次会话是一栋楼，组成一座可以自由探索的 3D 城市。

所有分析都在你的电脑上完成，会话不会上传。

<!-- source: README.md（“What is Oh Agent?”“Your history stays on your machine”及中文段）；定位按 Bear 2026-10-21 的说法 -->
<!-- source: 两层的代码边界与文件路径见 /docs/zh/architecture/overview（“两层在代码里分别在哪？”） -->

## 关键事实

- **版本**：1.0.0-beta.2。截至 2026 年 10 月还没有公开安装包，[GitHub Releases](https://github.com/MixLabPro/oh-agent-ai/releases) 目前是空的。
- **平台（首发）**：会发布 Apple Silicon Mac、Intel Mac、Windows 和 Linux 安装包。Apple Silicon 上的 macOS 验证最充分；Intel / Windows / Linux 在 `SUPPORT_MATRIX.md` 仍未声明支持前，按早期 / 试验版使用。详见[安装](/docs/zh/install)。
- **支持的 Agent**：Claude Code、Codex、DeepSeek Harness、WorkBuddy。
- **一栋楼对应一次会话**，楼高按这次会话的 Token 数取对数后计算。
- **本机运行**：不用注册账号，不用 API Key，会话不上传。
- **许可**：MIT 开源，源码在 [github.com/MixLabPro/oh-agent-ai](https://github.com/MixLabPro/oh-agent-ai)。
- **网页演示**：[ohagent.ai](https://ohagent.ai/) 上跑的是真实的城市前端，数据是 2000 条模拟会话，不会读取你电脑上的任何东西。

<!-- source: apps/desktop/src-tauri/tauri.conf.json（version 1.0.0-beta.2，minimumSystemVersion 11.0） -->
<!-- source: apps/desktop/src-tauri/SUPPORT_MATRIX.md（arm64 候选；x86_64 / Windows / Linux 未声明）；.github/workflows/release-desktop.yml；Bear 2026-10-21：首发全平台 -->
<!-- source: crates/agent-vitals-query/src/sources/watch_topology.rs（四个数据源监听根） -->
<!-- source: website/landing/README.md（Releases 为空；演示 30 天 2000 条模拟会话）；LICENSE -->

## Oh Agent 能看到什么？

- **Agent City**：会话变成数据楼，每种 Agent 占一个城区，Token 多少决定天际线的高低。点一栋楼，就能查看对应的会话。详见[城市里每栋楼代表什么](/docs/zh/city-guide)。
- **活动回放**：在选定的时间范围内回放城市是怎么长起来的。桌面版可以选近 7、30、90 或 366 天。
- **用量视图**：桌面版另有一个页面，按来源和时间查看用量和费用。在城市里，每栋楼的详情会显示估算费用；市政厅等公共建筑可以打开数据面板。

<!-- source: README.md；apps/agent-city/ui/src/CityApp.tsx（windowOptions = [7, 30, 90, 366]）；website/landing/i18n.js faq.6（城市尚未接入费用数据） -->

城市只是把记录画出来，并不是生产力评分。楼更高只说明 Token 更多，不说明活干得更好。

## 数据从哪里来？

Oh Agent 读取的是各个 Agent 自己写在用户目录里的会话日志。比如 Claude Code 的在 `~/.claude/projects`，Codex 的在 `~/.codex/sessions`。各家的具体情况：

- [Claude Code 的会话记录存在哪？Oh Agent 怎么读取](/docs/zh/data-sources/claude-code)
- [Codex 的会话记录存在哪？怎么用 Oh Agent 可视化](/docs/zh/data-sources/codex)
- [DeepSeek Harness](/docs/zh/data-sources/deepseek-harness) · [WorkBuddy](/docs/zh/data-sources/workbuddy)
- 其他 Agent：[添加其他目录和 manifest 数据源](/docs/zh/integrations/custom-sources-and-manifests)

## 它是怎么搭起来的？能扩展吗？

项目以 MIT 协议开源。引擎的 crate、命令行、MCP 工具和 App SDK 见 [Agent Vitals 引擎](/docs/zh/vitals/overview)；Agent Vitals 和 Agent City 怎么配合，见[架构总览](/docs/zh/architecture/overview)；本机 Data MCP 服务、插件和导出，见[集成](/docs/zh/integrations)；想给新的 Agent 加支持，见[添加数据源](/docs/zh/contributing/adding-a-data-source)。

## 我的数据安全吗？

会话在本机分析，不会上传。应用只会为几件事联网，比如获取公开的价格表、检查新版本，这些请求都不带你的数据。详见[Oh Agent 会上传我的会话吗？](/docs/zh/privacy-and-data)，以及[隐私政策](/zh/privacy)。

## 怎么安装？

公开安装包还在准备中。系统要求、首发会覆盖哪些平台，以及开发者现在怎么从源码构建，见[安装 Oh Agent](/docs/zh/install)。

## 更多

- [Agent City 介绍](/zh/city) · [下载](/zh/download) · [常见问题](/zh/faq)
- 关于名字：对外品牌叫 **Oh Agent**，桌面应用叫 `Oh Agent.app`；命令行工具和数据目录内部还叫 `agent-vitals`，不用手动改名。

<!-- source: README.md（“对外品牌为 Oh Agent，内部 CLI、路径和应用标识暂时保留 agent-vitals，无需手工迁移或改名数据目录”） -->
