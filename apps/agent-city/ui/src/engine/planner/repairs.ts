import { DetMath as Math } from "../detMath"; // 跨引擎确定性：与 cityPlan.ts 同一份 Math（见 detMath.ts）
import { clearsHighways, roadNodeId, segmentDistance } from "../cityPlan";
import type { RoadEdge, Vec2 } from "../cityLayout";
import type { RepairContext } from "./context";

// 规划尾部的修复遍（CITY_ARCHITECTURE §2 迁移步 5b）：逐字从 cityPlan.ts 的 buildPlan 尾部搬来，闭包引用改为 ctx 解构，
// 迭代顺序、阈值与常数一律不变（planner 基线哈希是证明）。每个遍返回「改动数」，供 solve.ts 汇总。

/** 用地修复遍共用的几何：可挪动的用地、最近非桥路段、占地圈湿点数。路网在这些遍内不变，所以每个遍各算一份与原先共用一份等价。 */
function siteGeometry(ctx: RepairContext) {
  const { edges, publicSites, landmarks, height, inRiver } = ctx;
  const movable = [...publicSites, ...landmarks].filter((s) => s.radius && s.kind !== "civic" && s.kind !== "arch" && !(s as { shore?: Vec2 }).shore);
  const solid = [...edges.values()].filter((e) => !e.bridge);
  const nearestRoad = (x: number, z: number) => {
    let best: { d: number; q: Vec2 } | null = null;
    for (const e of solid) {
      const [a, b] = e.points; const dx = b.x - a.x; const dz = b.z - a.z; const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
      const q = { x: a.x + dx * t, z: a.z + dz * t }; const d = Math.hypot(q.x - x, q.z - z);
      if (!best || d < best.d) best = { d, q };
    }
    return best;
  };
  const wetAt = (site: { radius: number }, x: number, z: number) => { let n = 0; for (let k = 0; k < 16; k += 1) { const t = (k / 16) * Math.PI * 2; const r = k % 2 ? site.radius : site.radius * 0.6; const px = x + Math.cos(t) * r; const pz = z + Math.sin(t) * r; if (height(px, pz) < 0.5 || inRiver(px, pz)) n += 1; } return n; };
  return { movable, nearestRoad, wetAt };
}
type SiteGeometry = ReturnType<typeof siteGeometry>;

