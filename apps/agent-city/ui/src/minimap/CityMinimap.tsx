/**
 * 城市小地图（2026-10-21，用户：「左下角设计一个正方形小地图……普通模式下可以查看道路路线，点击查看道路审计可以看到哪里拥堵，
 * 开车游戏可以看到道路情况以及当前所在的位置，小地图可以展开和收起，吸附在左边侧边」）。
 *
 * 一块正方形、贴着窗口左缘的面板，三种看法：
 *   - 路线（普通模式默认）：按路型着色的路网——主干道 / 次干道 / 小路 / 桥 / 高架，蓝色箭头是镜头看向的位置；
 *   - 道路审计：高峰车流估算（traffic.ts）——绿畅通、黄较忙、橙偏慢、红拥堵，紫色虚线是车开不过去、被排除在路网外的路；
 *     拥堵点闪烁，悬停看流量与超出通行能力多少；
 *   - 驾驶（开车时自动切换）：路况（红 = 开不过去，琥珀 = 很陡，判据与修复面板「体检」同一组函数，roadConditions.ts）
 *     + 车的位置与朝向；默认跟随车辆（看车周围 ~320 m），可切到全城。
 * 点地图（非驾驶）镜头飞过去，点在问题点附近就飞到问题点。收起时缩进左缘，只留一个把手；展开/收起与所选看法记在本机。
 * 只读：每 0.5 s 看一眼生效布局是不是换了（修复工具每次编辑产出新布局），换了就重画；整城视图缓存成位图，跟随视图按 ~12 fps 重画。
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { CityEngine } from "../engine/CityEngine";
import type { CityLayout } from "../engine/cityLayout";
import { minimapModel, type MinimapModel } from "./roadConditions";
import { trafficModel, type TrafficLevel, type TrafficModel } from "./traffic";

const SIZE = 208;
const FOLLOW_SPAN = 320;
const ROAD_COLOR = { main: "#ece8dc", secondary: "#cfcbc0", local: "#a29f97", bridge: "#8fb7d6" } as const;
const CONDITION_COLOR = { blocked: "#ff4d3d", steep: "#ffb02e" } as const;
const TRAFFIC_COLOR: Record<TrafficLevel, string> = { free: "#4fbf6a", busy: "#d8cf3f", slow: "#ff9a2e", jam: "#ff3b30" };
const IMPASSABLE = "#c65cff";
const HIGHWAY = "#4a4f55";
const LAND = [111, 125, 90], WATER = [47, 111, 143];
const STORAGE = { open: "city-minimap-open", tab: "city-minimap-tab" } as const;

type Tab = "routes" | "audit";
type Mode = Tab | "drive";
type Pose = Readonly<{ x: number; z: number; heading: number }>;
/** 视窗：世界里一个以 (cx, cz) 为中心、边长 span 的正方形，映射到 SIZE×SIZE 的画布。 */
type View = { cx: number; cz: number; span: number };
const scaleOf = (v: View) => SIZE / v.span;
const toCanvas = (v: View, x: number, z: number) => ({ x: (x - v.cx + v.span / 2) * scaleOf(v), y: (z - v.cz + v.span / 2) * scaleOf(v) });
function wholeView(model: MinimapModel): View {
  const b = model.bounds;
  return { cx: (b.minX + b.maxX) / 2, cz: (b.minZ + b.maxZ) / 2, span: Math.max(b.maxX - b.minX, b.maxZ - b.minZ) };
}

const waterTiles = new WeakMap<MinimapModel, HTMLCanvasElement>();
function waterTile(model: MinimapModel): HTMLCanvasElement {
  const hit = waterTiles.get(model); if (hit) return hit;
  const { cols, rows, water } = model.water;
  const tile = document.createElement("canvas"); tile.width = cols; tile.height = rows;
  const g = tile.getContext("2d");
  if (g) {
    const image = g.createImageData(cols, rows);
    for (let i = 0; i < water.length; i += 1) { const c = water[i] ? WATER : LAND; image.data.set([c[0], c[1], c[2], 255], i * 4); }
    g.putImageData(image, 0, 0);
  }
  waterTiles.set(model, tile);
  return tile;
}

