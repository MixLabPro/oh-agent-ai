/**
 * 规划修复：非会话建筑（设施）的编辑规则——市长管公共设施，会话楼由开发商（程序）盖，用户不手造会话楼
 * （docs/CITY_PLAN_MANUAL_REPAIR_SPEC.md §14）。
 *
 * 可编辑的四类，都是按街区/地块摆放、不牵连路网与海岸的：
 *   civic（学校/商场/医院，占整个空街区）、garden（城区花园，占整个街区）、
 *   district-landmark（城区地标，占一个地块）、context（背景楼，占一个地块）。
 * 放权后（SPEC §15）还可编辑：致敬地标（landmark）与市政用地（public-site）——拆除、或搬到任意空地（free 级）。
 * 它们的旧接入路会留成断头路（提示，不拒绝）。用户 2026-10-11 拍板「所有建筑都可以被移动」：
 * 海上地标（原址堤道留下）与港口（搬到内陆就失去码头的意义，由用户自己判断）也放开；
 * 唯一锁定的是悬索桥——它不是建筑，是路网里的一段桥面，锁定理由随对象给出，点到时原样显示。
 *
 * 操作带**位置校验**（`at`）：公共设施 id 是按序号编的（civic:0、civic:1…），数据增长后序号会变，
 * 没有校验时旧补丁会悄悄落到另一座设施上；位置对不上就判失效，不猜。
 * 纯函数、无副作用；被 planPatch（重放）与编辑器（校验/拾取/候选）共用。
 */
import type { CivicKind, CityLayout, Vec2 } from "./cityLayout";
import { clearsHighways } from "./cityPlan";
import { clearanceRoads, parcelIndex, rectClearOfRoads, reservedParcelIds } from "./planGeometry";
import type { PatchStaleEntry } from "./planPatch";

export type SiteKind = "civic" | "garden" | "district-landmark" | "context" | "landmark" | "public-site";

/** cls：写下时设施的类别（`siteClassOf`，如 "civic/school"）。公共设施的 id 是序号（civic:0），跨档后序号对应的可能已是
 *  另一种设施——重定位按类别找（路线图 SPEC P0-2）。 */
export type SiteOp =
  | { t: "remove"; id: string; at?: Vec2; cls?: string }
  /** toAnchor：目标街区/地块写下时的中心（跨档重定位用，路线图 SPEC P0-2）；自由级目标 "@x,z" 自带坐标，不需要。 */
  | { t: "move"; id: string; at?: Vec2; to: string; toAnchor?: Vec2; cls?: string };

/** 设施的类别签名：种类 + 子类（学校/商场…、地标种类、市政用地种类）。 */
export const siteClassOf = (site: Pick<SiteInfo, "kind" | "civicKind" | "landmarkKind" | "publicKind">): string =>
  `${site.kind}/${site.civicKind ?? site.landmarkKind ?? site.publicKind ?? ""}`;

export type SiteInfo = {
  id: string;
  kind: SiteKind;
  civicKind?: CivicKind;
  landmarkKind?: string;
  publicKind?: string;
  x: number; z: number; yaw: number; width: number; depth: number; height: number; y: number;
  /** block：占整个街区（目标是街区 id）；parcel：占一个地块（目标是地块 id）；free：圆形占地，目标是任意地面点（"@x,z"）。 */
  level: "block" | "parcel" | "free";
  /** 非空 = 锁定，内容是给用户看的理由（不能搬、不能拆）。 */
  locked?: string;
  /** 当前所在的街区/地块 id。 */
  slotId: string;
};

export type SiteTarget = { id: string; x: number; z: number; yaw: number; width: number; depth: number; distance: number };

const PICK_HEIGHT = { civic: 28, garden: 12, "district-landmark": 45 } as const;
const SLOPE_LIMIT = 0.55;

