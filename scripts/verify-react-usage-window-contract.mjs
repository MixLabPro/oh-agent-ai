#!/usr/bin/env node
// Static contract for the Usage page's two independent projections. This is
// intentionally small: the bridge parser is covered by the Overview/Usage
// contract; this guard prevents a UI refactor from silently rejoining an old
// source window to the newly selected calendar month.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(path.join(repo, "apps/desktop/ui-dev/react/src/features/usage/UsagePage.tsx"), "utf8");

for (const marker of [
  "const sourceForDisplayedMonth = source?.month === displayedMonth ? source : null;",
  "const sourceForPanel = source;",
  "当前月份来源摘要不可用或尚未对齐",
  "窗口：{monthTitle(sourceForPanel.month)}",
  "最后观测",
  "sourceForPanel.last_observed_at ?? \"无时间证据\"",
  "未决计费项",
  "不计为账单实付",
  "日历与来源面板独立读取",
]) assert.ok(page.includes(marker), `missing Usage window marker: ${marker}`);

assert.ok(page.includes("spendBasisLabel(sourceForDisplayedMonth.spend_by_basis)"));
assert.ok(page.includes('sourceForPanel.has_unresolved ? "有 · 不计为账单实付"'));
console.log("React Usage window contract: OK (matching summaries, explicit source window, evidence labels)");