/** 画底图（水陆 + 高架 + 路网），路的颜色随看法变。cull：跟随视图只画视窗里的路。 */
function drawMap(g: CanvasRenderingContext2D, model: MinimapModel, traffic: TrafficModel | null, mode: Mode, v: View, cull: boolean): void {
  const s = scaleOf(v);
  g.fillStyle = `rgb(${LAND.join(",")})`; g.fillRect(0, 0, SIZE, SIZE);
  const b = model.bounds; const o = toCanvas(v, b.minX, b.minZ);
  g.imageSmoothingEnabled = true; g.drawImage(waterTile(model), o.x, o.y, (b.maxX - b.minX) * s, (b.maxZ - b.minZ) * s);
  g.lineCap = "round"; g.lineJoin = "round";
  const half = v.span / 2 + 20;
  const visible = (points: readonly { x: number; z: number }[]) => !cull || points.some((p) => Math.abs(p.x - v.cx) < half && Math.abs(p.z - v.cz) < half);
  const stroke = (points: readonly { x: number; z: number }[], width: number, color: string, dash?: number[]) => {
    if (!visible(points)) return;
    g.beginPath(); points.forEach((p, i) => { const c = toCanvas(v, p.x, p.z); if (i) g.lineTo(c.x, c.y); else g.moveTo(c.x, c.y); });
    g.setLineDash(dash ?? []); g.strokeStyle = color; g.lineWidth = width; g.stroke();
  };
  for (const run of model.highways) stroke(run, Math.max(1.5, 10.5 * s), HIGHWAY);
  const w = (width: number, min: number) => Math.max(min, width * s);
  if (mode === "routes") {
    // 路线：宽路压在窄路上面，桥最后（跨水一眼可见）。
    for (const cls of ["local", "secondary", "main", "bridge"] as const)
      for (const road of model.roads) if (road.cls === cls) stroke(road.points, w(road.width, cls === "local" ? 0.8 : 1.2), ROAD_COLOR[cls]);
  } else if (mode === "audit") {
    // 审计：按拥堵档位着色，越堵越在上层；开不过去的路（不在路网里）画紫色虚线。
    for (const road of model.roads) if (!traffic?.edges.has(road.id) && !model.blocked.has(road.id)) stroke(road.points, w(road.width, 0.8), "#8d8a83");
    for (const level of ["free", "busy", "slow", "jam"] as const)
      for (const road of model.roads) if (traffic?.edges.get(road.id)?.level === level) stroke(road.points, w(road.width, level === "free" ? 1 : 2), TRAFFIC_COLOR[level]);
    for (const road of model.roads) if (model.blocked.has(road.id)) stroke(road.points, w(road.width, 2.5), IMPASSABLE, [3, 2]);
  } else {
    for (const road of model.roads) if (road.condition === "ok") stroke(road.points, w(road.width, 0.8), ROAD_COLOR[road.cls]);
    for (const road of model.roads) if (road.condition === "steep") stroke(road.points, w(road.width, 2), CONDITION_COLOR.steep);
    for (const road of model.roads) if (road.condition === "blocked") stroke(road.points, w(road.width, 2.5), CONDITION_COLOR.blocked);
  }
  g.setLineDash([]);
}

/** 闪烁的点：审计看拥堵点，驾驶看路况问题点；路线看法不打点。 */
type Spot = { at: { x: number; z: number }; color: string; text: { zh: string; en: string } };
function spotsOf(model: MinimapModel, traffic: TrafficModel | null, mode: Mode): Spot[] {
  if (mode === "audit") return [
    ...(traffic?.hotspots ?? []).map((h) => ({ at: h.at, color: h.vc >= 1 ? TRAFFIC_COLOR.jam : TRAFFIC_COLOR.slow, text: h.text })),
    ...model.issues.filter((i) => i.severity === "blocked").map((i) => ({ at: i.at, color: IMPASSABLE, text: i.text })),
  ];
  if (mode === "drive") return model.issues.map((i) => ({ at: i.at, color: i.severity === "blocked" ? CONDITION_COLOR.blocked : CONDITION_COLOR.steep, text: i.text }));
  return [];
}

function arrow(g: CanvasRenderingContext2D, x: number, y: number, angle: number, color: string, size = 1): void {
  g.save(); g.translate(x, y); g.rotate(angle); g.scale(size, size);
  g.beginPath(); g.moveTo(7, 0); g.lineTo(-5, -4.5); g.lineTo(-2.5, 0); g.lineTo(-5, 4.5); g.closePath();
  g.fillStyle = color; g.strokeStyle = "#0b1a24"; g.lineWidth = 1.2; g.fill(); g.stroke(); g.restore();
}

