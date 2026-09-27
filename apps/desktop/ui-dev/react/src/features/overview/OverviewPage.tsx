import { useEffect, useState } from "react";
import { StatusPill } from "../../components/ui/StatusPill";
import { readFindings, type FindingGroup, type OverviewDetails, type OverviewSnapshot, type SummaryHostTokens } from "../../lib/tauri";
import { sessionsDateHref, sessionsHostHref } from "../../lib/nav";
import { todayCacheHitRatio } from "./cacheHit";
import { monthSpendCard, todaySpendCard } from "./spendCards";

function tokensLabel(value: number | null): string {
  if (value == null) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function moneyDetail(values: Record<string, number>): string {
  const entries = Object.entries(values);
  if (!entries.length) return "暂无可计价数据";
  const remainder = entries.slice(1).map(([currency, amount]) => `${currency} ${amount.toFixed(2)}`);
  return remainder.length ? `另有 ${remainder.join(" · ")} · 不跨币种相加` : "按币种分栏";
}

function basisLabel(value: string): string {
  return ({ metered_actual: "按量实付", host_billed: "宿主账单", fixed_subscription: "订阅月费", metered_declared: "归因估算", metered_estimate: "默认估算", api_equivalent: "等价标价", other: "其他" } as Record<string, string>)[value] ?? value;
}

function basisLines(values: Record<string, Record<string, number>>): string {
  const lines = Object.entries(values).flatMap(([basis, currencies]) => Object.entries(currencies).map(([currency, amount]) => `${basisLabel(basis)} ${currency === "CNY" ? "¥" : `${currency} `}${amount.toFixed(2)}`));
  return lines.length ? lines.join(" · ") : "暂无可计入的真实支出";
}

function hostTokensLabel(value: SummaryHostTokens): string {
  return `${tokensLabel(value.total)} · 缓存命中 ${value.cache_hit_ratio == null ? "—" : `${(value.cache_hit_ratio * 100).toFixed(1)}%`}`;
}

function summaryState(value: "fresh" | "stale" | "partial" | "unavailable" | "unknown"): { label: string; tone: "success" | "warning" | "neutral" } {
  return ({ fresh: { label: "最新", tone: "success" }, stale: { label: "数据过期", tone: "warning" }, partial: { label: "部分覆盖", tone: "warning" }, unavailable: { label: "不可用", tone: "neutral" }, unknown: { label: "状态未知", tone: "neutral" } } as const)[value];
}

function summaryTokens(value: { freshness: "fresh" | "stale" | "partial" | "unavailable" | "unknown"; total_tokens: number } | null): string {
  return value && value.freshness !== "unavailable" && value.freshness !== "unknown" ? `${tokensLabel(value.total_tokens)} tokens` : "—";
}

function summaryFreshnessNote(value: { freshness: "fresh" | "stale" | "partial" | "unavailable" | "unknown"; last_observed_at: string | null }): string {
  if (value.freshness === "stale") return ` · 最后观测 ${value.last_observed_at?.slice(0, 10) ?? "未知"}`;
  if (value.freshness === "partial") return " · 仅部分字段有观测";
  return "";
}

function budgetStatusLabel(level: string): string {
  return ({ no_budget: "未设置", ok: "正常", warn: "接近预算", over: "已超预算", snoozed: "提醒已静默", disabled: "已关闭" } as Record<string, string>)[level] ?? "暂不可读";
}

function hostStatusLabel(status: OverviewSnapshot["host_rows"][number]["status"]): string {
  return ({ ready: "可用", partial: "部分覆盖", unavailable: "不可用" } as Record<typeof status, string>)[status];
}

function syncStageLabel(stage: string): string {
  return ({ complete: "完成", fold: "会话折账", discover: "来源发现", resolve: "CLI 检查", never: "尚未同步", paused: "已暂停", partial: "部分失败", light: "定向同步", control: "同步控制", facts: "事实导入", unknown: "状态未知" } as Record<string, string>)[stage] ?? "状态未知";
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="stat-card">
    <p className="eyebrow">{label}</p>
    <p className={`stat-value ${value.length > 10 ? "stat-value-compact" : ""}`}>{value}</p>
    <p className="stat-detail">{detail}</p>
  </article>;
}


/**
 * R2（OVERVIEW_DRILLDOWN spec §4.3）：总览内嵌发现条——画布首发承诺
 * 「发现作为相关页面中的事项呈现」的落地。只读 findings_groups_safe 的
 * 既有脱敏投影（零新载荷字段），top 3；每项给「去看证据」的可达路径
 * （宿主会话深链）。两态诚实降级：服务不可用如实说，零发现是诚实空态。
 */
function OverviewFindingsStrip() {
  const [state, setState] = useState<"loading" | "ok" | "unavailable">("loading");
  const [items, setItems] = useState<FindingGroup[]>([]);
  useEffect(() => {
    let active = true;
    void readFindings(null)
      .then((report) => { if (active) { setItems(report.issues.slice(0, 3)); setState("ok"); } })
      .catch(() => { if (active) setState("unavailable"); });
    return () => { active = false; };
  }, []);
  if (state === "loading") return null;
  if (state === "unavailable") {
    return <section className="info-panel overview-findings" aria-labelledby="overview-findings-title"><p id="overview-findings-title" className="overview-findings-note">发现服务暂不可用；稍后随刷新重试。</p></section>;
  }
  if (items.length === 0) {
    return <section className="info-panel overview-findings" aria-labelledby="overview-findings-title"><p id="overview-findings-title" className="overview-findings-note">当前没有需要注意的事项。发现随每次同步重新评估。</p></section>;
  }
  return (
    <section className="info-panel overview-findings" aria-labelledby="overview-findings-title">
      <div className="section-heading"><p className="eyebrow">发现</p><h3 id="overview-findings-title">需要注意</h3></div>
      <ul className="overview-findings-list">
        {items.map((item) => (
          <li key={item.group_id} className={`overview-finding severity-${item.severity}`}>
            <span className="finding-rule">{item.rule}</span>
            <small>{item.host} · {item.count} 例 · {item.sessions_count} 个会话</small>
            {item.sessions_count > 0 && item.host !== "generic" && item.host !== "all" && item.host
              ? <a className="inline-drill" href={sessionsHostHref(item.host)}>去看会话 <span aria-hidden="true">→</span></a>
              : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function OverviewPage({ overview, details }: { overview: OverviewSnapshot | null; details: OverviewDetails | null }) {
  if (!overview) return <section className="empty-state" aria-live="polite"><p className="eyebrow">正在读取</p><h2>准备工作台数据</h2><p>正在通过本地 IPC 获取状态。</p></section>;
  const budgetTone = overview.budget.level === "over" ? "warning" : overview.budget.level === "warn" ? "warning" : overview.budget.level === "ok" ? "success" : "neutral";
  const measuredHosts = details?.monthly && details.monthly.freshness !== "unavailable" && details.monthly.freshness !== "unknown"
    ? Object.values(details.monthly.tokens_by_host).filter((host) => host.total > 0).length : null;
  const cacheHit = todayCacheHitRatio(details?.daily ?? null);
  const todaySpend = todaySpendCard(details?.daily ?? null, details?.monthly ?? null);
  const monthSpend = monthSpendCard(details?.monthly ?? null);
  return <>
    {details?.errors.length ? <div className="error-banner" role="status">部分总览数据不可用：{details.errors.join("；")}。已保留可用分区，未用 0 代替未知。</div> : null}
    <section className="stats-grid" aria-label="工作台状态">
      <StatCard label="今日消耗" value={tokensLabel(overview.today_tokens)} detail={overview.today_tokens == null ? "暂无今日权威数据" : cacheHit == null ? "暂无缓存命中率" : `平均缓存命中率 ${(cacheHit * 100).toFixed(2)}%`} />
      <StatCard label="今日已知成本" value={todaySpend.value} detail={todaySpend.detail} />
      <StatCard label="本月已知支出" value={monthSpend.value} detail={monthSpend.detail} />
      <StatCard label="本月有用量宿主" value={measuredHosts == null ? "—" : String(measuredHosts)} detail={measuredHosts == null ? "月度覆盖数据不可用" : "已观测到 token 的宿主"} />
    </section>
    <section className="overview-detail-grid" aria-label="月度和今日权威汇总">
      <section className="info-panel overview-panel">
        <div><p className="eyebrow">月度权威汇总 · {details?.monthly?.month ?? details?.month ?? "—"}</p><h3>{summaryTokens(details?.monthly ?? null)}</h3><p className="overview-panel-copy">{details?.monthly && details.monthly.freshness !== "unavailable" && details.monthly.freshness !== "unknown" ? `${basisLines(details.monthly.spend_by_basis)}${details.monthly.has_unresolved ? " · 存在未解析项" : ""}${summaryFreshnessNote(details.monthly)}` : "月度汇总不可用；未用 0 代替未知"}</p></div>
        {(() => { const state = summaryState(details?.monthly?.freshness ?? "unavailable"); return <StatusPill tone={state.tone}>{details?.monthly ? `${state.label} · ${details.monthly.coverage.measured_fields}/${details.monthly.coverage.total_fields}` : state.label}</StatusPill>; })()}
      </section>
      <section className="info-panel overview-panel">
        <div><p className="eyebrow">今日权威汇总 · {details?.date ?? "—"}</p><h3>{summaryTokens(details?.daily ?? null)}</h3><p className="overview-panel-copy">{details?.daily && details.daily.freshness !== "unavailable" && details.daily.freshness !== "unknown" ? `${basisLines(details.daily.spend_by_basis)}${details.daily.has_unresolved ? " · 存在未解析项" : ""}${summaryFreshnessNote(details.daily)}` : "今日汇总不可用；请检查来源状态"}</p></div>
        {(() => { const state = summaryState(details?.daily?.freshness ?? "unavailable"); return <StatusPill tone={state.tone}>{details?.daily ? `${state.label} · ${details.daily.coverage.measured_fields}/${details.daily.coverage.total_fields}` : state.label}</StatusPill>; })()}
      </section>
    </section>
    {details?.monthly && details.monthly.freshness !== "unavailable" && details.monthly.freshness !== "unknown" && <section className="overview-host-panel" aria-labelledby="overview-month-host-title">
      <div className="section-heading"><div><p className="eyebrow">月度宿主拆分</p><h3 id="overview-month-host-title">tokens_by_host</h3></div><span className="count-badge">{Object.keys(details.monthly.tokens_by_host).length} 宿主</span></div>
      <div className="overview-host-list">{Object.entries(details.monthly.tokens_by_host).map(([host, tokens]) => <article className="overview-host-row" key={host}><div><strong>{host}</strong><span>{hostTokensLabel(tokens)}</span></div><b>{tokens.total ? tokensLabel(tokens.total) : "—"} token</b></article>)}</div>
      <p className="overview-empty">币种和账单口径仅按 basis 分栏；估算、订阅和等价标价不会跨币种相加。</p>
    </section>}
    <OverviewFindingsStrip />
    {details?.calendar && <section className="info-panel overview-recent-panel" aria-labelledby="overview-recent-title">
      <div className="section-heading"><div><p className="eyebrow">最近观测日</p><h3 id="overview-recent-title">{details.calendar.month}</h3></div><span className="count-badge">{details.calendar.days.length} 天</span></div>
      <div className="overview-recent-list">{details.calendar.days.slice(-5).reverse().map((day) => <a className="overview-recent-row overview-drill" key={day.date} href={sessionsDateHref(day.date)} title={`查看 ${day.date} 的会话`}><span>{day.date}</span><strong>{tokensLabel(day.total_tokens)} tokens</strong><small>{moneyDetail(day.costs)}</small></a>)}</div>
    </section>}
    <div className="overview-detail-grid">
      <section className="info-panel overview-panel" aria-labelledby="overview-budget-title">
        <div><p className="eyebrow">预算</p><h3 id="overview-budget-title">本月预算状态</h3><p className="overview-panel-copy">{overview.budget.month_cost == null || overview.budget.monthly_cny == null ? "尚无可计入的本月金额" : `已用 ¥${overview.budget.month_cost.toFixed(2)} / ¥${overview.budget.monthly_cny.toFixed(2)}`}</p></div>
        <StatusPill tone={budgetTone}>{budgetStatusLabel(overview.budget.level)}</StatusPill>
      </section>
      <section className="info-panel overview-panel" aria-labelledby="overview-sync-title">
        <div><p className="eyebrow">数据新鲜度</p><h3 id="overview-sync-title">{overview.freshness}</h3><p className="overview-panel-copy">同步阶段：{syncStageLabel(overview.sync.stage)} · 订阅月费：{overview.subscription_cny_month == null ? "—" : `¥${overview.subscription_cny_month.toFixed(2)}`}</p></div>
        <button className="button button-secondary" type="button" onClick={() => { window.location.hash = "trust"; }}>查看 Trust</button>
      </section>
    </div>
    <section className="overview-host-panel" aria-labelledby="overview-host-title">
      <div className="section-heading"><div><p className="eyebrow">宿主覆盖</p><h3 id="overview-host-title">本机 Agent 状态</h3></div><span className="count-badge">{overview.host_rows.length ? overview.host_rows.length : overview.hosts == null ? "—" : overview.hosts}</span></div>
      {overview.host_rows.length ? <div className="overview-host-list">{overview.host_rows.map((host) => <a className="overview-host-row overview-drill" key={host.host} href={sessionsHostHref(host.host)} title={`查看 ${host.host} 的会话`}><div><strong>{host.host}</strong><span>{host.today_sessions == null ? "会话不可用" : `${host.today_sessions} 个会话`} · {hostStatusLabel(host.status)}</span></div><b>{tokensLabel(host.today_tokens)} token</b></a>)}</div> : <p className="overview-empty">宿主快照尚未生成。没有快照不等于没有宿主，打开 Trust 可重新发现。</p>}
    </section>
  </>;
}
