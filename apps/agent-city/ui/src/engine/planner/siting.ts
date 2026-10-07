import { DetMath as Math } from "../detMath";
import { clearsHighways } from "../cityPlan";
import type { Vec2 } from "../cityLayout";
import type { RepairContext } from "./context";

// 选址后置（CITY_ARCHITECTURE §6 步）：候选表 + 路网后落位。
//
// 原来的流程是「先把用地放在名义位置、再生成路网、再对着路网到处挪」——选址时看不见路，后面每一类违例都得补一个特例修复
// （路穿用地推开、车站贴路、岸边换位……）。这里把「选址」改成对**已经生成好的路网**求解：
//   候选表 candidatesFor(site)  —— 以当前位置为中心，按离原位置从近到远枚举（环形 6..120 步长 6，每圈 20 个方向）；
//   落位判据 acceptable(site, p) —— 同一组条件一次判完：干地、不与别的用地重叠、避开高架/主干、不贴桥头、
//                                   离最近路在 [0.85 半径, 半径+20]（门前有路又不被穿过）；
//   选择                          —— 第一个满足全部条件的候选（即离原位置最近的合法位置）。
// 只对仍然违例的用地启用（入水、重叠），所以对本来就合法的岛零影响。判据与 constraints.ts 的 measure 同口径。

type S = { x: number; z: number; radius: number; kind: string; shore?: Vec2 };

function wetPoints(ctx: RepairContext, s: { radius: number }, x: number, z: number): number {
  let n = 0;
  for (let k = 0; k < 16; k += 1) {
    const t = (k / 16) * Math.PI * 2; const r = k % 2 ? s.radius : s.radius * 0.6;
    const px = x + Math.cos(t) * r; const pz = z + Math.sin(t) * r;
    if (ctx.height(px, pz) < 0.5 || ctx.inRiver(px, pz)) n += 1;
  }
  return n;
}

export function resiteViolatingSites(ctx: RepairContext): number {
  const all = [...ctx.publicSites, ...ctx.landmarks].filter((s) => s.radius) as S[];
  const solid = [...ctx.edges.values()].filter((e) => !e.bridge);
  const nearestRoad = (x: number, z: number) => {
    let d = Infinity;
    for (const e of solid) {
      const [a, b] = e.points; const dx = b.x - a.x; const dz = b.z - a.z; const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
      d = Math.min(d, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
    }
    return d;
  };
  const limit = (s: S) => (ctx.SHORE_SITE_KINDS.has(s.kind) ? 3 : 0);
  const violates = (s: S): boolean => {
    if (s.kind === "harbor" || s.kind === "civic" || s.kind === "arch" || s.shore) return false;
    // 与 constraints.ts siteInWater / sitesOverlap 同口径（此处只看地形高度，不含 inRiver，免得把没违例的岛也动了）
    let wet = 0;
    for (let k = 0; k < 16; k += 1) { const t = (k / 16) * Math.PI * 2; const r = k % 2 ? s.radius : s.radius * 0.6; if (ctx.height(s.x + Math.cos(t) * r, s.z + Math.sin(t) * r) < 0.5) wet += 1; }
    if (wet > (ctx.SHORE_SITE_KINDS.has(s.kind) ? 4 : 0)) return true;
    // 重叠：与 sitesOverlap 同判据（kind 字典序较小的一方被标记）；对方是不能挪的（港口、广场、凯旋门、岛上地标）时，不论字典序都由这一方让开。
    const fixed = (o: S) => o.kind === "harbor" || o.kind === "civic" || o.kind === "arch" || !!o.shore;
    return all.some((o) => o !== s && (o.kind > s.kind || fixed(o)) && Math.hypot(o.x - s.x, o.z - s.z) < o.radius + s.radius);
  };
  const acceptable = (s: S, x: number, z: number): boolean => {
    if (ctx.height(x, z) <= 0.5 || wetPoints(ctx, s, x, z) > limit(s)) return false;
    if (all.some((o) => o !== s && Math.hypot(o.x - x, o.z - z) < o.radius + s.radius)) return false;
    if (!clearsHighways({ x, z }, s.radius * 2, s.radius * 2, ctx.ringRuns)) return false;
    if (ctx.distanceToTrunks({ x, z }) < s.radius * 0.7 || ctx.nearBridgeEnd(x, z, s.radius)) return false;
    const road = nearestRoad(x, z);
    return road >= s.radius * 0.85 && road <= s.radius + 20;
  };
  let moved = 0;
  for (const s of all) {
    if (violates(s)) {
      let chosen: Vec2 | null = null;
      for (let radius = 6; radius <= 120 && !chosen; radius += 6) {
        for (let k = 0; k < 20 && !chosen; k += 1) {
          const a = (k / 20) * Math.PI * 2 + radius * 0.37; // 每圈错开起始角，免得候选排成同一条射线
          const p = { x: s.x + Math.cos(a) * radius, z: s.z + Math.sin(a) * radius };
          if (acceptable(s, p.x, p.z)) chosen = p;
        }
      }
      if (chosen) { s.x = chosen.x; s.z = chosen.z; moved += 1; }
    }
    // 无论是否挪过，都用地标实际底座半径 + 9 清空周边地块——曾只对「挪过的」
    // 用裸 radius 过滤，未挪的地标没有二次清地，会话楼贴到地标底座（如 TV 塔
    // 底座直径 17，地块中心 4.3–9.1 即重叠）。
    for (const block of ctx.blocks) block.parcels = block.parcels.filter((pc) => Math.hypot(pc.x - s.x, pc.z - s.z) >= s.radius + 9);
  }
  return moved;
}
