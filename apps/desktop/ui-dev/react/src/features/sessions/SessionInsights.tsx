import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { safeUiError } from "../../lib/tauri";
import {
  readSessionInsights, readSessionTraceEvidence,
  type InsightDiagnostic, type InsightStep, type NominalCost, type SessionInsights, type SessionTraceEvidence,
} from "../../lib/sessionInsights";
import { bandFor, layoutSteps, maxVisibleSteps, miniColumns, niceCeil, packBands, resolveWindow, tickStep } from "./insightsGeometry";
import "./session-insights.css";

// 会话消耗诊断（SESSION_TRACE_DIAGNOSTICS_SPEC r6 §8）：摘要 → 紧凑诊断列表 →
// 联动的轨迹与检查器。数据全部来自 `session_trace(output = "insights")`；错误
// 摘录等原始证据只经本地命令 `session_trace_evidence` 按需读取（§10）。

// ─────────────────────────── 文案与格式 ───────────────────────────

export function fmtTokens(n: number): string {
  if (n >= 1e8) return `${(n / 1e8).toFixed(2)} 亿`;
  if (n >= 1e6) return `${Math.round(n / 1e4)} 万`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(1)} 万`;
  return String(Math.round(n));
}
export function fmtPct(v: number): string {
  return `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;
}
export function fmtDuration(ms: number): string {
  if (ms >= 3_600_000) return `${(ms / 3_600_000).toFixed(1)} 小时`;
  if (ms >= 60_000) return `${Math.round(ms / 60_000)} 分钟`;
  return `${Math.round(ms / 1000)} 秒`;
}
function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}
export function fmtMoney(cost: NominalCost | null): string | null {
  if (!cost || cost.amounts.length === 0) return null;
  const parts = cost.amounts.map(a => `${a.currency === "USD" ? "$" : a.currency === "CNY" ? "¥" : `${a.currency} `}${(a.amount_minor / 100).toFixed(2)}`);
  return parts.join(" + ") + (cost.coverage === "partial" ? "（部分调用无价卡）" : "");
}
const inputOf = (s: { input: { cache_read: number; cache_write: number; uncached_input: number } }) => s.input.cache_read + s.input.cache_write + s.input.uncached_input;
const missOf = (s: { input: { cache_write: number; uncached_input: number } }) => s.input.cache_write + s.input.uncached_input;

const REMEDY: Record<string, [string, string]> = {
  "inspect-repeated-failure": ["先弄清这个调用为什么失败，再让助手重试。", "这几个回合的消耗不代表都能省下来。"],
  "review-context-growth": ["看看会话里有没有与当前任务无关的内容；任务确实变了，可以拆成新会话。", "新开会话会丢掉已有上下文，不建议一律这样做。"],
  "inspect-uncached-input": ["查看这段调用的模型和输入规模有没有变化。", "不保证能降低消耗。"],
};
const NOTE_TEXT: Record<string, string> = {
  possible_cache_expiry: "长时间空闲之后，缓存可能已过期",
  after_model_change: "模型切换之后，可能影响缓存复用",
};
/// 线格式里没有缓存写入字段的宿主（codex / workbuddy 的用量只有 cached / uncached 两档）：
/// 图例写「宿主不报告」，与「测到为 0」分开（§8.2）。
const HOSTS_WITHOUT_CACHE_WRITE = new Set(["codex", "workbuddy"]);

const LANE_REASON: Record<string, string> = {
  not_recorded_by_host: "宿主没有记录",
  not_ingested: "还没有接入",
  no_data_in_session: "这个会话没有",
};

export type DiagText = { title: string; chip: [string, string]; fact: string; why: string };

export function diagText(d: InsightDiagnostic, unit: string): DiagText {
  const f = d.fact;
  const num = (k: string) => (typeof f[k] === "number" ? (f[k] as number) : 0);
  const chip: [string, string] = d.cause === "evidence" ? ["ev", "有错误摘要"] : d.cause === "possible" ? ["maybe", "可能原因"] : ["unk", "原因未明"];
  if (d.kind === "repeated_failure") {
    const tool = typeof f.capability_id === "string" ? f.capability_id : "工具";
    const groups = num("groups");
    const title = f.same_invocation ? `同一调用失败 ${num("failures")} 次` : groups > 1 ? `${groups} 个调用反复失败，共 ${num("failures")} 次` : `${tool} 反复失败 ${num("failures")} 次`;
    const fact = f.same_invocation
      ? `${tool} 调用（参数相同）在 ${num("steps_hit")} 个${unit}里失败 ${num("failures")} 次。`
      : `${tool} 等调用在 ${num("steps_hit")} 个${unit}里共失败 ${num("failures")} 次。`;
    const why = d.cause === "evidence" ? "错误摘要见证据。失败原因分类尚未接入。" : "没有可查看的错误摘录，失败原因未明。";
    return { title, chip, fact, why };
  }
  if (d.kind === "input_growth") {
    return {
      title: `单次输入峰值增长 ${num("ratio").toFixed(1)} 倍`, chip,
      fact: `单次调用输入从 ${fmtTokens(num("peak_from"))} 涨到 ${fmtTokens(num("peak_to"))} tokens，这段占本会话输入 ${fmtPct(d.impact.share_of_session_input)}。`,
      why: "尚不能确定是否包含不必要的上下文，也可能是任务本身需要。",
    };
  }
  const drop = d.explanation === "hit_rate_drop";
  let fact = `${num("calls")} 次调用未命中缓存的输入 ${fmtTokens(num("uncached_tokens"))} tokens，占本会话输入 ${fmtPct(d.impact.share_of_session_input)}。`;
  if (drop) fact += ` 命中率从 ${fmtPct(num("hit_before"))} 降到 ${fmtPct(num("hit_after"))}。`;
  let why = "该区间未观察到长时间中断或模型切换，当前记录不足以解释未命中原因。";
  const notes = d.context_notes.filter(n => NOTE_TEXT[n.explanation]).map(n => `${n.calls} 次发生在${NOTE_TEXT[n.explanation]}`);
  if (notes.length) why += ` 另有 ${notes.join("，")}，不计入这条。`;
  return { title: drop ? "缓存命中率下降" : "高未命中输入", chip, fact, why };
}

// ─────────────────────────── 组件 ───────────────────────────

type Mode =
  | { kind: "diag"; diag: number }
  | { kind: "step"; step: number }
  | { kind: "calls"; from: number; to: number }
  | { kind: "failure"; step: number; ts: number }
  | { kind: "safety" };

