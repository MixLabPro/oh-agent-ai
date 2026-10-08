/**
 * 骨架阶段（CITY_PLANNER_V2_SPEC §5.1 / 步 2a 先迁核心点选择；主干/桥/环线在步 2b 迁入）。
 *
 * chooseCore 从 buildPlan 逐字迁出：25×25 网格打分（离岸 0.32R、离山脊远、靠河、种子抖动）。
 * random 为无状态键控哈希，迁移不改调用序；行为保持由基线哈希证明。
 */
import { DetMath as Math } from "../detMath";
import { fbm } from "../cityNoise";
import { segmentDistance, type Landmark } from "../cityPlan";
import type { CityLayout, PublicSite, Vec2 } from "../cityLayout";
import { addNetworkEdge, keyOf, type Network } from "./network";
import { chordClearsDisc, commitFixedLink, reStickClearance, walkableCorridor } from "./connect";
import type { Geography } from "./geography";

/** 环线高架在方位角 t 处的采样点（唯一公式，chooseCore 的成活率估计与 buildSkeleton 共用）。 */
function ringPointAt(core: Vec2, R: number, seed: number, t: number): Vec2 {
  const r = 0.55 * R * (1 + 0.08 * fbm(Math.cos(t) * 1.7, Math.sin(t) * 1.7, seed + 91, 2));
  return { x: core.x + Math.cos(t) * r, z: core.z + Math.sin(t) * r };
}

export function chooseCore(geo: Geography, seed: number, random: (key: string) => number): Vec2 {
  const { R, bbox, buildable, coastDistance, riverX, riverWidth, hasRiver, hillProj, hillLine, riverShift } = geo;
  // ── 城市核心点：可建地上评分最高处——离岸约 0.32R、离山脊远、靠河（有河时）。
  // V2 步 4（§5.4，按普查实证收敛）：核心与广场的联合决定由两半构造——
  // ① 出口接驳弦净空（buildSkeleton）：环线高架不再从广场上空切过，re-stick 不再推走广场；
  // ② 广场落位后核心跟随（cityPlan）：snap 即使推开广场，环岛/放射主干仍围着广场画。
  // 曾试「候选核心硬门（landClearance ≥ 58 + isDry 52）」：civicPlazaCentred 同样归零，但核心被
  // 推离地理最优，四档普查平均分下降（t1 −0.019），不采用——约束已由 ①② 构造成立，见步 4 提交。
  // 环线高架绕核心画：成活判据与生成端同口径（0..96 顺序、不跨首尾合并、run 需连续 ≥6 点）——
  // 统计最长连续成活段，< 6 的核心降分：散点再多也拼不出一段合法高架（§5.4；评审 P2）。
  const ringSurvival = (c: Vec2): number => {
    let longest = 0; let run = 0;
    for (let i = 0; i <= 96; i += 1) {
      const q = ringPointAt(c, R, seed, (i / 96) * Math.PI * 2);
      if (coastDistance(q.x, q.z) > 0 && hillProj(q.x, q.z) < hillLine - 12) { run += 1; if (run > longest) longest = run; }
      else run = 0;
    }
    return longest;
  };
  let core: Vec2 = { x: riverShift, z: 0 };
  let best = -Infinity;
  for (let gx = 0; gx <= 24; gx += 1) for (let gz = 0; gz <= 24; gz += 1) {
    const x = bbox.minX + ((bbox.maxX - bbox.minX) * gx) / 24;
    const z = bbox.minZ + ((bbox.maxZ - bbox.minZ) * gz) / 24;
    if (!buildable(x, z)) continue;
    const shore = coastDistance(x, z);
    const riverGap = hasRiver ? Math.abs(Math.abs(x - riverX(z)) - riverWidth(z) - 70) : 0;
    const score = -Math.abs(shore - 0.32 * R) - riverGap * 0.6 - Math.max(0, hillProj(x, z) - hillLine * 0.4) * 0.8 + random(`core${gx}:${gz}`) * 8;
    const total = score - (ringSurvival({ x, z }) < 6 ? 40 : 0);
    if (total > best) { best = total; core = { x, z }; }
  }
  return core;
}

