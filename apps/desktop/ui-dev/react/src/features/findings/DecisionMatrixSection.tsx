import { useMemo, useState } from "react";
import type { DecisionMatrixReport, DecisionMatrixRow, DecisionSummary } from "../../lib/tauri";

function compact(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function money(minor: number, currency: string, basis: string): string {
  const symbol = currency === "CNY" ? "¥" : currency === "USD" ? "$" : `${currency} `;
  return `${basis === "metered_estimate" ? "≈" : ""}${symbol}${(minor / 100).toFixed(2)}`;
}

function rowKey(row: DecisionMatrixRow): string {
  return JSON.stringify([row.host, row.model_id, row.provider_id]);
}

function summaryTitle(summary: DecisionSummary): string {
  if (summary.kind === "cost_outlier") return "最贵的组合更像缓存纪律问题，而不是单价问题";
  if (summary.kind === "marathon") return `一个 ${summary.span_hours ?? "—"} 小时的会话持续消耗 ${compact(summary.tokens_total ?? 0)} token`;
  return "计价币种不一致，成本排序暂不可比";
}

function summaryBody(summary: DecisionSummary): string {
  if (summary.kind === "cost_outlier" && summary.outlier && summary.control) {
    return `${summary.outlier.model_id} 单会话约 ${money(summary.outlier.per_session_minor, summary.currency ?? "<unknown>", "metered_estimate")}，是 ${summary.control.model_id} 的 ${summary.ratio_vs_control ?? "—"} 倍；异常组合缓存命中 ${summary.outlier.cache_hit_ratio == null ? "—" : `${Math.round(summary.outlier.cache_hit_ratio * 100)}%`}。`;
  }
  if (summary.kind === "marathon") return `${summary.combo?.host ?? "<unknown>"} · ${summary.combo?.model_id ?? "<unknown>"}，工具失败 ${summary.failures ?? 0} 次。墙钟时间为事件跨度近似，不代表真实任务耗时。`;
  const detail = Object.entries(summary.by_currency ?? {}).map(([currency, value]) => `${currency} ${value.combos} 组合/${compact(value.tokens)} token`).join("；");
  return detail ? `当前可计价组合：${detail}。不做汇率折算，统一申报口径后才能启用成本排序。` : "当前可计价组合的币种不唯一，不能直接比较。";
}

const LIMITATION_LABELS: Record<string, string> = {
  waste_rate_unavailable: "浪费率暂不可用",
  host_behavior_host_level: "行为证据按宿主级聚合",
  amounts_currency_separated: "金额按币种分栏",
  fingerprint_link_deferred: "指纹跨链尚未接入",
  top_sessions_unavailable: "贡献会话暂不可用",
  pricing_unavailable: "计价管线暂不可用",
};

function sortRows(rows: DecisionMatrixRow[]): { rows: DecisionMatrixRow[]; note: string; sorted: boolean } {
  const unpriced = rows.filter((row) => row.amounts.length === 0 && !row.has_subscription);
  const subscriptions = rows.filter((row) => row.has_subscription);
  const candidates = rows.filter((row) => row.amounts.length > 0 && !row.has_subscription);
  const currencies = new Set(candidates.flatMap((row) => row.amounts.map((amount) => amount.currency)));
  const canSort = candidates.length > 0 && currencies.size === 1 && candidates.every((row) => row.amounts.length === 1 && row.sessions > 0 && !row.cost_provider_unresolved && row.waste_rate !== null);
  const byTokens = (a: DecisionMatrixRow, b: DecisionMatrixRow) => b.tokens.total - a.tokens.total;
  if (!canSort) {
    const reason = currencies.size > 1 ? "币种不可比，未做汇率折算" : candidates.some((row) => row.waste_rate === null) ? "浪费率不可用，暂不启用调整后成本排序" : "计价归属或会话数不足，暂不启用成本排序";
    return { rows: [...unpriced].sort(byTokens).concat([...candidates].sort(byTokens), [...subscriptions].sort(byTokens)), note: reason, sorted: false };
  }
  const currency = [...currencies][0];
  const score = (row: DecisionMatrixRow) => (row.amounts[0].amount_minor / row.sessions) * (1 + (row.waste_rate ?? 0));
  return { rows: [...unpriced].sort(byTokens).concat([...candidates].sort((a, b) => score(b) - score(a)), [...subscriptions].sort(byTokens)), note: `排序：浪费调整后单位会话成本（${currency}，近似，仅用于排序提示）`, sorted: true };
}

function MatrixRow({ row, expanded, detailId, onToggle }: { row: DecisionMatrixRow; expanded: boolean; detailId: string; onToggle: () => void }) {
  const amount = row.amounts.length === 1 ? money(row.amounts[0].amount_minor, row.amounts[0].currency, row.amounts[0].basis) : row.amounts.map((item) => money(item.amount_minor, item.currency, item.basis)).join(" · ");
  const perSession = row.amounts.length === 1 && row.sessions > 0 && !row.has_subscription ? money(Math.round(row.amounts[0].amount_minor / row.sessions), row.amounts[0].currency, row.amounts[0].basis) : "—";
  const tags = [row.has_subscription ? "订阅覆盖" : row.amounts.length === 0 ? "成本未知" : null, row.cost_provider_unresolved ? "归属未确认" : null].filter(Boolean);
  return <>
    <article className="matrix-row" role="listitem" data-testid="decision-matrix-row">
      <button className="matrix-row-toggle" type="button" aria-expanded={expanded} aria-controls={detailId} onClick={onToggle}>
        <span className="matrix-combo"><strong>{row.host} · {row.model_id}</strong><small>{row.provider_id}{tags.length ? ` · ${tags.join(" · ")}` : ""}</small></span>
        <span className="matrix-cell"><b>{row.sessions}</b><small>会话</small></span>
        <span className="matrix-cell"><b>{compact(row.tokens.total)}</b><small>token</small></span>
        <span className="matrix-cell"><b>{amount}</b><small>名义成本</small></span>
        <span className="matrix-cell"><b>{perSession}</b><small>单会话</small></span>
        <span className="matrix-cell"><b>{row.cache_hit_ratio == null ? "—" : `${Math.round(row.cache_hit_ratio * 100)}%`}</b><small>缓存命中</small></span>
        <span className="matrix-cell"><b>{row.waste_rate == null ? "—" : `${Math.round(row.waste_rate * 100)}%`}</b><small>浪费率</small></span>
        <span className="matrix-cell"><b>{row.limit_pressure == null ? "—" : `${row.limit_pressure.hits} 次${row.limit_pressure.per_session == null ? "" : ` · ≈${row.limit_pressure.per_session}/会话`}`}</b><small>撞限流</small></span>
        <span className="matrix-chevron" aria-hidden="true">{expanded ? "⌃" : "⌄"}</span>
      </button>
    </article>
    {expanded && <div id={detailId} className="matrix-detail" role="region" aria-label={`${row.host} ${row.model_id} 的决策证据`}>
      <p>四桶 token：未缓存输入 {compact(row.tokens.uncached_input)} · 缓存读 {compact(row.tokens.cache_read)} · 缓存写 {compact(row.tokens.cache_write)} · 输出 {compact(row.tokens.output)}</p>
      {Object.keys(row.host_behavior).length > 0 && <p>宿主级行为证据（不按模型归组）：{Object.entries(row.host_behavior).map(([rule, count]) => `${rule} × ${count}`).join(" · ")}</p>}
      {row.top_sessions.length > 0 ? row.top_sessions.map((session) => <p key={session.session_ref}>贡献会话 <code>{session.session_ref.slice(0, 18)}…</code> · 事件跨度约 {((session.span_last_ms - session.span_first_ms) / 3_600_000).toFixed(1)}h · {compact(session.tokens_total)} token · 失败 {session.failures} 次 · 轨迹下钻待接线</p>) : <p>贡献会话不可用；当前只展示组合级聚合。</p>}
    </div>}
  </>;
}

export function DecisionMatrixSection({ report, loading, error }: { report: DecisionMatrixReport | null; loading: boolean; error: string | null }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const sorted = useMemo(() => sortRows(report?.rows ?? []), [report]);
  const hasStaleReport = Boolean(report && (loading || error));
  const staleMessage = loading
    ? "正在刷新模型 × Harness 对比；以下暂保留上一次对比结果。"
    : error && report
      ? `本次对比未完成；仍展示上一次对比结果（窗口：${report.month}）。`
      : null;
  return <section className="finding-section matrix-section" aria-labelledby="matrix-title">
    <div className="section-heading"><div><p className="eyebrow">决策证据面</p><h3 id="matrix-title">模型 × Harness 对比 {report && <small className="section-meta">窗口 {report.month}</small>}</h3><p className="section-description">成本按币种分栏；未计价、订阅和浪费率未知的组合不会被伪装成可比数字。</p></div><div className="section-heading-side">{hasStaleReport && <span className="status-pill status-pill-warning" aria-label="上一次对比结果"><span aria-hidden="true" className="status-dot" />上一次结果</span>}<span className="count-badge">{report?.rows.length ?? 0}</span></div></div>
    {loading && <p className="inline-status" aria-busy="true">{staleMessage ?? "正在读取 authority 聚合…"}</p>}
    {error && <div className="error-banner" role="alert">对比面读取失败：{error} · {staleMessage ?? "待办和证据明细仍可单独查看"}</div>}
    {report && report.findings_summary.length > 0 && <div className="decision-summary-list">{report.findings_summary.map((summary, index) => <article className="decision-summary" key={`${summary.kind}-${index}`}><strong>{summaryTitle(summary)}</strong><p>{summaryBody(summary)}</p>{summary.saving_minor != null && <span>预计差额约 {money(summary.saving_minor, summary.currency ?? "<unknown>", "metered_estimate")} · 仅为决策提示</span>}</article>)}</div>}
    {report && <p className="matrix-sort-note">{sorted.note}{sorted.sorted ? "" : " · 当前按 token 贡献排列"}</p>}
    {report && sorted.rows.length > 0 ? <div className="matrix-list" role="list">{sorted.rows.map((row, index) => { const key = rowKey(row); const detailId = `matrix-detail-${index}`; return <MatrixRow key={key} row={row} detailId={detailId} expanded={Boolean(expanded[key])} onToggle={() => setExpanded((current) => ({ ...current, [key]: !current[key] }))} />; })}</div> : !loading && <div className="finding-empty"><strong>当前没有可对比的组合</strong><p>需要先有 authority 用量事实；空结果不代表本机没有行为。</p></div>}
    {report && report.limitations.length > 0 && <p className="matrix-limitations">已知边界：{report.limitations.map((item) => LIMITATION_LABELS[item] ?? "部分数据不可用").join(" · ")}</p>}
  </section>;
}
