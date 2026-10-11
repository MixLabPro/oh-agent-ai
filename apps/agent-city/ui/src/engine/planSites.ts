/**
 * 规划修复：非会话建筑（设施）的编辑规则——市长管公共设施，会话楼由开发商（程序）盖，用户不手造会话楼
 * （docs/CITY_PLAN_MANUAL_REPAIR_SPEC.md §14）。
 *
 * 可编辑的四类，都是按街区/地块摆放、不牵连路网与海岸的：
 *   civic（学校/商场/医院，占整个空街区）、garden（城区花园，占整个街区）、
 *   district-landmark（城区地标，占一个地块）、context（背景楼，占一个地块）。
 * 不可编辑：致敬地标与市政用地（体育场、摩天轮、观景塔、港口、车站）——它们带路网接入点/海岸绑定，
 * 移动或拆除会牵连路网，不属于「简单方案」。
 *
 * 操作带**位置校验**（`at`）：公共设施 id 是按序号编的（civic:0、civic:1…），数据增长后序号会变，
 * 没有校验时旧补丁会悄悄落到另一座设施上；位置对不上就判失效，不猜。
 * 纯函数、无副作用；被 planPatch（重放）与编辑器（校验/拾取/候选）共用。
 */
import type { CivicKind, CityLayout, Vec2 } from "./cityLayout";
import { clearsHighways } from "./cityPlan";
import { clearanceRoads, parcelIndex, rectClearOfEdges, reservedParcelIds } from "./planGeometry";
import type { PatchStaleEntry } from "./planPatch";

export type SiteKind = "civic" | "garden" | "district-landmark" | "context";

export type SiteOp =
  | { t: "remove"; id: string; at?: Vec2 }
  | { t: "move"; id: string; at?: Vec2; to: string };

export type SiteInfo = {
  id: string;
  kind: SiteKind;
  civicKind?: CivicKind;
  x: number; z: number; yaw: number; width: number; depth: number; height: number; y: number;
  /** block：占整个街区（目标是街区 id）；parcel：占一个地块（目标是地块 id）。 */
  level: "block" | "parcel";
  /** 当前所在的街区/地块 id。 */
  slotId: string;
};

export type SiteTarget = { id: string; x: number; z: number; yaw: number; width: number; depth: number; distance: number };

const PICK_HEIGHT = { civic: 28, garden: 12, "district-landmark": 45 } as const;
const SLOPE_LIMIT = 0.55;

export function siteKindOf(id: string): SiteKind | null {
  if (id.startsWith("civic:")) return "civic";
  if (id.startsWith("garden:")) return "garden";
  if (id.startsWith("district-landmark:")) return "district-landmark";
  if (id.startsWith("context:")) return "context";
  return null;
}

/** 当前布局里全部可编辑设施。 */
export function listSites(layout: CityLayout): SiteInfo[] {
  const parcels = parcelIndex(layout);
  const out: SiteInfo[] = [];
  for (const civic of layout.civics) {
    out.push({ id: civic.id, kind: "civic", civicKind: civic.kind, x: civic.x, z: civic.z, yaw: civic.yaw, width: civic.width, depth: civic.depth, height: PICK_HEIGHT.civic, y: civic.y, level: "block", slotId: civic.parcelId });
  }
  for (const garden of layout.gardens) {
    out.push({ id: garden.id, kind: "garden", x: garden.x, z: garden.z, yaw: garden.yaw, width: garden.width, depth: garden.depth, height: PICK_HEIGHT.garden, y: garden.y, level: "block", slotId: garden.blockId });
  }
  for (const landmark of layout.districtLandmarks ?? []) {
    const parcel = parcels.get(landmark.parcelId);
    out.push({ id: `district-landmark:${landmark.districtId}`, kind: "district-landmark", x: landmark.x, z: landmark.z, yaw: landmark.yaw, width: parcel?.width ?? 8, depth: parcel?.depth ?? 8, height: PICK_HEIGHT["district-landmark"], y: landmark.y, level: "parcel", slotId: landmark.parcelId });
  }
  for (const context of layout.contextBuildings) {
    out.push({ id: context.id, kind: "context", x: context.x, z: context.z, yaw: context.yaw, width: context.width, depth: context.depth, height: context.height, y: context.y, level: "parcel", slotId: context.id.replace(/^context:/, "") });
  }
  return out;
}

