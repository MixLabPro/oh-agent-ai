/**
 * 城市小地图（2026-10-21）：俯视整座城的路网，一眼看出哪里开不过去。
 * 路况来自 roadConditions.minimapModel（与修复面板体检的道路规则同一组判据）：红 = 车开不过去，琥珀 = 很陡；
 * 问题点闪烁；蓝色箭头是镜头看向的位置。点小地图任一处，镜头飞过去。可收起成一个按钮（记在本机）。
 * 只读：每 0.5 s 看一眼生效布局是不是换了（修复工具每次编辑产出新布局），换了就重画静态层；镜头箭头与闪烁按帧画。
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { CityEngine } from "../engine/CityEngine";
import type { CityLayout } from "../engine/cityLayout";
import { minimapModel, type MinimapIssue, type MinimapModel } from "./roadConditions";

const SIZE = 220;
const ROAD_COLOR = { main: "#e8e4d8", secondary: "#c9c5ba", local: "#9e9b93", bridge: "#8fb7d6" } as const;
const CONDITION_COLOR = { blocked: "#ff4d3d", steep: "#ffb02e" } as const;
const STORAGE_KEY = "city-minimap-open";

type View = { scale: number; ox: number; oz: number; width: number; height: number };
function viewOf(model: MinimapModel): View {
  const w = model.bounds.maxX - model.bounds.minX, h = model.bounds.maxZ - model.bounds.minZ;
  const scale = SIZE / Math.max(w, h);
  return { scale, ox: model.bounds.minX, oz: model.bounds.minZ, width: Math.round(w * scale), height: Math.round(h * scale) };
}
const toCanvas = (v: View, x: number, z: number) => ({ x: (x - v.ox) * v.scale, y: (z - v.oz) * v.scale });

function drawStatic(canvas: HTMLCanvasElement, model: MinimapModel, v: View, ratio: number): void {
  canvas.width = v.width * ratio; canvas.height = v.height * ratio;
  const g = canvas.getContext("2d"); if (!g) return;
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  // 水陆：按地形取样的栅格放大铺满（平滑插值，岸线不出锯齿）。
  const { cols, rows, water } = model.water;
  const tile = document.createElement("canvas"); tile.width = cols; tile.height = rows;
  const tg = tile.getContext("2d");
  if (tg) {
    const image = tg.createImageData(cols, rows);
    for (let i = 0; i < water.length; i += 1) {
      const [r, gg, b] = water[i] ? [47, 111, 143] : [111, 125, 90];
      image.data[i * 4] = r; image.data[i * 4 + 1] = gg; image.data[i * 4 + 2] = b; image.data[i * 4 + 3] = 255;
    }
    tg.putImageData(image, 0, 0);
    g.imageSmoothingEnabled = true; g.drawImage(tile, 0, 0, v.width, v.height);
  }
  g.lineCap = "round"; g.lineJoin = "round";
  const stroke = (points: readonly { x: number; z: number }[], width: number, color: string) => {
    g.beginPath(); points.forEach((p, i) => { const c = toCanvas(v, p.x, p.z); if (i) g.lineTo(c.x, c.y); else g.moveTo(c.x, c.y); });
    g.strokeStyle = color; g.lineWidth = width; g.stroke();
  };
  for (const run of model.highways) stroke(run, Math.max(1.5, 10.5 * v.scale), "#4a4f55");
  // 正常路先画，有问题的路压在上面（红比琥珀更上层），细路也至少 2 像素宽，免得问题路段在缩小后看不见。
  for (const road of model.roads) if (road.condition === "ok") stroke(road.points, Math.max(0.8, road.width * v.scale), ROAD_COLOR[road.cls]);
  for (const road of model.roads) if (road.condition === "steep") stroke(road.points, Math.max(2, road.width * v.scale), CONDITION_COLOR.steep);
  for (const road of model.roads) if (road.condition === "blocked") stroke(road.points, Math.max(2.5, road.width * v.scale), CONDITION_COLOR.blocked);
}

const COPY = {
  zh: { title: "小地图", blocked: (n: number) => `${n} 处开不过去`, clear: "全城可通行", steep: (n: number) => ` · ${n} 处很陡`, close: "收起小地图", open: "展开小地图",
    hint: "点地图飞过去；红 = 开不过去，琥珀 = 很陡。修复工具「体检」里能逐条定位与修复。", legend: ["开不过去", "很陡", "桥", "高架", "镜头"] },
  en: { title: "Minimap", blocked: (n: number) => `${n} spot${n === 1 ? "" : "s"} cars can't pass`, clear: "Every road drivable", steep: (n: number) => ` · ${n} steep`, close: "Collapse minimap", open: "Expand minimap",
    hint: "Click to fly there. Red = cars can't pass, amber = steep. Repair city → Audit locates and fixes each one.", legend: ["Can't pass", "Steep", "Bridge", "Expressway", "Camera"] },
} as const;

export function CityMinimap({ engine, hidden, language = "zh" }: { engine: RefObject<CityEngine | null>; hidden: boolean; language?: string }) {
  const copy = language === "en" ? COPY.en : COPY.zh;
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(STORAGE_KEY) !== "0"; } catch { return true; } });
  const [layout, setLayout] = useState<CityLayout | null>(null);
  const [hover, setHover] = useState<MinimapIssue | null>(null);
  const staticRef = useRef<HTMLCanvasElement | null>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, open ? "1" : "0"); } catch { /* 无痕模式：不记 */ } }, [open]);
  // 生效布局换了没有（修复工具每次编辑产出新布局对象）。
  useEffect(() => {
    if (hidden || !open) return;
    const poll = () => { const next = engine.current?.currentLayout ?? null; setLayout((prev) => (prev === next ? prev : next)); };
    poll(); const timer = window.setInterval(poll, 500);
    return () => window.clearInterval(timer);
  }, [engine, hidden, open]);
  const model = useMemo(() => (layout ? minimapModel(layout) : null), [layout]);
  const view = useMemo(() => (model ? viewOf(model) : null), [model]);
  const ratio = typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1);
  useEffect(() => {
    if (!model || !view) return;
    staticRef.current ??= document.createElement("canvas");
    drawStatic(staticRef.current, model, view, ratio);
  }, [model, view, ratio]);
  // 每帧：静态层 + 闪烁的问题点 + 镜头箭头。
  useEffect(() => {
    if (hidden || !open || !model || !view) return;
    let frame = 0;
    const draw = (now: number) => {
      const canvas = liveRef.current; const base = staticRef.current;
      const g = canvas?.getContext("2d");
      if (canvas && base && g) {
        if (canvas.width !== base.width) { canvas.width = base.width; canvas.height = base.height; }
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height); g.drawImage(base, 0, 0);
        g.setTransform(ratio, 0, 0, ratio, 0, 0);
        const pulse = 0.5 + 0.5 * Math.sin(now / 260);
        for (const issue of model.issues) {
          const c = toCanvas(view, issue.at.x, issue.at.z);
          g.beginPath(); g.arc(c.x, c.y, 3 + pulse * 3, 0, Math.PI * 2);
          g.fillStyle = issue.severity === "blocked" ? `rgba(255,77,61,${0.35 + 0.45 * pulse})` : `rgba(255,176,46,${0.3 + 0.4 * pulse})`; g.fill();
          g.beginPath(); g.arc(c.x, c.y, 2, 0, Math.PI * 2); g.fillStyle = issue.severity === "blocked" ? "#ff4d3d" : "#ffb02e"; g.fill();
        }
        const photo = engine.current?.photoView();
        if (photo) {
          const [px, , pz] = photo.position; const [tx, , tz] = photo.target;
          const c = toCanvas(view, tx, tz); const angle = Math.atan2(tz - pz, tx - px);
          g.save(); g.translate(c.x, c.y); g.rotate(angle);
          g.beginPath(); g.moveTo(7, 0); g.lineTo(-5, -4.5); g.lineTo(-2.5, 0); g.lineTo(-5, 4.5); g.closePath();
          g.fillStyle = "#4dd2ff"; g.strokeStyle = "#0b1a24"; g.lineWidth = 1; g.fill(); g.stroke(); g.restore();
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [engine, hidden, open, model, view, ratio]);

  if (hidden) return null;
  if (!open || !model || !view) return <button className="city-minimap-toggle" onClick={() => setOpen(true)} aria-label={copy.open} title={copy.open}>🗺</button>;
  const world = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const sx = (event.clientX - rect.left) * (view.width / rect.width), sy = (event.clientY - rect.top) * (view.height / rect.height);
    return { x: view.ox + sx / view.scale, z: view.oz + sy / view.scale, sx, sy };
  };
  const nearest = (sx: number, sy: number) => {
    let best: MinimapIssue | null = null; let bestD = 8;
    for (const issue of model.issues) { const c = toCanvas(view, issue.at.x, issue.at.z); const d = Math.hypot(c.x - sx, c.y - sy); if (d < bestD) { bestD = d; best = issue; } }
    return best;
  };
  const { blocked, steep } = model.counts;
  return <aside className="city-minimap" aria-label={copy.title}>
    <header>
      <b>{copy.title}</b>
      <span className={blocked ? "is-bad" : "is-ok"}>{blocked ? copy.blocked(blocked) : copy.clear}{steep ? copy.steep(steep) : ""}</span>
      <button onClick={() => setOpen(false)} aria-label={copy.close}>×</button>
    </header>
    <canvas ref={liveRef} style={{ width: view.width, height: view.height }}
      onMouseMove={(event) => { const p = world(event); setHover(nearest(p.sx, p.sy)); }} onMouseLeave={() => setHover(null)}
      onClick={(event) => { const p = world(event); const issue = nearest(p.sx, p.sy); engine.current?.focusPoint(issue ? issue.at.x : p.x, issue ? issue.at.z : p.z); }} />
    <p className="city-minimap-note">{hover ? (language === "en" ? hover.text.en : hover.text.zh) : copy.hint}</p>
    <ul className="city-minimap-legend" aria-hidden="true">
      <li><i style={{ background: CONDITION_COLOR.blocked }} />{copy.legend[0]}</li><li><i style={{ background: CONDITION_COLOR.steep }} />{copy.legend[1]}</li>
      <li><i style={{ background: ROAD_COLOR.bridge }} />{copy.legend[2]}</li><li><i style={{ background: "#4a4f55" }} />{copy.legend[3]}</li><li><i className="is-camera" />{copy.legend[4]}</li>
    </ul>
  </aside>;
}