/** 临街：车站/体育场拉到离路 0.85 半径（先不转向、再转向车站正面各一遍，与原先顺序一致）。返回挪动次数。 */
export function frontStationsAndStadiums(ctx: RepairContext): number {
  const { publicSites, landmarks, blocks, ringRuns, height } = ctx;
  const { movable, nearestRoad, wetAt } = siteGeometry(ctx);
  let moved = 0;
  // 临街：车站/体育场的正面要贴着路边（用户截图：车站离路一大截——「门前有路」守卫只要求 ≤ 半径+20）。
  // 沿「路 → 用地中心」反方向的反向把它拉到离路 0.85 半径（占地前沿 ≈ 0.65 半径，贴着人行道），
  // 仍满足上面的「中心到路 ≥ 0.7 半径」；新位置须是干地、不压其它用地/高架、不让别的路穿过。
  for (const site of movable) {
    if (site.kind !== "station" && site.kind !== "stadium") continue;
    const near = nearestRoad(site.x, site.z);
    if (!near || near.d <= site.radius * 0.95 || near.d > site.radius + 90) continue;
    const others = [...publicSites, ...landmarks].filter((o) => o !== site && o.radius);
    const dirx = (site.x - near.q.x) / near.d; const dirz = (site.z - near.q.z) / near.d;
    const nx = near.q.x + dirx * site.radius * 0.85; const nz = near.q.z + dirz * site.radius * 0.85;
    const probe = nearestRoad(nx, nz);
    if (!probe || probe.d < site.radius * 0.8) continue;
    if (wetAt(site, nx, nz) > Math.max(3, wetAt(site, site.x, site.z)) || height(nx, nz) <= 0.5) continue;
    if (others.some((o) => Math.hypot(o.x - nx, o.z - nz) < o.radius + site.radius)) continue;
    if (!clearsHighways({ x: nx, z: nz }, site.radius * 2, site.radius * 2, ringRuns)) continue;
    site.x = nx; site.z = nz; moved += 1;
    for (const block of blocks) block.parcels = block.parcels.filter((pc) => Math.hypot(pc.x - nx, pc.z - nz) >= site.radius);
  }
  // 临街：车站/体育场的正面要贴着路边（用户截图：车站离路一大截——「门前有路」守卫只要求 ≤ 半径+20）。
  // 沿「路 → 用地中心」反方向的反向把它拉到离路 0.85 半径（占地前沿 ≈ 0.65 半径，贴着人行道），
  // 仍满足上面的「中心到路 ≥ 0.7 半径」；新位置须是干地、不压其它用地/高架、不让别的路穿过。
  for (const site of movable) {
    if (site.kind !== "station" && site.kind !== "stadium") continue;
    const near = nearestRoad(site.x, site.z);
    if (!near || near.d > site.radius + 90) continue;
    // 车站正面（站房入口/雨篷）在局部 +z：转向最近的路（原先是固定朝向 0.12，从不看路）。
    if (site.kind === "station" && near.d > 0.5) site.yaw = Math.atan2(near.q.x - site.x, near.q.z - site.z);
    if (near.d <= site.radius * 0.95) continue;
    const others = [...publicSites, ...landmarks].filter((o) => o !== site && o.radius);
    const dirx = (site.x - near.q.x) / near.d; const dirz = (site.z - near.q.z) / near.d;
    const nx = near.q.x + dirx * site.radius * 0.85; const nz = near.q.z + dirz * site.radius * 0.85;
    const probe = nearestRoad(nx, nz);
    if (!probe || probe.d < site.radius * 0.8) continue;
    if (wetAt(site, nx, nz) > Math.max(3, wetAt(site, site.x, site.z)) || height(nx, nz) <= 0.5) continue;
    if (others.some((o) => Math.hypot(o.x - nx, o.z - nz) < o.radius + site.radius)) continue;
    if (!clearsHighways({ x: nx, z: nz }, site.radius * 2, site.radius * 2, ringRuns)) continue;
    site.x = nx; site.z = nz; moved += 1;
    for (const block of blocks) block.parcels = block.parcels.filter((pc) => Math.hypot(pc.x - nx, pc.z - nz) >= site.radius);
  }
  return moved;
}

/** 兜底：岸边用地附近推不开时，沿海岸换一个位置（nudge 轮次里逐用地调用）。成功返回 true。 */
export function relocateShoreSite(ctx: RepairContext, site: { x: number; z: number; radius: number; kind: string }, g: SiteGeometry, others: Array<{ x: number; z: number; radius: number }>): boolean {
  const { blocks, ringRuns, coast, core, height, nearBridgeEnd, distanceToTrunks, SHORE_SITE_KINDS } = ctx;
  const { nearestRoad, wetAt } = g;
  if (!(SHORE_SITE_KINDS.has(site.kind)) || (site as { shore?: Vec2 }).shore) return false;
  let done = false;
  const ranked2 = [...coast].sort((u, v) => Math.hypot(u.x - site.x, u.z - site.z) - Math.hypot(v.x - site.x, v.z - site.z));
  // 向内移 0.7 / 1.0 / 1.5 / 2.0 个半径各试一次：沿海大道离水线 ~22，贴岸 0.7 半径的位置正好压在它上面，
  // 退到大道内侧（岸边用地与海之间隔一条路）也算临水。
  const slots = ranked2.slice(0, 400).flatMap((q) => [0.7, 1.0, 1.5, 2.0].map((f) => ({ q, f })));
  for (let idx = 0; idx < slots.length && !done; idx += 1) {
    const { q, f } = slots[idx]; const lx = core.x - q.x; const lz = core.z - q.z; const ll = Math.hypot(lx, lz) || 1;
    const nx = q.x + (lx / ll) * site.radius * f; const nz = q.z + (lz / ll) * site.radius * f;
    const probe = nearestRoad(nx, nz);
    if (!probe || probe.d < site.radius * 0.85 || probe.d > site.radius + 20) continue;
    if (wetAt(site, nx, nz) > 3 || height(nx, nz) <= 0.5 || nearBridgeEnd(nx, nz, site.radius)) continue;
    if (others.some((o) => Math.hypot(o.x - nx, o.z - nz) < o.radius + site.radius)) continue;
    if (!clearsHighways({ x: nx, z: nz }, site.radius * 2, site.radius * 2, ringRuns)) continue;
    if (distanceToTrunks({ x: nx, z: nz }) < site.radius * 0.7) continue;
    site.x = nx; site.z = nz; done = true;
    for (const block of blocks) block.parcels = block.parcels.filter((pc) => Math.hypot(pc.x - nx, pc.z - nz) >= site.radius);
  }
  return done;
}