/** 目标街区/地块能否接收这座设施；null = 可以，否则返回阻止原因码。 */
export function siteMoveProblem(layout: CityLayout, site: SiteInfo, targetId: string, suppressedContext: Iterable<string> = []): string | null {
  if (targetId === site.slotId) return "unchanged";
  const reserved = reservedParcelIds(layout, suppressedContext);
  if (site.level === "block") {
    const block = layout.blocks.find((candidate) => candidate.id === targetId);
    if (!block || !block.parcels.length) return "missing-target";
    if (block.parcels.some((parcel) => reserved.has(parcel.id))) return "target-occupied";
    if (!layout.terrain.buildable(block.x, block.z)) return "not-buildable";
    if (!clearsHighways(block, block.width, block.depth, layout.highways)) return "highway-clearance";
    return null;
  }
  const parcel = parcelIndex(layout).get(targetId);
  if (!parcel) return "missing-target";
  if (reserved.has(parcel.id)) return "target-occupied";
  if (!layout.terrain.buildable(parcel.x, parcel.z)) return "not-buildable";
  if (layout.terrain.slope(parcel.x, parcel.z) > SLOPE_LIMIT) return "steep-slope";
  if (!clearsHighways(parcel, 16, 16, layout.highways)) return "highway-clearance";
  if (!rectClearOfEdges(parcel, clearanceRoads(layout), 0.5)) return "site-over-road";
  return null;
}

/** 离该设施最近的、可以搬过去的空街区/空地块（按距离从近到远逐个校验，凑够 limit 个就停）。 */
export function siteTargets(layout: CityLayout, site: SiteInfo, suppressedContext: Iterable<string> = [], limit = 40, maxDistance = 240): SiteTarget[] {
  const candidates: SiteTarget[] = site.level === "block"
    ? layout.blocks.filter((block) => block.parcels.length > 0).map((block) => ({ id: block.id, x: block.x, z: block.z, yaw: block.parcels[0].yaw, width: block.width, depth: block.depth, distance: 0 }))
    : layout.blocks.flatMap((block) => block.parcels).map((parcel) => ({ id: parcel.id, x: parcel.x, z: parcel.z, yaw: parcel.yaw, width: parcel.width, depth: parcel.depth, distance: 0 }));
  const sorted = candidates
    .map((target) => ({ ...target, distance: Math.hypot(target.x - site.x, target.z - site.z) }))
    .filter((target) => target.id !== site.slotId && target.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance || (a.id < b.id ? -1 : 1));
  const out: SiteTarget[] = [];
  for (const target of sorted) {
    if (siteMoveProblem(layout, site, target.id, suppressedContext) !== null) continue;
    out.push({ ...target, distance: Math.round(target.distance) });
    if (out.length >= limit) break;
  }
  return out;
}

/** 射线对设施占地盒（朝向矩形的外接 AABB，外扩 1）求交，取最近的一座。 */
export function pickSite(layout: CityLayout, ray: { origin: { x: number; y: number; z: number }; direction: { x: number; y: number; z: number } }): SiteInfo | null {
  let best: { site: SiteInfo; t: number } | null = null;
  for (const site of listSites(layout)) {
    const ax = Math.cos(site.yaw); const az = -Math.sin(site.yaw); // 局部 x 轴（面宽）
    const bx = Math.sin(site.yaw); const bz = Math.cos(site.yaw);  // 局部 z 轴（进深）
    const hx = Math.abs(ax) * site.width / 2 + Math.abs(bx) * site.depth / 2 + 1;
    const hz = Math.abs(az) * site.width / 2 + Math.abs(bz) * site.depth / 2 + 1;
    const lo = [site.x - hx, site.y, site.z - hz]; const hi = [site.x + hx, site.y + site.height, site.z + hz];
    const o = [ray.origin.x, ray.origin.y, ray.origin.z]; const d = [ray.direction.x, ray.direction.y, ray.direction.z];
    let tMin = 0; let tMax = Infinity; let hit = true;
    for (let axis = 0; axis < 3; axis += 1) {
      if (Math.abs(d[axis]) < 1e-9) { if (o[axis] < lo[axis] || o[axis] > hi[axis]) { hit = false; break; } continue; }
      let t1 = (lo[axis] - o[axis]) / d[axis]; let t2 = (hi[axis] - o[axis]) / d[axis];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tMin = Math.max(tMin, t1); tMax = Math.min(tMax, t2);
      if (tMin > tMax) { hit = false; break; }
    }
    if (hit && (!best || tMin < best.t)) best = { site, t: tMin };
  }
  return best?.site ?? null;
}

