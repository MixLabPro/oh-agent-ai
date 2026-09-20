import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  listen,
  readSessions,
  type SessionCostStatus,
  type SessionRow,
  type SessionsCostFilter,
  type SessionsFilters,
  type SessionsPage as SessionsPageData,
  type SessionsWindow,
} from "../../lib/tauri";

const costStates: Array<{ value: SessionsCostFilter; label: string }> = [
  { value: "all", label: "全部计费状态" },
  { value: "estimated", label: "估算" },
  { value: "subscription", label: "订阅" },
  { value: "unpriced", label: "缺价" },
  { value: "unavailable", label: "不可用" },
];

function localDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localMonth(date = new Date()): string {
  return localDate(date).slice(0, 7);
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function initialFilters(): SessionsFilters {
  return { window: "month", month: localMonth(), date_from: shiftDate(localDate(), -6), date_to: localDate(), host_kind: "all", model: "", provider: "", cost_status: "all" };
}

function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function dateLabel(value: string | null): string {
  if (!value) return "时间不可用";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return "时间不可用";
  return parsed.toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function dayLabel(value: string | null): string {
  if (!value) return "未知日期";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return "未知日期";
  return parsed.toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" });
}

function sessionTitle(row: SessionRow): string {
  return `${row.host} 会话 · ${dayLabel(row.first_event_at)}`;
}

function costStateLabel(status: SessionCostStatus): string {
  const labels: Record<SessionCostStatus["state"], string> = { estimated: "估算", subscription: "订阅", unpriced: "缺价", unavailable: "不可用" };
  return `${labels[status.state]} · ${status.reason}`;
}

function costStateShort(state: SessionCostStatus["state"]): string {
  return ({ estimated: "估算", subscription: "订阅", unpriced: "缺价", unavailable: "不可用" } as Record<SessionCostStatus["state"], string>)[state];
}

function costLabel(row: SessionRow): string {
  if (!row.cost_minor) return "—";
  const amount = row.cost_minor.amount_minor / 100;
  return `${row.cost_minor.currency === "CNY" ? "¥" : `${row.cost_minor.currency} `}${amount.toFixed(2)}`;
}

function serverArgs(filters: SessionsFilters, cursor: string | null): Parameters<typeof readSessions>[0] {
  const args: Parameters<typeof readSessions>[0] = { page_size: 50, cursor };
  if (filters.window === "month") args.month = filters.month;
  if (filters.window === "today") args.day = localDate();
  if (filters.window === "7d") { args.date_from = shiftDate(localDate(), -6); args.date_to = localDate(); }
  if (filters.window === "custom") { args.date_from = filters.date_from; args.date_to = filters.date_to; }
  if (filters.host_kind !== "all") args.host_kind = filters.host_kind;
  if (filters.model.trim()) args.model = filters.model.trim();
  if (filters.provider.trim()) args.provider = filters.provider.trim();
  return args;
}

function updateFilter(setFilters: Dispatch<SetStateAction<SessionsFilters>>, key: keyof SessionsFilters, value: string) {
  setFilters((current) => ({ ...current, [key]: value } as SessionsFilters));
}

export function SessionsPage() {
  const [filters, setFilters] = useState<SessionsFilters>(initialFilters);
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [windowTokens, setWindowTokens] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const requestInFlight = useRef(false);
  const pendingRefresh = useRef(false);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const serverKey = useMemo(() => JSON.stringify([filters.window, filters.month, filters.date_from, filters.date_to, filters.host_kind, filters.model, filters.provider]), [filters]);
  const visibleRows = useMemo(() => filters.cost_status === "all" ? rows : rows.filter((row) => row.cost_status.state === filters.cost_status), [filters.cost_status, rows]);

  const fetchFirstPage = async () => {
    if (requestInFlight.current) {
      pendingRefresh.current = true;
      generation.current += 1;
      return;
    }
    const currentFilters = filtersRef.current;
    const currentGeneration = ++generation.current;
    requestInFlight.current = true;
    setLoading(true);
    setError(null);
    setRows([]);
    setNextCursor(null);
    try {
      const page = await readSessions(serverArgs(currentFilters, null));
      if (currentGeneration !== generation.current) return;
      setRows(page.sessions);
      setNextCursor(page.next_cursor);
      setTotal(page.window_session_count);
      setWindowTokens(page.window_total_tokens);
    } catch (reason: unknown) {
      if (currentGeneration !== generation.current) return;
      setError(reason instanceof Error ? reason.message : "会话数据暂不可用");
      setTotal(null);
      setWindowTokens(null);
    } finally {
      if (currentGeneration === generation.current) setLoading(false);
      requestInFlight.current = false;
      if (pendingRefresh.current) {
        pendingRefresh.current = false;
        void fetchFirstPage();
      }
    }
  };

  useEffect(() => { void fetchFirstPage(); }, [serverKey]);

  useEffect(() => {
    let active = true;
    const refresh = () => { if (active) void fetchFirstPage(); };
    let cleanups: Array<() => void> = [];
    Promise.all([listen("usage-fold-updated", refresh), listen("sync-status-updated", refresh)])
      .then((unsubscribers) => { if (active) cleanups = unsubscribers; else unsubscribers.forEach((unsubscribe) => unsubscribe()); });
    return () => { active = false; cleanups.forEach((unsubscribe) => unsubscribe()); };
  }, [serverKey]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore || requestInFlight.current) return;
    const currentGeneration = generation.current;
    setLoadingMore(true);
    try {
      const page = await readSessions(serverArgs(filters, nextCursor));
      if (currentGeneration !== generation.current) return;
      setRows((current) => {
        const known = new Set(current.map((row) => row.session_ref));
        return current.concat(page.sessions.filter((row) => !known.has(row.session_ref)));
      });
      setNextCursor(page.next_cursor);
      setTotal(page.window_session_count);
      setWindowTokens(page.window_total_tokens);
    } catch (reason: unknown) {
      if (currentGeneration === generation.current) setError(reason instanceof Error ? reason.message : "更多会话暂不可用");
    } finally {
      if (currentGeneration === generation.current) setLoadingMore(false);
    }
  };

  return <>
    <section className="sessions-page-header">
      <div>
        <p className="eyebrow">本地会话索引</p>
        <h2>会话</h2>
        <p className="section-description">只显示本机 authority 的安全聚合：宿主、时间、模型、token 和计费状态。不会把会话正文、路径或原生会话 ID 放入页面。</p>
      </div>
      <div className="sessions-header-actions">
        <span className="status-pill"><span aria-hidden="true" className="status-dot" />安全列表</span>
        <button className="button button-secondary" type="button" onClick={() => void fetchFirstPage()} disabled={loading}>刷新</button>
      </div>
    </section>

    <section className="sessions-toolbar" aria-label="会话筛选">
      <label>时间窗口<select value={filters.window} onChange={(event) => updateFilter(setFilters, "window", event.target.value)}><option value="month">按月</option><option value="today">今天</option><option value="7d">最近 7 天</option><option value="custom">自定义</option></select></label>
      {filters.window === "month" && <label>月份<input type="month" value={filters.month} onChange={(event) => updateFilter(setFilters, "month", event.target.value)} /></label>}
      {filters.window === "custom" && <><label>开始日期<input type="date" value={filters.date_from} onChange={(event) => updateFilter(setFilters, "date_from", event.target.value)} /></label><label>结束日期<input type="date" value={filters.date_to} onChange={(event) => updateFilter(setFilters, "date_to", event.target.value)} /></label></>}
      <label>宿主<input list="session-host-options" value={filters.host_kind === "all" ? "" : filters.host_kind} placeholder="全部宿主 / 动态宿主" onChange={(event) => updateFilter(setFilters, "host_kind", event.target.value || "all")} /></label>
      <datalist id="session-host-options"><option value="codex" /><option value="claude-code" /><option value="dsh" /><option value="workbuddy" /><option value="zcode" /><option value="minimax-code" /></datalist>
      <label>模型<input value={filters.model} placeholder="可选精确匹配" onChange={(event) => updateFilter(setFilters, "model", event.target.value)} /></label>
      <label>服务商<input value={filters.provider} placeholder="可选精确匹配" onChange={(event) => updateFilter(setFilters, "provider", event.target.value)} /></label>
      <label>计费状态<select value={filters.cost_status} onChange={(event) => updateFilter(setFilters, "cost_status", event.target.value)}>{costStates.map((state) => <option key={state.value} value={state.value}>{state.label}</option>)}</select></label>
    </section>

    {error && <div className="error-banner" role="alert">会话数据不可用：{error}</div>}
    <section className="sessions-summary" aria-live="polite">
      <div><strong>{total === null ? "—" : total}</strong><span>窗口会话</span></div>
      <div><strong>{windowTokens === null ? "—" : compact(windowTokens)}</strong><span>窗口 tokens</span></div>
      <div><strong>{visibleRows.length}</strong><span>{filters.cost_status === "all" ? "当前页" : "当前页匹配"}</span></div>
      <p>当前加载 {rows.length} 条 · 成本不跨币种相加</p>
    </section>

    <section className="sessions-panel" aria-labelledby="sessions-list-title">
      <div className="section-heading"><div><p className="eyebrow">安全投影</p><h3 id="sessions-list-title">会话列表</h3></div><span className="count-badge">{nextCursor ? "可继续" : "已加载"}</span></div>
      {loading ? <div className="sessions-state" role="status"><strong>正在读取会话</strong><p>正在通过本地 authority 汇总当前窗口，不会上传数据。</p></div> : visibleRows.length === 0 ? <div className="sessions-state"><strong>{error ? "无法显示会话" : rows.length ? "没有匹配的计费状态" : "暂无会话"}</strong><p>{error ? "请检查本地数据同步状态后重试。" : "当前筛选窗口没有可展示的安全会话聚合。"}</p></div> : <>
        <div className="sessions-table-wrap"><table className="sessions-table"><thead><tr><th scope="col">会话</th><th scope="col">宿主 · 模型</th><th scope="col">时间</th><th scope="col">Tokens</th><th scope="col">费用</th><th scope="col">状态</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.session_ref}><td><strong>{sessionTitle(row)}</strong><code>{row.session_ref.slice(0, 15)}…</code></td><td>{row.host}<small>{row.model_ids.length ? row.model_ids.join(" · ") : "模型不可用"}</small></td><td>{dateLabel(row.first_event_at)}<small>{row.last_event_at ? `至 ${dateLabel(row.last_event_at)}` : "结束时间不可用"}</small></td><td><strong>{compact(row.tokens.total)}</strong><small>{row.event_count} 个事件 · 峰值 {compact(row.peak_tokens)}</small></td><td><strong>{costLabel(row)}</strong><small>{row.cost_minor ? row.cost_minor.basis : "未计入金额"}</small></td><td><span className={`session-cost-state session-cost-${row.cost_status.state}`}>{costStateLabel(row.cost_status)}</span></td></tr>)}</tbody></table></div>
        <div className="sessions-card-list">{visibleRows.map((row) => <article className="session-card" key={row.session_ref}><div className="session-card-heading"><strong>{sessionTitle(row)}</strong><span className={`session-cost-state session-cost-${row.cost_status.state}`}>{costStateShort(row.cost_status.state)}</span></div><p>{row.host} · {row.model_ids.join(" · ") || "模型不可用"}</p><div><span>{compact(row.tokens.total)} token · {row.event_count} 个事件</span><strong>{costLabel(row)}</strong></div><small>{dateLabel(row.first_event_at)} 至 {dateLabel(row.last_event_at)}</small><code>{row.session_ref.slice(0, 15)}…</code></article>)}</div>
        {nextCursor && <div className="sessions-more"><button className="button button-secondary" type="button" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "正在加载…" : "加载更多"}</button></div>}
      </>}
    </section>
  </>;
}