/** 穿路的用地推离路（最多 6 轮直到没有挪动）；推不开的岸边用地走 relocateShoreSite。返回总挪动数。 */
export function nudgeSitesOffRoads(ctx: RepairContext): number {
  const { publicSites, landmarks, blocks, ringRuns, height, distanceToTrunks } = ctx;
  const g = siteGeometry(ctx);
  const { movable, nearestRoad, wetAt } = g;
  let total = 0;
  for (let round = 0; round < 6; round += 1) {
    let moved = 0;
    for (const site of movable) {
      const near = nearestRoad(site.x, site.z);
      if (!near || near.d >= site.radius * 0.7) continue;
      const others = [...publicSites, ...landmarks].filter((o) => o !== site && o.radius);
      const away = near.d > 0.5 ? { x: (site.x - near.q.x) / near.d, z: (site.z - near.q.z) / near.d } : { x: 1, z: 0 };
      const wet0 = wetAt(site, site.x, site.z);
      // 沿「离路」方向优先，再试两侧与四个斜向（路穿过用地、而用地一侧临河时只有斜着挪得开）；最大推 1.3 半径。
      const diag = Math.SQRT1_2; const tryDirs = [away, { x: -away.z, z: away.x }, { x: away.z, z: -away.x }, { x: (away.x - away.z) * diag, z: (away.z + away.x) * diag }, { x: (away.x + away.z) * diag, z: (away.z - away.x) * diag }, { x: -away.x, z: -away.z }];
      let done = false;
      for (const dir of tryDirs) {
        for (let push = 4; push <= site.radius * 1.3 && !done; push += 3) {
          const nx = site.x + dir.x * push; const nz = site.z + dir.z * push;
          const probe = nearestRoad(nx, nz);
          if (!probe || probe.d < site.radius * 0.85) continue;
          if (wetAt(site, nx, nz) > Math.max(3, wet0) || height(nx, nz) <= 0.5) continue;
          if (others.some((o) => Math.hypot(o.x - nx, o.z - nz) < o.radius + site.radius)) continue;
          if (!clearsHighways({ x: nx, z: nz }, site.radius * 2, site.radius * 2, ringRuns)) continue;
          if (distanceToTrunks({ x: nx, z: nz }) < site.radius * 0.7) continue;
          site.x = nx; site.z = nz; done = true; moved += 1;
          for (const block of blocks) block.parcels = block.parcels.filter((p) => Math.hypot(p.x - nx, p.z - nz) >= site.radius);
        }
        if (done) break;
      }
  // 兜底：附近推不开（岸边用地夹在海与路之间、桥头贴着它）——沿海岸换一个位置。
  if (!done && relocateShoreSite(ctx, site, g, others)) moved += 1;
    }
    total += moved;
    if (!moved) break;
  }
  return total;
}

