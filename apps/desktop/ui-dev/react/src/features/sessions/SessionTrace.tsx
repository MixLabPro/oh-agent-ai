import { useEffect, useRef, useState } from "react";
import "../../../../../src-tauri/ui/timeline.js";
import { invoke, safeUiError } from "../../lib/tauri";
import "./session-trace.css";

type Series = {
  points: { ordinal: number; task_id?: string; values: Record<string, number | null> }[];
  events: { ordinal: number; kind: string; label?: string; severity?: string }[];
  series: { name: string; cumulative?: boolean }[];
  unplaced_events: number;
};
type Envelope<T> = { data?: T; error?: unknown };
type Geometry = { buildTimeline: (spec: Series & { width: number; height: number; classPrefix: string }) => string };

// The existing shared renderer escapes text/attributes. Only its generated SVG
// is inserted, never HTML supplied by the bridge. Geometry remains single-source.
/// timeline.js（UMD）恒把几何挂到 `self.TimelineGeometry`。它曾是「有 module.exports 就只导出」
/// 的二选一：Vite 生产构建把整个 app 包进一个 CommonJS 外壳（`module.exports` 存在），全局
/// 从未设置，打包后的 app 里每条轨迹都「暂不可用」。拿不到就明说，不静默。
function timelineGeometry(): Geometry {
  const geometry = (window as unknown as { TimelineGeometry?: Geometry }).TimelineGeometry;
  if (!geometry?.buildTimeline) throw new Error("Timeline geometry unavailable");
  return geometry;
}

export function traceMarkup(series: Series): string {
  if (!Array.isArray(series.points) || !Array.isArray(series.events) || !Array.isArray(series.series)) throw new Error("Invalid trace");
  for (const point of series.points) {
    if (!Number.isFinite(point.ordinal) || !point.values || Object.values(point.values).some(value => value !== null && (typeof value !== "number" || !Number.isFinite(value)))) throw new Error("Invalid trace point");
  }
  if (series.events.some(event => !Number.isFinite(event.ordinal))) throw new Error("Invalid trace event");
  const geometry = timelineGeometry();
  return geometry.buildTimeline({ points: series.points, events: series.events, series: series.series, unplaced_events: series.unplaced_events, width: 800, height: 240, classPrefix: "session-trace" });
}

export function SessionTrace({ sessionRef, refreshKey }: { sessionRef: string; refreshKey: number }) {
  const [result, setResult] = useState<{ ref: string; data: Series; count: number; unplaced: number; coverage: string } | null>(null);
  const [metric, setMetric] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  // 后台同步每轮都会 bump refreshKey：同一会话刷新时保留旧图（result 按 ref 校验，
  // 换会话时旧值自然不显示），不先清空——否则详情浮层每轮同步都闪一次空白。
  const hasResultRef = useRef<string | null>(null);
  hasResultRef.current = result?.ref ?? null;
  useEffect(() => {
    let active = true;
    const sameSession = hasResultRef.current === sessionRef;
    if (!sameSession) setError(null);
    const graph = invoke<Envelope<{ coverage?: Record<string, number> }>>("session_trace", { sessionRef, output: "graph" }).catch(() => null);
    void invoke<Envelope<Series>>("session_trace", { sessionRef, output: "timeline_series" }).then(async envelope => {
      if (envelope.error || !envelope.data) throw new Error("Trace unavailable");
      const data = envelope.data;
      traceMarkup(data);
      const graphResult = await graph;
      const coverage = graphResult?.error ? undefined : graphResult?.data?.coverage;
      if (active) { setError(null); setResult({ ref: sessionRef, data, count: data.points.length, unplaced: data.unplaced_events ?? 0,
        coverage: coverage ? `节点 ${coverage.total_nodes ?? "—"} · 缺父 ${coverage.missing_parent ?? "—"} · 缺时 ${coverage.missing_time ?? "—"} · 缺状态 ${coverage.missing_status ?? "—"}` : "轨迹覆盖率不可用" }); }
    }).catch((reason: unknown) => { if (active && !sameSession) setError(safeUiError(reason, "轨迹暂不可用")); });
    return () => { active = false; };
  }, [sessionRef, refreshKey, retry]);
  const current = result?.ref === sessionRef ? result : null;
  const selected = current?.data.series.find(item => item.name === metric) ?? current?.data.series[0];
  const labels: Record<string, string> = { tool_call_count: "工具调用次数", input: "输入 tokens", output: "输出 tokens", context: "上下文 tokens", cache: "缓存 tokens" };
  return <section className="session-detail-panel session-trace-panel" aria-label="会话轨迹图">
    <div className="section-heading"><h3>会话轨迹图</h3>{current && <span className="count-badge">{current.count} 个轮次</span>}</div>
    {error ? <div role="alert"><p>{error}；下方事实和行为事件仍可查看。</p><button className="button button-secondary" onClick={() => setRetry(value => value + 1)}>重试轨迹</button></div> : !current ? <p role="status">正在加载轨迹…</p> : <>
      {selected && <label className="session-trace-metric">指标 <select aria-label="轨迹指标" value={selected.name} onChange={event => setMetric(event.target.value)}>{current.data.series.map(item => <option key={item.name} value={item.name}>{labels[item.name] ?? item.name}</option>)}</select></label>}
      <div className="session-trace-scroll" dangerouslySetInnerHTML={{ __html: traceMarkup({ ...current.data, series: selected ? [selected] : [] }) }} />
      <p className="session-detail-note">按记录轮次排列 · 缺失测量保留缺口 · 标记表示工具事件，红色表示失败</p>
      <p className="session-detail-note">{current.coverage} · {current.unplaced} 个事件无法定位到轮次</p>
    </>}
  </section>;
}
