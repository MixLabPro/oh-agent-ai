import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { listen, readOverviewSnapshot, type OverviewSnapshot } from "../lib/tauri";
import { TrustPage } from "../features/trust/TrustPage";

type Overview = OverviewSnapshot;

type Page = "overview" | "findings" | "trust";

const navigation: Array<{ id: Page; label: string; hint: string }> = [
  { id: "overview", label: "总览", hint: "当前状态" },
  { id: "findings", label: "发现", hint: "风险与待办" },
  { id: "trust", label: "Trust", hint: "证据审计" },
];

function pageFromHash(): Page {
  const value = window.location.hash.replace(/^#\/?/, "");
  return navigation.some((item) => item.id === value) ? value as Page : "overview";
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error("[workbench-react] render failure", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <main className="main-content"><section className="empty-state" role="alert">
      <p className="eyebrow">工作台暂不可用</p><h1>页面渲染失败</h1>
      <p>本地数据没有被修改。请刷新页面；如果问题持续，请从设置页导出脱敏诊断。</p>
      <button className="button button-secondary" type="button" onClick={() => window.location.reload()}>重新加载</button>
    </section></main>;
  }
}

function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" }) {
  return <span className={`status-pill status-pill-${tone}`}><span aria-hidden="true" className="status-dot" />{children}</span>;
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="stat-card">
    <p className="eyebrow">{label}</p>
    <p className="stat-value">{value}</p>
    <p className="stat-detail">{detail}</p>
  </article>;
}

function OverviewPage({ overview }: { overview: Overview | null }) {
  if (!overview) return <section className="empty-state" aria-live="polite"><p className="eyebrow">正在读取</p><h2>准备工作台数据</h2><p>正在通过本地 IPC 获取状态。</p></section>;
  return <>
    <section className="hero-panel">
      <div>
        <p className="eyebrow">本地工作台 · Phase 1 preview</p>
        <h2>把运行状态变成可理解的证据</h2>
        <p className="hero-copy">React 页面只负责呈现，数据仍由本机 Rust runtime 计算和脱敏。</p>
      </div>
      <StatusPill tone={overview.monitored ? "success" : "warning"}>{overview.monitored ? "实时监控已开启" : "实时监控未开启"}</StatusPill>
    </section>
    <section className="stats-grid" aria-label="工作台状态">
      <StatCard label="已覆盖宿主" value={overview.hosts == null ? "—" : String(overview.hosts)} detail={overview.hosts == null ? "覆盖数据不可用" : "本机已发现的 Agent"} />
      <StatCard label="可判定风险" value={overview.findings == null ? "—" : String(overview.findings)} detail={overview.findings == null ? "等待 Trust DTO" : "没有风险不等于没有证据"} />
      <StatCard label="安全证据" value={overview.evidence == null ? "—" : String(overview.evidence)} detail={overview.evidence == null ? "等待 Trust DTO" : "已脱敏的本地证据引用"} />
    </section>
    <section className="info-panel">
      <div><p className="eyebrow">数据新鲜度</p><p>{overview.freshness}</p></div>
      <button className="button button-secondary" type="button" disabled>重新审计（下一阶段）</button>
    </section>
  </>;
}

function FindingsPage({ trust }: { trust: boolean }) {
  return <section className="empty-state">
    <p className="eyebrow">{trust ? "Trust / 证据链" : "发现 / Finding"}</p>
    <h2>{trust ? "证据工作台即将接入" : "风险与待办即将接入"}</h2>
    <p>这是 React 迁移的第一个垂直切片。下一轮会接入真实的 Finding、证据时间线、置信度和监控状态 DTO。</p>
    <div className="callout"><strong>当前边界</strong><span>预览页不会读取或展示真实路径、会话内容、凭据或原始宿主日志。</span></div>
  </section>;
}

export function App() {
  const [page, setPage] = useState<Page>(pageFromHash);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => readOverviewSnapshot()
      .then((value) => { if (active) setOverview(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "本地数据暂不可用"); });
    void refresh();
    let cleanups: Array<() => void> = [];
    Promise.all([listen("usage-fold-updated", refresh), listen("sync-status-updated", refresh)])
      .then((unsubscribers) => { if (active) cleanups = unsubscribers; else unsubscribers.forEach((unsubscribe) => unsubscribe()); });
    return () => { active = false; cleanups.forEach((unsubscribe) => unsubscribe()); };
  }, []);

  useEffect(() => {
    const onHashChange = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = (next: Page) => {
    window.location.hash = next;
    setPage(next);
  };

  return <AppErrorBoundary><div className="app-shell">
    <aside className="sidebar" aria-label="主导航">
      <div className="brand"><span className="brand-mark" aria-hidden="true">av</span><div><strong>agent-vitals</strong><span>工作台预览</span></div></div>
      <nav className="nav-list">
        {navigation.map((item) => <button key={item.id} className={`nav-item ${page === item.id ? "nav-item-active" : ""}`} aria-current={page === item.id ? "page" : undefined} type="button" onClick={() => navigate(item.id)}><span>{item.label}</span><small>{item.hint}</small></button>)}
      </nav>
      <div className="sidebar-footer"><StatusPill>离线优先</StatusPill><span>所有数据留在本机</span></div>
    </aside>
    <main className="main-content">
      <header className="page-header"><div><p className="eyebrow">Workbench React migration</p><h1>{navigation.find((item) => item.id === page)?.label}</h1></div><div className="header-actions"><StatusPill tone="success">本地运行</StatusPill><button className="button button-secondary" type="button" onClick={() => window.location.reload()}>刷新</button></div></header>
      {error && <div className="error-banner" role="alert">{error} · 当前显示安全的预览状态</div>}
      {page === "overview" ? <OverviewPage overview={overview} /> : page === "trust" ? <TrustPage /> : <FindingsPage trust={false} />}
    </main>
  </div></AppErrorBoundary>;
}
