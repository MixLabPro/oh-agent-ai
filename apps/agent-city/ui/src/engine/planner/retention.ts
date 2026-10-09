/** 展示裁剪的必要路径：仅恢复已接受的规划边，按实际折线长度，不创造几何捷径。 */
import { DetMath as Math } from "../detMath";
import type { RoadEdge } from "../cityLayout";

export type RetentionReport = { keep: Set<string>; restored: string[]; unresolved: string[]; anchorMissing: boolean };

export function preserveDemandPaths(edges: readonly RoadEdge[], selected: ReadonlySet<string>, anchor: string | null, required: readonly string[]): RetentionReport {
  const keep = new Set(selected);
  const adjacency = new Map<string, RoadEdge[]>();
  for (const edge of edges) for (const id of [edge.from, edge.to]) {
    const list = adjacency.get(id) ?? []; list.push(edge); adjacency.set(id, list);
  }
  const demands = [...new Set(required)].sort();
  if (!anchor || !adjacency.has(anchor)) return { keep, restored: [], unresolved: demands, anchorMissing: true };
  for (const list of adjacency.values()) list.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const distance = new Map<string, number>([[anchor, 0]]);
  const back = new Map<string, { previous: string; edge: string }>();
  const settled = new Set<string>();
  // 有限图、确定性 Dijkstra；无墙钟预算，等长按节点/边 id 固定选择。
  while (true) {
    let next: string | null = null; let cost = Infinity;
    for (const [id, d] of distance) if (!settled.has(id) && (d < cost || (d === cost && (next === null || id < next)))) { next = id; cost = d; }
    if (next === null) break;
    settled.add(next);
    for (const edge of adjacency.get(next) ?? []) {
      const to = edge.from === next ? edge.to : edge.from;
      if (settled.has(to)) continue;
      const length = edge.points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - edge.points[i].x, p.z - edge.points[i].z), 0);
      if (!Number.isFinite(length) || length <= 0) continue;
      const total = cost + length; const prior = distance.get(to) ?? Infinity;
      if (total < prior || (total === prior && edge.id < (back.get(to)?.edge ?? "\uffff"))) {
        distance.set(to, total); back.set(to, { previous: next, edge: edge.id });
      }
    }
  }
  const unresolved: string[] = [];
  const reachable = () => {
    const seen = new Set([anchor]); const queue = [anchor];
    for (let i = 0; i < queue.length; i += 1) for (const edge of adjacency.get(queue[i]) ?? []) {
      if (!keep.has(edge.id)) continue;
      const next = edge.from === queue[i] ? edge.to : edge.from;
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
    return seen;
  };
  let covered = reachable();
  // 已被保留图接通的需求不再恢复第二条路；每个剩余分量优先使用距锚点最短的成员。
  for (const demand of [...demands].sort((a, b) => (distance.get(a) ?? Infinity) - (distance.get(b) ?? Infinity) || (a < b ? -1 : a > b ? 1 : 0))) {
    if (covered.has(demand)) continue;
    if (!settled.has(demand)) { unresolved.push(demand); continue; }
    for (let cursor = demand; cursor !== anchor;) {
      const step = back.get(cursor)!; keep.add(step.edge); cursor = step.previous;
    }
    covered = reachable();
  }
  // 即使空城也保留真实锚点，不以 first-wide-road 或隐式不存在节点代替。
  if (![...keep].some((id) => adjacency.get(anchor)?.some((e) => e.id === id))) keep.add(adjacency.get(anchor)![0].id);
  return { keep, restored: [...keep].filter((id) => !selected.has(id)).sort(), unresolved: unresolved.sort(), anchorMissing: false };
}