type Arrays = Pick<CityLayout, "civics" | "gardens" | "districtLandmarks" | "contextBuildings">;

/**
 * 重放设施操作日志（删/移，按顺序）：先于会话楼移动套用，后者看到的是设施改动后的占用。
 * 每个操作失败就进 stale、不影响后续（同 roadOps）。返回改动后的四组数组。
 */
export function applySiteOps(layout: CityLayout, ops: readonly SiteOp[], suppressedContext: Iterable<string>, stale: PatchStaleEntry[]): Arrays {
  let view: CityLayout = { ...layout, civics: [...layout.civics], gardens: [...layout.gardens], districtLandmarks: [...(layout.districtLandmarks ?? [])], contextBuildings: [...layout.contextBuildings] };
  const suppressed = [...suppressedContext];
  ops.forEach((op, index) => {
    const label = `${index + 1}:${op.t}`;
    const kind = op.t === "remove" ? "site-remove" : "site-move";
    const site = listSites(view).find((candidate) => candidate.id === op.id);
    if (!site) { stale.push({ kind, id: label, reason: "unknown-site", detail: `${op.id} 不在当前城市里（规划已重算或前序操作已改动）` }); return; }
    if (op.at && Math.hypot(site.x - op.at.x, site.z - op.at.z) > 1) { stale.push({ kind, id: label, reason: "site-changed", detail: `${op.id} 的位置已经变了（城市扩容或配套重排），为免落到另一座设施上，这条编辑作废` }); return; }
    if (op.t === "remove") {
      view = {
        ...view,
        civics: view.civics.filter((civic) => civic.id !== op.id),
        gardens: view.gardens.filter((garden) => garden.id !== op.id),
        districtLandmarks: (view.districtLandmarks ?? []).filter((landmark) => `district-landmark:${landmark.districtId}` !== op.id),
        contextBuildings: view.contextBuildings.filter((context) => context.id !== op.id),
      };
      return;
    }
    const problem = siteMoveProblem(view, site, op.to, suppressed);
    if (problem === "unchanged") return;
    if (problem) { stale.push({ kind, id: label, reason: problem === "missing-target" ? "missing-target" : problem === "target-occupied" ? "target-occupied" : "site-blocked", detail: `${op.id} → ${op.to}：${problem}` }); return; }
    const height = (x: number, z: number) => layout.terrain.height(x, z);
    if (site.level === "block") {
      const block = view.blocks.find((candidate) => candidate.id === op.to)!;
      const place = { x: block.x, z: block.z, y: height(block.x, block.z), yaw: block.parcels[0].yaw, width: block.width, depth: block.depth };
      view = {
        ...view,
        civics: view.civics.map((civic) => (civic.id === op.id ? { ...civic, ...place, parcelId: block.id } : civic)),
        gardens: view.gardens.map((garden) => (garden.id === op.id ? { ...garden, ...place, blockId: block.id } : garden)),
      };
    } else {
      const parcel = parcelIndex(view).get(op.to)!;
      const place = { x: parcel.x, z: parcel.z, y: height(parcel.x, parcel.z), yaw: parcel.yaw };
      view = {
        ...view,
        districtLandmarks: (view.districtLandmarks ?? []).map((landmark) => (`district-landmark:${landmark.districtId}` === op.id ? { ...landmark, ...place, parcelId: parcel.id } : landmark)),
        // 背景楼的 id 由地块决定（context:<parcelId>）：搬家后 id 跟着变，占用判定才认得新地块。
        contextBuildings: view.contextBuildings.map((context) => (context.id === op.id ? { ...context, ...place, id: `context:${parcel.id}` } : context)),
      };
    }
  });
  return { civics: view.civics, gardens: view.gardens, districtLandmarks: view.districtLandmarks, contextBuildings: view.contextBuildings };
}
