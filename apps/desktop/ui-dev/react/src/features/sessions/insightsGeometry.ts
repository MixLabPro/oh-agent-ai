// 会话消耗诊断轨迹图的纯几何（SESSION_TRACE_DIAGNOSTICS_SPEC r6 §8.2、§8.3）。
//
// 为什么单独成模块：比例尺错了图照样画得出来，没有异常、没有红测，只有人眼能
// 发现（CLAUDE.md「timeline 的几何」同一教训）。这里只做数→坐标，不碰 DOM，
// 由 scripts/verify-react-session-insights-contract.mjs 直接断言不变量：
// - 诊断区间与失败标记**永不因抽稀或窗口而消失**：窗口外的区间给出方向标记；
// - 窗口恒包含当前焦点；
// - 长空闲（> 30 分钟）折叠成固定宽度的缝隙，且只出现在窗口内；
// - 柱位单调、落在绘图区内。

export const LONG_IDLE_MS = 30 * 60 * 1000;
export const GAP_WIDTH = 22;
export const MIN_SLOT = 7;

export type GeoStep = { index: number; idle_before_ms: number | null };
export type Slot = { index: number; x: number; w: number };
export type Gap = { x: number; idleMs: number; beforeIndex: number };
export type Layout = { slots: Slot[]; gaps: Gap[]; slot: number };

/// 「好看的」刻度上界：≥ v 的 {1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10}×10^k。
export function niceCeil(v: number): number {
  if (!(v > 0) || !Number.isFinite(v)) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / e;
  for (const k of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (f <= k + 1e-9) return k * e;
  return 10 * e;
}

/// 绘图区能容纳的最多步数（每步至少 MIN_SLOT 像素）。
export function maxVisibleSteps(plotWidth: number): number {
  return Math.max(20, Math.floor(plotWidth / MIN_SLOT));
}

/// 显示窗口 [start, end]（1 基、含两端）。焦点区间 [from, to] 若不在当前窗口内，
/// 窗口移过去使其居中；焦点比窗口还宽时从焦点起点开始。总步数装得下时恒为全程。
export function chartWindow(total: number, maxVisible: number, current: [number, number] | null, from: number, to: number): [number, number] {
  if (total <= maxVisible) return [1, Math.max(1, total)];
  const span = maxVisible;
  if (current && current[1] - current[0] + 1 === span && from >= current[0] && to <= current[1]) return current;
  const width = to - from + 1;
  let start = width >= span ? from : Math.round((from + to) / 2 - span / 2);
  start = Math.max(1, Math.min(total - span + 1, start));
  return [start, start + span - 1];
}

/// 窗口的状态机：用户在缩略图上拖动/翻页设定的窗口，在**选择没变**之前一直有效；
/// 选择变了才按新焦点重新定位。此前每次渲染都按焦点重算，窗口一拖就被拽回当前
/// 诊断（验收 Major）。`focusKey` 标识「当前选择」（诊断序号 / 回合号等）。
export function resolveWindow(
  total: number, maxVisible: number,
  user: { view: [number, number]; focusKey: string } | null,
  focusKey: string, from: number, to: number,
): [number, number] {
  if (total <= maxVisible) return [1, Math.max(1, total)];
  if (user && user.focusKey === focusKey && user.view[1] - user.view[0] + 1 === maxVisible) {
    const start = Math.max(1, Math.min(total - maxVisible + 1, user.view[0]));
    return [start, start + maxVisible - 1];
  }
  return chartWindow(total, maxVisible, null, from, to);
}

/// 诊断底带的行分配：同一行内区间不重叠，最多 `maxRows` 行；放不下的仍放进最后
/// 一行（允许重叠）——**任何诊断都有带**（§8.3 诊断标记不抽稀）。返回每条诊断的行号。
export function packBands(ranges: { from: number; to: number }[], maxRows = 6): number[] {
  const rowsEnd: number[] = [];
  return ranges.map(r => {
    for (let row = 0; row < rowsEnd.length; row += 1) {
      if (r.from > rowsEnd[row]) { rowsEnd[row] = r.to; return row; }
    }
    if (rowsEnd.length < maxRows) { rowsEnd.push(r.to); return rowsEnd.length - 1; }
    const last = maxRows - 1;
    rowsEnd[last] = Math.max(rowsEnd[last], r.to);
    return last;
  });
}

/// 窗口内的柱位与缝隙。窗口首步前的空闲不画缝（它在窗口之外）。
export function layoutSteps(steps: GeoStep[], window: [number, number], plotLeft: number, plotWidth: number): Layout {
  const visible = steps.slice(window[0] - 1, window[1]);
  const gapCount = visible.filter((s, k) => k > 0 && (s.idle_before_ms ?? 0) > LONG_IDLE_MS).length;
  const slot = visible.length ? Math.max(1, (plotWidth - gapCount * GAP_WIDTH) / visible.length) : plotWidth;
  const slots: Slot[] = [];
  const gaps: Gap[] = [];
  let x = plotLeft;
  visible.forEach((s, k) => {
    if (k > 0 && (s.idle_before_ms ?? 0) > LONG_IDLE_MS) {
      gaps.push({ x, idleMs: s.idle_before_ms ?? 0, beforeIndex: s.index });
      x += GAP_WIDTH;
    }
    slots.push({ index: s.index, x, w: slot });
    x += slot;
  });
  return { slots, gaps, slot };
}

export type Band = { kind: "visible"; x: number; w: number } | { kind: "offscreen"; side: "left" | "right" };

/// 诊断区间在窗口里的位置：与窗口相交则裁到窗口；否则给出方向——**永不丢弃**。
export function bandFor(range: { from: number; to: number }, window: [number, number], layout: Layout): Band {
  const a = Math.max(range.from, window[0]);
  const b = Math.min(range.to, window[1]);
  if (a > b) return { kind: "offscreen", side: range.to < window[0] ? "left" : "right" };
  const sa = layout.slots.find(s => s.index === a);
  const sb = layout.slots.find(s => s.index === b);
  if (!sa || !sb) return { kind: "offscreen", side: "right" };
  return { kind: "visible", x: sa.x, w: sb.x + sb.w - sa.x };
}

/// 横轴刻度间隔：保证相邻标签至少 minPx 像素。
export function tickStep(slot: number, minPx = 34): number {
  const need = Math.ceil(minPx / Math.max(slot, 0.001));
  return [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find(k => k >= need) ?? 1000;
}

/// 缩略图：每像素一列，取该列覆盖步中输入最大者（未命中占比 > 50% 标警示）。
/// 聚合只用于缩略图；主图与诊断标记不聚合。
export function miniColumns(values: { input: number; miss: number }[], plotWidth: number): { x: number; value: number; warn: boolean }[] {
  const n = values.length;
  if (n === 0 || plotWidth <= 0) return [];
  const cols = Math.max(1, Math.floor(plotWidth));
  const per = n / cols;
  const out: { x: number; value: number; warn: boolean }[] = [];
  for (let c = 0; c < cols; c += 1) {
    const a = Math.floor(c * per);
    const b = Math.max(a, Math.floor((c + 1) * per) - 1);
    let best = -1;
    let warn = false;
    for (let k = a; k <= b && k < n; k += 1) {
      if (values[k].input > best) {
        best = values[k].input;
        warn = values[k].input > 0 && values[k].miss / values[k].input > 0.5;
      }
    }
    if (best >= 0) out.push({ x: c, value: best, warn });
  }
  return out;
}
