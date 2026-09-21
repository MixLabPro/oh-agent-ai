import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { listen, readOverviewSnapshot, type OverviewSnapshot } from "../lib/tauri";
import { FindingsPage } from "../features/findings/FindingsPage";
import { TrustPage } from "../features/trust/TrustPage";
import { UsagePage } from "../features/usage/UsagePage";
import { SessionsPage } from "../features/sessions/SessionsPage";
import { TestPage } from "../features/test/TestPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { SkillsPage } from "../features/skills/SkillsPage";
import { OverviewPage } from "../features/overview/OverviewPage";
import { StatusPill } from "../components/ui/StatusPill";

type Page = "overview" | "usage" | "sessions" | "findings" | "test" | "trust" | "skills" | "settings";

const navigation: Array<{ id: Page; label: string; hint: string }> = [
  { id: "overview", label: "总览", hint: "当前状态" },
  { id: "usage", label: "用量", hint: "按日查看" },
  { id: "sessions", label: "会话", hint: "安全列表" },
  { id: "findings", label: "发现", hint: "风险与待办" },
  { id: "test", label: "测试", hint: "路线质量" },
  { id: "trust", label: "Trust", hint: "证据审计" },
  { id: "skills", label: "Skill", hint: "定义体检" },
  { id: "settings", label: "设置", hint: "本机配置" },
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

export function App() {
  const [page, setPage] = useState<Page>(pageFromHash);
  const [overview, setOverview] = useState<OverviewSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (page !== "overview") return;
    let active = true;
    setError(null);
    const refresh = () => readOverviewSnapshot()
      .then((value) => { if (active) setOverview(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "本地数据暂不可用"); });
    void refresh();
    let cleanups: Array<() => void> = [];
    Promise.all([listen("usage-fold-updated", refresh), listen("sync-status-updated", refresh)])
      .then((unsubscribers) => { if (active) cleanups = unsubscribers; else unsubscribers.forEach((unsubscribe) => unsubscribe()); });
    return () => { active = false; cleanups.forEach((unsubscribe) => unsubscribe()); };
  }, [page]);

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
      {page === "overview" ? <OverviewPage overview={overview} /> : page === "usage" ? <UsagePage /> : page === "sessions" ? <SessionsPage /> : page === "trust" ? <TrustPage /> : page === "test" ? <TestPage /> : page === "skills" ? <SkillsPage /> : page === "settings" ? <SettingsPage /> : <FindingsPage />}
    </main>
  </div></AppErrorBoundary>;
}
