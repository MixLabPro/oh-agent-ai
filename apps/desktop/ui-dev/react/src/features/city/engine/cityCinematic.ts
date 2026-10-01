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
  /** t ∈ [0,1] → 相机位置 / 注视点。 */
  position: (t: number) => THREE.Vector3;
  target: (t: number) => THREE.Vector3;
  /** t → 时间游标（ms）：生长回放与镜头同步。 */
  cursor: (t: number) => number;
  cards: CinematicCard[];
};

type Key = { at: number; pos: [number, number, number]; look: [number, number, number] };

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
  const push = (pos: [number, number, number], look: [number, number, number]) => keys.push({ at: 0, pos, look });

  // 1. 远海推近：从南面海上高空起，压向城市。
  push([cx + span * 0.15, span * 0.55, south + span * 0.95], [cx, 0, cz + span * 0.1]);
  push([cx + span * 0.05, span * 0.26, south + span * 0.35], [cx, 0, cz]);

  // 2. 贴河低飞：沿河道中线从南往北，略高于两岸楼的腰线。
  const river = (layout.river ?? []).filter((p) => p.z > north - 40 && p.z < south + 60).sort((a, b) => b.z - a.z);
  if (river.length >= 4) {
    const pick = [0, 0.33, 0.66, 1].map((f) => river[Math.min(river.length - 1, Math.floor(f * (river.length - 1)))]);
    pick.forEach((p, index) => {
      const ahead = pick[Math.min(pick.length - 1, index + 1)];
      const lookZ = index === pick.length - 1 ? p.z - 80 : ahead.z;
      push([p.x, groundAt(p.x, p.z) + 16, p.z], [ahead.x, 10, lookZ]);
    });
  }

  // 3. 环绕地标：半圈，仰角，半径随楼高。
  const orbitR = Math.max(55, hero.height * 1.6);
  const heroLook: [number, number, number] = [hero.x, hero.ground + hero.height * 0.65, hero.z];
  for (let index = 0; index <= 4; index += 1) {
    const angle = Math.PI * 0.85 + (index / 4) * Math.PI * 1.05;
    const x = hero.x + Math.cos(angle) * orbitR;
    const z = hero.z + Math.sin(angle) * orbitR;
    push([x, hero.ground + hero.height * (0.35 + index * 0.08), z], heroLook);
  }

  // 4. 掠过城区：按 token 排序依次飞越各宿主城区上空。
  const districtCards: CinematicCard[] = [];
  const ranked = [...layout.districts]
    .map((d) => ({ layout: d, data: model.districts.find((m) => m.id === d.id) }))
    .filter((d) => d.data)
    .sort((a, b) => (b.data!.tokensTotal - a.data!.tokensTotal));
  const passStart = keys.length;
  for (const district of ranked.slice(0, 4)) {
    // 用该区楼的实际质心：district.center 是规划圆心，楼按宿主锚点落位，二者可能隔着半座城
    // （曾出现「Zcode」字卡配着 Claude Code 的粉色楼群）。
    const slots = [...district.layout.slots.values()];
    const c = slots.length
      ? { x: slots.reduce((sum, slot) => sum + slot.x, 0) / slots.length, z: slots.reduce((sum, slot) => sum + slot.z, 0) / slots.length }
      : district.layout.center;
    push([c.x - 70, groundAt(c.x, c.z) + 70, c.z + 90], [c.x, 8, c.z]);
  }
  const passEnd = keys.length;

  // 5. 拉升收尾：后退并升到全景。
  push([cx - span * 0.35, span * 0.42, cz + span * 0.75], [cx, 0, cz]);
  push([cx - span * 0.55, span * 0.62, cz + span * 1.05], [cx, 10, cz - span * 0.05]);

  // 每个关键帧占相同时长（曲线参数按序号均分）：每个镜头都有足够的停留，远距离转场自然加速。
  keys.forEach((key, index) => { key.at = index / Math.max(1, keys.length - 1); });

  const positionCurve = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k.pos)), false, "centripetal", 0.5);
  const targetCurve = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k.look)), false, "centripetal", 0.5);
  // 曲线自身参数近似按弧长；再套一层整体缓入缓出，起落不突兀。
  const ease = (t: number) => smootherstep(t);
  const durationSec = Math.min(42, Math.max(26, 18 + keys.length * 1.1));
  const start = model.windowStartMs;
  const end = model.windowEndMs;

  const cards: CinematicCard[] = [
    { atSec: 0.6, untilSec: 5.2, kind: "title", text: model.windowLabel, detail: `${model.stats.totalSessions}` },
  ];
  ranked.slice(0, 4).forEach((district, index) => {
    // getPoint(u) 按关键帧序号均分参数（不是弧长）：第 i 个关键帧在 u = i/(n-1)。
    // 曾用弧长 at 计时，字卡比镜头晚一个城区（「DeepSeek」配着 Zcode 的紫楼）。
    const t = (passStart + index) / Math.max(1, keys.length - 1);
    if (passEnd <= passStart) return;
    const at = invertEase(t) * durationSec;
    districtCards.push({ atSec: at - 1.6, untilSec: at + 1.8, kind: "district", text: district.data!.label, detail: `${district.data!.sessionCount}` });
  });
  cards.push(...districtCards);
  cards.push({ atSec: durationSec - 5, untilSec: durationSec + 60, kind: "finale", text: "", detail: "" });

  return {
    durationSec,
    position: (t) => positionCurve.getPoint(ease(t)),
    target: (t) => targetCurve.getPoint(ease(t)),
    cursor: (t) => start + (end - start) * smootherstep(t / 0.7),
    cards,
  };
}

/** ease 的反函数（数值二分）：把关键帧的曲线参数换算回播放时间。 */
function invertEase(value: number): number {
  let lo = 0;
  let hi = 1;
  for (let index = 0; index < 30; index += 1) {
    const mid = (lo + hi) / 2;
    if (smootherstep(mid) < value) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