const PAD_L = 52;
const PAD_R = 52;

export function SessionInsightsPanel({ sessionRef, refreshKey }: { sessionRef: string; refreshKey: number }) {
  const [data, setData] = useState<{ ref: string; insights: SessionInsights } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [mode, setMode] = useState<Mode | null>(null);
  const modeRef = useRef<Mode | null>(null);
  modeRef.current = mode;
  const [history, setHistory] = useState<{ mode: Mode; cursor: number }[]>([]);
  const [cursor, setCursor] = useState(1);
  const [win, setWin] = useState<{ view: [number, number]; navKey: string } | null>(null);
  // 导航计数：每次点诊断 / 回合 / 方向键 +1。同一诊断再点一次也算新导航（缩略图拖走后
  // 按 Esc 或「下一处」要能把它带回视野）。
  const [nav, setNav] = useState(0);
  const lastView = useRef<[number, number] | null>(null);
  // 数据代次：同一会话刷新后 +1。证据缓存按代次校验（旧值先照常显示、后台重取，
  // 不闪「正在读取」）；迟到的旧响应不得覆盖新值。
  const [dataGen, setDataGen] = useState(0);
  const dataGenRef = useRef(0);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [width, setWidth] = useState(800);
  const [evidence, setEvidence] = useState<Record<string, { value: SessionTraceEvidence | "loading" | "error"; gen: number }>>({});
  const chartBox = useRef<HTMLDivElement | null>(null);

  // 换会话才清空；同一会话的后台刷新（每次同步都会触发）保留当前视图与选择，
  // 只在新数据到达后校验选择是否仍然有效（验收 Major：每次同步都把用户拽回诊断 1）。
  const loadedRef = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    const sameSession = loadedRef.current === sessionRef;
    if (!sameSession) { setData(null); setMode(null); setHistory([]); setWin(null); setEvidence({}); lastView.current = null; }
    setError(null);
    void readSessionInsights(sessionRef).then(insights => {
      if (!active) return;
      loadedRef.current = sessionRef;
      setData({ ref: sessionRef, insights });
      setRefreshFailed(false);
      dataGenRef.current += 1;
      setDataGen(dataGenRef.current);
      const current = modeRef.current;
      if (!(sameSession && current && modeStillValid(current, insights))) {
        setHistory([]);
        if (insights.diagnostics.length) { setCursor(insights.diagnostics[0].steps.from); setMode({ kind: "diag", diag: 0 }); }
        else { const s = insights.axis.steps.find(x => x.notes.length)?.index ?? 1; setCursor(s); setMode({ kind: "step", step: s }); }
      }
      setCursor(c => Math.min(Math.max(1, c), Math.max(1, insights.axis.steps.length)));
    }).catch((reason: unknown) => {
      if (!active) return;
      // 首次加载失败 → 整块报错；刷新失败 → 保留旧数据并提示（不静默吞掉）。
      if (sameSession) setRefreshFailed(true); else setError(safeUiError(reason, "消耗诊断暂不可用"));
    });
    return () => { active = false; };
  }, [sessionRef, refreshKey, retry]);

  useEffect(() => {
    const el = chartBox.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(entries => { const w = Math.floor(entries[0].contentRect.width); if (w > 0) setWidth(Math.max(340, w)); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  const insights = data?.ref === sessionRef ? data.insights : null;
  const steps = insights?.axis.steps ?? [];
  const unit = insights?.axis.unit === "turn" ? "回合" : "调用";
  const plotW = width - PAD_L - PAD_R;
  const maxVisible = maxVisibleSteps(plotW);
  const focus: [number, number] = useMemo(() => {
    if (!insights || !mode) return [cursor, cursor];
    if (mode.kind === "diag") { const d = insights.diagnostics[mode.diag]; return d ? [d.steps.from, d.steps.to] : [cursor, cursor]; }
    if (mode.kind === "calls") return [mode.from, mode.to];
    return [cursor, cursor];
  }, [insights, mode, cursor]);
  const navKey = String(nav);
  const view: [number, number] = resolveWindow(steps.length, maxVisible, win, navKey, focus[0], focus[1], lastView.current);
  lastView.current = view;
  const setUserWindow = (next: [number, number]) => setWin({ view: next, navKey });

  // 需要原始证据的模式按需加载（按区间缓存）。
  const evidenceRange: [number, number] | null = (() => {
    if (!insights || !mode) return null;
    if (mode.kind === "diag") { const d = insights.diagnostics[mode.diag]; return d?.kind === "repeated_failure" ? [d.steps.from, d.steps.to] : null; }
    if (mode.kind === "calls") return [mode.from, mode.to];
    if (mode.kind === "failure" || mode.kind === "step") return [mode.step, mode.step];
    if (mode.kind === "safety") return [1, Math.max(1, steps.length)];
    return null;
  })();
  const evKey = evidenceRange ? `${mode?.kind === "safety" ? "safety" : "calls"}:${evidenceRange[0]}-${evidenceRange[1]}` : null;
  const includeCalls = mode?.kind !== "safety";
  useEffect(() => {
    if (!evKey || !evidenceRange) return;
    const entry = evidence[evKey];
    if (entry && (entry.gen >= dataGen || entry.value === "loading")) return;
    const generation = dataGen;
    const ref = sessionRef;
    // 首次读取显示「正在读取」；刷新后的重取保留旧值直到新值到达。
    if (!entry) setEvidence(e => ({ ...e, [evKey]: { value: "loading", gen: generation } }));
    const settle = (value: SessionTraceEvidence | "error") => {
      if (generation !== dataGenRef.current || ref !== loadedRef.current) return;
      setEvidence(e => ({ ...e, [evKey]: { value, gen: generation } }));
    };
    void readSessionTraceEvidence(sessionRef, evidenceRange[0], evidenceRange[1], includeCalls).then(settle).catch(() => settle("error"));
  }, [evKey, evidence, dataGen]); // eslint-disable-line react-hooks/exhaustive-deps
  const retryEvidence = () => { if (evKey) setEvidence(e => { const next = { ...e }; delete next[evKey]; return next; }); };
  const ev = evKey ? evidence[evKey]?.value : undefined;

  const go = (next: Mode, push = true) => {
    setNav(n => n + 1);
    if (push && mode) setHistory(h => [...h, { mode, cursor }].slice(-20));
    if (!push) setHistory([]);
    setMode(next);
    if (next.kind === "step" || next.kind === "failure") setCursor(next.step);
    if (next.kind === "diag" && insights) setCursor(insights.diagnostics[next.diag].steps.from);
  };
  const back = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setMode(prev.mode);
    setCursor(prev.cursor);
    setNav(n => n + 1);
    setHistory(history.slice(0, -1));
  };

  if (error) return <section className="session-detail-panel session-insights" aria-label="消耗诊断"><div role="alert"><p>消耗诊断暂不可用：{error}；下方事实时间线仍可查看。</p><button className="button button-secondary" onClick={() => setRetry(v => v + 1)}>重试</button></div></section>;
  if (!insights) return <section className="session-detail-panel session-insights" aria-label="消耗诊断"><p role="status">正在分析这次会话的消耗…</p></section>;

  const all = inputOf(insights.session);
  const diags = insights.diagnostics;
  const selectedDiag = mode?.kind === "diag" ? mode.diag : -1;
  const money = fmtMoney(insights.session.nominal_cost);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next = Math.min(steps.length, Math.max(1, cursor + (e.key === "ArrowRight" ? 1 : -1)));
      go({ kind: "step", step: next }, false);
    } else if (e.key === "Escape" && diags.length) {
      go({ kind: "diag", diag: selectedDiag >= 0 ? selectedDiag : 0 }, false);
    }
  };

  return <section className="session-detail-panel session-insights" aria-label="消耗诊断">
    <div className="section-heading"><div><p className="eyebrow">消耗诊断</p><h3>这次会话的消耗集中在哪里</h3></div><span className="count-badge">{steps.length} 个{unit}</span></div>
    {refreshFailed && <p className="insights-refresh-failed" role="status">刷新失败，显示的是上一次的结果。<button type="button" className="link" onClick={() => setRetry(v => v + 1)}>重试</button></p>}

    <dl className="insights-summary">
      <div><dt>{unit}</dt><dd className="num">{steps.length}</dd></div>
      <div><dt>调用</dt><dd className="num">{insights.session.calls}</dd></div>
      <div><dt>输入 / 输出</dt><dd className="num">{fmtTokens(all)} / {fmtTokens(insights.session.output)}</dd></div>
      <div><dt>缓存命中率</dt><dd className="num">{all ? fmtPct(insights.session.input.cache_read / all) : "—"}</dd></div>
      <div><dt>名义成本</dt><dd>{money ? <><span className="num">{money}</span><small>按调用模型的官方价估算，含输出，非账单</small></> : <><span className="muted">暂无可用计价依据</span><small>{insights.session.nominal_cost_reason === "no_pricing_snapshot" ? "这段时间还没有价目快照" : insights.session.nominal_cost_reason === "no_price_card" ? "这些模型没有价卡" : ""}</small></>}</dd></div>
      <div className="insights-safety"><dt>安全提醒</dt><dd>{insights.safety.count ? <button className="insights-safety-btn" type="button" onClick={() => go({ kind: "safety" })}><b className="num">{insights.safety.count}</b> 条 · 查看</button> : <span className="muted">未发现</span>}</dd></div>
    </dl>

    <div className="insights-diags" role="list" aria-label="值得关注">
      {diags.length === 0 ? <div className="insights-empty">
        <b>在当前可分析的数据中，未发现达到提示条件的消耗异常。</b>
        <p>检查了：高未命中输入、单次输入峰值增长、同一调用重复失败。{emptyNotes(insights, unit)}</p>
      </div> : <>
        <div className="insights-diags-head"><span>值得关注</span><span>{diags.length} 条 · 有直接证据的排前面</span></div>
        {diags.slice(0, 3).map((d, i) => <DiagRow key={i} d={d} i={i} unit={unit} open={selectedDiag === i} onSelect={() => go({ kind: "diag", diag: i }, false)} />)}
        {diags.length > 3 && <details className="insights-more"><summary>还有 {diags.length - 3} 条</summary>{diags.slice(3).map((d, k) => <DiagRow key={k + 3} d={d} i={k + 3} unit={unit} open={selectedDiag === k + 3} onSelect={() => go({ kind: "diag", diag: k + 3 }, false)} />)}</details>}
      </>}
    </div>

    <div className="insights-work">
      <div className="insights-chart-card" ref={chartBox}>
        <Legend insights={insights} unit={unit} />
        {axisNote(insights) && <p className="insights-axis-note">{axisNote(insights)}</p>}
        {steps.length > maxVisible && <MiniMap steps={steps} diags={diags} view={view} width={width} maxVisible={maxVisible} onWindow={setUserWindow} unit={unit} onJump={dir => { if (!diags.length) return; const i = selectedDiag >= 0 ? (selectedDiag + dir + diags.length) % diags.length : 0; go({ kind: "diag", diag: i }, false); }} />}
        <Chart insights={insights} view={view} width={width} cursor={cursor} mode={mode} unit={unit}
          onStep={s => go({ kind: "step", step: s }, false)} onDiag={i => go({ kind: "diag", diag: i }, false)} onKey={onKey} />
        <p className="insights-hint">点击任一列查看详情 · ← → 逐个移动 · Esc 回到当前诊断</p>
        <details className="insights-sum"><summary>文字摘要</summary><ul>{summaryLines(insights, unit).map((t, i) => <li key={i}>{t}</li>)}</ul></details>
      </div>
      <aside className="insights-inspector" aria-live="polite" aria-label="详情">
        {history.length > 0 && <div className="insights-inspector-bar"><button className="insights-back" type="button" onClick={back}>‹ 返回</button></div>}
        {mode && <Inspector insights={insights} mode={mode} unit={unit} ev={ev} go={go} retry={retryEvidence} />}
      </aside>
    </div>
  </section>;
}