/** 被用地截断的路：两个共线断头隔着同一块用地时，用绕用地外缘的折线接起来。返回新增折线数。 */
export function detourAroundSites(ctx: RepairContext): number {
  const { nodes, edges, addEdge, key, height, inRiver, publicSites, landmarks } = ctx;
  let joined = 0;
    const solid = () => [...edges.values()].filter((e) => !e.bridge);
    const degree = new Map<string, RoadEdge[]>();
    for (const e of solid()) for (const id of [e.from, e.to]) (degree.get(id) ?? degree.set(id, []).get(id)!).push(e);
    const loose = [...degree.entries()].filter(([, list]) => list.length === 1).map(([id, list]) => ({ id, edge: list[0], at: nodes.get(id)! })).filter((x) => x.at && height(x.at.x, x.at.z) >= 2.5);
    const sitesAll = [...publicSites, ...landmarks].filter((o) => o.radius);
    const crosses = (a: Vec2, b: Vec2) => solid().some((e) => {
      const [c, d] = e.points; if (roadNodeId(c) === roadNodeId(a) || roadNodeId(d) === roadNodeId(a) || roadNodeId(c) === roadNodeId(b) || roadNodeId(d) === roadNodeId(b)) return false;
      const o = (p: Vec2, q: Vec2, r: Vec2) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
      return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
    });
    const used = new Set<string>();
    for (let i = 0; i < loose.length; i += 1) for (let j = i + 1; j < loose.length; j += 1) {
      const A = loose[i]; const B = loose[j];
      if (used.has(A.id) || used.has(B.id) || A.edge.kind !== B.edge.kind || A.edge.width !== B.edge.width) continue;
      const span = Math.hypot(B.at.x - A.at.x, B.at.z - A.at.z); if (span < 30 || span > 320) continue;
      const nb = (L: typeof A) => { const [p0, p1] = L.edge.points; return roadNodeId(p0) === L.id ? p1 : p0; };
      const dirOf = (L: typeof A, to: Vec2) => { const n = nb(L); const v = { x: L.at.x - n.x, z: L.at.z - n.z }; const w = { x: to.x - L.at.x, z: to.z - L.at.z }; const c = (v.x * w.x + v.z * w.z) / ((Math.hypot(v.x, v.z) || 1) * (Math.hypot(w.x, w.z) || 1)); return c; };
      if (dirOf(A, B.at) < Math.cos((50 * Math.PI) / 180) || dirOf(B, A.at) < Math.cos((50 * Math.PI) / 180)) continue; // 两头都要朝着对方延伸
      const blocker = sitesAll.find((o) => segmentDistance(o, A.at, B.at) < o.radius + 4 && Math.hypot(o.x - A.at.x, o.z - A.at.z) <= o.radius + 90 && Math.hypot(o.x - B.at.x, o.z - B.at.z) <= o.radius + 90);
      if (!blocker) continue;
      const R = blocker.radius + 8; const ux = (B.at.x - A.at.x) / span; const uz = (B.at.z - A.at.z) / span; const px = -uz; const pz = ux;
      for (const side of [1, -1]) {
        const m = key({ x: blocker.x + px * side * R, z: blocker.z + pz * side * R });
        // 折线 A → q1 → m → q2 → B：q1/q2 取 A/B 与 m 的中点再向外推，让转角缓一些（单个拐点会出 <60° 的急弯）。
        const q1 = key({ x: (A.at.x + m.x) / 2 + px * side * R * 0.15, z: (A.at.z + m.z) / 2 + pz * side * R * 0.15 });
        const q2 = key({ x: (B.at.x + m.x) / 2 + px * side * R * 0.15, z: (B.at.z + m.z) / 2 + pz * side * R * 0.15 });
        const chain = [A.at, q1, m, q2, B.at];
        let ok = true;
        for (let k = 0; k < chain.length && ok; k += 1) {
          const q = chain[k];
          if (k > 0 && k < chain.length - 1 && (height(q.x, q.z) <= 0.5 || inRiver(q.x, q.z))) ok = false;
          if (sitesAll.some((o) => o !== blocker && Math.hypot(o.x - q.x, o.z - q.z) < o.radius + 4)) ok = false;
          if (k > 0 && crosses(chain[k - 1], q)) ok = false;
        }
        if (!ok) continue;
        for (let k = 1; k < chain.length; k += 1) addEdge(chain[k - 1], chain[k], A.edge.kind === "arterial", false, A.edge.width >= 12);
        used.add(A.id); used.add(B.id); joined += 1;
        break;
      }
    }
  return joined;
}

