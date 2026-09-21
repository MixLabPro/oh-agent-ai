import { useEffect, useRef, useState } from "react";
import { readSessionDetail, safeUiError, type SessionBillingBucket, type SessionDetail as SessionDetailData, type SessionRow, type SessionWorkflowEvent } from "../../lib/tauri";

function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function timeLabel(value: string | null): string {
  if (!value) return "时间不可用";
  return value.slice(0, 19).replace("T", " ");
}

function costLabel(row: Pick<SessionRow, "cost_minor">): string {
  if (!row.cost_minor) return "—";
  const amount = row.cost_minor.amount_minor / 100;
  return `${row.cost_minor.currency === "CNY" ? "¥" : `${row.cost_minor.currency} `}${amount.toFixed(2)}`;
}

function statusLabel(row: Pick<SessionRow, "cost_status">): string {
  return ({ estimated: "估算", subscription: "订阅", unpriced: "缺价", unavailable: "不可用" } as Record<SessionRow["cost_status"]["state"], string>)[row.cost_status.state];
}

function workflowLabel(event: SessionWorkflowEvent): string {
  const eventNames: Record<string, string> = { task_started: "任务开始", task_finished: "任务结束", skill_invoked: "Skill 调用", skill_finished: "Skill 完成", tool_invoked: "工具调用", tool_finished: "工具完成", model_switched: "模型切换", unknown: "未知事件" };
  return eventNames[event.event_type] ?? "未知事件";
}

function bucketCost(bucket: SessionBillingBucket): string {
  if (!bucket.cost_minor) return "—";
  return costLabel(bucket);
}

