import { StatusPill } from "../../components/ui/StatusPill";
import type { OverviewSnapshot } from "../../lib/tauri";

function tokensLabel(value: number | null): string {
  if (value == null) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function moneyLabel(values: Record<string, number>): string {
  const entries = Object.entries(values);
  if (!entries.length) return "—";
  const [currency, amount] = entries[0];
  return `${currency === "CNY" ? "¥" : currency + " "}${amount.toFixed(2)}`;
}

function moneyDetail(values: Record<string, number>): string {
  const entries = Object.entries(values);
  if (!entries.length) return "暂无可计价数据";
  const remainder = entries.slice(1).map(([currency, amount]) => `${currency} ${amount.toFixed(2)}`);
  return remainder.length ? `另有 ${remainder.join(" · ")} · 不跨币种相加` : "按币种分栏";
}

function budgetStatusLabel(level: string): string {
  return ({ no_budget: "未设置", ok: "正常", warn: "接近预算", over: "已超预算", snoozed: "提醒已静默", disabled: "已关闭" } as Record<string, string>)[level] ?? "暂不可读";
}

function hostStatusLabel(status: OverviewSnapshot["host_rows"][number]["status"]): string {
  return ({ ready: "可用", partial: "部分覆盖", unavailable: "不可用" } as Record<typeof status, string>)[status];
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="stat-card">
    <p className="eyebrow">{label}</p>
    <p className={`stat-value ${value.length > 10 ? "stat-value-compact" : ""}`}>{value}</p>
    <p className="stat-detail">{detail}</p>
  </article>;
}

export function OverviewPage({ overview }: { overview: OverviewSnapshot | null }) {
  if (!overview) return <section className="empty-state" aria-live="polite"><p className="eyebrow">正在读取</p><h2>准备工作台数据</h2><p>正在通过本地 IPC 获取状态。</p></section>;
  const budgetTone = overview.budget.level === "over" ? "warning" : overview.budget.level === "warn" ? "warning" : overview.budget.level === "ok" ? "success" : "neutral";
  return <>
    <section className="hero-panel">
      <div>
        <p className="eyebrow">本地工作台 · 数据概览</p>
        <h2>把运行状态变成可理解的证据</h2>
        <p className="hero-copy">数据来自本机 authority；React 只呈现安全投影，不读取原始日志、路径或工作区内容。</p>
      </div>
      <StatusPill tone={overview.sync.ok ? "success" : "warning"}>{overview.sync.ok ? "本地同步正常" : "同步状态需检查"}</StatusPill>
    </section>
    <section className="stats-grid" aria-label="工作台状态">
      <StatCard label="今日消耗" value={tokensLabel(overview.today_tokens)} detail={overview.today_tokens == null ? "暂无今日权威数据" : "tokens · 含缓存读写"} />
      <StatCard label="今日费用" value={moneyLabel(overview.today_spend)} detail={moneyDetail(overview.today_spend)} />
      <StatCard label="本月费用" value={moneyLabel(overview.month_spend)} detail={moneyDetail(overview.month_spend)} />
      <StatCard label="已覆盖宿主" value={overview.hosts == null ? "—" : String(overview.hosts)} detail={overview.hosts == null ? "覆盖数据不可用" : "本机已发现的 Agent"} />
    </section>
    <div className="overview-detail-grid">
      <section className="info-panel overview-panel" aria-labelledby="overview-budget-title">
        <div><p className="eyebrow">预算</p><h3 id="overview-budget-title">本月预算状态</h3><p className="overview-panel-copy">{overview.budget.month_cost == null || overview.budget.monthly_cny == null ? "尚无可计入的本月金额" : `已用 ¥${overview.budget.month_cost.toFixed(2)} / ¥${overview.budget.monthly_cny.toFixed(2)}`}</p></div>
        <StatusPill tone={budgetTone}>{budgetStatusLabel(overview.budget.level)}</StatusPill>
      </section>
      <section className="info-panel overview-panel" aria-labelledby="overview-sync-title">
        <div><p className="eyebrow">数据新鲜度</p><h3 id="overview-sync-title">{overview.freshness}</h3><p className="overview-panel-copy">同步阶段：{overview.sync.stage} · 订阅月费：{overview.subscription_cny_month == null ? "—" : `¥${overview.subscription_cny_month.toFixed(2)}`}</p></div>
        <button className="button button-secondary" type="button" onClick={() => { window.location.hash = "trust"; }}>查看 Trust</button>
      </section>
    </div>
    <section className="overview-host-panel" aria-labelledby="overview-host-title">
      <div className="section-heading"><div><p className="eyebrow">宿主覆盖</p><h3 id="overview-host-title">本机 Agent 状态</h3></div><span className="count-badge">{overview.host_rows.length ? overview.host_rows.length : overview.hosts == null ? "—" : overview.hosts}</span></div>
      {overview.host_rows.length ? <div className="overview-host-list">{overview.host_rows.map((host) => <article className="overview-host-row" key={host.host}><div><strong>{host.host}</strong><span>{host.today_sessions == null ? "会话不可用" : `${host.today_sessions} 个会话`} · {hostStatusLabel(host.status)}</span></div><b>{tokensLabel(host.today_tokens)} token</b></article>)}</div> : <p className="overview-empty">宿主快照尚未生成。没有快照不等于没有宿主，打开 Trust 可重新发现。</p>}
    </section>
  </>;
}
