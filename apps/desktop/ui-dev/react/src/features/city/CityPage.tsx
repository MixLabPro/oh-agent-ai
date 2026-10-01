/**
 * Agent City 页面：3D 城市画布 + 克制的 HUD。
 * React 只负责数据装载、HUD 与钻取面板；渲染细节全部在 CityEngine 里。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./city.css";
import { CityLoader, CITY_WINDOWS, type CityWindowKind } from "./cityData";
import type { CityBuilding, CityModel } from "./cityModel";
import { paletteFor } from "./engine/cityTextures";
import { CityEngine, type EngineQualityMode, type EngineStats } from "./engine/CityEngine";
import { hostName } from "../../lib/hostNames";
import { formatCost } from "../sessions/costSummary";
import { SessionDetail } from "../sessions/SessionDetail";
import { message, resolvedLanguage, useLanguage, formatTokenCount, modelLabel, type AppLanguage } from "../../lib/i18n";
import { Button, SelectInput } from "../../components/ui/FormControls";
import { ToolbarActions } from "../../components/ui/ToolbarActions";

const PLAYBACK_SPEEDS: Array<{ value: number; key: "city.time.speed10m" | "city.time.speed1h" | "city.time.speed4h" }> = [
  { value: 600, key: "city.time.speed10m" },
  { value: 3_600, key: "city.time.speed1h" },
  { value: 14_400, key: "city.time.speed4h" },
];

function dayLabel(ms: number): string {
  const date = new Date(ms);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  return `${month}-${day} ${hour}:00`;
}

function durationLabel(startedAt: number, endedAt: number | null, language: AppLanguage): string {
  const end = endedAt ?? Date.now();
  const minutes = Math.max(1, Math.round((end - startedAt) / 60_000));
  if (minutes < 90) return message("city.detail.minutes", language, { count: minutes });
  const hours = minutes / 60;
  if (hours < 36) return message("city.detail.hours", language, { count: Math.round(hours * 10) / 10 });
  return message("city.detail.days", language, { count: Math.round(hours / 24) });
}

export function CityPage() {
  const language = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<CityEngine | null>(null);
  const loaderRef = useRef<CityLoader | null>(null);
  const modelRef = useRef<CityModel | null>(null);
  const fingerprintRef = useRef<string>("");
  const cursorThrottleRef = useRef(0);
  const selectedRef = useRef<string | null>(null);

  const [model, setModel] = useState<CityModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [windowKind, setWindowKind] = useState<CityWindowKind>("30d");
  const [qualityMode, setQualityMode] = useState<EngineQualityMode>("auto");
  const [labelsVisible, setLabelsVisible] = useState(true);
  const [stats, setStats] = useState<EngineStats | null>(null);
  const [cursorMs, setCursorMs] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(3_600);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRefresh, setDetailRefresh] = useState(0);
  const [overflowCount, setOverflowCount] = useState(0);

  const buildingIndex = useMemo(() => {
    const index = new Map<string, CityBuilding>();
    for (const building of model?.buildings ?? []) index.set(building.id, building);
    return index;
  }, [model]);

  const laidOutComplete = useRef(false);
  const applyModel = useCallback((result: { model: CityModel; complete: boolean }) => {
    const next = result.model;
    const fingerprint = JSON.stringify([next.stats, next.districts, next.buildings.length, next.buildings.map((building) => [building.id, building.tokensTotal, building.active, building.height])]);
    modelRef.current = next;
    setModel(next);
    if (fingerprint !== fingerprintRef.current) {
      fingerprintRef.current = fingerprint;
      // 分页是 token 降序、乱序到达：中间页的布局只是近似。全部页到齐后
      // 做一次全量重排（老会话回到内圈，生长叙事归位）；此后轮询/失效
      // 刷新复用布局，楼永不搬家。
      const needsRelayout = result.complete && !laidOutComplete.current;
      engineRef.current?.applyModel(next, !needsRelayout);
      if (result.complete) laidOutComplete.current = true;
      setOverflowCount(engineRef.current?.overflowCount ?? 0);
      if (selectedRef.current) engineRef.current?.setSelected(selectedRef.current);
    } else if (result.complete) {
      laidOutComplete.current = true;
    }
  }, []);

  useEffect(() => {
    const loader = new CityLoader();
    loaderRef.current = loader;
    return () => {
      loader.dispose();
      loaderRef.current = null;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new CityEngine({
      canvas,
      onHover: (id, clientX, clientY) => {
        const tooltip = tooltipRef.current;
        if (!tooltip) return;
        if (!id) {
          tooltip.style.opacity = "0";
          return;
        }
        const current = modelRef.current;
        if (!current) return;
        const building = current.buildings.find((item) => item.id === id);
        const row = current.rows.get(id);
        if (!building) return;
        const title = row
          ? `${hostName(row.host)} · ${row.first_event_at?.slice(0, 10) ?? ""}`
          : message("city.tooltipAggregate", resolvedLanguage(), { count: building.extraCount });
        const body = row
          ? `${formatTokenCount(row.tokens.total)} tokens · ${row.model_ids.map((id2) => modelLabel(id2, resolvedLanguage())).join(" · ") || "—"}`
          : `${formatTokenCount(building.tokensTotal)} tokens`;
        tooltip.textContent = "";
        const titleNode = document.createElement("strong");
        titleNode.textContent = `${title}${building.active ? " 🏗" : ""}`;
        const bodyNode = document.createElement("span");
        bodyNode.textContent = body;
        tooltip.append(titleNode, bodyNode);
        tooltip.style.opacity = "1";
        tooltip.style.transform = `translate(${clientX + 14}px, ${clientY + 14}px)`;
      },
      onSelect: (id) => {
        selectedRef.current = id;
        setSelectedId(id);
        if (!id) setDetailOpen(false);
      },
      onStats: (value) => setStats(value),
      onTimeCursor: (ms, live) => {
        const now = performance.now();
        if (now - cursorThrottleRef.current < 180 && !live) return;
        cursorThrottleRef.current = now;
        setCursorMs(live ? null : ms);
        setPlaying(engine.isPlaying);
      },
    });
    engineRef.current = engine;
    engine.setQualityMode(qualityMode);
    if (modelRef.current) engine.applyModel(modelRef.current);
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const loader = loaderRef.current;
    if (!loader) return;
    setLoading(true);
    setError(null);
    fingerprintRef.current = "";
    laidOutComplete.current = false;
    void loader.reload(windowKind, {
      onModel: (result) => {
        setError(result.error);
        applyModel(result);
        setLoading(false);
      },
      onBackgroundModel: (result) => {
        if (result.error) return; // 后台刷新失败保留旧城
        applyModel(result);
      },
    });
    const stopPolling = loader.startActivePolling(90_000, () => {
      void loader.reload(windowKind, {
        onModel: (result) => applyModel(result),
        onBackgroundModel: (result) => {
          if (!result.error) applyModel(result);
        },
      });
    });
    return stopPolling;
  }, [windowKind, applyModel]);

  useEffect(() => {
    engineRef.current?.setQualityMode(qualityMode);
  }, [qualityMode]);

  useEffect(() => {
    engineRef.current?.setLabelsVisible(labelsVisible);
  }, [labelsVisible]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (detailOpen) setDetailOpen(false);
        else {
          selectedRef.current = null;
          setSelectedId(null);
          engineRef.current?.setTimeCursor(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailOpen]);

  const selectedBuilding = selectedId ? buildingIndex.get(selectedId) ?? null : null;
  const selectedRow = selectedId ? model?.rows.get(selectedId) ?? null : null;

  const onSlider = (value: number) => {
    const current = modelRef.current;
    if (!current) return;
    const span = current.windowEndMs - current.windowStartMs;
    const ms = current.windowStartMs + (value / 1000) * span;
    engineRef.current?.setTimeCursor(ms, { playing: false });
    setCursorMs(ms);
    setPlaying(false);
  };

  const startReplay = () => {
    const current = modelRef.current;
    if (!current) return;
    const from = cursorMs && cursorMs < current.windowEndMs ? cursorMs : current.windowStartMs + 60_000;
    engineRef.current?.setTimeCursor(from, { playing: true, speed });
    setPlaying(true);
  };

  const pauseReplay = () => {
    engineRef.current?.setTimeCursor(cursorMs ?? modelRef.current?.windowEndMs ?? 0, { playing: false });
    setPlaying(false);
  };

  const backToLive = () => {
    engineRef.current?.setTimeCursor(null);
    setCursorMs(null);
    setPlaying(false);
  };

  const sliderValue = (() => {
    const current = modelRef.current;
    if (!current) return 1000;
    if (cursorMs === null) return 1000;
    return Math.round(((cursorMs - current.windowStartMs) / Math.max(1, current.windowEndMs - current.windowStartMs)) * 1000);
  })();

  const openSessionDetail = () => {
    setDetailRefresh((value) => value + 1);
    setDetailOpen(true);
  };

  return <div className="city-workspace">
    <canvas ref={canvasRef} className="city-canvas" aria-label={message("city.canvasLabel", language)} />
    <div ref={tooltipRef} className="city-tooltip" aria-hidden="true" />

    <ToolbarActions>
      <div className="city-toolbar">
        <span className="status-pill"><span aria-hidden="true" className="status-dot" />{message("city.localData", language)}</span>
        <SelectInput aria-label={message("city.window", language)} value={windowKind} onChange={(event) => setWindowKind(event.target.value as CityWindowKind)}>
          {CITY_WINDOWS.map((item) => <option key={item.kind} value={item.kind}>{message(`city.window.${item.kind}` as "city.window.7d", language)}</option>)}
        </SelectInput>
        <SelectInput aria-label={message("city.quality", language)} value={qualityMode} onChange={(event) => setQualityMode(event.target.value as EngineQualityMode)}>
          <option value="auto">{message("city.quality.auto", language)}</option>
          <option value="high">{message("city.quality.high", language)}</option>
          <option value="eco">{message("city.quality.eco", language)}</option>
        </SelectInput>
        <Button type="button" onClick={() => setLabelsVisible((value) => !value)}>{message(labelsVisible ? "city.labelsHide" : "city.labelsShow", language)}</Button>
        <Button type="button" onClick={() => engineRef.current?.resetView()}>{message("city.resetView", language)}</Button>
      </div>
    </ToolbarActions>

    <section className="city-hud-stats" aria-live="polite">
      <div><strong>{model ? model.stats.totalSessions : "—"}</strong><span>{message("city.stats.sessions", language)}</span></div>
      <div><strong>{model ? formatTokenCount(model.stats.tokensTotal) : "—"}</strong><span>{message("city.stats.tokens", language)}</span></div>
      <div><strong>{model ? model.stats.activeCount : "—"}</strong><span>{message("city.stats.active", language)}</span></div>
      {model && model.stats.aggregatedSessions + overflowCount > 0 && <div><strong>{model.stats.aggregatedSessions + overflowCount}</strong><span>{message("city.stats.aggregated", language)}</span></div>}
    </section>

    <section className="city-legend" aria-label={message("city.legend", language)}>
      <p className="city-legend-title">{message("city.legend", language)}</p>
      <ul>
        {(model?.districts ?? []).map((district) => <li key={district.id}>
          <button type="button" onClick={() => engineRef.current?.focusDistrict(district.id)} title={message("city.legendFocus", language)}>
            <span className="city-legend-chip" style={{ background: paletteFor(district.id).accent }} />
            <span className="city-legend-name">{district.label}</span>
            <span className="city-legend-count">{district.sessionCount}</span>
            {district.activeCount > 0 && <span className="city-legend-active" title={message("city.stats.active", language)}>🏗 {district.activeCount}</span>}
            {district.anomaly && <span className={`city-legend-anomaly city-anomaly-${district.anomaly.severity}`} title={`${district.anomaly.topRule} × ${district.anomaly.count}`}>⚠ {district.anomaly.count}</span>}
          </button>
        </li>)}
      </ul>
    </section>

    <section className="city-timeline" aria-label={message("city.time.replay", language)}>
      <div className="city-timeline-row">
        <Button type="button" className="city-replay-button" onClick={playing ? pauseReplay : startReplay} disabled={!model}>{playing ? "⏸" : "▶"}<span className="visually-hidden">{message(playing ? "city.time.pause" : "city.time.play", language)}</span></Button>
        <input
          className="city-time-slider"
          type="range"
          min={0}
          max={1000}
          value={sliderValue}
          aria-label={message("city.time.cursor", language)}
          onChange={(event) => onSlider(Number(event.target.value))}
          disabled={!model}
        />
        <span className="city-time-label">{cursorMs === null ? message("city.time.live", language) : dayLabel(cursorMs)}</span>
        <SelectInput className="city-speed-select" aria-label={message("city.time.speed", language)} value={String(speed)} onChange={(event) => setSpeed(Number(event.target.value))} disabled={playing}>
          {PLAYBACK_SPEEDS.map((item) => <option key={item.value} value={item.value}>{message(item.key, language)}</option>)}
        </SelectInput>
        {cursorMs !== null && <Button type="button" onClick={backToLive}>{message("city.time.now", language)}</Button>}
      </div>
      <p className="city-time-hint">{message("city.time.hint", language)}</p>
    </section>

    {loading && !model && <div className="city-state" role="status"><strong>{message("city.loading", language)}</strong><p>{message("city.loadingHelp", language)}</p></div>}
    {error && <div className="error-banner city-error" role="alert">{error}</div>}
    {!loading && model && model.stats.totalSessions === 0 && !error && <div className="city-state"><strong>{message("city.empty", language)}</strong><p>{message("city.emptyHelp", language)}</p></div>}

    {stats && <p className="city-perf" aria-hidden="true">{message("city.perf", language, { fps: stats.fps, calls: stats.drawCalls, buildings: stats.buildings, quality: stats.quality })}{stats.idle ? ` · ${message("city.perfIdle", language)}` : ""}</p>}

    {selectedBuilding && <aside className="city-panel" role="dialog" aria-label={message("city.detail.title", language)}>
      <button type="button" className="city-panel-close" aria-label={message("city.detail.close", language)} onClick={() => { selectedRef.current = null; setSelectedId(null); }}>×</button>
      <p className="eyebrow">{message("city.detail.building", language)}</p>
      {selectedRow ? <>
        <h2>{message("sessions.sessionTitle", language, { host: hostName(selectedRow.host), date: selectedRow.first_event_at?.slice(0, 10).replaceAll("-", "/") ?? "—" })}</h2>
        <dl className="city-panel-grid">
          <div><dt>{message("city.detail.host", language)}</dt><dd>{hostName(selectedRow.host)}</dd></div>
          <div><dt>{message("city.detail.models", language)}</dt><dd>{selectedRow.model_ids.length ? selectedRow.model_ids.map((id) => modelLabel(id, language)).join(" · ") : message("sessions.unknownModel", language)}</dd></div>
          <div><dt>{message("city.detail.tokens", language)}</dt><dd>{formatTokenCount(selectedRow.tokens.total)}</dd></div>
          <div><dt>{message("city.detail.material", language)}</dt><dd>{message("city.detail.materialValue", language, { input: formatTokenCount(selectedRow.tokens.uncached_input_tokens), cached: formatTokenCount(selectedRow.tokens.cache_read_tokens), output: formatTokenCount(selectedRow.tokens.output_tokens) })}</dd></div>
          <div><dt>{message("city.detail.duration", language)}</dt><dd>{durationLabel(selectedBuilding.startedAt, selectedBuilding.endedAt, language)}</dd></div>
          <div><dt>{message("city.detail.events", language)}</dt><dd>{selectedRow.event_count}</dd></div>
          <div><dt>{message("city.detail.cost", language)}</dt><dd>{formatCost(selectedRow.cost_minor) ?? "—"}</dd></div>
          <div><dt>{message("city.detail.status", language)}</dt><dd className={selectedBuilding.active ? "city-status-active" : ""}>{message(selectedBuilding.active ? "city.detail.statusActive" : "city.detail.statusComplete", language)}</dd></div>
          {!selectedBuilding.aggregated && <div><dt>{message("city.detail.progress", language)}</dt><dd>{selectedBuilding.active ? `${Math.round(selectedBuilding.builtFraction * 100)}% · ${message("city.detail.progressEstimate", language)}` : "100%"}</dd></div>}
        </dl>
        <div className="city-panel-actions">
          <Button type="button" onClick={openSessionDetail}>{message("city.detail.openSession", language)}</Button>
          <Button type="button" className="button-secondary" onClick={() => engineRef.current?.focusBuilding(selectedBuilding.id)}>{message("city.detail.focus", language)}</Button>
        </div>
      </> : <>
        <h2>{message("city.detail.aggregateTitle", language)}</h2>
        <dl className="city-panel-grid">
          <div><dt>{message("city.detail.host", language)}</dt><dd>{hostName(selectedBuilding.districtId)}</dd></div>
          <div><dt>{message("city.detail.sessions", language)}</dt><dd>{selectedBuilding.extraCount}</dd></div>
          <div><dt>{message("city.detail.tokens", language)}</dt><dd>{formatTokenCount(selectedBuilding.tokensTotal)}</dd></div>
        </dl>
        <p className="city-panel-note">{message("city.detail.aggregateNote", language)}</p>
      </>}
      <p className="city-panel-note">{message("city.detail.metaphorNote", language)}</p>
    </aside>}

    {detailOpen && selectedRow && selectedId && <>
      <div className="sessions-overlay-backdrop" onClick={() => setDetailOpen(false)} />
      <div className="sessions-overlay-panel" role="dialog" aria-modal="true" aria-label={message("sessions.detail", language)}>
        <div className="sessions-overlay-bar"><button type="button" className="sessions-overlay-close" onClick={() => setDetailOpen(false)} aria-label={message("sessions.closeDetail", language)}>×</button></div>
        <div className="sessions-overlay-body"><SessionDetail row={selectedRow} sessionRef={selectedId} hostKind={selectedRow.host} refreshKey={detailRefresh} onBack={() => setDetailOpen(false)} /></div>
      </div>
    </>}
  </div>;
}
