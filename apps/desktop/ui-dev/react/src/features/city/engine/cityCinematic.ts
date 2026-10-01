/**
 * 无人机航拍：从布局与模型推导一条电影镜头路径（纯函数、确定性——同一座城永远同一条片子）。
 *
 * 镜头语言（约 32s）：
 *   1. 远海推近（establishing）：高空从海上压向海岸，城市在脚下展开。
 *   2. 贴河低飞（river run）：沿河道低空穿城，两岸楼群从身边掠过。
 *   3. 环绕地标（hero orbit）：绕全城最高的楼半圈，仰拍。
 *   4. 掠过城区（district pass）：依次掠过各宿主城区。
 *   5. 拉升收尾（pull-out）：边后退边上升，落到全城天际线全景。
 * 生长同步：镜头前 70% 把时间游标从窗口起点推到终点——城市在镜头里从空地长到现在。
 */

import * as THREE from "three";
import type { CityModel } from "../cityModel";
import type { CityLayout } from "./cityLayout";

export type CinematicCard = { atSec: number; untilSec: number; kind: "title" | "district" | "finale"; text: string; detail?: string };

export type CinematicPlan = {
  durationSec: number;
  /** 播放秒数 → 相机位置 / 注视点。 */
  position: (seconds: number) => THREE.Vector3;
  target: (seconds: number) => THREE.Vector3;
  /** 播放秒数 → 时间游标（ms）：生长回放与镜头同步。 */
  cursor: (seconds: number) => number;
  cards: CinematicCard[];
  /** 各关键帧的播放秒数与离地高度（诊断/节奏守卫用）。 */
  keyTimes: Array<{ seconds: number; altitude: number }>;
};

type Key = { pos: [number, number, number]; look: [number, number, number]; card?: number };

