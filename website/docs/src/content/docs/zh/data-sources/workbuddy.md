---
title: Oh Agent 怎么读取 WorkBuddy 的会话？
description: Oh Agent 从 ~/.workbuddy/traces 下的 trace 文件读取 WorkBuddy 用量，在 Agent City 里建成 WorkBuddy 城区。不支持添加其他目录，同步时也不做行为检查。
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
          {"@type": "ListItem", "position": 3, "name": "WorkBuddy 数据来源", "item": "https://ohagent.ai/docs/zh/data-sources/workbuddy"}
        ]
      }
---

对 WorkBuddy，Agent Vitals 在你的 Mac 上读取 `~/.workbuddy/traces/` 下的 `trace_*.json` 文件获取用量。每个 WorkBuddy 会话会成为 Agent City 里 WorkBuddy 城区的一栋楼。WorkBuddy 的支持范围比其他内置数据源窄：不能添加其他目录，同步时不做行为检查，会话也暂时没有标题。

## 关键事实

- **位置**：`~/.workbuddy/`（固定，不看环境变量）。
- **用量文件**：`~/.workbuddy/traces/` 下的 `trace_*.json`。
- **会话审计**（命令行 `workbuddy-session`）还会读 `workbuddy.db`（`sessions`、`session_usage` 表）和 `audit-log/*.jsonl`。
- **其他目录**：不支持。
- **行为发现**：正常同步时没有。
- **标题**：暂时没有。标题存在 `workbuddy.db` 里，还没接入。

<!-- source: workbuddy/sources/mod.rs; workbuddy/sources/traces.rs; session_harnesses.rs (workbuddy: accepts_custom_roots false, findings None, title_index None); custom_sources.rs -->

## WorkBuddy 的费用怎么显示？

WorkBuddy 用自己的积分计费。Oh Agent 把积分就记为积分，不当作钱。按公开加量包价格折算的名义人民币（积分 × 0.05）只放在名义栏，永远不当作实付；本机没有支付证据，所以实付栏保持为空。

<!-- source: workbuddy/sources/mod.rs module doc (credits; cash_cny 恒 null; nominal_cny = credits × 0.05) -->

**待确认**：补上 WorkBuddy 官网链接，并确认哪些 WorkBuddy 版本会写 `traces/`。

## 相关

- [数据管线](/docs/zh/architecture/data-pipeline)
- [DeepSeek Harness 数据来源](/docs/zh/data-sources/deepseek-harness)
- [集成总览](/docs/zh/integrations)