const COPY = {
  zh: {
    title: "小地图", tabs: { routes: "路线", audit: "道路审计" }, drive: "路况", follow: "跟随", whole: "全城", close: "收起小地图", open: "展开小地图",
    routes: (roads: number, bridges: number) => `${roads} 段路 · ${bridges} 座桥`,
    computing: "正在估算高峰车流…",
    audit: (t: TrafficModel, blocked: number) => `高峰估算：${t.counts.jam} 段拥堵 · ${t.counts.slow} 段偏慢${blocked ? ` · ${blocked} 段开不过去` : ""}${t.unreachable ? ` · ${Math.round((t.unreachable / Math.max(1, t.trips)) * 100)}% 出行到不了` : ""}`,
    driveSummary: (m: MinimapModel) => (m.counts.blocked ? `${m.counts.blocked} 处开不过去` : "全城可通行") + (m.counts.steep ? ` · ${m.counts.steep} 处很陡` : ""),
    hint: { routes: "点地图，镜头飞过去。", audit: "估算：按街区用地生成高峰出行、按拥堵后的行程时间走最短路；高架不计入。紫色虚线的路车开不过去，修复城市里可以修。", drive: "红 = 开不过去，琥珀 = 很陡。三角是你的车。" },
    legend: { routes: ["主干道", "次干道", "小路", "桥", "高架", "镜头"], audit: ["畅通", "较忙", "偏慢", "拥堵", "开不过去"], drive: ["开不过去", "很陡", "正常路", "我的位置"] },
  },
  en: {
    title: "Minimap", tabs: { routes: "Routes", audit: "Road audit" }, drive: "Road conditions", follow: "Follow", whole: "City", close: "Collapse minimap", open: "Expand minimap",
    routes: (roads: number, bridges: number) => `${roads} roads · ${bridges} bridge${bridges === 1 ? "" : "s"}`,
    computing: "Estimating peak traffic…",
    audit: (t: TrafficModel, blocked: number) => `Peak estimate: ${t.counts.jam} jammed · ${t.counts.slow} slow${blocked ? ` · ${blocked} can't be driven` : ""}${t.unreachable ? ` · ${Math.round((t.unreachable / Math.max(1, t.trips)) * 100)}% of trips can't arrive` : ""}`,
    driveSummary: (m: MinimapModel) => (m.counts.blocked ? `${m.counts.blocked} spot${m.counts.blocked === 1 ? "" : "s"} cars can't pass` : "Every road drivable") + (m.counts.steep ? ` · ${m.counts.steep} steep` : ""),
    hint: { routes: "Click to fly the camera there.", audit: "Estimate: peak trips from block land use, routed by congested travel time; expressways not counted. Dashed purple roads can't be driven; fix them in Repair city.", drive: "Red = cars can't pass, amber = steep. The triangle is your car." },
    legend: { routes: ["Arterial", "Secondary", "Local", "Bridge", "Expressway", "Camera"], audit: ["Free", "Busy", "Slow", "Jammed", "Can't pass"], drive: ["Can't pass", "Steep", "Road", "You"] },
  },
} as const;

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try { const v = localStorage.getItem(key); return allowed.includes(v as T) ? (v as T) : fallback; } catch { return fallback; }
}

export type MinimapDriving = Readonly<{ active: boolean; pose: () => Pose | null }>;