function axisNote(insights: SessionInsights): string | null {
  const a = insights.axis;
  if (a.fallback === "few_turn_starts") return a.turn_starts === 0 ? "这个会话没有回合记录，横轴按助手调用逐次排列。" : "这个会话只记录到一个回合（旧会话的源日志可能已被宿主清理），横轴按助手调用逐次排列。";
  if (a.fallback === "most_calls_before_first_turn") return "这个会话的大部分调用发生在第一个回合记录之前，横轴按助手调用逐次排列。";
  if (a.leading_step) return "第 1 个回合是「首个回合记录之前」的调用，单独列出，不丢数据。";
  return null;
}

function modeStillValid(mode: Mode, insights: SessionInsights): boolean {
  const n = insights.axis.steps.length;
  if (mode.kind === "diag") return mode.diag < insights.diagnostics.length;
  if (mode.kind === "calls") return mode.to <= n;
  if (mode.kind === "step" || mode.kind === "failure") return mode.step <= n;
  return true;
}

function emptyNotes(insights: SessionInsights, unit: string): string {
  const failed = insights.axis.steps.filter(s => s.outcome === "failed").length;
  const cancelled = insights.axis.steps.filter(s => s.outcome === "cancelled").length;
  const idle = insights.axis.steps.filter(s => s.notes.some(n => n.explanation === "possible_cache_expiry")).map(s => s.index);
  const bits: string[] = [];
  if (failed) bits.push(`${failed} 个${unit}以失败结束`);
  if (cancelled) bits.push(`${cancelled} 个${unit}被中断`);
  if (idle.length) bits.push(`${unit} ${idle.slice(0, 3).join("、")}${idle.length > 3 ? " 等" : ""} 前有长时间空闲`);
  return bits.length ? ` 另有 ${bits.join("，")}，未达到提示条件，仍标在轨迹上。` : "";
}