/** 断头顺着自己的方向直接延伸到下一条路（两遍）。返回接上的断头数。 */
export function extendLooseEnds(ctx: RepairContext): number {
  const { nodes, edges, addEdge, key, height, publicSites, landmarks, safeRoadLink, crosses } = ctx;
  let total = 0;
    for (let pass = 0; pass < 2; pass += 1) {
      const solidEdges = [...edges.values()].filter((e) => !e.bridge);
      const inc = new Map<string, RoadEdge[]>();
      for (const e of solidEdges) for (const id of [e.from, e.to]) (inc.get(id) ?? inc.set(id, []).get(id)!).push(e);
      const sitesAll2 = [...publicSites, ...landmarks].filter((o) => o.radius);
      let healed = 0;
      for (const [id, list] of inc) {
        if (list.length !== 1) continue;
        const at = nodes.get(id); if (!at || height(at.x, at.z) < 2.5) continue;
        if (sitesAll2.some((o) => Math.hypot(o.x - at.x, o.z - at.z) < o.radius + 12)) continue; // 伸进用地边缘的门前路是正常终点
        const own = list[0]; const [p0, p1] = own.points; const from = roadNodeId(p0) === id ? p1 : p0;
        const dx = at.x - from.x; const dz = at.z - from.z; const dl = Math.hypot(dx, dz); if (dl < 1) continue;
        const ux = dx / dl; const uz = dz / dl;
        let best: { t: number; edge: RoadEdge } | null = null;
        for (const e of solidEdges) {
          if (e === own) continue;
          const [c, d] = e.points; const ex = d.x - c.x; const ez = d.z - c.z;
          const den = ux * ez - uz * ex; if (Math.abs(den) < 1e-6) continue;
          const t = ((c.x - at.x) * ez - (c.z - at.z) * ex) / den;
          const w = ((c.x - at.x) * uz - (c.z - at.z) * ux) / den;
          if (t < 3 || t > 320 || w < -0.02 || w > 1.02) continue;
          if (!best || t < best.t) best = { t, edge: e };
        }
        if (!best) continue;
        const [c, d] = best.edge.points;
        let target = key({ x: at.x + ux * best.t, z: at.z + uz * best.t });
        const lenE = Math.hypot(d.x - c.x, d.z - c.z) || 1;
        const along = Math.hypot(target.x - c.x, target.z - c.z);
        if (along < 12) target = c; else if (lenE - along < 12) target = d;
        if (roadNodeId(target) === id) continue;
        if (!safeRoadLink(at, target)) continue;
        // 与落点处已有道路夹角 ≥ 30°（clearAngle 的 35° 对「延伸」略严，这里只防折回重叠）。
        const ex2 = d.x - c.x; const ez2 = d.z - c.z; const cosA = Math.abs((ux * ex2 + uz * ez2) / lenE);
        if (target !== c && target !== d && cosA > Math.cos((30 * Math.PI) / 180)) continue;
        if ([...edges.values()].some((o) => o !== best!.edge && !o.bridge && o !== own && crosses(at, target, o.points[0], o.points[1]) )) continue;
        const host = best.edge;
        if (target !== c && target !== d && edges.has(host.id)) {
          edges.delete(host.id);
          addEdge(c, target, host.kind === "arterial", false, host.width >= 12);
          addEdge(target, d, host.kind === "arterial", false, host.width >= 12);
        }
        addEdge(at, target, own.kind === "arterial", false, own.width >= 12);
        healed += 1;
      }
      total += healed;
      if (!healed) break;
    }
  return total;
}