export function SessionDetail({ row, onBack }: { row: SessionRow; onBack: () => void }) {
  const [detail, setDetail] = useState<SessionDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paginationError, setPaginationError] = useState<string | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    setPaginationError(null);
    setDetail(null);
    void readSessionDetail(row.session_ref).then((value) => {
      if (generation.current === current) setDetail(value);
    }).catch((reason: unknown) => {
      if (generation.current === current) setError(safeUiError(reason, "会话详情暂不可用"));
    }).finally(() => {
      if (generation.current === current) setLoading(false);
    });
  }, [row.session_ref]);

  const loadMore = async () => {
    if (!detail?.next_cursor || loadingMore) return;
    setLoadingMore(true);
    setPaginationError(null);
    try {
      const page = await readSessionDetail(row.session_ref, detail.next_cursor);
      setDetail((current) => current ? { ...current, timeline: current.timeline.concat(page.timeline), has_more: page.has_more, next_cursor: page.next_cursor } : current);
      setPaginationError(null);
    } catch (reason: unknown) {
      setPaginationError(safeUiError(reason, "更多事实暂不可用"));
    } finally {
      setLoadingMore(false);
    }
  };

  return <>
    <div className="session-detail-header"><button className="button button-secondary" type="button" onClick={onBack}>← 返回会话列表</button><div><p className="eyebrow">安全会话详情</p><h2>{row.host} 会话</h2></div><span className="status-pill"><span aria-hidden="true" className="status-dot" />只读投影</span></div>
    <p className="section-description session-detail-intro">详情只显示本机 authority 的聚合和脱敏事件；不显示会话正文、命令参数、工作区路径或原生会话 ID。引用：<code>{row.session_ref.slice(0, 18)}…</code></p>
    {loading && <div className="sessions-state" role="status"><strong>正在读取详情</strong><p>正在读取安全的 usage / workflow 时间线。</p></div>}
    {error && <div className="error-banner" role="alert">会话详情不可用：{error}</div>}
    {paginationError && <div className="error-banner" role="alert">更多事实加载失败：{paginationError}；已有详情仍可用，请重试。</div>}
    {!loading && !detail && !error && <div className="sessions-state"><strong>没有可展示的详情</strong><p>当前引用没有对应的本地 authority 记录。</p></div>}
    {detail && <>
      <section className="session-detail-stats" aria-label="会话摘要"><div><span>事件</span><strong>{detail.event_count}</strong></div><div><span>Tokens</span><strong>{compact(detail.tokens.total)}</strong></div><div><span>成本</span><strong>{costLabel(detail)}</strong><small>{statusLabel(detail)} · {detail.cost_status.reason}</small></div><div><span>时间范围</span><strong>{timeLabel(detail.first_event_at)}</strong><small>至 {timeLabel(detail.last_event_at)}</small></div></section>
      <section className="session-detail-panel"><div className="section-heading"><div><p className="eyebrow">计费归因</p><h3>估算依据与覆盖</h3></div><span className={`session-cost-state session-cost-${detail.cost_status.state}`}>{statusLabel(detail)}</span></div>{detail.billing_breakdown.length === 0 ? <p className="session-detail-muted">没有可审计的计费桶；这不等于零成本。</p> : <div className="sessions-table-wrap"><table className="sessions-table session-billing-table"><thead><tr><th scope="col">Provider · 模型</th><th scope="col">计费口径</th><th scope="col">价格来源</th><th scope="col">Tokens</th><th scope="col">金额</th><th scope="col">状态</th></tr></thead><tbody>{detail.billing_breakdown.map((bucket, index) => <tr key={`${bucket.model_id}-${bucket.peak}-${index}`}><td><strong>{bucket.provider_raw ?? bucket.provider_id} · {bucket.model_id}</strong><small>{bucket.peak ? "峰值桶" : "普通桶"}</small></td><td>{bucket.billing_mode}<small>{bucket.pricing_basis}</small></td><td>{bucket.pricing_source ?? "无可用价格"}<small>{bucket.pricing_version ?? "版本不可用"}</small></td><td>{compact(bucket.tokens.total)}</td><td><strong>{bucketCost(bucket)}</strong></td><td><span className={`session-cost-state ${bucket.has_unresolved ? "session-cost-unavailable" : "session-cost-estimated"}`}>{bucket.has_unresolved ? "归因未决" : "可审计"}</span></td></tr>)}</tbody></table></div>}</section>
      <section className="session-detail-panel"><div className="section-heading"><div><p className="eyebrow">Usage timeline</p><h3>事实时间线</h3></div><span className="count-badge">{detail.timeline.length}{detail.has_more ? "+" : ""} 条</span></div>{detail.timeline.length === 0 ? <p className="session-detail-muted">没有事实时间线；不会用空数据推断行为。</p> : <div className="sessions-table-wrap"><table className="sessions-table session-timeline-table"><thead><tr><th scope="col">时间</th><th scope="col">模型</th><th scope="col">观测类型</th><th scope="col">峰值</th><th scope="col">Tokens</th></tr></thead><tbody>{detail.timeline.map((event, index) => <tr key={`${event.event_at}-${event.model_id}-${index}`}><td>{timeLabel(event.event_at)}</td><td>{event.model_id}</td><td>{event.observation_kind}</td><td>{event.peak ? "峰值" : "—"}</td><td><strong>{compact(event.tokens.total)}</strong></td></tr>)}</tbody></table></div>}{detail.has_more && <div className="sessions-more"><button className="button button-secondary" type="button" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "正在加载…" : "加载更多事实"}</button></div>}</section>
      <section className="session-detail-panel"><div className="section-heading"><div><p className="eyebrow">Workflow timeline</p><h3>脱敏行为事件</h3></div><span className="count-badge">{detail.workflow_timeline.length}{detail.workflow_has_more ? " · 仅前 1000 条" : " 条"}</span></div><p className="session-detail-note">Workflow 事件与 token 事实时间线独立展示，不把工具事件硬分摊成 token 或费用。{detail.workflow_has_more ? "当前仅展示前 1000 条，后端暂未提供 workflow 独立游标。" : ""}</p>{detail.workflow_timeline.length === 0 ? <p className="session-detail-muted">没有可用的脱敏行为事件。</p> : <ol className="session-workflow-list">{detail.workflow_timeline.map((event, index) => <li key={`${event.event_at}-${event.event_type}-${index}`}><span className={`workflow-marker workflow-${event.outcome}`} aria-hidden="true" /><div><strong>{workflowLabel(event)}</strong><p>{event.capability_kind ?? "能力不可用"}{event.capability_id ? ` · ${event.capability_id}` : ""} · {event.outcome === "failed" ? "失败" : event.outcome === "succeeded" ? "成功" : "结果不可用"}</p><small>{timeLabel(event.event_at)}{event.duration_ms == null ? "" : ` · ${event.duration_ms}ms`}</small></div></li>)}</ol>}</section>
    </>}
  </>;
}