function summaryLines(insights: SessionInsights, unit: string): string[] {
  const all = inputOf(insights.session);
  const lines = [`共 ${insights.axis.steps.length} 个${unit}，输入 ${fmtTokens(all)} tokens，缓存命中率 ${all ? fmtPct(insights.session.input.cache_read / all) : "—"}。`];
  insights.diagnostics.forEach((d, i) => { const t = diagText(d, unit); lines.push(`诊断 ${i + 1}：${unit} ${d.steps.from}–${d.steps.to}，${t.title}。${t.fact}原因：${t.why}`); });
  for (const s of insights.axis.steps) for (const n of s.notes) lines.push(`${unit} ${s.index}：${n.calls} 次调用发生在${NOTE_TEXT[n.explanation]}。`);
  if (insights.lanes.tools.state === "unavailable") lines.push(`工具结果：未记录（${LANE_REASON[insights.lanes.tools.reason ?? ""] ?? "原因未知"}）。`);
  if (insights.quality.legacy_fingerprints) lines.push(`${insights.quality.legacy_fingerprints} 次失败来自已清理的旧日志，无法按参数区分是不是同一调用。`);
  return lines.slice(0, 200);
}

function DiagRow({ d, i, unit, open, onSelect }: { d: InsightDiagnostic; i: number; unit: string; open: boolean; onSelect: () => void }) {
  const t = diagText(d, unit);
  const rm = REMEDY[d.remedy_id];
  return <div className={`insights-diag${open ? " on" : ""}`} role="listitem">
    <button type="button" className="insights-diag-sum" aria-expanded={open} onClick={onSelect}>
      <span className="insights-num">{i + 1}</span>
      <span className="insights-diag-title"><b>{t.title}</b><span className="num muted">{unit} {d.steps.from}–{d.steps.to}</span><span className={`insights-chip ${t.chip[0]}`}>{t.chip[1]}</span></span>
      <span className="insights-chev" aria-hidden="true">{open ? "▾" : "▸"}</span>
      <span className="insights-diag-fact">{t.fact}</span>
    </button>
    {open && <div className="insights-diag-more"><p><span className="lbl">原因</span>{t.why}</p>{rm && <p><span className="lbl">建议</span>{rm[0]} <span className="muted">{rm[1]}</span></p>}</div>}
  </div>;
}

function Legend({ insights, unit }: { insights: SessionInsights; unit: string }) {
  const writes = insights.session.input.cache_write > 0;
  return <div className="insights-legend">
    <span><i className="sw read" />缓存读取</span>
    <span className={writes ? "" : "off"}><i className="sw write" />{writes ? "缓存写入" : HOSTS_WITHOUT_CACHE_WRITE.has(insights.host) ? "缓存写入（宿主不报告）" : "缓存写入（本会话为 0）"}</span>
    <span><i className="sw unc" />未缓存输入</span>
    <span><i className="sw line" />单次输入峰值</span>
    <span><i className="sw fail" />工具失败</span>
    <span>◷ 长空闲后</span><span>◇ 模型切换</span>
    <span className="muted">横轴：{unit}</span>
  </div>;
}

function MiniMap({ steps, diags, view, width, maxVisible, onWindow, onJump, unit }: { steps: InsightStep[]; diags: InsightDiagnostic[]; view: [number, number]; width: number; maxVisible: number; onWindow: (w: [number, number]) => void; onJump: (dir: number) => void; unit: string }) {
  const plotW = width - PAD_L - PAD_R;
  const H = 34;
  const cols = useMemo(() => miniColumns(steps.map(s => ({ input: inputOf(s), miss: missOf(s) })), plotW), [steps, plotW]);
  const maxV = Math.max(1, ...cols.map(c => c.value));
  const px = plotW / steps.length;
  const drag = useRef(false);
  const svg = useRef<SVGSVGElement | null>(null);
  const at = (clientX: number) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return;
    const x = (clientX - r.left) * width / r.width;
    const c = Math.round((x - PAD_L) / plotW * steps.length);
    const s = Math.max(1, Math.min(steps.length - maxVisible + 1, c - Math.floor(maxVisible / 2)));
    onWindow([s, s + maxVisible - 1]);
  };
  return <>
    <div className="insights-nav"><span>显示 {unit} {view[0]}–{view[1]}，共 {steps.length} 个</span><span className="sp" />{diags.length > 0 && <><button type="button" className="button button-secondary" onClick={() => onJump(-1)}>‹ 上一处诊断</button><button type="button" className="button button-secondary" onClick={() => onJump(1)}>下一处诊断 ›</button></>}</div>
    <svg ref={svg} className="insights-mini" viewBox={`0 0 ${width} ${H}`} role="slider" aria-label="全程缩略图" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={view[0]} tabIndex={0}
      onPointerDown={e => { drag.current = true; (e.target as Element).setPointerCapture?.(e.pointerId); at(e.clientX); }}
      onPointerMove={e => { if (drag.current) at(e.clientX); }} onPointerUp={() => { drag.current = false; }} onPointerCancel={() => { drag.current = false; }}
      onKeyDown={e => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); const d = e.key === "ArrowRight" ? Math.ceil(maxVisible / 2) : -Math.ceil(maxVisible / 2); const s = Math.max(1, Math.min(steps.length - maxVisible + 1, view[0] + d)); onWindow([s, s + maxVisible - 1]); } }}>
      <rect x={PAD_L} y={0} width={plotW} height={H - 8} rx={3} className="mini-bg" />
      {cols.map(c => { const h = c.value / maxV * (H - 12); return <rect key={c.x} x={PAD_L + c.x} y={H - 10 - h} width={1} height={h} className={c.warn ? "mini-warn" : "mini-col"} />; })}
      {diags.map((d, i) => <rect key={i} x={PAD_L + (d.steps.from - 1) * px} y={H - 6} width={Math.max(3, (d.steps.to - d.steps.from + 1) * px)} height={4} rx={2} className={`band-${d.kind}`} />)}
      <rect x={PAD_L + (view[0] - 1) * px} y={0.5} width={(view[1] - view[0] + 1) * px} height={H - 9} rx={2} className="mini-window" />
      <text x={PAD_L - 6} y={H / 2} textAnchor="end" className="tnum">全程</text>
    </svg>
  </>;
}

