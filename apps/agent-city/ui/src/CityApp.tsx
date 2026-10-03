import { useEffect, useRef, useState } from "react";
import { buildCityModel, type CitySessionRow } from "./cityModel";
import { CityEngine } from "./engine/CityEngine";
import { tauriCityDataProvider, type CityProjectionV1 } from "./data/provider";
import "./city.css";
import { embedded, connect, observeHealth, publishToolbar, type Tool } from "./host";
import type { EngineQualityMode } from "./engine/CityEngine";
import { CityExperience, useCityExperience } from "./CityExperience";
import { supportsBackgroundFilm } from "./export/filmJob";
import { cityText, cityView, useCityLanguage } from "./i18n";
import { replayStartMs } from "./replayRange";

const windowOptions = [7, 30, 90, 366] as const;
type WindowDays = (typeof windowOptions)[number];

function projectionStatusLabel(data: CityProjectionV1): string {
  if (data.status === "ready") return data.source === "local"
    ? `本机真实数据 · ${data.coverage.truncated ? `载入 ${data.coverage.returned}/${data.coverage.total} 会话` : "窗口内会话"} · ${data.coverage.findings_state === "partial" ? "异常为部分已入库投影" : "异常统计未接入"}`
    : "合成 fixture · 尚未接入真实数据源";
  if (data.status === "empty") return "当前时间范围没有会话";
  if (data.status === "stale") return "数据可能已过期";
  return "City 数据不可用";
}