export function CityMinimap({ engine, hidden, language = "zh", driving }: {
  engine: RefObject<CityEngine | null>; hidden: boolean; language?: string; driving?: MinimapDriving;
}) {
  const copy = language === "en" ? COPY.en : COPY.zh;
  const [open, setOpen] = useState(() => readStored(STORAGE.open, ["1", "0"], "1") === "1");
  const [tab, setTab] = useState<Tab>(() => readStored(STORAGE.tab, ["routes", "audit"], "routes"));
  const [follow, setFollow] = useState(true);
  const [layout, setLayout] = useState<CityLayout | null>(null);
  const [traffic, setTraffic] = useState<TrafficModel | null>(null);
  const [hover, setHover] = useState<Spot | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View | null>(null);
  const spotsRef = useRef<Spot[]>([]);
  const drivingActive = driving?.active ?? false;
  // 位姿读取器放进 ref：宿主每次渲染都传新对象（驾驶 HUD 每秒刷新多次），放进依赖会反复重建底图。
  const poseOf = useRef(driving?.pose); poseOf.current = driving?.pose;
  const mode: Mode = drivingActive ? "drive" : tab;
  useEffect(() => { try { localStorage.setItem(STORAGE.open, open ? "1" : "0"); localStorage.setItem(STORAGE.tab, tab); } catch { /* 无痕模式：不记 */ } }, [open, tab]);
  // 生效布局换了没有（修复工具每次编辑产出新布局对象）。
  useEffect(() => {
    if (hidden) return;
    const poll = () => { const next = engine.current?.currentLayout ?? null; setLayout((prev) => (prev === next ? prev : next)); };
    poll(); const timer = window.setInterval(poll, 500);
    return () => window.clearInterval(timer);
  }, [engine, hidden]);
  const model = useMemo(() => (layout ? minimapModel(layout) : null), [layout]);
  // 车流估算只在打开「道路审计」时算（4000 楼约 0.2 s），放到下一拍，先把「正在估算」画出来。
  useEffect(() => {
    setTraffic(null);
    if (!layout || !model || mode !== "audit" || !open || hidden) return;
    const timer = window.setTimeout(() => setTraffic(trafficModel(layout, model.blocked)), 30);
    return () => window.clearTimeout(timer);
  }, [layout, model, mode, open, hidden]);
  const spots = useMemo(() => (model ? spotsOf(model, traffic, mode) : []), [model, traffic, mode]);
  spotsRef.current = spots;
  const ratio = typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1);

  useEffect(() => {
    if (hidden || !open || !model) return;
    const canvas = canvasRef.current; if (!canvas) return;
    canvas.width = SIZE * ratio; canvas.height = SIZE * ratio;
    const g = canvas.getContext("2d"); if (!g) return;
    // 整城视图画一次存成位图，每帧只叠点与箭头；跟随视图每 ~80 ms 按车的位置重画（只画视窗里的路）。
    const whole = wholeView(model);
    let base: HTMLCanvasElement | null = null;
    const following = mode === "drive" && follow;
    if (!following) {
      base = document.createElement("canvas"); base.width = SIZE * ratio; base.height = SIZE * ratio;
      const bg = base.getContext("2d"); if (bg) { bg.setTransform(ratio, 0, 0, ratio, 0, 0); drawMap(bg, model, traffic, mode, whole, false); }
    }
    const followBase = document.createElement("canvas"); followBase.width = SIZE * ratio; followBase.height = SIZE * ratio;
    let lastFollow = -Infinity;
    let frame = 0;
    const draw = (now: number) => {
      const pose = mode === "drive" ? poseOf.current?.() ?? null : null;
      let view = whole;
      if (following && pose) {
        view = { cx: pose.x, cz: pose.z, span: FOLLOW_SPAN };
        if (now - lastFollow > 80) {
          lastFollow = now;
          const fg = followBase.getContext("2d"); if (fg) { fg.setTransform(ratio, 0, 0, ratio, 0, 0); drawMap(fg, model, traffic, mode, view, true); }
        }
        base = followBase;
      } else if (following && !base) {
        base = document.createElement("canvas"); base.width = SIZE * ratio; base.height = SIZE * ratio;
        const bg = base.getContext("2d"); if (bg) { bg.setTransform(ratio, 0, 0, ratio, 0, 0); drawMap(bg, model, traffic, mode, whole, false); }
      }
      viewRef.current = view;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height);
      if (base) g.drawImage(base, 0, 0);
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      const pulse = 0.5 + 0.5 * Math.sin(now / 260);
      for (const spot of spotsRef.current) {
        const c = toCanvas(view, spot.at.x, spot.at.z);
        if (c.x < -8 || c.y < -8 || c.x > SIZE + 8 || c.y > SIZE + 8) continue;
        g.globalAlpha = 0.3 + 0.45 * pulse; g.beginPath(); g.arc(c.x, c.y, 3 + pulse * 3, 0, Math.PI * 2); g.fillStyle = spot.color; g.fill();
        g.globalAlpha = 1; g.beginPath(); g.arc(c.x, c.y, 2, 0, Math.PI * 2); g.fill();
      }
      if (pose) {
        const c = toCanvas(view, pose.x, pose.z);
        g.globalAlpha = 0.25; g.beginPath(); g.arc(c.x, c.y, 9 + pulse * 2, 0, Math.PI * 2); g.fillStyle = "#4dd2ff"; g.fill(); g.globalAlpha = 1;
        arrow(g, c.x, c.y, pose.heading, "#4dd2ff", 1.15);
      } else if (mode !== "drive") {
        const photo = engine.current?.photoView();
        if (photo) {
          const [px, , pz] = photo.position; const [tx, , tz] = photo.target;
          const c = toCanvas(view, tx, tz); arrow(g, c.x, c.y, Math.atan2(tz - pz, tx - px), "#4dd2ff");
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [engine, hidden, open, model, traffic, mode, follow, ratio]);

  if (hidden || !model) return null;
  const pointer = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect(); const view = viewRef.current ?? wholeView(model);
    const sx = (event.clientX - rect.left) * (SIZE / rect.width), sy = (event.clientY - rect.top) * (SIZE / rect.height);
    let best: Spot | null = null; let bestD = 9;
    for (const spot of spotsRef.current) { const c = toCanvas(view, spot.at.x, spot.at.z); const d = Math.hypot(c.x - sx, c.y - sy); if (d < bestD) { bestD = d; best = spot; } }
    return { x: view.cx - view.span / 2 + sx / scaleOf(view), z: view.cz - view.span / 2 + sy / scaleOf(view), spot: best };
  };
  const bridges = model.roads.filter((r) => r.cls === "bridge").length;
  const summary = mode === "routes" ? copy.routes(model.roads.length - bridges, bridges) : mode === "audit" ? (traffic ? copy.audit(traffic, model.blocked.size) : copy.computing) : copy.driveSummary(model);
  const bad = mode === "audit" ? !!traffic && (traffic.counts.jam > 0 || traffic.unreachable > 0 || model.blocked.size > 0) : mode === "drive" && model.counts.blocked > 0;
  const swatches: readonly string[] = mode === "routes" ? [ROAD_COLOR.main, ROAD_COLOR.secondary, ROAD_COLOR.local, ROAD_COLOR.bridge, HIGHWAY]
    : mode === "audit" ? [TRAFFIC_COLOR.free, TRAFFIC_COLOR.busy, TRAFFIC_COLOR.slow, TRAFFIC_COLOR.jam, IMPASSABLE] : [CONDITION_COLOR.blocked, CONDITION_COLOR.steep, ROAD_COLOR.secondary];
  const labels = copy.legend[mode];
  return <aside className={`city-minimap${open ? "" : " is-collapsed"}${drivingActive ? " is-driving" : ""}`} aria-label={copy.title}>
    <div className="city-minimap-body" aria-hidden={!open}>
      <header>
        {mode === "drive" ? <>
          <b>{copy.drive}</b>
          <div className="city-minimap-tabs" role="group">
            <button className={follow ? "is-on" : ""} aria-pressed={follow} onClick={() => setFollow(true)}>{copy.follow}</button>
            <button className={follow ? "" : "is-on"} aria-pressed={!follow} onClick={() => setFollow(false)}>{copy.whole}</button>
          </div>
        </> : <div className="city-minimap-tabs" role="tablist">
          {(["routes", "audit"] as const).map((id) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "is-on" : ""} onClick={() => setTab(id)}>{copy.tabs[id]}</button>)}
        </div>}
      </header>
      <canvas ref={canvasRef} width={SIZE} height={SIZE} style={{ width: SIZE, height: SIZE, cursor: mode === "drive" ? "default" : "crosshair" }}
        onMouseMove={(event) => setHover(pointer(event).spot)} onMouseLeave={() => setHover(null)}
        onClick={(event) => { if (mode === "drive") return; const p = pointer(event); engine.current?.focusPoint(p.spot ? p.spot.at.x : p.x, p.spot ? p.spot.at.z : p.z); }} />
      <p className={`city-minimap-summary ${bad ? "is-bad" : "is-ok"}`}>{summary}</p>
      <ul className="city-minimap-legend" aria-hidden="true">
        {swatches.map((color, i) => <li key={labels[i]}><i style={{ background: color }} className={mode === "audit" && i === 4 ? "is-dashed" : undefined} />{labels[i]}</li>)}
        {(mode === "routes" || mode === "drive") && <li><i className="is-arrow" />{labels[labels.length - 1]}</li>}
      </ul>
      <p className="city-minimap-note">{hover ? (language === "en" ? hover.text.en : hover.text.zh) : copy.hint[mode]}</p>
    </div>
    <button className="city-minimap-handle" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? copy.close : copy.open} title={open ? copy.close : copy.open}>
      <span aria-hidden="true">{open ? "‹" : "›"}</span>{!open && <em>{copy.title}</em>}
    </button>
  </aside>;
}