function Chart({ insights, view, width, cursor, mode, unit, onStep, onDiag, onKey }: { insights: SessionInsights; view: [number, number]; width: number; cursor: number; mode: Mode | null; unit: string; onStep: (s: number) => void; onDiag: (i: number) => void; onKey: (e: KeyboardEvent) => void }) {
  const steps = insights.axis.steps;
  const diags = insights.diagnostics;
  const plotW = width - PAD_L - PAD_R;
  const layout = layoutSteps(steps, view, PAD_L, plotW);
  const yTop = 20, hBar = 150, bandRow = 11;
  const bandRows = packBands(diags.map(d => d.steps));
  const bandsH = diags.length ? (Math.max(...bandRows) + 1) * bandRow + 10 : 6;
  const yBand = yTop + hBar + 8, yPeak = yBand + bandsH + 12, hPeak = 58, yTools = yPeak + hPeak + 16, hTools = 40, yAxis = yTools + hTools + 6, H = yAxis + 22;
  const maxT = niceCeil(Math.max(1, ...steps.map(inputOf)));
  const maxP = niceCeil(Math.max(1, ...steps.map(s => s.input_peak)));
  const yB = (v: number) => yTop + hBar - v / maxT * hBar;
  const yP = (v: number) => yPeak + hPeak - v / maxP * hPeak;
  const bw = Math.max(2, Math.min(layout.slot * 0.72, 26));
  const slotOf = (i: number) => layout.slots.find(s => s.index === i);
  const sel = mode?.kind === "diag" ? diags[mode.diag]?.steps : mode?.kind === "calls" ? { from: mode.from, to: mode.to } : null;
  const selBand = sel ? bandFor(sel, view, layout) : null;
  const cur = slotOf(cursor);
  const toolsOk = insights.lanes.tools.state !== "unavailable";
  const maxN = Math.max(1, ...steps.map(s => s.tools.succeeded + s.tools.failed + s.tools.cancelled + s.tools.unknown));
  const step = tickStep(layout.slot);
  // 没有调用的步没有测量：折线在那里断开，不跨缺口插值；长空闲也断开。
  let path = "";
  let broken = true;
  layout.slots.forEach(s => {
    const st = steps[s.index - 1];
    if (st.calls === 0) { broken = true; return; }
    const brk = broken || (st.idle_before_ms ?? 0) > 30 * 60_000;
    path += `${brk ? "M" : "L"}${(s.x + s.w / 2).toFixed(1)} ${yP(st.input_peak).toFixed(1)}`;
    broken = false;
  });
  return <svg className="insights-chart" viewBox={`0 0 ${width} ${H}`} tabIndex={0} role="img" onKeyDown={onKey}
    aria-label={`每${unit}输入消耗、单次输入峰值与工具结果，显示 ${view[0]}–${view[1]}，共 ${steps.length} 个${unit}`}>
    <defs>
      <pattern id="ins-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" className="hatch-bg" /><line x1="0" y1="0" x2="0" y2="5" className="hatch-line" /></pattern>
      <pattern id="ins-off" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" className="off-bg" /><line x1="0" y1="0" x2="0" y2="7" className="off-line" /></pattern>
    </defs>
    {selBand?.kind === "visible" && <rect x={selBand.x} y={yTop - 8} width={selBand.w} height={yAxis - yTop + 8} className="sel" />}
    {cur && <rect x={cur.x} y={yTop - 8} width={cur.w} height={yAxis - yTop + 8} className={sel ? "cursor-outline" : "sel"} />}
    {[0, 0.5, 1].map(f => <g key={f}><line x1={PAD_L} x2={width - PAD_R} y1={yB(maxT * f)} y2={yB(maxT * f)} className="grid" /><text x={PAD_L - 6} y={yB(maxT * f) + 3.5} textAnchor="end" className="tnum">{f ? fmtTokens(maxT * f) : "0"}</text></g>)}
    <text x={PAD_L} y={yTop - 10} className="lane">每{unit}输入消耗（累计）</text>
    {layout.slots.map(s => {
      const st = steps[s.index - 1];
      const x = s.x + (s.w - bw) / 2;
      let y = yTop + hBar;
      const segs: [number, string][] = [[st.input.cache_read, "read"], [st.input.cache_write, "write"], [st.input.uncached_input, "unc"]];
      return <g key={s.index}>
        {segs.map(([v, cls]) => { const h = v / maxT * hBar; if (h <= 0) return null; y -= h; return <rect key={cls} x={x} y={y} width={bw} height={h} className={`bar ${cls}`} />; })}
        {st.notes.map((n, j) => { const cx = s.x + s.w / 2, cy = yB(inputOf(st)) - 9 - j * 12; return n.explanation === "possible_cache_expiry"
          ? <g key={j} className="note-icon"><circle cx={cx} cy={cy} r={4.5} /><path d={`M${cx} ${cy - 2.4}V${cy}l1.8 1.2`} /></g>
          : <rect key={j} x={cx - 4} y={cy - 4} width={8} height={8} transform={`rotate(45 ${cx} ${cy})`} className="note-icon" />; })}
      </g>;
    })}
    {layout.gaps.map(g => <g key={g.beforeIndex} className="gap"><path d={`M${g.x + 8} ${yTop}l3 5l-3 5l3 5M${g.x + 12} ${yTop}l3 5l-3 5l3 5`} /><line x1={g.x + 11} x2={g.x + 11} y1={yTop + 18} y2={yAxis} /><text x={g.x + 17} y={yTop + 8} className="tnum">空闲 {Math.round(g.idleMs / 60_000)} 分</text></g>)}
    {diags.length > 0 && <line x1={PAD_L} x2={width - PAD_R} y1={yBand - 3} y2={yBand - 3} className="axis" />}
    {diags.map((d, i) => {
      const b = bandFor(d.steps, view, layout);
      const y = yBand + bandRows[i] * bandRow + 2;
      if (b.kind === "offscreen") return <text key={i} x={b.side === "left" ? PAD_L : width - PAD_R} y={y + 6} textAnchor={b.side === "left" ? "start" : "end"} className="tnum faint">{b.side === "left" ? `‹ ${i + 1}` : `${i + 1} ›`}</text>;
      const on = mode?.kind === "diag" && mode.diag === i;
      return <g key={i} className={`band band-${d.kind}${d.cause === "evidence" ? " solid" : " dashed"}${on ? " on" : ""}`} onClick={() => onDiag(i)}>
        <rect x={b.x + 1} y={y} width={Math.max(3, b.w - 2)} height={6} rx={3} />
        <text x={b.x - 4} y={y + 6} textAnchor="end" className="tnum band-num">{i + 1}</text>
        <rect x={b.x} y={y - 3} width={b.w} height={12} className="hit" />
      </g>;
    })}
    <text x={PAD_L} y={yPeak - 4} className="lane">单次输入峰值</text>
    {[0, 1].map(f => <g key={f}><line x1={PAD_L} x2={width - PAD_R} y1={yP(maxP * f)} y2={yP(maxP * f)} className="grid" /><text x={width - PAD_R + 6} y={yP(maxP * f) + 3.5} className="tnum">{f ? fmtTokens(maxP) : "0"}</text></g>)}
    <path d={path} className="peak-line" />
    {cur && steps[cur.index - 1].calls > 0 && <circle cx={cur.x + cur.w / 2} cy={yP(steps[cur.index - 1].input_peak)} r={3.2} className="peak-dot" />}
    <text x={PAD_L} y={yTools - 4} className="lane">工具结果</text>
    {!toolsOk ? <g><rect x={PAD_L} y={yTools} width={plotW} height={hTools} rx={3} fill="url(#ins-off)" /><text x={PAD_L + plotW / 2} y={yTools + hTools / 2 + 4} textAnchor="middle" className="muted-text">未记录 · {LANE_REASON[insights.lanes.tools.reason ?? ""] ?? "原因未知"}</text></g>
      : layout.slots.map(s => {
        const t = steps[s.index - 1].tools;
        const x = s.x + (s.w - bw) / 2;
        let y = yTools + hTools;
        const segs: [number, string][] = [[t.succeeded, "tool-ok"], [t.unknown, "tool-unknown"], [t.cancelled, "tool-cancel"], [t.failed, "tool-fail"]];
        return <g key={s.index}>{segs.map(([n, cls]) => { if (!n) return null; const h = Math.max(cls === "tool-fail" ? 5 : 0, n / maxN * hTools); y -= h; return <rect key={cls} x={x} y={y} width={bw} height={h} className={cls} fill={cls === "tool-fail" ? "url(#ins-hatch)" : undefined} />; })}</g>;
      })}
    <line x1={PAD_L} x2={width - PAD_R} y1={yAxis} y2={yAxis} className="axis" />
    {layout.slots.map(s => {
      const st = steps[s.index - 1];
      const cx = s.x + s.w / 2;
      return <g key={s.index}>
        {(s.index === 1 || s.index % step === 0) && <text x={cx} y={yAxis + 15} textAnchor="middle" className="tnum">{s.index}</text>}
        {(st.outcome === "failed" || st.outcome === "cancelled") && <circle cx={cx} cy={yAxis} r={3.2} className={`outcome-${st.outcome}`} />}
        <rect x={s.x} y={yTop - 8} width={s.w} height={yAxis - yTop + 8} className="hit" onClick={() => onStep(s.index)}><title>{`${unit} ${s.index}`}</title></rect>
      </g>;
    })}
  </svg>;
}