/** 只用 ease 过的单调参数去采样曲线：段与段之间速度连续，不出现「停顿—猛冲」。 */
function smootherstep(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function planCinematic(layout: CityLayout, model: CityModel, heights: Map<string, { x: number; z: number; height: number; ground: number }>): CinematicPlan {
  const { left, right, north, south } = layout.urbanBounds;
  const cx = (left + right) / 2;
  const cz = (north + south) / 2;
  const span = Math.max(right - left, south - north);
  const groundAt = (x: number, z: number) => Math.max(0, layout.terrain.height(x, z));

  // 主角：全城最高的楼（没有楼时退回城市中心）。
  let hero = { x: cx, z: cz, height: 30, ground: groundAt(cx, cz) };
  for (const anchor of heights.values()) if (anchor.height > hero.height) hero = anchor;

  const keys: Key[] = [];
  const push = (pos: [number, number, number], look: [number, number, number], card?: number) => keys.push({ pos, look, card });

  // 1. 远海推近：从南面海上高空起，压向城市。
  push([cx + span * 0.1, span * 0.42, south + span * 0.6], [cx, 0, cz + span * 0.1]);
  push([cx + span * 0.03, span * 0.2, south + span * 0.2], [cx, 0, cz]);

  // 2. 贴河低飞：沿河道中线从南往北，略高于两岸楼的腰线。
  const river = (layout.river ?? []).filter((p) => p.z > north - 40 && p.z < south + 60).sort((a, b) => b.z - a.z);
  if (river.length >= 4) {
    // 只取穿过城区的中段（约 35%–80%），离地 40：低飞 16 时整段河要飞两分多钟。
    const pick = [0.45, 0.72].map((f) => river[Math.min(river.length - 1, Math.floor(f * (river.length - 1)))]);
    pick.forEach((p, index) => {
      const ahead = pick[Math.min(pick.length - 1, index + 1)];
      const lookZ = index === pick.length - 1 ? p.z - 80 : ahead.z;
      push([p.x, groundAt(p.x, p.z) + 40, p.z], [ahead.x, 10, lookZ]);
    });
  }

  // 3. 环绕地标：半圈，仰角，半径随楼高。
  const orbitR = Math.max(55, hero.height * 1.6);
  const heroLook: [number, number, number] = [hero.x, hero.ground + hero.height * 0.65, hero.z];
  // 四分之一圈多一点：半圈在楼高的半径上要飞 30s。
  // 切入角取「上一个机位所在的一侧」：曾写死 0.85π，换种子后地标可能在河段身后，镜头得掉头。
  // 绕行方向取与来向一致的那一边（叉积符号），不逆着惯性拐。
  const previous = keys[keys.length - 1].pos;
  const entry = Math.atan2(previous[2] - hero.z, previous[0] - hero.x);
  const beforePrevious = keys[keys.length - 2]?.pos ?? previous;
  const travel = { x: previous[0] - beforePrevious[0], z: previous[2] - beforePrevious[2] };
  const radial = { x: Math.cos(entry), z: Math.sin(entry) };
  const sweep = (travel.x * radial.z - travel.z * radial.x) > 0 ? -1 : 1;
  for (let index = 0; index <= 2; index += 1) {
    const angle = entry + sweep * (index / 2) * Math.PI * 0.6;
    const x = hero.x + Math.cos(angle) * orbitR;
    const z = hero.z + Math.sin(angle) * orbitR;
    // 高度取楼高的 75%–100%：主角是全城最高楼，这个高度在其余楼顶之上，环绕不会擦着邻楼飞。
    push([x, hero.ground + hero.height * (0.75 + index * 0.12), z], heroLook);
  }

  // 4. 掠过城区：按 token 排序依次飞越各宿主城区上空。
  const ranked = [...layout.districts]
    .map((d) => ({ layout: d, data: model.districts.find((m) => m.id === d.id) }))
    .filter((d) => d.data)
    .sort((a, b) => (b.data!.tokensTotal - a.data!.tokensTotal));
  const centroid = (district: (typeof ranked)[number]) => {
    const slots = [...district.layout.slots.values()];
    return slots.length
      ? { x: slots.reduce((sum, slot) => sum + slot.x, 0) / slots.length, z: slots.reduce((sum, slot) => sum + slot.z, 0) / slots.length }
      : district.layout.center;
  };
  // 就近顺序：从地标出发每次飞最近的下一个城区。按 token 排序会在城区间来回横穿半座城，
  // 转场距离一长，镜头就只能高速掠过（用户看不清 Claude Code → Zcode → DeepSeek）。
  const remaining = ranked.slice(0, 4);
  const ordered: typeof remaining = [];
  let from = { x: hero.x, z: hero.z };
  while (remaining.length) {
    remaining.sort((a, b) => Math.hypot(centroid(a).x - from.x, centroid(a).z - from.z) - Math.hypot(centroid(b).x - from.x, centroid(b).z - from.z));
    const next = remaining.shift()!;
    ordered.push(next);
    from = centroid(next);
  }
  for (const [cardIndex, district] of ordered.entries()) {
    // 用该区楼的实际质心：district.center 是规划圆心，楼按宿主锚点落位，二者可能隔着半座城
    // （曾出现「Zcode」字卡配着 Claude Code 的粉色楼群）。
    const c = centroid(district);
    const g = groundAt(c.x, c.z);
    // 每个城区只放一个机位：曾用「抵达 + 横移」两帧，城区挨得近时横移方向与下一段相反，
    // 路径折返出尖角（匀速下弦长骤减，画面一顿一冲）。停留感改由「低空 → 自动减速」提供：
    // 速度 ∝ 离地高度，这里比城区间巡航低，镜头自然放慢。
    push([c.x - 70, g + 62, c.z + 80], [c.x, 8, c.z], cardIndex);
  }

  // 5. 拉升收尾：后退并升到全景。
  push([cx - span * 0.35, span * 0.42, cz + span * 0.75], [cx, 0, cz]);
  push([cx - span * 0.55, span * 0.62, cz + span * 1.05], [cx, 10, cz - span * 0.05]);

  // 几何兜底：路线由布局推导，换地形总可能出现掉头。不带字卡的关键帧若让水平航向转弯
  // 超过 115°，删掉它（迭代到稳定）；带字卡的城区机位保留——宁可少一个过渡镜头，也不让画面折返。
  for (let changed = true; changed;) {
    changed = false;
    for (let index = 1; index < keys.length - 1; index += 1) {
      if (keys[index].card !== undefined) continue;
      const [ax, , az] = keys[index - 1].pos;
      const [bx, , bz] = keys[index].pos;
      const [cx2, , cz2] = keys[index + 1].pos;
      const inX = bx - ax, inZ = bz - az, outX = cx2 - bx, outZ = cz2 - bz;
      const norm = Math.hypot(inX, inZ) * Math.hypot(outX, outZ);
      if (norm < 1e-6) { keys.splice(index, 1); changed = true; break; }
      const turn = Math.acos(Math.max(-1, Math.min(1, (inX * outX + inZ * outZ) / norm)));
      if (turn > (115 * Math.PI) / 180) { keys.splice(index, 1); changed = true; break; }
    }
  }

  const positionCurve = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k.pos)), false, "centripetal", 0.5);
  const targetCurve = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k.look)), false, "centripetal", 0.5);

  // ── 速度剖面：按弧长匀速、且速度 ∝ 离地高度 ──
  // 曾按关键帧序号均分时间：相距远的两帧（跨城区转场）挤在同样时长里，速度瞬间暴增、画面猛晃。
  // 真实航拍保持的是「画面里的视觉速度」，即 速度/离地高度 ≈ 常数：低飞慢、高飞快。
  // 时间表按「弧长」均匀建立（不是曲线参数 t）：CatmullRom 的 t 按控制点序号均分，关键帧密的地方
  // t 与距离严重不成比例，按 t 建表再插值会在那里出现单帧的速度骤降骤升（画面一顿）。
  const SAMPLES = 1600;
  positionCurve.arcLengthDivisions = 4000;
  const totalLength = positionCurve.getLength() || 1;
  const altitudeAtU = (u: number) => {
    const point = positionCurve.getPointAt(Math.min(1, Math.max(0, u)));
    return Math.max(12, point.y - groundAt(point.x, point.z));
  };
  const OMEGA = Number((globalThis as { __CITY_CINE_OMEGA__?: number }).__CITY_CINE_OMEGA__ ?? 0.55);
  const MIN_SPEED = 9; // 单位/秒：起落之外最慢也在动
  const MAX_SPEED = 120; // 高空全景也不允许飞得比这快
  const RAMP_SECONDS = 2.5; // 起飞/降落各自的加减速时长（按距离折算）
  const segment = totalLength / SAMPLES;
  const raw = new Float64Array(SAMPLES);
  for (let index = 0; index < SAMPLES; index += 1) raw[index] = Math.min(MAX_SPEED, Math.max(MIN_SPEED, OMEGA * altitudeAtU((index + 0.5) / SAMPLES)));
  // 速度平滑：约 ±80 单位的滑动平均，两遍；地形起伏/海岸线会让离地高度跳变，速度不能跟着跳。
  const window = Math.max(2, Math.round(80 / segment));
  let smoothed = raw;
  for (let pass = 0; pass < 2; pass += 1) {
    const next = new Float64Array(SAMPLES);
    for (let index = 0; index < SAMPLES; index += 1) {
      let sum = 0;
      let n = 0;
      for (let j = Math.max(0, index - window); j <= Math.min(SAMPLES - 1, index + window); j += 1) { sum += smoothed[j]; n += 1; }
      next[index] = sum / n;
    }
    smoothed = next;
  }
  const rampDistance = (smoothed[0] + smoothed[SAMPLES - 1]) * 0.5 * RAMP_SECONDS;
  const speedAt = (index: number) => {
    const travelled = index * segment;
    const left = totalLength - (index + 1) * segment;
    const ramp = Math.min(1, 0.12 + 0.88 * smootherstep(travelled / rampDistance), 0.12 + 0.88 * smootherstep(left / rampDistance));
    return smoothed[index] * ramp;
  };
  // times[i] = 飞完前 i 段（距离 i·segment）所用秒数。
  const times = new Float64Array(SAMPLES + 1);
  for (let index = 0; index < SAMPLES; index += 1) times[index + 1] = times[index] + segment / speedAt(index);
  const durationSec = times[SAMPLES];
  /** 秒数 → 弧长比例 u（二分查时间表 + 段内线性插值；段内匀速所以线性是精确的）。 */
  const arcU = (seconds: number) => {
    if (seconds <= 0) return 0;
    if (seconds >= durationSec) return 1;
    let lo = 0;
    let hi = SAMPLES;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= seconds) lo = mid;
      else hi = mid;
    }
    return (lo + (seconds - times[lo]) / (times[hi] - times[lo] || 1)) / SAMPLES;
  };
  /** 关键帧 i 位于曲线参数 t = i/(n-1)；换成弧长比例再查时间表。 */
  const cumulative = positionCurve.getLengths();
  const keySeconds = (index: number) => {
    const t = index / Math.max(1, keys.length - 1);
    const u = cumulative[Math.round(t * positionCurve.arcLengthDivisions)] / totalLength;
    const f = u * SAMPLES;
    const lo = Math.min(SAMPLES - 1, Math.floor(f));
    return times[lo] + (times[lo + 1] - times[lo]) * (f - lo);
  };
  const altitudeAt = (t: number) => {
    const point = positionCurve.getPoint(t);
    return Math.max(12, point.y - groundAt(point.x, point.z));
  };

  const start = model.windowStartMs;
  const end = model.windowEndMs;
  const growthSeconds = durationSec * 0.7;

  const cards: CinematicCard[] = [
    { atSec: 0.6, untilSec: 5.2, kind: "title", text: model.windowLabel, detail: `${model.stats.totalSessions}` },
  ];
  keys.forEach((key, index) => {
    if (key.card === undefined) return;
    const district = ordered[key.card];
    const at = keySeconds(index);
    // 字卡以机位为中心：提前 2s 出现（镜头正在降近），飞过后再留 2.2s。
    cards.push({ atSec: at - 2, untilSec: at + 2.2, kind: "district", text: district.data!.label, detail: `${district.data!.sessionCount}` });
  });
  cards.push({ atSec: durationSec - 5, untilSec: durationSec + 60, kind: "finale", text: "", detail: "" });

  return {
    durationSec,
    position: (seconds) => positionCurve.getPointAt(arcU(seconds)),
    // 注视点与位置用同一个曲线参数 t（由弧长换算），关键帧上二者严格对应。
    target: (seconds) => targetCurve.getPoint(positionCurve.getUtoTmapping(arcU(seconds), 0)),
    cursor: (seconds) => start + (end - start) * smootherstep(seconds / growthSeconds),
    cards,
    keyTimes: keys.map((_, index) => ({ seconds: keySeconds(index), altitude: altitudeAt(index / Math.max(1, keys.length - 1)) })),
  };
}
