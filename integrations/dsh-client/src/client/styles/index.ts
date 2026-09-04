// Design tokens mirroring --dsw-alias-* / --dsw-font-* CSS vars.
// This is the single source of truth for every styled component.
export const T = {
  fg: 'var(--dsw-alias-label-primary)',
  muted: 'var(--dsw-alias-label-secondary)',
  dimmed: 'var(--dsw-alias-label-tertiary)',
  border: 'var(--dsw-alias-border-l1)',
  trackBg: 'var(--dsw-alias-bg-layer-2)',
  accent: 'var(--dsw-alias-state-business-primary)',
  success: 'var(--dsw-alias-state-success-primary)',
  error: 'var(--dsw-alias-state-error-primary)',
  warn: 'var(--dsw-alias-state-warn-primary)',
  fontProse: 'var(--dsw-font-s-14)',
  fontSmall: 'var(--dsw-font-xs-13)',
  fontMono: 'var(--dsw-font-markdown-code-block)',
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
}

export function tint(colorVar: string, pct: number): string {
  return `color-mix(in srgb, ${colorVar} ${pct}%, transparent)`
}

// Severity glyph/color are locale-independent; labels live in i18n.ts
// (severityLabel) since they're user-facing text.
export const SEVERITY = {
  critical: { glyph: '✕', color: 'var(--dsw-alias-state-error-primary)' },
  warning: { glyph: '⚠', color: 'var(--dsw-alias-state-warn-primary)' },
  info: { glyph: '·', color: T.accent },
} as const

export const SEVERITY_ORDER = ['critical', 'warning', 'info'] as const

// labelKey resolves through i18n.ts's t() — TokenBar has no static Chinese
// label to fall back on, so its lang prop is required, not optional.
export const TOKEN_SEGMENTS = [
  { key: 'in', labelKey: 'inputLabel', pick: (u: any) => u.uncachedInputTokens || 0, opacity: 1 },
  { key: 'out', labelKey: 'outputLabel', pick: (u: any) => u.outputTokens || 0, opacity: 0.72 },
  { key: 'cr', labelKey: 'cacheReadLabel', pick: (u: any) => u.cacheReadTokens || 0, opacity: 0.46 },
  { key: 'cw', labelKey: 'cacheWriteLabel', pick: (u: any) => u.cacheWriteTokens || 0, opacity: 0.24 },
]

// DeepSeek pricing, for DISPLAY only (model short-name lookup in normalizeModel/
// modelShort below) — actual cost math now runs host-side in dsh-client/src/
// host/index.ts, which reads the real scripts/agent_vitals/pricing.json
// directly (Node can; the browser can't, hence this baked copy still exists).
// Values must still match pricing.json exactly — guarded by
// tests/test_pricing_lockstep.py.
export const PRICING: Record<string, { inputUncached: { off: number; peak: number }; inputCached: { off: number; peak: number }; output: { off: number; peak: number } }> = {
  'deepseek-v4-flash': {
    inputUncached: { off: 1.5, peak: 3.0 },
    inputCached: { off: 0.05, peak: 0.10 },
    output: { off: 4.5, peak: 9.0 },
  },
  'deepseek-v4-pro': {
    inputUncached: { off: 4.5, peak: 9.0 },
    inputCached: { off: 0.15, peak: 0.30 },
    output: { off: 13.5, peak: 27.0 },
  },
}

export function normalizeModel(model: string | undefined): string | null {
  if (!model) return null
  const seg = String(model).split('/').pop()
  if (!seg) return null
  for (const key in PRICING) {
    if (seg === key || seg.startsWith(key)) return key
  }
  return null
}

export function modelShort(model: string): string {
  const norm = normalizeModel(model)
  if (norm) return norm
  return truncate(String(model || '').split('/').pop() || '', 24)
}

export function truncate(s: string, max = 48): string {
  if (!s || s.length <= max) return s
  const head = Math.ceil((max - 1) * 0.6)
  const tail = max - 1 - head
  return s.slice(0, head) + '…' + s.slice(-tail)
}

export function formatNumber(n: number | undefined | null): string | null {
  if (n === undefined || n === null) return null
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(n)
}