function Buckets({ input, noWrite }: { input: { cache_read: number; cache_write: number; uncached_input: number }; noWrite: boolean }) {
  const a = Math.max(1, input.cache_read + input.cache_write + input.uncached_input);
  return <div className="insights-buckets">
    <div className="bar-track"><span className="read" style={{ width: `${input.cache_read / a * 100}%` }} /><span className="write" style={{ width: `${input.cache_write / a * 100}%` }} /><span className="unc" style={{ width: `${input.uncached_input / a * 100}%` }} /></div>
    <div className="brow"><i className="sw read" />缓存读取<span className="num">{fmtTokens(input.cache_read)}</span></div>
    <div className="brow"><i className="sw write" />缓存写入<span className="num">{noWrite ? "未记录到" : fmtTokens(input.cache_write)}</span></div>
    <div className="brow"><i className="sw unc" />未缓存输入<span className="num">{fmtTokens(input.uncached_input)}</span></div>
  </div>;
}

function LocalNote() {
  return <p className="insights-local">仅在本机显示，不进入导出和 MCP。</p>;
}

function Inspector({ insights, mode, unit, ev, go, retry }: { insights: SessionInsights; mode: Mode; unit: string; ev: SessionTraceEvidence | "loading" | "error" | undefined; go: (m: Mode, push?: boolean) => void; retry: () => void }) {
  const steps = insights.axis.steps;
  const all = inputOf(insights.session);
  const noWrite = insights.session.input.cache_write === 0;
  const loading = ev === "loading" || ev === undefined;
  const evErr = ev === "error";
  const evData = typeof ev === "object" ? ev : null;
  const retryButton = <button type="button" className="link" onClick={retry}>重试</button>;

  if (mode.kind === "safety") {
    return <div className="insights-insp">
      <h4>安全提醒</h4><p className="muted">{insights.safety.count} 条，与消耗诊断分开统计</p>
      <ul className="insights-list">{insights.safety.rules.map(r => <li key={r.rule}><span className="num fail">{r.rule}</span> {r.count} 条{r.steps.length ? <> · {r.steps.slice(0, 8).map(s => <button key={s} type="button" className="link" onClick={() => go({ kind: "step", step: s })}>{unit} {s}</button>)}</> : null}</li>)}</ul>
      {evData ? <ul className="insights-list">{evData.safety.slice(0, 50).map((s, i) => <li key={i}><span className="num fail">{s.rule}</span> <span className="num">{s.summary ?? "—"}</span>{s.step ? <button type="button" className="link" onClick={() => go({ kind: "step", step: s.step as number })}>{unit} {s.step}</button> : null}</li>)}</ul> : evErr ? <p className="muted">命令摘要暂不可用。{retryButton}</p> : <p className="muted">正在读取命令摘要…</p>}
      <LocalNote />
    </div>;
  }

  if (mode.kind === "calls") {
    return <div className="insights-insp">
      <h4>逐次调用 · {unit} {mode.from}{mode.to !== mode.from ? `–${mode.to}` : ""}</h4>
      {evData ? <CallsTable ev={evData} unit={unit} /> : evErr ? <p className="muted">逐次调用暂不可用。{retryButton}</p> : <p className="muted">正在读取…</p>}
    </div>;
  }

  if (mode.kind === "failure") {
    const f = evData?.failures.find(x => x.ts_ms === mode.ts && x.step === mode.step);
    return <div className="insights-insp">
      <h4>{f?.capability_id ?? "工具"} 调用失败</h4><p className="muted num">{unit} {mode.step} · {clock(mode.ts)}</p>
      {f ? <><dl className="kv"><dt>参数摘要</dt><dd className="num wrap">{f.args_excerpt ?? "—"}</dd></dl><div><p className="muted">错误摘录</p><pre className="insights-excerpt">{f.error_excerpt ?? "（没有记录错误文本）"}</pre><LocalNote /></div></>
        : loading ? <p className="muted">正在读取…</p> : <p className="muted">这次失败的证据暂不可用。{evErr ? retryButton : null}</p>}
      <p className="muted">退出码与调用树不在这里：宿主没有结构化错误码（失败原因分类待接入）；调用顺序见下方「工具调用序列」。</p>
      <div className="insights-acts"><button type="button" className="button button-secondary" onClick={() => go({ kind: "step", step: mode.step })}>查看该{unit}</button></div>
    </div>;
  }

  if (mode.kind === "diag") {
    const d = insights.diagnostics[mode.diag];
    if (!d) return null;
    const t = diagText(d, unit);
    const rm = REMEDY[d.remedy_id];
    const L = steps.slice(d.steps.from - 1, d.steps.to);
    const rangeLabel = `${unit} ${d.steps.from}–${d.steps.to}`;
    if (d.kind === "repeated_failure") {
      const fails = evData?.failures ?? [];
      const byKey = new Map<string, typeof fails>();
      // 没有分组键（旧日志的工具名级指纹已被服务端置空）就不能说「相同调用」：每次失败自成一组。
      for (const f of fails) { const k = f.invocation_key ?? `ts:${f.ts_ms}:${f.step}`; byKey.set(k, [...(byKey.get(k) ?? []), f]); }
      const top = [...byKey.values()].sort((a, b) => b.length - a.length)[0] ?? [];
      const first = top[0];
      return <div className="insights-insp">
        <h4>{t.title}</h4><p className="muted num">{rangeLabel}</p>
        <div className="insights-big num">{typeof d.fact.failures === "number" ? d.fact.failures : 0} 次<small>{d.fact.same_invocation ? "相同调用失败" : "调用失败"}</small></div>
        {loading && <p className="muted">正在读取错误摘要…</p>}
        {evErr && <p className="muted">错误摘要暂不可用。{retryButton}</p>}
        {first && <><dl className="kv"><dt>调用</dt><dd className="num wrap">{first.capability_id ?? "工具"} · {first.args_excerpt ?? "—"}</dd></dl>
          <div><p className="muted">{top.length > 1 && first.invocation_key ? `错误摘要（${top.length} 次相同调用）` : "错误摘要（其中一次）"}</p><pre className="insights-excerpt">{(first.error_excerpt ?? "（没有记录错误文本）").split("\n")[0]}</pre><LocalNote /></div>
          <div className="insights-acts"><button type="button" className="button button-primary" onClick={() => go({ kind: "failure", step: first.step ?? d.steps.from, ts: first.ts_ms })}>查看一次失败</button><button type="button" className="button button-secondary" onClick={() => go({ kind: "calls", from: d.steps.from, to: d.steps.to })}>查看相关调用</button></div>
          <ul className="insights-list">{fails.slice(0, 30).map((f, i) => <li key={i}><button type="button" className="row" onClick={() => go({ kind: "failure", step: f.step ?? d.steps.from, ts: f.ts_ms })}><span className="fail">✕</span><span>{unit} {f.step} · {f.capability_id ?? "工具"}</span><span className="num muted">{clock(f.ts_ms)}</span></button></li>)}</ul></>}
        {rm && <div className="insights-note"><b>建议</b> {rm[0]}<br /><span className="muted">这几个{unit}共输入 {fmtTokens(d.impact.tokens)} tokens，不代表都能省下来。</span></div>}
      </div>;
    }
    if (d.kind === "input_growth") {
      const topStep = L.reduce((m, s) => (s.input_peak > m.input_peak ? s : m), L[0]);
      return <div className="insights-insp">
        <h4>{t.title}</h4><p className="muted num">{rangeLabel}</p>
        <div className="insights-big num">{(typeof d.fact.ratio === "number" ? d.fact.ratio : 0).toFixed(1)}×<small>单次输入峰值</small></div>
        <dl className="kv"><dt>起点</dt><dd className="num">{fmtTokens(Number(d.fact.peak_from ?? 0))}（{unit} {d.steps.from}）</dd><dt>终点</dt><dd className="num">{fmtTokens(Number(d.fact.peak_to ?? 0))}（{unit} {d.steps.to}）</dd><dt>区间调用</dt><dd className="num">{L.reduce((a, s) => a + s.calls, 0)}</dd><dt>占本会话输入</dt><dd className="num">{fmtPct(d.impact.share_of_session_input)}</dd></dl>
        <Spark values={L.map(s => s.input_peak)} />
        <div className="insights-note"><b>原因</b> {t.why}</div>
        <div className="insights-acts"><button type="button" className="button button-primary" onClick={() => go({ kind: "step", step: topStep.index })}>查看峰值最大的{unit}</button><button type="button" className="button button-secondary" onClick={() => go({ kind: "calls", from: d.steps.from, to: d.steps.to })}>查看逐次调用</button></div>
        {rm && <div className="insights-note"><b>建议</b> {rm[0]}<br /><span className="muted">{rm[1]}</span></div>}
      </div>;
    }
    const rangeInput = L.reduce((a, s) => a + inputOf(s), 0);
    const rangeRead = L.reduce((a, s) => a + s.input.cache_read, 0);
    const restInput = all - rangeInput;
    return <div className="insights-insp">
      <h4>{t.title}</h4><p className="muted num">{rangeLabel}</p>
      <div className="insights-big num">{fmtTokens(Number(d.fact.uncached_tokens ?? 0))}<small>未命中缓存的输入（tokens）</small></div>
      <dl className="kv"><dt>区间命中率</dt><dd className="num">{rangeInput ? fmtPct(rangeRead / rangeInput) : "—"}</dd><dt>会话其余部分</dt><dd className="num">{restInput > 0 ? fmtPct((insights.session.input.cache_read - rangeRead) / restInput) : "—"}</dd><dt>占本会话输入</dt><dd className="num">{fmtPct(d.impact.share_of_session_input)}</dd></dl>
      <ul className="insights-list">{L.slice(0, 40).map(s => <li key={s.index}><button type="button" className="row" onClick={() => go({ kind: "step", step: s.index })}><span className="num">{unit} {s.index}</span><span className="muted">{s.idle_before_ms != null ? `空闲 ${fmtDuration(s.idle_before_ms)}` : ""} · {s.model_ids.join("→")}</span><span className="num">{s.hit_rate != null ? fmtPct(s.hit_rate) : "—"}</span></button></li>)}</ul>
      <div className="insights-note"><b>原因</b> {t.why}</div>
      <div className="insights-acts"><button type="button" className="button button-primary" onClick={() => go({ kind: "calls", from: d.steps.from, to: d.steps.to })}>查看逐次调用</button></div>
      {rm && <div className="insights-note"><b>建议</b> {rm[0]}<br /><span className="muted">{rm[1]}</span></div>}
    </div>;
  }

  // 普通回合
  const s = steps[mode.step - 1];
  if (!s) return null;
  const a = inputOf(s);
  const cost = fmtMoney(s.nominal_cost);
  const fails = evData?.failures ?? [];
  return <div className="insights-insp">
    <h4>{unit} {s.index}</h4>
    <p className="muted num">{clock(s.started_at_ms)} 开始{s.ended_at_ms != null ? ` · 用时 ${fmtDuration(Math.max(0, s.ended_at_ms - s.started_at_ms))}` : " · 没有测量"}{s.idle_before_ms != null ? ` · 之前空闲 ${fmtDuration(s.idle_before_ms)}` : ""}</p>
    <dl className="kv">
      <dt>输入 / 输出</dt><dd className="num">{fmtTokens(a)} / {fmtTokens(s.output)}</dd>
      <dt>调用</dt><dd className="num">{s.calls}</dd>
      <dt>单次输入峰值</dt><dd className="num">{fmtTokens(s.input_peak)}</dd>
      <dt>缓存命中率</dt><dd className="num">{s.hit_rate != null ? fmtPct(s.hit_rate) : "—"}</dd>
      <dt>模型</dt><dd className="wrap">{s.model_ids.join(" → ") || "—"}</dd>
      {s.outcome && <><dt>结果</dt><dd>{({ succeeded: "完成", failed: "失败", cancelled: "被中断", unknown: "未知" } as const)[s.outcome]}</dd></>}
      <dt>名义成本</dt><dd className="num">{cost ?? "暂无可用计价依据"}</dd>
    </dl>
    {cost && <p className="insights-local">按每次调用的模型、以官方价估算，含输出，不是账单。</p>}
    {s.notes.map((n, i) => <div key={i} className="insights-note warn">{n.calls} 次调用发生在{NOTE_TEXT[n.explanation]}。</div>)}
    <Buckets input={s.input} noWrite={noWrite} />
    {insights.lanes.tools.state === "unavailable"
      ? <p className="muted">工具结果：未记录（{LANE_REASON[insights.lanes.tools.reason ?? ""] ?? "原因未知"}）</p>
      : <dl className="kv"><dt>工具成功</dt><dd className="num">{s.tools.succeeded}</dd><dt>失败</dt><dd className={`num${s.tools.failed ? " fail" : ""}`}>{s.tools.failed}</dd><dt>取消</dt><dd className="num">{s.tools.cancelled}</dd><dt>结果未知</dt><dd className="num">{s.tools.unknown}</dd></dl>}
    {fails.length > 0 && <><ul className="insights-list">{fails.slice(0, 20).map((f, i) => <li key={i}><button type="button" className="row bad" onClick={() => go({ kind: "failure", step: s.index, ts: f.ts_ms })}><span className="fail">✕</span><span className="num">{f.capability_id ?? "工具"}：{(f.error_excerpt ?? "").split("\n")[0].slice(0, 60) || "失败"}</span><span>›</span></button></li>)}</ul><LocalNote /></>}
    <div className="insights-acts"><button type="button" className="button button-secondary" onClick={() => go({ kind: "calls", from: s.index, to: s.index })}>查看逐次调用</button></div>
  </div>;
}