export function siteKindOf(id: string): SiteKind | null {
  if (id.startsWith("landmark:")) return "landmark";
  if (id.startsWith("public:")) return "public-site";
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
  const ground = (x: number, z: number) => Math.max(0, layout.terrain.height(x, z));
  for (const landmark of layout.landmarks ?? []) {
    if (!landmark.radius) continue;
    const locked = landmark.kind === "suspension-bridge" ? "悬索桥不是建筑，是路网里的一段桥面（由桥梁模型绑定），不能单独搬或拆" : undefined;
    out.push({ id: landmark.id, kind: "landmark", landmarkKind: landmark.kind, x: landmark.x, z: landmark.z, yaw: landmark.yaw, width: landmark.radius * 2, depth: landmark.radius * 2, height: Math.max(30, landmark.radius * 2.5), y: ground(landmark.x, landmark.z), level: "free", slotId: "", ...(locked ? { locked } : {}) });
  }
  for (const site of layout.publicSites ?? []) {
    if (!site.radius) continue;
    out.push({ id: `public:${site.id}`, kind: "public-site", publicKind: site.kind, x: site.x, z: site.z, yaw: site.yaw, width: site.radius * 2, depth: site.radius * 2, height: 22, y: ground(site.x, site.z), level: "free", slotId: "" });
  }
  return out;
}

/** 目标街区/地块能否接收这座设施；null = 可以，否则返回阻止原因码。 */
export function siteMoveProblem(layout: CityLayout, site: SiteInfo, targetId: string, suppressedContext: Iterable<string> = []): string | null {
  if (site.locked) return "site-locked";
  if (site.level === "free") return freeMoveProblem(layout, site, targetId);
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
  if (site.kind === "district-landmark") {
    // 城区地标的 17 m 裙房占整面（与生成器一致，注册表 SPEC D1）：目标所在街区除它自己外必须全空。
    const without = { ...layout, districtLandmarks: (layout.districtLandmarks ?? []).filter((landmark) => `district-landmark:${landmark.districtId}` !== site.id) };
    const free = reservedParcelIds(without, suppressedContext);
    const block = layout.blocks.find((candidate) => candidate.id === parcel.blockId);
    if ((block?.parcels ?? [parcel]).some((member) => free.has(member.id))) return "target-occupied";
  } else if (reserved.has(parcel.id)) return "target-occupied";
  if (!layout.terrain.buildable(parcel.x, parcel.z)) return "not-buildable";
  if (layout.terrain.slope(parcel.x, parcel.z) > SLOPE_LIMIT) return "steep-slope";
  if (!clearsHighways(parcel, 16, 16, layout.highways)) return "highway-clearance";
  if (!rectClearOfRoads(layout, parcel, 0.5)) return "site-over-road";
  return null;
}

/** "@x,z" → 坐标；格式不对返回 null。 */
export function parseFreeTarget(targetId: string): Vec2 | null {
  const m = /^@(-?[\d.]+),(-?[\d.]+)$/.exec(targetId);
  return m ? { x: Number(m[1]), z: Number(m[2]) } : null;
}

/** free 级（圆形占地）设施搬到任意地面点：圆内地形可建、不压地面路、不压别的楼与设施（自己除外）。 */
function freeMoveProblem(layout: CityLayout, site: SiteInfo, targetId: string): string | null {
  const at = parseFreeTarget(targetId);
  if (!at) return "missing-target";
  if (Math.hypot(at.x - site.x, at.z - site.z) < 1) return "unchanged";
  const r = site.width / 2;
  const samples = [at, ...Array.from({ length: 8 }, (_, i) => ({ x: at.x + Math.cos((i * Math.PI) / 4) * r * 0.8, z: at.z + Math.sin((i * Math.PI) / 4) * r * 0.8 }))];
  if (samples.some((p) => !layout.terrain.buildable(p.x, p.z))) return "not-buildable";
  for (const edge of clearanceRoads(layout)) {
    for (let i = 1; i < edge.points.length; i += 1) {
      const a = edge.points[i - 1]; const b = edge.points[i];
      const dx = b.x - a.x; const dz = b.z - a.z; const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((at.x - a.x) * dx + (at.z - a.z) * dz) / l2));
      if (Math.hypot(at.x - a.x - dx * t, at.z - a.z - dz * t) < r * 0.75 + edge.width / 2) return "site-over-road";
    }
  }
  // 圆 × 朝向矩形：把圆心转进矩形局部坐标，夹到矩形内，距离 < r 即相交。
  const hitsRect = (rect: { x: number; z: number; yaw: number; width: number; depth: number }) => {
    const dx = at.x - rect.x; const dz = at.z - rect.z;
    const lx = dx * Math.cos(rect.yaw) - dz * Math.sin(rect.yaw); const lz = dx * Math.sin(rect.yaw) + dz * Math.cos(rect.yaw);
    const cx = Math.max(-rect.width / 2, Math.min(rect.width / 2, lx)); const cz = Math.max(-rect.depth / 2, Math.min(rect.depth / 2, lz));
    return Math.hypot(lx - cx, lz - cz) < r;
  };
  for (const district of layout.districts) for (const slot of district.slots.values()) if (hitsRect({ ...slot, width: slot.width * 0.92, depth: slot.depth * 0.9 })) return "target-occupied";
  for (const other of listSites(layout)) if (other.id !== site.id && hitsRect(other)) return "target-occupied";
  return null;
}

