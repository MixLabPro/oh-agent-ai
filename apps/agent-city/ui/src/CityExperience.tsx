import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { CityModel } from "./cityModel";
import type { CityProjectionV1 } from "./data/provider";
import { citySeed, randomSeed } from "./data/seed";
import type { CityEngine, EngineStats } from "./engine/CityEngine";
import type { CinematicCard, CinematicCut, CinematicPlan } from "./engine/cityCinematic";
import type { BackdropMode } from "./engine/cityLayout";
import { paletteFor } from "./engine/cityTextures";
import { invokeHost, embedded, pluginLocale } from "./host";
import type { PluginResponseV1 } from "@agent-vitals/app-sdk";
import { runFilmJob, supportsBackgroundFilm } from "./export/filmJob";
import { cinematicCopy } from "./engine/cinematicCopy";
import { cityText, cityView, useCityLanguage } from "./i18n";

const dateLabel = (ms: number) => new Date(ms).toLocaleString(pluginLocale() === "en" ? "en-US" : "zh-CN");
const tokens = (n: number) => n.toLocaleString(pluginLocale() === "en" ? "en-US" : "zh-CN");
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function useCityExperience(engine: RefObject<CityEngine | null>, projection: CityProjectionV1 | null) {
  const modelRef = useRef<CityModel | null>(null);
  const [model, setModel] = useState<CityModel | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const [options, setOptions] = useState(false);
  const [seed, setSeed] = useState(74031);
  const [seedDraft, setSeedDraft] = useState("74031");
  const [seedBusy, setSeedBusy] = useState(true);
  const [confirmSeed, setConfirmSeed] = useState(false);
  const seedTimer = useRef<number | undefined>(undefined);
  const [cursor, setCursor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(3600);
  const [cut, setCut] = useState<CinematicCut>("short");
  // 背景楼档位（F4）：按本机浏览器存储（与种子不同，不经宿主 city-settings 投影——那需要宿主侧改动，见 SPEC §4 F4 注）。
  const [backdrop, setBackdropState] = useState<BackdropMode>(() => {
    try { const saved = localStorage.getItem("city.backdrop"); return saved === "off" || saved === "full" ? saved : "auto"; } catch { return "auto"; }
  });
  const setBackdrop = (mode: BackdropMode) => {
    setBackdropState(mode);
    try { localStorage.setItem("city.backdrop", mode); } catch { /* 存储不可用：本次会话内仍生效 */ }
  };
  useEffect(() => { engine.current?.setBackdrop(backdrop); }, [backdrop]);
  const [film, setFilm] = useState<{ frame: number; total: number; width?: number; height?: number; software?: boolean } | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<EngineStats | null>(null);
  const [card, setCard] = useState<CinematicCard | null>(null);
  const [progress, setProgress] = useState(0);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    const suspend = () => { abort.current?.abort(); };
    window.addEventListener("__AV_PLUGIN_SUSPENDED__", suspend);
    return () => window.removeEventListener("__AV_PLUGIN_SUSPENDED__", suspend);
  }, []);
  const requests = useRef(0);
  const mounted = useRef(true);
  const lastCursor = useRef(0);
  const lastCard = useRef<CinematicCard | null>(null);
  const lastProgress = useRef(0);
  const busy = photoBusy || seedBusy;

  useEffect(() => {
    mounted.current = true;
    let active = true;
    void (async () => {
      try {
        const saved = await citySeed("read");
        const value = saved ?? randomSeed();
        if (!active) return;
        if (saved === null) await citySeed("write", value);
        if (!active) return;
        engine.current?.setBackdrop(backdrop); // 首次布局前就用已存档位，避免先按 auto 排一遍再换
        engine.current?.setSeed(value); setSeed(value); setSeedDraft(String(value));
      } catch {
        if (active) { engine.current?.setSeed(74031); setError("岛屿种子无法保存，本次使用临时种子。"); }
      } finally { if (active) setSeedBusy(false); }
    })();
    return () => { active = false; mounted.current = false; abort.current?.abort(); window.clearTimeout(seedTimer.current); };
  }, []);

  const clearSelection = () => { setSelected(null); setDetails(false); engine.current?.setSelected(null); };
  const callbacks = useMemo(() => ({
    onSelect(id: string | null) { setSelected(id); setDetails(false); },
    onHover(id: string | null, x: number, y: number) {
      const tooltip = tooltipRef.current;
      if (!tooltip) return;
      const building = modelRef.current?.buildings.find((b) => b.id === id);
      if (!building) { tooltip.style.opacity = "0"; return; }
      tooltip.textContent = `${building.districtId} · ${tokens(building.tokensTotal)} tokens${building.aggregated ? ` · ${building.extraCount}${pluginLocale() === "en" ? " aggregated sessions" : " 个聚合会话"}` : ""}`;
      tooltip.style.opacity = "1";
      tooltip.style.transform = `translate(${Math.min(x + 14, Math.max(8, window.innerWidth - 270))}px, ${Math.min(y + 14, window.innerHeight - 60)}px)`;
    },
    onStats(value: EngineStats) { setStats(value); },
    onTimeCursor(ms: number, live: boolean) {
      const now = performance.now();
      if (!live && now - lastCursor.current < 180) return;
      lastCursor.current = now; setCursor(live ? null : ms); setPlaying(engine.current?.isPlaying ?? false);
    },
    onCinematic(seconds: number, plan: CinematicPlan, ended: boolean) {
      const next = ended ? null : plan.cards.find((c) => seconds >= c.atSec && seconds < c.untilSec) ?? null;
      const p = ended ? 0 : Math.min(1, seconds / plan.durationSec);
      if (next !== lastCard.current || Math.abs(p - lastProgress.current) >= .01 || ended) {
        lastCard.current = next; lastProgress.current = p; setCard(next); setProgress(p);
      }
    },
  }), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (options) setOptions(false);
      else if (details) setDetails(false);
      else if (film) abort.current?.abort();
      else { clearSelection(); engine.current?.stopCinematic(); engine.current?.setTimeCursor(null, { playing: false }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [options, details, film]);

  const applySeed = async (value: number) => {
    if (busy || !Number.isInteger(value) || value < 1 || value > 4294967295) { setError("种子须为 1–4294967295 的整数。"); return; }
    setSeedBusy(true); setError(null);
    try {
      await citySeed("write", value);
      if (!mounted.current) return;
      engine.current?.setSeed(value); setSeed(value); setSeedDraft(String(value)); clearSelection();
    } catch { if (mounted.current) setError("无法保存岛屿种子，原岛屿保持不变。"); }
    finally { if (mounted.current) setSeedBusy(false); }
  };
  const reseed = () => {
    if (!confirmSeed) { setConfirmSeed(true); seedTimer.current = window.setTimeout(() => setConfirmSeed(false), 4000); return; }
    setConfirmSeed(false); window.clearTimeout(seedTimer.current); void applySeed(randomSeed());
  };
  const seek = (value: number) => {
    const model = modelRef.current; if (!model) return;
    const ms = model.windowStartMs + value / 1000 * (model.windowEndMs - model.windowStartMs);
    engine.current?.setTimeCursor(ms, { playing: false }); setCursor(ms); setPlaying(false);
  };
  const replay = () => {
    const model = modelRef.current; if (!model) return;
    const ms = cursor !== null && cursor < model.windowEndMs ? cursor : model.windowStartMs;
    engine.current?.setTimeCursor(ms, { playing: !playing, speed }); setCursor(ms); setPlaying(!playing);
  };
  const live = () => { engine.current?.setTimeCursor(null, { playing: false }); setCursor(null); setPlaying(false); };
  const describe = (c: CinematicCard) => {
    const model = modelRef.current;
    if (!model) return null;
    return cinematicCopy(model, c, pluginLocale());
  };
  const photo = async () => {
    if (!engine.current || busy || abort.current) return;
    setPhotoBusy(true); setError(null);
    try { const blob = await engine.current.capturePhoto({ watermark: "agent-vitals" }); if (mounted.current) download(blob, `agent-city-${Date.now()}.png`); }
    catch { if (mounted.current) setError("拍照失败，当前环境可能不支持画布导出。"); }
    finally { if (mounted.current) setPhotoBusy(false); }
  };
  const exportFilm = async () => {
    if (abort.current) { abort.current.abort(); return; }
    if (!modelRef.current || busy) return;
    setError(null);
    const controller = new AbortController(); abort.current = controller; setFilm({ frame: 0, total: 1 });
    previewRef.current?.getContext("2d")?.clearRect(0, 0, 640, 360);
    try {
      const blob = await runFilmJob({ model: structuredClone(modelRef.current), seed, cut, backdrop, locale: pluginLocale(), width: 1920, height: 1080, fps: 30, bitrate: 12_000_000 }, {
        signal: controller.signal,
        onPreview: (bitmap) => {
          const canvas = previewRef.current;
          if (!mounted.current || !canvas) return;
          const context = canvas.getContext("2d");
          if (context) context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        },
        onProfile: (width, height, software) => { if (mounted.current) setFilm((value) => value ? { ...value, width, height, software } : value); },
        onProgress: (frame, total) => { if (mounted.current) setFilm((value) => value ? { ...value, frame, total } : value); },
      });
      if (mounted.current) download(blob, `agent-city-${cut}-${Date.now()}.${blob.type === "video/webm" ? "webm" : "mp4"}`);
    } catch (reason) {
      if (mounted.current && !(reason instanceof DOMException && reason.name === "AbortError")) {
        const code = reason instanceof Error ? reason.message : "background_export_failed";
        setError(code === "export_memory_limit" ? "视频超过导出内存上限，请改用短片。"
          : code === "background_export_timeout" ? "后台导出无响应，任务已终止；City 可以继续使用。"
          : code === "video_encoder_unavailable" ? "当前环境没有可用的视频编码器（H.264 / VP9 / VP8），可使用拍照。"
          : ["background_export_unavailable", "background_webgl_unavailable"].includes(code)
            ? "当前环境不支持后台视频导出，可使用拍照；不会在界面线程执行导出。"
            : "后台视频导出失败，City 可以继续使用。");
      }
    } finally { abort.current = null; if (mounted.current) setFilm(null); }
  };
  const refreshSelection = () => { if (selected && !modelRef.current?.buildings.some((b) => b.id === selected)) clearSelection(); else engine.current?.setSelected(selected); };
  const openHostSession = async () => {
    if (!selected || !embedded() || projection?.source !== "local") { setError("合成会话没有宿主日志详情，请使用原生真实数据模式。"); return; }
    const requestId = `city-open-${++requests.current}`;
    try {
      const response = await invokeHost<PluginResponseV1<{ opened: boolean }>>("plugin_request", { request: {
        version: 1, instanceId: window.__AV_PLUGIN_INSTANCE__, requestId, method: "ui.open-session", payload: { handle: selected },
      } });
      if (response.version !== 1 || response.requestId !== requestId || !response.ok || !response.result?.opened) throw new Error("session_unavailable");
    } catch { if (mounted.current) setError("无法打开宿主会话详情，数据可能已删除或当前实例已失效。"); }
  };
  return { modelRef, model, setModel, tooltipRef, callbacks, selected, setSelected, clearSelection, details, setDetails, options, setOptions,
    seed, seedDraft, setSeedDraft, seedBusy, confirmSeed, applySeed, reseed, cursor, playing, speed, setSpeed,
    cut, setCut, backdrop, setBackdrop, film, photoBusy, busy, error, setError, stats, card, progress, seek, replay, live, previewRef,
    describe, photo, exportFilm, refreshSelection, openHostSession, projection,
    focusDistrict: (id: string) => engine.current?.focusDistrict(id),
    focusBuilding: (id: string) => engine.current?.focusBuilding(id) };
}

export function CityExperience({ ui, disabled, cinema, status }: { ui: ReturnType<typeof useCityExperience>; disabled: boolean; cinema: boolean; status?: string }) {
  const language = useCityLanguage();
  const model = ui.model;
  const selected = model?.buildings.find((b) => b.id === ui.selected);
  const session = ui.projection?.sessions.find((s) => s.id === ui.selected);
  const card = ui.card ? ui.describe(ui.card) : null;
  const locked = disabled || cinema || ui.busy;
  const slider = !model || ui.cursor === null ? 1000 : Math.max(0, Math.min(1000,
    Math.round((ui.cursor - model.windowStartMs) / Math.max(1, model.windowEndMs - model.windowStartMs) * 1000)));
  const debug = new URLSearchParams(location.search).has("cityDebug");
  const settingsRef = useRef<HTMLDialogElement>(null);
  const detailsRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (ui.options) settingsRef.current?.showModal(); else settingsRef.current?.close(); }, [ui.options]);
  useEffect(() => { if (ui.details && session) detailsRef.current?.showModal(); else detailsRef.current?.close(); }, [ui.details, session?.id]);
  return cityView(<>
    <div className="city-tooltip" ref={ui.tooltipRef} aria-hidden="true" />
    {!cinema && <section className="city-legend" aria-label="执行环境城区">
      <h2>执行环境城区</h2>
      {(model?.districts ?? []).map((district) => <button key={district.id} disabled={locked} onClick={() => ui.focusDistrict(district.id)}>
        <span aria-hidden="true" style={{ background: paletteFor(district.id).accent }} /><strong>{district.label}</strong>
        <span className="city-district-meta">{district.sessionCount} 会话 · {district.activeCount} 活跃</span>
        {district.anomaly && <span className="city-district-meta">{district.anomaly.severity} · {district.anomaly.count} 条异常（部分投影）</span>}
      </button>)}
      <p className="city-context-note">灰调背景楼为城市氛围 · 不计入会话</p>
    </section>}
    {!cinema && <section className="city-timeline" aria-label="时间回放">
      <button type="button" onClick={ui.replay} disabled={locked}>{ui.playing ? "暂停回放" : "播放回放"}</button>
      <input aria-label="时间游标" type="range" min="0" max="1000" value={slider} disabled={locked} onChange={(e) => ui.seek(Number(e.target.value))} />
      <span>{ui.cursor === null ? "实时" : dateLabel(ui.cursor)}</span>
      <select aria-label="回放速度" value={ui.speed} disabled={locked || ui.playing} onChange={(e) => ui.setSpeed(Number(e.target.value))}>
        <option value="600">每秒 10 分钟</option><option value="3600">每秒 1 小时</option><option value="14400">每秒 4 小时</option>
      </select>
      <button type="button" onClick={ui.live} disabled={locked || ui.cursor === null}>回到实时</button>
      <p>会话楼高表示 token 规模；施工状态和生长进度是可视化估算，不代表任务完成度。</p>
    </section>}
    {cinema && <div className="city-cinematic-overlay" aria-live="polite">
      <div className="city-cinema-top" /><div className="city-cinema-bottom"><span style={{ transform: `scaleX(${ui.progress})` }} /></div>
      {card && <div className="city-cinema-card"><p>{"eyebrow" in card ? card.eyebrow : ""}</p><h2>{card.title}</h2><p>{card.subtitle}</p></div>}
    </div>}
    {selected && !cinema && <aside className="city-detail-panel" aria-label="建筑详情">
      <button className="city-close" aria-label="关闭建筑详情" onClick={ui.clearSelection}>×</button>
      <p>建筑 · {selected.aggregated ? "聚合会话" : "会话"}</p><h2>{selected.districtId}</h2>
      <dl><dt>Token</dt><dd>{tokens(selected.tokensTotal)}</dd><dt>状态</dt><dd>{selected.active ? "活跃 · 施工中" : "非活跃 · 已封顶"}</dd>
        <dt>进度估算</dt><dd>{Math.round(selected.builtFraction * 100)}%</dd><dt>起始时间</dt><dd>{dateLabel(selected.startedAt)}</dd>
        <dt>事件数</dt><dd>{session?.event_count ?? "未投影"}</dd><dt>费用</dt><dd>尚未接入</dd></dl>
      <button disabled={locked} onClick={() => ui.focusBuilding(selected.id)}>聚焦建筑</button>
      {session && <button onClick={() => ui.setDetails(true)}>查看会话详情</button>}
      {selected.aggregated && <p>此建筑代表 {selected.extraCount} 个会话，不支持单独钻取。</p>}
      <p>建筑和施工仅为数据隐喻。</p>
    </aside>}
    <dialog className="city-dialog" ref={detailsRef} onCancel={(event) => { event.preventDefault(); event.stopPropagation(); ui.setDetails(false); }} onClose={() => ui.setDetails(false)} aria-label="会话详情">
      <button className="city-close" aria-label="关闭会话详情" onClick={() => ui.setDetails(false)}>×</button><h2>会话详情</h2>
      {session && <><p>{session.harness} · {session.first_event_at}</p><dl><dt>输入 token（含缓存）</dt><dd>{tokens(session.tokens.input)}</dd><dt>输出 token</dt><dd>{tokens(session.tokens.output)}</dd><dt>统计截止</dt><dd>{session.last_event_at}</dd></dl>
        <h3>用户输入摘录</h3>{session.task_excerpts?.length ? session.task_excerpts.map((excerpt, i) => <section key={i} className="city-excerpt"><p>{excerpt.role === "user_first" ? "首次输入" : "后续输入"} · {excerpt.provenance === "truncated" ? "已截断" : excerpt.provenance === "scrubbed" ? "已清理" : "有限摘录"}</p><blockquote>{excerpt.text}</blockquote></section>) : <p>当前数据没有可用摘录。</p>}
        <p>摘录并非完整提示词。原始日志、调用详情、模型、费用及异常尚未开放为此插件的详情投影。</p></>}
      <button disabled={ui.projection?.source !== "local"} onClick={() => void ui.openHostSession()}>在宿主打开完整会话详情</button>
    </dialog>
    <dialog className="city-dialog" ref={settingsRef} onCancel={(event) => { event.preventDefault(); event.stopPropagation(); ui.setOptions(false); }} onClose={() => ui.setOptions(false)} aria-label="城市设置">
      <button className="city-close" aria-label="关闭城市设置" onClick={() => ui.setOptions(false)}>×</button><h2>城市设置</h2>
      <form onSubmit={(e) => { e.preventDefault(); void ui.applySeed(Number(ui.seedDraft.trim())); }}>
        <label htmlFor="city-seed">岛屿种子</label><input id="city-seed" inputMode="numeric" value={ui.seedDraft} disabled={locked} onChange={(e) => ui.setSeedDraft(e.target.value)} />
        <button disabled={locked}>应用种子</button>
      </form>
      <button onClick={ui.reseed} disabled={locked}>{ui.confirmSeed ? "确认重新生成（4 秒内）" : "重新生成岛屿"}</button>
      <p>只改变地形与布局，不删除会话数据。种子保存于插件私有本地状态。</p>
      <label htmlFor="city-backdrop">城市背景楼</label><select id="city-backdrop" value={ui.backdrop} disabled={locked} onChange={(e) => ui.setBackdrop(e.target.value as BackdropMode)}><option value="auto">自动（随会话数，不挤占城区）</option><option value="off">关闭（纯数据城市）</option><option value="full">繁华（铺满城区周边）</option></select>
      <p>背景楼只是城市氛围，不是会话，不可点击，不计入统计。</p>
      <label htmlFor="city-cut">航拍与视频长度</label><select id="city-cut" value={ui.cut} disabled={locked} onChange={(e) => ui.setCut(e.target.value as CinematicCut)}><option value="short">短片</option><option value="full">完整航线</option></select>
      <p>拍照保存 PNG；视频后台逐帧生成 30 FPS MP4（H.264；环境不支持时改为 WebM），并显示实际生成画面的低帧率预览。硬件渲染为 1080p，软件渲染降至 360p。导出中暂停拍照，避免并发导出和保存；离开 City 会取消任务。不上传数据。</p>
      {ui.film && <p role="status" aria-atomic="true">航拍导出 {Math.round(ui.film.frame / ui.film.total * 100)}% · 关闭设置不取消导出</p>}
      {!supportsBackgroundFilm() && <p>当前环境不支持后台视频导出；可使用拍照。</p>}
      <label htmlFor="city-session">选择会话（键盘入口）</label><select id="city-session" value={ui.selected ?? ""} disabled={disabled || ui.busy} onChange={(e) => { ui.setSelected(e.target.value || null); if (e.target.value) ui.focusBuilding(e.target.value); ui.setOptions(false); }}>
        <option value="">请选择</option>{(ui.projection?.sessions ?? []).map((session) => <option key={session.id} value={session.id}>{session.harness} · {session.first_event_at} · {tokens(session.tokens.total)} tokens</option>)}
      </select>
      {ui.error && <p role="alert">{ui.error}</p>}
    </dialog>
    {ui.film && <section className="city-export-preview" aria-label="航拍导出预览">
      <canvas ref={ui.previewRef} width="640" height="360" aria-label="后台实际生成的航拍画面" />
      <div><p role="status" aria-atomic="true">航拍导出 {Math.round(ui.film.frame / ui.film.total * 100)}% {ui.film.width && `${ui.film.width}×${ui.film.height}${ui.film.software ? " · 软件渲染" : ""}`}</p>
      <button onClick={() => void ui.exportFilm()}>取消导出</button></div>
      <small>实际生成帧 · 预览最多 2 FPS，成片 30 FPS</small>
    </section>}
    {ui.error && !ui.options && <div className="city-feature-error" role="alert">{ui.error}<button aria-label="关闭提示" onClick={() => ui.setError(null)}>×</button></div>}
    {debug && ui.stats && <p className="city-perf">{ui.stats.fps} FPS · {ui.stats.drawCalls} draw calls · {ui.stats.buildings} buildings · quality {ui.stats.quality}</p>}
  </>, language);
}