function CallsTable({ ev, unit }: { ev: SessionTraceEvidence; unit: string }) {
  const failedAt = new Set(ev.failures.map(f => f.step));
  let prev = -1;
  let k = 0;
  return <>
    <div className="insights-calls-wrap"><table className="insights-calls"><thead><tr><th>{unit} · 调用</th><th>模型</th><th>输入</th><th>命中</th><th>输出</th></tr></thead><tbody>
      {ev.calls.slice(0, 2000).map((c, i) => {
        if (c.step !== prev) { prev = c.step ?? -1; k = 0; }
        k += 1;
        const a = inputOf(c);
        const hit = a ? c.input.cache_read / a : 0;
        return <tr key={i} className={a >= 10_000 && hit < 0.5 ? "low" : ""}><td className="num">{c.step}·{k}{failedAt.has(c.step) && k === 1 ? " ✕" : ""}</td><td>{(c.model_id ?? "—").replace("claude-", "")}</td><td className="num">{fmtTokens(a)}</td><td className="num">{a ? fmtPct(hit) : "—"}</td><td className="num">{fmtTokens(c.output)}</td></tr>;
      })}
    </tbody></table></div>
    <p className="insights-local">橙底：命中率低于 50% 且输入 ≥ 1 万；✕：该{unit}内有工具失败。</p>
  </>;
}

function Spark({ values }: { values: number[] }) {
  const W = 280, H = 46, mx = Math.max(1, ...values), n = values.length;
  const pts = values.map((v, k) => `${(k / Math.max(1, n - 1) * (W - 8) + 4).toFixed(1)},${(H - 4 - v / mx * (H - 10)).toFixed(1)}`).join(" ");
  return <svg className="insights-spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true"><polyline points={pts} /></svg>;
}
