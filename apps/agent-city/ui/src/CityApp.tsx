import { useEffect, useRef, useState } from "react";
import { buildCityModel, type CitySessionRow } from "./cityModel";
import { prepareCityLayout } from "./engine/cityLayout";
import { MIAMI_COASTAL } from "./engine/citySeaside";
import { CityEngine } from "./engine/CityEngine";
import { tauriCityDataProvider, type CityProjectionV1 } from "./data/provider";
import "./city.css";
import { embedded, connect, observeHealth, publishToolbar, type Tool } from "./host";
import type { EngineQualityMode } from "./engine/CityEngine";
import { CityExperience, useCityExperience } from "./CityExperience";
import { usePlanRepair } from "./planRepair/usePlanRepair";
import { supportsBackgroundFilm } from "./export/filmJob";
import { cityText, cityView, useCityLanguage } from "./i18n";
import { replayStartMs } from "./replayRange";
import { useCityGame } from "./game/useCityGame";
import { CITY_DRIVING_UAT, useCityDrivingUat } from "./game/useCityDrivingUat";
import { DrivingHud } from "./game/DrivingHud";

const windowOptions = [7, 30, 90, 366] as const;
declare const __CITY_GAME_UAT__: boolean;
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
  const [windowDays, setWindowDays] = useState<WindowDays>(() => {
    const params = new URLSearchParams(location.search);
    const days = Number(params.get("windowDays"));
    // The browser landing starts with its mock window, avoiding a second full
    // scene build. The native default remains the latest 500 sessions/year.
    return embedded() && params.get("presentation") === "landing" && windowOptions.includes(days as WindowDays)
      ? days as WindowDays : 366;
  });
  const [status, setStatus] = useState("正在载入 City 插槽数据…");
  const [sceneUnavailable, setSceneUnavailable] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [firstModelFrame, setFirstModelFrame] = useState(false);
  const [quality, setQuality] = useState<EngineQualityMode>("auto");
  const [labels, setLabels] = useState(true);
  const [cinema, setCinema] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const experience = useCityExperience(engineRef, projection);
  // 游戏模式（G1）：开发开关下从城市设置进入；未验收不默认开放（§11 G1 交付）。
  // 必须先于引擎创建 effect 声明——卸载清理时先退出游戏（归还相机）再销毁引擎。
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const cinemaRef = useRef(cinema);
  cinemaRef.current = cinema;
  const filmRef = useRef(!!experience.film);
  filmRef.current = !!experience.film;
  const busyRef = useRef(experience.busy);
  busyRef.current = experience.busy;
  const drivingActive = useRef(false);
  const planRepairActive = useRef(false);
  const game = useCityGame(engineRef, {
    cinemaActive: () => cinemaRef.current,
    filmActive: () => filmRef.current,
    busy: () => busyRef.current || drivingActive.current,
    labelsVisible: () => labelsRef.current,
    requestRefresh: () => setRefresh((value) => value + 1),
    locale: () => (language === "en" ? "en" : "zh-Hans"),
  });
  const driving = useCityDrivingUat(engineRef, {
    cinemaActive: () => cinemaRef.current,
    gameActive: () => game.active,
    busy: () => busyRef.current || filmRef.current || planRepairActive.current,
  });
  drivingActive.current = driving.active;
  // 规划修复（开发开关 ?cityPlan / cityPlanDev=1；未开启时 hook 什么都不做）。与游戏/航拍/导出/忙碌互斥。
  const planRepair = usePlanRepair(engineRef, { seed: experience.seed, model: experience.model, blocked: cinema || game.active || driving.active || experience.busy || !!experience.film });
  planRepairActive.current = planRepair.state.active;
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
    if (!projection || !engineRef.current || experience.busy || game.active || driving.active) return;
    const preparation = new AbortController();
    const engine = engineRef.current;
    const from = Date.parse(projection.window.from);
    const to = Date.parse(projection.window.to);
    const rows: CitySessionRow[] = projection.sessions.map((session) => ({
      session_ref: session.id,
      harness: session.harness,
      title: session.title ?? null,
      title_source: session.title_source ?? null,
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
      harnessNames: Object.fromEntries(projection.harnesses.map((h) => [h.id, h.display_name])),
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
    const signature = JSON.stringify([projection.window, projection.harnesses, projection.sessions, projection.findings]);
    if (signature !== fingerprint.current) {
      void prepareCityLayout(model, experience.seed, MIAMI_COASTAL, { signal: preparation.signal }).then(() => {
        if (preparation.signal.aborted || engineRef.current !== engine) return;
        engine.applyModel(model, appliedWindow.current === projection.window.days);
        appliedWindow.current = projection.window.days;
        fingerprint.current = signature;
        experience.refreshSelection();
      }).catch(() => {
        if (!preparation.signal.aborted) setSceneUnavailable(true);
      });
    }
    experience.refreshSelection();
    return () => preparation.abort();
  }, [projection, experience.busy, experience.seed, game.active, driving.active]);

  useEffect(() => {
    if (experience.busy || game.active || driving.active) return;
    if (!cinema) engineRef.current?.setLabelsVisible(labels);
    engineRef.current?.setQualityMode(quality);
  }, [projection, labels, quality, cinema, experience.busy, game.active, driving.active]);

  const dataAvailable = projection !== null && projection.status !== "unavailable";
  const sceneReady = dataAvailable && projection.status !== "empty" && !sceneUnavailable && firstModelFrame;
  const toolbarReady = true; // UI/command channel ready; scene actions stay disabled until the first model frame.
  const tools: Tool[] = [
    // 时间范围、显示标签移入城市设置（用户：这两个应放设置里）；画质同样在设置里。city.window / city.labels 命令仍保留给宿主与自动化。
    { id: "catalog", commandId: "city.catalog", label: "建筑说明", kind: "button", enabled: !cinema && !game.active },
    { id: "reset", commandId: "city.reset", label: "重置视角", kind: "button", enabled: sceneReady && !cinema && !game.active && !experience.busy },
    { id: "cinema", commandId: "city.cinema", label: cinema ? "停止航拍" : "航拍", kind: "button", enabled: sceneReady && !experience.busy && !game.active },
    { id: "photo", commandId: "city.photo", label: experience.photoBusy ? "正在拍照" : "拍照", kind: "button", enabled: sceneReady && !cinema && !game.active && !experience.busy && !experience.film },
    { id: "film", commandId: "city.film", label: experience.film ? `取消导出 · ${Math.round(experience.film.frame / experience.film.total * 100)}%` : "导出视频", kind: "button", enabled: !!experience.film || (sceneReady && !cinema && !game.active && !experience.busy && supportsBackgroundFilm()) },
    { id: "settings", commandId: "city.settings", label: "城市设置", kind: "button", enabled: !cinema && !game.active },
    // 游戏模式（开发开关门控）：平时「驾驶飞机」直接进自由练习（挑战仍在城市设置）；
    // 游戏中变「退出游戏」——即计划 §3 要求的宿主级通用退出入口。上限 8→9 见 host 校验器。
    { id: "game", commandId: "city.game", label: game.active ? "退出游戏" : "驾驶飞机", kind: "button" as const, enabled: sceneReady && !cinema && !experience.busy && !experience.film },
    // 修复城市入口放在「更多工具」里（用户：不要悬浮在画面上）。进入后的编辑面板仍在页面内；
    // 上限 9→10 见 host 校验器（plugin_host.rs::valid_tools）。
    { id: "repair", commandId: "city.repair", label: planRepair.state.active ? "退出修复" : "修复城市", kind: "button" as const, enabled: planRepair.state.active || (sceneReady && !cinema && !game.active && !experience.busy && !experience.film) },
    ...(CITY_DRIVING_UAT ? [{ id: "car", commandId: "city.car", label: driving.active ? "退出试驾" : "试驾汽车 · UAT", kind: "button" as const,
      enabled: driving.active || (sceneReady && !cinema && !game.active && !experience.busy && !experience.film && !planRepair.state.active) }] : []),
  ].map((tool) => ({ ...tool, enabled: tool.id === "car" ? tool.enabled : tool.enabled && !driving.active })).map((tool: { id: string; label: string; options?: Array<{ value: string; label: string }> }) => ({ ...tool, placement: tool.id === "cinema" || tool.id === "game" || tool.id === "car" || tool.id === "film" && experience.film ? "primary" : "overflow", label: cityText(tool.label, language), options: tool.options?.map((option) => ({ ...option, label: cityText(option.label, language) })) })) as Tool[];
  const execute = (commandId: string, value?: string) => {
    const engine = engineRef.current;
    if (driving.active && commandId !== "city.car") throw new Error("driving_active");
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
      case "city.catalog": experience.setCatalog(!experience.catalog); break;
      case "city.repair":
        if (planRepair.state.active) planRepair.exit(); else planRepair.enter();
        break;
      case "city.car":
        if (!CITY_DRIVING_UAT) throw new Error("command_unavailable");
        if (driving.active) driving.exit(); else { experience.setOptions(false); experience.clearSelection(); driving.enter(); }
        break;
      case "city.game":
        if (game.active) game.exit();
        else game.enterPractice();
        break;
      default: throw new Error("command_unavailable");
    }
  };
  // 宿主命令监听只注册一次、永远调用最新的 execute：此前按依赖列表重注册，列表里没有 model，
  // 模型晚于首次注册才就绪时 execute 里的 planRepair.enter 还是 model=null 的旧闭包，静默 return——
  // 宿主日志显示「命令成功」而界面毫无反应（修复城市入口的真机症状）。
  const executeRef = useRef(execute);
  executeRef.current = execute;
  useEffect(() => connect((command) => executeRef.current(command.commandId, command.value)), []);
  // Publishing the first toolbar acknowledges the responsive plugin shell, not
  // scene completion. Planning runs on a local worker while scene tools stay disabled.
  useEffect(() => { if (toolbarReady) publishToolbar(tools); }, [language, toolbarReady, windowDays, quality, labels, cinema, sceneReady, sceneUnavailable, game.active, driving.active, planRepair.state.active, experience.busy, experience.film?.frame, experience.film?.total]);
  const sceneMessage = sceneUnavailable ? "当前环境无法显示三维城市，仍可查看会话摘要。"
    : !dataAvailable || projection.status === "empty" ? status : null;
  return cityView((
    <section className="city-app" aria-label="Agent City">
      <canvas className="city-canvas" ref={canvasRef} aria-label="Agent City 三维城市" style={{ visibility: sceneMessage && !game.active ? "hidden" : "visible" }} />
      {sceneMessage && !game.active && <p className="city-scene-message" role="status">{sceneMessage}</p>}
      {!embedded() && <header className="city-header">
        <div className="city-local-toolbar">{tools.map((tool) => tool.kind === "select"
          ? <select key={tool.id} aria-label={tool.label} value={tool.value} disabled={!tool.enabled} onChange={(event) => execute(tool.commandId, event.target.value)}>{tool.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          : <button key={tool.id} disabled={!tool.enabled} onClick={() => execute(tool.commandId)}>{tool.label}</button>)}</div>
      </header>}
      <div hidden={driving.active}><CityExperience ui={experience} disabled={!sceneReady} cinema={cinema} status={status} quality={quality} game={game} planRepair={planRepair}
        windowDays={windowDays} windowOptions={windowOptions} onWindowDays={(days) => setWindowDays(days as WindowDays)} labels={labels} onLabels={(next) => { engineRef.current?.setLabelsVisible(next); setLabels(next); }}
        onQuality={(value) => { if (["auto", "high", "eco"].includes(value)) { engineRef.current?.setQualityMode(value as EngineQualityMode); setQuality(value as EngineQualityMode); } }} /></div>
      {CITY_DRIVING_UAT && <DrivingHud model={{ active: driving.active, entryError: driving.entryError,
        initialPaused: driving.initialPaused, hud: driving.hud, diagnostics: driving.diagnostics() }}
        actions={{ clearEntryError: driving.clearEntryError, exit: driving.exit, pause: driving.pause,
          resume: driving.resume, openUiContext: driving.openUiContext }}
        locale={language === "en" ? "en" : "zh-Hans"} sound={driving.sound} />}
    </section>
  ), language);
}