// D7/D8：毫秒 → 人类可读时长（"420ms"/"1.2s"/"2m 5s"）。null 安全，同
// formatNumber/formatMoney 的约定——"没有数"必须能返回 null 而不是伪造一个 0。
export function formatDuration(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined) return null
  if (ms < 1000) return ms + 'ms'
  if (ms < 60000) return (ms / 1000).toFixed(1).replace(/\.0$/, '') + 's'
  const totalSec = Math.round(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return m + 'm' + (s > 0 ? ' ' + s + 's' : '')
}

export function formatMoney(n: number | null | undefined): string | null {
  if (n === null || n === undefined) return null
  const s = n >= 100 ? n.toFixed(1) : n.toFixed(2)
  return '¥' + s.replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1')
}

// ── Styles string (injected as <style> tag) ────────────────────────────────
// Kept as a string constant; actual CSS lives here so components stay pure.
//
// 为什么结论区/成本表用 class 而不是内联 style：这两块需要 `@media`（窄屏
// 三栏塌成两栏）、`:hover`、`[aria-expanded]` 选择器——**内联 style 表达不了
// 其中任何一个**。findings 那几个组件暂时保留内联 style，等它们自己那一期
// 再迁；混着写是有意的过渡态，不是遗漏。
export const STYLES = `
/* T12: skill 事件颜色（原本 hardcoded #60a5fa / #c084fc）。在 brand-spec 定义
   --dsw-alias-skill-* 之前用 CSS 变量守住这个取值点；两个值都在这儿定义，
   不是散在组件里。
   D12：--sv-status-failed 同一个理由——SkillSection.tsx（T8）的 LoadBadge
   与 DurationSection.tsx（D7）的 StatusBadge 都要给"失败"这个状态上色，
   原来是 SkillSection 先写死了 #f87171，D7 又原样抄了一份；这次把它提成
   变量、两处一起改用，不然下次改色又要改两个文件里两份写死的十六进制。 */
[data-audit-view], [data-audit-view] * {
  --sv-skill-explicit: #60a5fa;
  --sv-skill-model: #c084fc;
  --sv-status-failed: #f87171;
}
[data-audit-view] {
  padding: 24px 24px;
  /* P1-01：底部固定 Composer 会盖住滚动到底部的内容——插件读不到宿主
     Composer 的实际高度（没有暴露对应的 --dsw-* 变量或 API），只能按常见
     单行输入框高度打一个保守估算再加安全边距；如果宿主 Composer 显著更高
     （比如展开成多行），这个值需要跟着调大，暂时没有信号能自动感知这个。 */
  padding-bottom: 144px;
  color: var(--dsw-alias-label-primary);
  font: var(--dsw-font-s-14);
  line-height: 1.5;
}
[data-audit-view] * { box-sizing: border-box; }
[data-audit-cost] { }
[data-audit-tokens] { }
[data-audit-findings] { }

/* ── 结论区 ─────────────────────────────────────────────────────── */
.sv-verdict {
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 24px;
}
/* **按容器自适应，不按 viewport**。审计 Tab 活在 DSH 侧边栏旁边的内容列里：
   viewport 1512px 时内容区已经只有 1224px，320px viewport 下侧边栏会吃掉绝
   大部分宽度。用 @media 写断点根本不对症——实测 320px 容器下四栏仍然是四栏，
   每张卡只剩 80px。auto-fit + minmax 直接看容器有多宽，四栏 → 二栏 → 单栏
   自动降级，不需要知道 viewport。 */
.sv-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(168px, 1fr));
}
/* auto-fit 换行后，用 1px 外描边 + 容器裁切画网格线：不管一行摆几张卡，
   都不会出现悬空的竖线或缺失的横线（用 border-right 做不到这一点）。 */
.sv-metric {
  padding: 14px 18px;
  min-width: 0;
  outline: 1px solid var(--dsw-alias-border-l1);
}
.sv-metric-label {
  font: var(--dsw-font-xs-13);
  color: var(--dsw-alias-label-secondary);
}
.sv-metric-value {
  margin-top: 4px;
  overflow-wrap: anywhere;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.02em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.sv-metric-value.sv-num {
  font-family: var(--dsw-font-markdown-code-block);
  font-variant-numeric: tabular-nums;
  font-size: 17px;
}
.sv-metric-note {
  margin-top: 3px;
  font: var(--dsw-font-xs-13);
  color: var(--dsw-alias-label-secondary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
/* P1-02：KPI 卡钻取——整卡是一个真实 <button>，先 all:unset 抹掉浏览器的
   按钮默认外观（居中文字、内置内边距等），再用后面的声明按 .sv-metric 原样
   重铺一次，视觉上和纯展示的卡片没有差别，只是多了 hover/focus/pressed。 */
.sv-metric-btn {
  all: unset;
  display: block; box-sizing: border-box; width: 100%;
  padding: 14px 18px; min-width: 0;
  outline: 1px solid var(--dsw-alias-border-l1);
  cursor: pointer; text-align: left; font: inherit; color: inherit;
}
.sv-metric-btn:hover { background: var(--dsw-alias-bg-layer-2); }
.sv-metric-btn:active { background: var(--dsw-alias-bg-layer-2); }
.sv-metric-btn:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: -2px;
}
.sv-metric-chevron {
  margin-top: 4px;
  color: var(--dsw-alias-state-business-primary);
  font: var(--dsw-font-xs-13);
}
.sv-linkbtn {
  border: 0; background: none; padding: 0;
  color: var(--dsw-alias-state-business-primary);
  font: inherit; cursor: pointer;
}
.sv-linkbtn:hover { text-decoration: underline; }
.sv-linkbtn:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 2px; border-radius: 3px;
}
/* 展开的「这个数怎么来的」。默认收起——用 hidden 属性而不是 class 切换，
   读屏软件也跟着一起隐藏。 */
.sv-detail {
  padding: 12px 18px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  font: var(--dsw-font-xs-13);
  color: var(--dsw-alias-label-secondary);
  line-height: 1.65;
}
.sv-detail[hidden] { display: none; }
.sv-detail b { color: var(--dsw-alias-label-primary); font-weight: 600; }
.sv-detail code {
  font-family: var(--dsw-font-markdown-code-block);
  color: var(--dsw-alias-label-primary);
}

/* ── 成本明细表 ─────────────────────────────────────────────────── */
.sv-costwrap { overflow-x: auto; margin-top: 8px; }
.sv-costtable {
  border-collapse: collapse;
  width: 100%;
  min-width: 460px;
  font: var(--dsw-font-xs-13);
}
.sv-costtable th, .sv-costtable td {
  padding: 7px 10px 7px 0;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  text-align: right;
  white-space: nowrap;
}
.sv-costtable th:first-child, .sv-costtable td:first-child {
  text-align: left; padding-left: 0;
}
.sv-costtable th {
  color: var(--dsw-alias-label-tertiary);
  font-weight: 400;
}
.sv-costtable tbody tr:last-child td { border-bottom: 0; }
.sv-costtable td.sv-num {
  font-family: var(--dsw-font-markdown-code-block);
  font-variant-numeric: tabular-nums;
}
.sv-costtable td.sv-total { font-weight: 600; }
.sv-insight {
  margin-top: 10px;
  font: var(--dsw-font-xs-13);
  color: var(--dsw-alias-label-secondary);
  line-height: 1.65;
}
.sv-insight b { color: var(--dsw-alias-label-primary); font-weight: 600; }

/* ── P1-06 一级区块（会话资源概览 / 会话健康时间线 / 上下文归因与优化线索 /
   Finding 队列）── 统一外边距 + 1px 低对比分隔线的标题，替代原来逐块手动
   记账要不要插一条 <Divider>。刻意不加阴影或高饱和色块——保持 DSH 原生的
   克制感，只用背景弱一档的 --dsw-alias-bg-layer2 区分"这几个小块同属一个
   一级区块"。 */
.sv-section { margin-top: 32px; }
.sv-section:first-child { margin-top: 0; }
.sv-section-header {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 12px; padding-bottom: 8px; margin-bottom: 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.sv-section-title {
  margin: 0; font: var(--dsw-font-s-14); font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
/* "上下文归因与优化线索"内部的常驻前缀构成/结构性浪费/子代理——弱背景 +
   8px 圆角的软卡片，不是阴影卡片，一眼能看出"同属一组"又不抢 Finding
   队列的视觉重量。 */
.sv-subcard {
  margin-top: 16px; padding: 16px 18px;
  background: var(--dsw-alias-bg-layer-2); border-radius: 8px;
}
.sv-subcard:first-child { margin-top: 0; }

/* ── 会话健康时间线 ─────────────────────────────────────────────── */
/* margin-top 归零：这个类现在总是被 .sv-section 或 .sv-subcard 包一层，
   外边距交给外层统一节奏，这里再叠一份会让间距对不上设计稿的 16/32px。 */
.sv-panel { margin-top: 0; }
.sv-panel-head {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 12px; flex-wrap: wrap; margin-bottom: 8px;
}
.sv-panel-sub {
  font: var(--dsw-font-xs-13);
  color: var(--dsw-alias-label-secondary);
  margin-top: 2px;
}
.sv-seg {
  display: inline-flex; gap: 2px; padding: 3px;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
}
.sv-seg button {
  border: 0; background: transparent; border-radius: 5px;
  padding: 4px 10px; font: var(--dsw-font-xs-13);
  color: var(--dsw-alias-label-secondary); cursor: pointer;
}
.sv-seg button:hover { color: var(--dsw-alias-label-primary); }
.sv-seg button[aria-pressed="true"] {
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent);
  color: var(--dsw-alias-state-business-primary); font-weight: 600;
}
.sv-seg button:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 1px;
}
.sv-legend {
  display: flex; flex-wrap: wrap; gap: 8px 16px;
  font: var(--dsw-font-xs-13); color: var(--dsw-alias-label-secondary);
  margin-bottom: 8px;
}
.sv-legend span { display: inline-flex; align-items: center; gap: 5px; }
.sv-legend i { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.sv-chartwrap {
  border-top: 1px solid var(--dsw-alias-border-l1);
  padding-top: 10px;
}
.sv-chart { display: block; width: 100%; height: auto; overflow: visible; }
.sv-axis {
  fill: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  font-family: var(--dsw-font-markdown-code-block);
}
.sv-grid { stroke: var(--dsw-alias-border-l1); stroke-width: 1; }
.sv-line {
  fill: none; stroke: var(--dsw-alias-state-business-primary);
  stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
}
.sv-area { fill: color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent); }
.sv-event { cursor: pointer; }
.sv-event circle, .sv-event rect { stroke: var(--dsw-alias-bg-layer-1); stroke-width: 1.5; }
.sv-event:hover circle, .sv-event:hover rect { stroke: var(--dsw-alias-label-primary); stroke-width: 2; }
.sv-event:focus-visible { outline: none; }
.sv-event:focus-visible circle, .sv-event:focus-visible rect {
  stroke: var(--dsw-alias-state-business-primary); stroke-width: 2.5;
}
.sv-chart:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px;
}
.sv-legend-btn {
  display: inline-flex; align-items: center; gap: 5px;
  border: 0; background: none; padding: 0; cursor: pointer;
  color: inherit; font: inherit;
}
.sv-legend-btn[aria-pressed="false"] {
  color: var(--dsw-alias-label-tertiary); text-decoration: line-through;
}
.sv-legend-btn:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px;
}
/* 十字游标。固定态实线 + 更粗，hover 态虚线——选中状态不只靠颜色。 */
.sv-cursor line {
  stroke: var(--dsw-alias-label-tertiary); stroke-width: 1;
}
.sv-cursor circle {
  fill: var(--dsw-alias-state-business-primary);
  stroke: var(--dsw-alias-bg-layer-1); stroke-width: 1.5;
}
.sv-cursorinfo {
  margin-top: 6px; padding: 6px 10px;
  border-radius: 6px; background: var(--dsw-alias-bg-layer-2);
  font: var(--dsw-font-xs-13); color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere; min-height: 1.6em;
}
.sv-cursorinfo-pinned {
  color: var(--dsw-alias-label-primary);
  box-shadow: inset 2px 0 0 var(--dsw-alias-state-business-primary);
}
/* P1-07 问题 3：小屏默认摘要 + 展开入口。按**容器**宽度而不是 viewport
   （同 .sv-metrics 那条已有的理由）——container query 而不是 JS 量宽度，
   跟这个代码库"不猜视口、只认容器"的一贯做法一致。摘要与完整图表两块都
   在 DOM 里，容器查询只切可见性；手动"展开"是一个更高优先级的类，覆盖
   容器查询的默认判断（两条规则类选择器数量不同，天然不需要 !important）。 */
.sv-timeline-cq { container-type: inline-size; }
.sv-chart-summary { display: none; }
@container (max-width: 480px) {
  .sv-chart-summary { display: block; }
  .sv-chart-full { display: none; }
}
.sv-timeline-cq.sv-timeline-expanded .sv-chart-full { display: block; }
.sv-timeline-cq.sv-timeline-expanded .sv-chart-summary { display: none; }
.sv-event-list { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; }
.sv-event-list-item {
  display: flex; align-items: baseline; gap: 6px;
  text-align: left; border: none; background: none; padding: 4px 0;
  color: var(--dsw-alias-label-primary); font: var(--dsw-font-xs-13); cursor: pointer;
  min-height: 32px;
}
.sv-event-list-item:hover { text-decoration: underline; }
.sv-event-list-item:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 1px;
}

.sv-chartfoot {
  display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  font: var(--dsw-font-xs-13); color: var(--dsw-alias-label-tertiary);
  margin-top: 6px;
}

/* ── 上下文构成（三行实测） ─────────────────────────────────────── */
.sv-comp { display: grid; gap: 7px; margin-top: 10px; }
.sv-comp-row {
  display: grid; grid-template-columns: 88px 1fr 68px; gap: 10px; align-items: center;
  font: var(--dsw-font-xs-13); color: var(--dsw-alias-label-secondary);
}
.sv-comp-row b {
  color: var(--dsw-alias-label-primary); text-align: right; font-weight: 500;
  font-family: var(--dsw-font-markdown-code-block); font-variant-numeric: tabular-nums;
}
.sv-comp-track {
  height: 6px; border-radius: 99px; overflow: hidden;
  background: var(--dsw-alias-bg-layer-2);
}
.sv-comp-track i {
  display: block; height: 100%; border-radius: 99px;
  background: var(--dsw-alias-state-business-primary);
}
.sv-comp-row:nth-child(2) .sv-comp-track i { opacity: .74; }
.sv-comp-row:nth-child(3) .sv-comp-track i { opacity: .5; }

/* ── 子代理列表 ─────────────────────────────────────────────────── */
.sv-sublist { display: grid; gap: 4px; margin-top: 8px; }
.sv-subrow {
  display: grid;
  /* 7 列：turn / desc / tokens / cost / duration / findings / action。
     findings 是新加的第 6 列（P2-01：数据早就有，只是没渲染出来，见
     SubagentSection.tsx 的同一处注释）。 */
  grid-template-columns: 40px minmax(0, 1fr) 62px 62px 62px 40px auto;
  gap: 10px; align-items: baseline;
  font: var(--dsw-font-xs-13);
  padding: 3px 0;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.sv-subrow:last-child { border-bottom: 0; }
.sv-subturn { color: var(--dsw-alias-label-tertiary); font-family: var(--dsw-font-markdown-code-block); }
.sv-subdesc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-primary); }
.sv-subnum {
  text-align: right; font-family: var(--dsw-font-markdown-code-block);
  font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-secondary);
}
@media (max-width: 520px) {
  .sv-subrow { grid-template-columns: 40px minmax(0, 1fr) 62px; }
  /* cost / duration / findings 各自单独一行、都右对齐在第 3 列；action 再
     另起一行横跨 desc/tokens 的宽度——同一种"每加一列多占一行"的堆叠。 */
  .sv-subrow > :nth-child(4) { grid-column: 3; text-align: right; }
  .sv-subrow > :nth-child(5) { grid-column: 3; text-align: right; }
  .sv-subrow > :nth-child(6) { grid-column: 3; text-align: right; }
  .sv-subrow > :nth-child(7) { grid-column: 2 / -1; }
}

/* ── 子代理"流程图"视图（同一份 spawns 数据的图形化呈现）───────────── */
.sv-flow-chartwrap {
  border-top: 1px solid var(--dsw-alias-border-l1);
  padding-top: 10px; margin-top: 8px;
}
.sv-flow-chart { display: block; width: 100%; height: auto; overflow: visible; }
.sv-flow-edge { stroke: var(--dsw-alias-border-l1); stroke-width: 1.5; }
.sv-flow-root { fill: var(--dsw-alias-bg-layer-2); stroke: var(--dsw-alias-label-tertiary); stroke-width: 1.5; }
.sv-flow-root-text {
  fill: var(--dsw-alias-label-secondary); font: var(--dsw-font-xs-13);
}
.sv-flow-node { cursor: pointer; }
.sv-flow-node-rect {
  fill: var(--dsw-alias-bg-layer-2); stroke: var(--dsw-alias-border-l1); stroke-width: 1.5;
}
.sv-flow-node-rect-warn { stroke: var(--dsw-alias-state-warn-primary); }
.sv-flow-node-dot { fill: var(--dsw-alias-state-warn-primary); }
.sv-flow-node-text {
  fill: var(--dsw-alias-label-primary); font: var(--dsw-font-xs-13);
  font-family: var(--dsw-font-markdown-code-block);
}
.sv-flow-node:hover .sv-flow-node-rect { stroke: var(--dsw-alias-label-primary); }
.sv-flow-node:focus-visible { outline: none; }
.sv-flow-node:focus-visible .sv-flow-node-rect {
  stroke: var(--dsw-alias-state-business-primary); stroke-width: 2.5;
}
.sv-flow-node-active .sv-flow-node-rect {
  stroke: var(--dsw-alias-state-business-primary); stroke-width: 2.5;
}
/* 常驻详情面板——同 .sv-cursorinfo（TimelinePanel）同一个理由：固定在图
   下方而不是浮层，键盘/触屏都能摸到，role=status 让读屏软件跟着播报。 */
.sv-flow-detail {
  margin-top: 6px; padding: 8px 10px;
  border-radius: 6px; background: var(--dsw-alias-bg-layer-2);
  font: var(--dsw-font-xs-13); color: var(--dsw-alias-label-secondary);
  min-height: 2.4em;
}
.sv-flow-detail-title {
  color: var(--dsw-alias-label-primary); font-weight: 600; margin-bottom: 2px;
}

/* ── finding 展开详情（P4） ─────────────────────────────────────── */
.sv-fdetail {
  margin: 4px 0 10px 22px; padding: 10px 12px;
  border-left: 2px solid var(--dsw-alias-border-l1);
  font: var(--dsw-font-xs-13); color: var(--dsw-alias-label-secondary);
  line-height: 1.7;
}
.sv-fdetail[hidden] { display: none; }
.sv-fdetail dl { display: grid; grid-template-columns: 72px 1fr; gap: 3px 10px; margin: 0; }
.sv-fdetail dt { color: var(--dsw-alias-label-tertiary); }
.sv-fdetail dd {
  margin: 0; color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-markdown-code-block);
  word-break: break-all;
}
.sv-fdetail .sv-suggest {
  margin-top: 8px; padding-top: 8px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-primary);
}
.sv-xref {
  margin-top: 6px;
  color: var(--dsw-alias-state-warn-primary);
}

/* ── FR-07 过滤/搜索工具条 ─────────────────────────────────────── */
.sv-toolbar {
  display: flex; flex-wrap: wrap; gap: 8px 12px;
  align-items: center; justify-content: space-between;
  margin: 8px 0 6px;
}
.sv-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.sv-toolbar-right { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.sv-chip {
  min-height: 28px; padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px;
  background: none; color: var(--dsw-alias-label-secondary);
  font: var(--dsw-font-xs-13); cursor: pointer; white-space: nowrap;
}
.sv-chip:hover { border-color: var(--dsw-alias-label-tertiary); }
.sv-chip[aria-pressed="true"] {
  background: color-mix(in srgb, currentColor 12%, transparent);
  font-weight: 600;
}
/* P1-03：0 条时禁用而不是消失——固定五个 chip 的筛选维度始终可见。 */
.sv-chip:disabled { opacity: .45; cursor: default; }
.sv-chip:focus-visible, .sv-search:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 1px;
}
.sv-search {
  min-height: 28px; width: min(220px, 100%);
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px;
  padding: 0 8px; background: none;
  color: var(--dsw-alias-label-primary); font: var(--dsw-font-xs-13);
}
.sv-export-status { font: var(--dsw-font-xs-13); }
.sv-export-downloaded { color: var(--dsw-alias-state-success-primary); }
.sv-export-clipboard { color: var(--dsw-alias-state-warn-primary); }
.sv-export-failed { color: var(--dsw-alias-state-error-primary); }

/* ── P4 finding 行（P0-01/P1-04） ──────────────────────────────── */
/* 容器宽度触发换行，不锁 viewport 断点——理由同 .sv-metrics：审计 Tab 挤在
   宿主侧栏旁边，容器比 viewport 更早变窄。flex-wrap 本身就保证任何一组
   内容都不会被裁到可视区域外（此前的 bug：trailing 按钮组不换行，390px
   下直接冲出容器右侧，且没有横向滚动条可以够到）。 */
.sv-frow-row {
  display: flex; flex-wrap: wrap; align-items: center;
  gap: 4px 8px; padding: 6px 2px; cursor: pointer;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  font: var(--dsw-font-xs-13);
  color: var(--dsw-alias-label-primary);
}
.sv-frow-evidence {
  font-family: var(--dsw-font-markdown-code-block);
  color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  flex: 1 1 140px; min-width: 0;
}
.sv-frow-trailing {
  display: flex; align-items: center; gap: 4px;
  margin-left: auto; flex-shrink: 0;
}
.sv-frow-menuwrap { position: relative; }
/* 「更多」+ 「展开」是每行仅剩的两个常驻可见入口（P1-04 完成标准：不超过
   2 个）；复制证据/复制 JSON/复制 seq 都收进「更多」菜单。 */
.sv-frow-more, .sv-frow-exp {
  min-width: 32px; min-height: 32px; padding: 1px 4px;
  border: none; background: none;
  color: var(--dsw-alias-label-tertiary); cursor: pointer;
  font: var(--dsw-font-xs-13);
}
.sv-frow-more:hover, .sv-frow-exp:hover { color: var(--dsw-alias-label-primary); }
.sv-frow-more:focus-visible, .sv-frow-exp:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 1px;
}
.sv-frow-menu {
  position: absolute; right: 0; top: 100%; z-index: 5;
  display: flex; flex-direction: column; min-width: 168px;
  margin-top: 2px; padding: 4px;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, .18);
}
/* 菜单项**始终渲染**、用 hidden 属性切菜单可见性，不是条件渲染——
   renderToStaticMarkup 快照要能断言到「复制证据」这几个字，和 .sv-fdetail
   展开详情同一套纪律（见 verify-render.mjs）。 */
.sv-frow-menu[hidden] { display: none; }
.sv-frow-menuitem {
  min-height: 32px; padding: 6px 8px; border: none; background: none;
  text-align: left; border-radius: 5px;
  color: var(--dsw-alias-label-primary);
  font: var(--dsw-font-xs-13); cursor: pointer; white-space: nowrap;
}
.sv-frow-menuitem:hover { background: var(--dsw-alias-bg-layer-2); }
.sv-frow-menuitem:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: -2px;
}
/* 容器窄到放不下 evidence 时让它独占一行——trailing 组仍贴右、仍然整组
   可见，不会有任何按钮被挤出可视区域。 */
@media (max-width: 480px) {
  .sv-frow-evidence { flex-basis: 100%; }
}

/* ── FR-10 个人复核备注 ────────────────────────────────────────── */
.sv-frow { min-width: 0; }
.sv-note {
  margin: 2px 0 10px 22px;
  display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline;
  font: var(--dsw-font-xs-13);
}
.sv-note-body {
  flex: 1 1 220px; min-width: 0;
  color: var(--dsw-alias-label-primary);
  overflow-wrap: anywhere;
}
.sv-note-tag {
  color: var(--dsw-alias-label-tertiary);
  margin-right: 6px;
}
.sv-note-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: baseline; }
.sv-note-toast { color: var(--dsw-alias-state-success-primary); }
.sv-note-edit { flex-direction: column; align-items: stretch; }
.sv-note-input {
  width: 100%; resize: vertical;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px;
  padding: 6px 8px; background: none;
  color: var(--dsw-alias-label-primary); font: var(--dsw-font-xs-13);
}
.sv-note-input:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 1px;
}
`