/**
 * 骨架生成（CITY_PLANNER_V2_SPEC §5.1 / 步 2b-full）：主干放射（含最窄处过河）、环线高架（含修剪与出口接入）。
 * 从 buildPlan 逐字迁出；random 为无状态键控哈希、迁移不改调用序，行为保持由基线哈希证明。
 * 输入全是数据（geography/core/sites/network），输出 { trunks, bridges, ringRuns }—— highwayRuns 即 ringRuns 的别名（原样保留在 buildPlan）。
 */

export type TrunkRun = { angle: number; points: Vec2[] };

export function buildSkeleton(opts: {
  geo: Geography; seed: number; core: Vec2;
  publicSites: PublicSite[]; landmarks: Landmark[];
  shoreSiteKinds: Set<string>;
  random: (key: string) => number;
  network: Network;
  /** buildPlan 的河道闭包（含 coastDistance>0 短路）——geography 阶段尚未收编，先作参数。 */
  inRiver: (x: number, z: number) => boolean;
}): { trunks: TrunkRun[]; bridges: CityLayout["bridges"]; ringRuns: Vec2[][] } {
  const { geo, seed, core, publicSites, landmarks, random, network } = opts;
  const SHORE_SITE_KINDS = opts.shoreSiteKinds;
  const { R, hasRiver, coastDistance, hillDir, hillProj, hillLine, buildable } = geo;
  const { inRiver } = opts;
  const { edges } = network;
  const key = keyOf;
  const addEdge = (a: Vec2, b: Vec2, arterial: boolean, bridge = false, primary = false) => addNetworkEdge(network, a, b, arterial, bridge, primary);
  // 市政广场（核心处，半径 44）外环路半径：主干道都接在这一圈上，广场四周是路、中间不走车。
  const PLAZA_RING = 52;
  // 主干道：5–6 条，均分方位 + 抖动；指向山脊的方向（与山脊方位夹角 < 40°）不修路。
  const trunkCount = 5 + Math.floor(random("trunks") * 2);
  const trunkBase = random("trunkBase") * Math.PI * 2;
  const trunks: Array<{ angle: number; points: Vec2[] }> = [];
  const bridges: CityLayout["bridges"] = [];
  for (let i = 0; i < trunkCount; i += 1) {
    const nominal = trunkBase + (i / trunkCount) * Math.PI * 2 + (random(`trunkJ${i}`) - 0.5) * 0.35;
    // 桥址取最窄处（规划旧债 D-桥址，CITY_ROAD_SIMULATION_PROPOSAL §1）：主干道是从核心出发的射线，过河位置
    // 曾由抖动角度偶然决定。在 ±0.14 弧度内选过河跨距最短的角度；跨距相同取偏移最小者，尽量不动原规划。
    const waterSpan = (a: number) => {
      const d = { x: Math.cos(a), z: Math.sin(a) };
      let span = 0; let entered = false;
      for (let step = Math.ceil(PLAZA_RING / 12) + 1; step < 400; step += 1) {
        const q = { x: core.x + d.x * step * 12, z: core.z + d.z * step * 12 };
        if (inRiver(q.x, q.z)) { span += 12; entered = true; continue; }
        if (entered || coastDistance(q.x, q.z) <= 0) break;
      }
      return span;
    };
    let angle = nominal;
    if (hasRiver) {
      let best = { offset: 0, span: waterSpan(nominal) };
      if (best.span > 0) for (let k = -7; k <= 7; k += 1) {
        const offset = k * 0.02; const span = waterSpan(nominal + offset);
        if (span > 0 && (span < best.span || (span === best.span && Math.abs(offset) < Math.abs(best.offset)))) best = { offset, span };
      }
      angle = nominal + best.offset;
    }
    const dir = { x: Math.cos(angle), z: Math.sin(angle) };
    if (dir.x * hillDir.x + dir.z * hillDir.z > Math.cos((40 * Math.PI) / 180)) continue;
    // 主干道从市政广场外环出发（环形广场 = 环岛），不再穿过广场中心。
    const start = { x: core.x + dir.x * PLAZA_RING, z: core.z + dir.z * PLAZA_RING };
    const points: Vec2[] = [start];
    let water = 0;
    let lastLand: Vec2 = start;
    let farBank = 0;
    for (let step = Math.ceil(PLAZA_RING / 12) + 1; step < 400; step += 1) {
      const q = { x: core.x + dir.x * step * 12, z: core.z + dir.z * step * 12 };
      if (inRiver(q.x, q.z)) {
        // 入水前的最后一个陆地点作为桥头（曾用「每 3 步才记一次」的上一个路点，桥头最多退回岸上 36）。
        if (water === 0 && points[points.length - 1] !== lastLand) points.push(lastLand);
        water += 12; if (water > 140) break; continue; // 河：最多跨 140
      }
      // Riverbank setbacks are not obstacles to a road crossing the river.
      if (coastDistance(q.x, q.z) <= 0 || hillProj(q.x, q.z) >= hillLine - 12) break;
      // 岸边用地（港口/灯塔/歌剧院/摩天轮）：主干道到它门口为止，这一段就是它的入口路。
      // 曾一路穿过去直到海边（港口中心离主干道 1 单位）。
      if (water === 0 && [...publicSites, ...landmarks].some((site) => SHORE_SITE_KINDS.has(site.kind) && Math.hypot(q.x - site.x, q.z - site.z) < site.radius + 4)) {
        if (points[points.length - 1] !== lastLand) points.push(lastLand);
        break;
      }
      if (water > 0) {
        // 对岸退界最多再铺 3 步（36）桥面就落地：曾一直延伸到「可建设」地块为止——对岸是一长条不可建的
        // 低地/海岸带时，「桥」在干地上又铺了两百多单位（扩到 1 档 2000 栋的大岛后 seed 2175747322 实测）。
        if (!buildable(q.x, q.z) && farBank < 3) { farBank += 1; continue; }
        farBank = 0;
        // 刚过完河：把对岸点接上，这一段是桥。
        const from = points[points.length - 1];
        bridges.push({ from, to: q, angle: Math.atan2(q.z - from.z, q.x - from.x), length: Math.hypot(q.x - from.x, q.z - from.z) });
        addEdge(from, q, true, true, true);
        points.push(q);
        water = 0;
        continue;
      }
      lastLand = q;
      if (step % 3 === 0) points.push(q);
    }
    if (points.length < 3) continue;
    for (let k = 1; k < points.length; k += 1) {
      const isBridge = bridges.some((bridge) => bridge.to === points[k]);
      if (!isBridge) addEdge(points[k - 1], points[k], true, false, true);
    }
    trunks.push({ angle, points });
  }
  trunks.sort((p, q) => p.angle - q.angle);
  // 广场环路：经过每条主干道的起点，其余按 24 等分补点；跨河/不可建的弧段不修。
  {
    const angles = [...trunks.map((t) => ((t.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)),
      ...Array.from({ length: 24 }, (_, i) => (i / 24) * Math.PI * 2)].sort((a, b) => a - b)
      .filter((a, i, all) => i === 0 || a - all[i - 1] > 0.08);
    const ringPoint = (a: number) => {
      const trunk = trunks.find((t) => Math.abs((((t.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - a) < 1e-9);
      return trunk ? trunk.points[0] : { x: core.x + Math.cos(a) * PLAZA_RING, z: core.z + Math.sin(a) * PLAZA_RING };
    };
    for (let i = 0; i < angles.length; i += 1) {
      const a = ringPoint(angles[i]); const b = ringPoint(angles[(i + 1) % angles.length]);
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      if (inRiver(mid.x, mid.z) || inRiver(a.x, a.z) || inRiver(b.x, b.z) || coastDistance(mid.x, mid.z) <= 0) continue;
      addEdge(a, b, true);
    }
  }
  // 环线高架：半径 0.55R ± fbm，河流/河岸连续跨越，仅出海或进山时断开。
  const ringRuns: Vec2[][] = [];
  let run: Vec2[] = [];
  for (let i = 0; i <= 96; i += 1) {
    const t = (i / 96) * Math.PI * 2;
    const q = ringPointAt(core, R, seed, t);
    if (coastDistance(q.x, q.z) > 0 && hillProj(q.x, q.z) < hillLine - 12) run.push(q);
    else { if (run.length >= 6) ringRuns.push(run); run = []; }
  }
  if (run.length >= 6) ringRuns.push(run);
  // Highway fragments stop at the coast today, where the deck still hangs above
  // the ground. Trim each end to buildable land, then connect it to a nearby arterial.
  // 批次 5-2：出口接驳弦的净空/可走校验改走连接器共享的 corridor validator（connect.ts），
  // 不再当 69 特例——公式同源（re-stick 净空 5.25 + hypot(88,88)/2 + 1，向上取整 = 69）。
  // 落点的拆边经 commitFixedLink 事务提交（保持历史「强制 arterial」口径以不动基线）。
  const chordClearance = reStickClearance(88, 88); // 88 = 高架双车道幅面（clearsHighways 同尺寸）
  for (let r = ringRuns.length - 1; r >= 0; r -= 1) {
    const points = ringRuns[r];
    if (Math.hypot(points[0].x - points[points.length - 1].x, points[0].z - points[points.length - 1].z) < 0.01) continue;
    const safe = (p: Vec2) => buildable(p.x, p.z);
    while (points.length > 6 && !safe(points[0])) points.shift();
    while (points.length > 6 && !safe(points[points.length - 1])) points.pop();
    if (points.length <= 6) { ringRuns.splice(r, 1); continue; }
    const exits: Vec2[] = [];
    for (const end of [points[0], points[points.length - 1]]) {
      const candidates: Array<{ p: Vec2; distance: number }> = [];
      for (const edge of edges.values()) {
        if (edge.bridge) continue;
        const [a, b] = edge.points;
        const dx = b.x - a.x; const dz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((end.x - a.x) * dx + (end.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
        const p = key({ x: a.x + t * dx, z: a.z + t * dz });
        if (Math.hypot(p.x - core.x, p.z - core.z) < 110) continue; // 出口不能落在环岛附近：高架贴到市政广场（半径 44 + 避让 ≈ 69）会把广场推离核心点
        if (!chordClearsDisc(end, p, core, chordClearance)) continue; // 出口接驳弦本身也不得切近广场：端点 ≥110 不够，弦可从核心旁切过（seed 2002199309 实测弦离核心 56.7，把广场推走 72）；69 = re-stick 净空刚过线
        const distance = Math.hypot(p.x - end.x, p.z - end.z);
        if (walkableCorridor(geo, end, p)) candidates.push({ p, distance });
      }
      candidates.sort((a, b) => a.distance - b.distance);
      if (candidates[0]) exits.push(candidates[0].p);
    }
    if (exits.length !== 2) { ringRuns.splice(r, 1); continue; }
    ringRuns[r] = [exits[0], ...points, exits[1]].filter((p, i, all) => i === 0 || Math.hypot(p.x - all[i - 1].x, p.z - all[i - 1].z) > 0.01);
    for (const endpoint of exits) {
      const hosts = [...edges.values()].filter((edge) => !edge.bridge && segmentDistance(endpoint, edge.points[0], edge.points[1]) <= 0.02);
      const patchOps = hosts.flatMap((edge) => [
        { a: edge.points[0], b: endpoint, arterial: true },
        { a: endpoint, b: edge.points[1], arterial: true },
      ]);
      if (hosts.length) {
        edges.delete(hosts[0].id); // 多条宿主边同点拆分时逐条事务提交（与历史顺序一致）
        commitFixedLink({ network, geo, inRiver, reservations: () => [] }, patchOps.slice(0, 2));
        for (let h = 1; h < hosts.length; h += 1) {
          edges.delete(hosts[h].id);
          commitFixedLink({ network, geo, inRiver, reservations: () => [] }, [
            { a: hosts[h].points[0], b: endpoint, arterial: true },
            { a: endpoint, b: hosts[h].points[1], arterial: true },
          ]);
        }
      }
    }
  }
  return { trunks, bridges, ringRuns };
}