export function CityApp() {
  const language = useCityLanguage();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CityEngine | null>(null);
  const [projection, setProjection] = useState<CityProjectionV1 | null>(null);
  const [windowDays, setWindowDays] = useState<WindowDays>(30);
  const [status, setStatus] = useState("正在载入 City 插槽数据…");
  const [sceneUnavailable, setSceneUnavailable] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [firstModelFrame, setFirstModelFrame] = useState(false);
  const [quality, setQuality] = useState<EngineQualityMode>("auto");
  const [labels, setLabels] = useState(true);
  const [cinema, setCinema] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const experience = useCityExperience(engineRef, projection);
  const appliedWindow = useRef<number | null>(null);
  const fingerprint = useRef("");
  useEffect(() => observeHealth(() => engineRef.current?.diagnosticState() ?? { engineMissing: true }), []);
  useEffect(() => {
    const invalidated = () => setRefresh((value) => value + 1);
    window.addEventListener("__AV_PLUGIN_INVALIDATED__", invalidated);
    return () => window.removeEventListener("__AV_PLUGIN_INVALIDATED__", invalidated);
  }, []);

  useEffect(() => {
    let active = true;
    setStatus("正在更新 City 插槽数据…");
    tauriCityDataProvider.getProjection({ windowDays }).then((data) => {
      if (!active) return;
      setProjection(data);
      setDataLoaded(true);
      setStatus(projectionStatusLabel(data));
    }).catch(() => {
      if (!active) return;
      setProjection(null);
      setDataLoaded(true);
      setStatus("City 数据暂不可用");
    });
    return () => { active = false; };
  }, [windowDays, refresh]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let engine: CityEngine;
    try {
      engine = new CityEngine({ canvas, ...experience.callbacks, onFirstFrame: () => setFirstModelFrame(true), onCinematic: (_elapsed, _plan, ended) => {
        experience.callbacks.onCinematic(_elapsed, _plan, ended);
        if (ended) { setCinema(false); }
      } });
    } catch {
      setSceneUnavailable(true);
      return;
    }
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!projection || !engineRef.current || experience.busy) return;
    const from = Date.parse(projection.window.from);
    const to = Date.parse(projection.window.to);
    const rows: CitySessionRow[] = projection.sessions.map((session) => ({
      session_ref: session.id,
      harness: session.harness,
      first_event_at: session.first_event_at,
      last_event_at: session.last_event_at,
      event_count: session.event_count ?? 1,
      peak_tokens: session.tokens.total,
      model_ids: [],
      tokens: {
        uncached_input_tokens: session.tokens.input,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        output_tokens: session.tokens.output,
        total: session.tokens.total,
      },
      cost_minor: null,
      cost_status: { state: "unavailable", reason: "cost_not_projected", has_unresolved: true },
    }));
    const model = buildCityModel({
      rows,
      findings: projection.findings.map((finding) => ({
        harness: finding.harness,
        rule: "harness_summary",
        severity: finding.severity,
        status_rollup: { open: finding.count, later: 0 },
      })),
      windowStartMs: replayStartMs(projection.sessions, from, to),
      windowEndMs: to,
      windowLabel: projection.window.label,
      totalSessions: projection.coverage.total,
      truncated: projection.coverage.truncated,
      generatedAt: Date.parse(projection.generated_at ?? new Date().toISOString()),
    });
    experience.modelRef.current = model;
    experience.setModel(model);
    const signature = JSON.stringify([projection.window, projection.sessions, projection.findings]);
    if (signature !== fingerprint.current) {
      engineRef.current.applyModel(model, appliedWindow.current === projection.window.days);
      appliedWindow.current = projection.window.days;
      fingerprint.current = signature;
    }
    experience.refreshSelection();
  }, [projection, experience.busy]);

  useEffect(() => {
    if (experience.busy) return;
    if (!cinema) engineRef.current?.setLabelsVisible(labels);
    engineRef.current?.setQualityMode(quality);
  }, [projection, labels, quality, cinema, experience.busy]);

  const dataAvailable = projection !== null && projection.status !== "unavailable";
  const totalTokens = dataAvailable ? projection.sessions.reduce((sum, session) => sum + session.tokens.total, 0) : null;
  const sceneReady = dataAvailable && projection.status !== "empty" && !sceneUnavailable && firstModelFrame;
  const toolbarReady = dataLoaded && (sceneUnavailable || !dataAvailable || projection.status === "empty" || firstModelFrame);
  const tools: Tool[] = [
    { id: "window", commandId: "city.window", label: "时间范围", kind: "select", enabled: !cinema && !experience.busy, value: String(windowDays), options: windowOptions.map((days) => ({ value: String(days), label: `${days} 天` })) },
    { id: "quality", commandId: "city.quality", label: "画质", kind: "select", enabled: !sceneUnavailable && !experience.busy, value: quality, options: [{ value: "auto", label: "自动" }, { value: "high", label: "高画质" }, { value: "eco", label: "节能" }] },
    { id: "labels", commandId: "city.labels", label: labels ? "隐藏标签" : "显示标签", kind: "button", enabled: sceneReady && !cinema && !experience.busy },
    { id: "reset", commandId: "city.reset", label: "重置视角", kind: "button", enabled: sceneReady && !cinema && !experience.busy },
    { id: "cinema", commandId: "city.cinema", label: cinema ? "停止航拍" : "航拍", kind: "button", enabled: sceneReady && !experience.busy },
    { id: "photo", commandId: "city.photo", label: experience.photoBusy ? "正在拍照" : "拍照", kind: "button", enabled: sceneReady && !cinema && !experience.busy && !experience.film },
    { id: "film", commandId: "city.film", label: experience.film ? `取消导出 · ${Math.round(experience.film.frame / experience.film.total * 100)}%` : "导出视频", kind: "button", enabled: !!experience.film || (sceneReady && !cinema && !experience.busy && supportsBackgroundFilm()) },
    { id: "settings", commandId: "city.settings", label: "城市设置", kind: "button", enabled: !cinema },
  ].map((tool) => ({ ...tool, label: cityText(tool.label, language), options: tool.options?.map((option) => ({ ...option, label: cityText(option.label, language) })) })) as Tool[];
  const execute = (commandId: string, value?: string) => {
    const engine = engineRef.current;
    switch (commandId) {
      case "city.window": {
        const days = Number(value);
        if (!windowOptions.includes(days as WindowDays)) throw new Error("invalid_window");
        setWindowDays(days as WindowDays); break;
      }
      case "city.quality":
        if (!["auto", "high", "eco"].includes(value ?? "")) throw new Error("invalid_quality");
        engine?.setQualityMode(value as EngineQualityMode); setQuality(value as EngineQualityMode); break;
      case "city.labels": engine?.setLabelsVisible(!labels); setLabels(!labels); break;
      case "city.reset": engine?.resetView(); break;
      case "city.cinema":
        if (cinema) { engine?.stopCinematic(); engine?.setLabelsVisible(labels); setCinema(false); }
        else { experience.clearSelection(); experience.live(); if (!engine?.startCinematic(experience.cut)) throw new Error("cinema_unavailable"); setCinema(true); }
        break;
      case "city.photo": void experience.photo(); break;
      case "city.film": void experience.exportFilm(); break;
      case "city.settings": experience.setOptions(!experience.options); break;
      default: throw new Error("command_unavailable");
    }
  };
  useEffect(() => connect((command) => execute(command.commandId, command.value)), [windowDays, quality, labels, cinema, experience.busy, experience.cut, experience.options, experience.film]);
  // Publishing the first toolbar is the host's ready handshake. An empty scene
  // or loaded DTO alone must not arm the runtime watchdog during shader boot.
  useEffect(() => { if (toolbarReady) publishToolbar(tools); }, [language, toolbarReady, windowDays, quality, labels, cinema, sceneReady, sceneUnavailable, experience.busy, experience.film?.frame, experience.film?.total]);
  const sceneMessage = sceneUnavailable ? "当前环境无法显示三维城市，仍可查看会话摘要。"
    : !dataAvailable || projection.status === "empty" ? status : null;
  return cityView((
    <section className="city-app" aria-label="Agent City">
      <canvas className="city-canvas" ref={canvasRef} aria-label="Agent City 三维城市" style={{ visibility: sceneMessage ? "hidden" : "visible" }} />
      {sceneMessage && <p className="city-scene-message" role="status">{sceneMessage}</p>}
      <header className="city-header">
        <div>
          <div className="eyebrow">AGENT VITALS · LOCAL APP</div>
          <h1>Agent City</h1>
          <p>{status}</p>
          {dataAvailable && <p>{cityText("已载入", language)} {projection.coverage.returned}/{projection.coverage.total} · {cityText("统计及回放仅覆盖已载入会话；最多 500 条近期会话，不代表完整历史。", language)}</p>}
        </div>
        {!embedded() && <div className="city-local-toolbar">{tools.map((tool) => tool.kind === "select"
          ? <select key={tool.id} aria-label={tool.label} value={tool.value} disabled={!tool.enabled} onChange={(event) => execute(tool.commandId, event.target.value)}>{tool.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          : <button key={tool.id} disabled={!tool.enabled} onClick={() => execute(tool.commandId)}>{tool.label}</button>)}</div>}
      </header>
      <section className="city-stats" aria-label="城市摘要">
        <div><span>会话</span><strong>{dataAvailable ? projection.coverage.returned : "—"}</strong></div>
        <div><span>Token</span><strong>{totalTokens?.toLocaleString() ?? "—"}</strong></div>
        <div><span>活跃</span><strong>{dataAvailable ? experience.model?.stats.activeCount ?? "—" : "—"}</strong></div>
        {experience.model && experience.model.stats.aggregatedSessions + (engineRef.current?.overflowCount ?? 0) > 0 && <div><span>聚合</span><strong>{experience.model.stats.aggregatedSessions + (engineRef.current?.overflowCount ?? 0)}</strong></div>}
      </section>
      <CityExperience ui={experience} disabled={!sceneReady} cinema={cinema} />
      <footer>Agent Vitals City 模块 · {projection?.source === "local" ? "本机只读投影 · 不上传数据" : "本地演示数据 · 尚未接入真实数据源"}</footer>
    </section>
  ), language);
}