/** 离该设施最近的、可以搬过去的空街区/空地块（按距离从近到远逐个校验，凑够 limit 个就停）。 */
export function siteTargets(layout: CityLayout, site: SiteInfo, suppressedContext: Iterable<string> = [], limit = 40, maxDistance = 240): SiteTarget[] {
  if (site.level === "free" || site.locked) return []; // free 级：点任意地面点，不预先列候选
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

type Arrays = Pick<CityLayout, "civics" | "gardens" | "districtLandmarks" | "contextBuildings" | "landmarks" | "publicSites">;

/**
 * 重放设施操作日志（删/移，按顺序）：先于会话楼移动套用，后者看到的是设施改动后的占用。
 * 每个操作失败就进 stale、不影响后续（同 roadOps）。返回改动后的四组数组。
 */
export function applySiteOps(layout: CityLayout, ops: readonly SiteOp[], suppressedContext: Iterable<string>, stale: PatchStaleEntry[]): Arrays {
  let view: CityLayout = { ...layout, civics: [...layout.civics], gardens: [...layout.gardens], districtLandmarks: [...(layout.districtLandmarks ?? [])], contextBuildings: [...layout.contextBuildings], landmarks: [...(layout.landmarks ?? [])], publicSites: [...(layout.publicSites ?? [])] };
  const suppressed = [...suppressedContext];
  ops.forEach((op, index) => {
    const label = `${index + 1}:${op.t}`;
    const kind = op.t === "remove" ? "site-remove" : "site-move";
    const site = listSites(view).find((candidate) => candidate.id === op.id);
    if (!site) { stale.push({ kind, id: label, reason: "unknown-site", detail: `${op.id} 不在当前城市里（规划已重算或前序操作已改动）` }); return; }
    if (op.at && Math.hypot(site.x - op.at.x, site.z - op.at.z) > 1) { stale.push({ kind, id: label, reason: "site-changed", detail: `${op.id} 的位置已经变了（城市扩容或配套重排），为免落到另一座设施上，这条编辑作废` }); return; }
    if (site.locked) { stale.push({ kind, id: label, reason: "site-blocked", detail: `${op.id} 已锁定：${site.locked}` }); return; }
    if (op.t === "remove") {
      view = {
        ...view,
        civics: view.civics.filter((civic) => civic.id !== op.id),
        gardens: view.gardens.filter((garden) => garden.id !== op.id),
        districtLandmarks: (view.districtLandmarks ?? []).filter((landmark) => `district-landmark:${landmark.districtId}` !== op.id),
        contextBuildings: view.contextBuildings.filter((context) => context.id !== op.id),
        landmarks: (view.landmarks ?? []).filter((landmark) => landmark.id !== op.id),
        publicSites: (view.publicSites ?? []).filter((public_) => `public:${public_.id}` !== op.id),
      };
      return;
    }
    const problem = siteMoveProblem(view, site, op.to, suppressed);
    if (problem === "unchanged") return;
    if (problem) { stale.push({ kind, id: label, reason: problem === "missing-target" ? "missing-target" : problem === "target-occupied" ? "target-occupied" : "site-blocked", detail: `${op.id} → ${op.to}：${problem}` }); return; }
    const height = (x: number, z: number) => layout.terrain.height(x, z);
    if (site.level === "free") {
      // 圆形占地设施：只挪圆心（朝向不变）；旧接入路留在原地成为断头路——如实保留，不替用户删路。
      const at = parseFreeTarget(op.to)!;
      view = {
        ...view,
        landmarks: (view.landmarks ?? []).map((landmark) => (landmark.id === op.id ? { ...landmark, x: at.x, z: at.z } : landmark)),
        publicSites: (view.publicSites ?? []).map((public_) => (`public:${public_.id}` === op.id ? { ...public_, x: at.x, z: at.z } : public_)),
      };
      return;
    }
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
  return { civics: view.civics, gardens: view.gardens, districtLandmarks: view.districtLandmarks, contextBuildings: view.contextBuildings, landmarks: view.landmarks, publicSites: view.publicSites };
}
