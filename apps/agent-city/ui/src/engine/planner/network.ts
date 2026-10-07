/**
 * 路网原语（CITY_PLANNER_V2_SPEC §5.1 / 步 2b-lite）：节点/边表与加边、坐标规范化键的唯一实现。
 *
 * 从 buildPlan 逐字迁出（行为由基线哈希证明）。v2 终态是 network 阶段持有它并对外只暴露
 * 纯函数；本步先让 buildPlan 与 RepairContext 共享同一个 Network 对象，替代 addEdge/key 闭包成员
 * （spec D5：闭包杂物袋 → 数据引用）。
 */
import { roadNodeId } from "../cityPlan";
import type { RoadEdge, RoadNode, Vec2 } from "../cityLayout";

export type Network = {
  nodes: Map<string, RoadNode>;
  edges: Map<string, RoadEdge>;
};

export const emptyNetwork = (): Network => ({ nodes: new Map(), edges: new Map() });

/** 坐标取整到 0.01（路网节点的规范化键）。 */
export const keyOf = (p: Vec2) => ({ x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 });

/** 加一条路段（端点取整、同 id 不重复）。 */
export function addNetworkEdge(network: Network, a0: Vec2, b0: Vec2, arterial: boolean, bridge = false, primary = false): void {
  const a = keyOf(a0); const b = keyOf(b0);
  const from = roadNodeId(a); const to = roadNodeId(b); if (from === to) return;
  const id = [from, to].sort().join("/");
  network.nodes.set(from, { ...a, id: from }); network.nodes.set(to, { ...b, id: to });
  if (!network.edges.has(id)) network.edges.set(id, { id, from, to, width: primary ? 12 : arterial ? 8 : 5, kind: arterial ? "arterial" : "local", points: [a, b], bridge });
}
