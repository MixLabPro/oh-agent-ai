/** Distance from a point to the nearest ordinary ground carriageway (negative inside it). CPU-only.
 * Scenery placers use it to keep solids off real roads; it is the same render-edge set and junction
 * plan the road compiler draws (bridges and decks excluded — they have their own clearance rules).
 * 只量边的矩形带不够：锐角路口的转角扇面能伸出节点 30 多（90/1 真机：街景立面落在这样一块扇面上，
 * 离最近的边带还有 6.5），所以转角扇面与渐变段轮廓也算路面。 */
import type { RoadEdge, Vec2 } from "../cityLayout";
import { cornerArc, renderRoadEdges, roadJunctionPlan, taperOutline } from "../cityRoadJunctions";

type Ground = { edges: RoadEdge[]; polygons: Vec2[][] };
const cache = new WeakMap<object, Ground>();

function groundOf(roadEdges: readonly RoadEdge[]): Ground {
  let ground = cache.get(roadEdges);
  if (ground) return ground;
  const rendered = renderRoadEdges(roadEdges as RoadEdge[]);
  const polygons: Vec2[][] = [];
  for (const junction of roadJunctionPlan(rendered)) {
    const node = { x: junction.x, z: junction.z };
    for (const corner of junction.corners) polygons.push([node, ...cornerArc(corner, 0)]);
    if (junction.taper) polygons.push(taperOutline(junction, 0));
  }
  ground = { edges: rendered.filter((e) => !e.bridge && e.structure !== "deck"), polygons };
  cache.set(roadEdges, ground);
  return ground;
}

function segmentDistance(x: number, z: number, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dz = b.z - a.z, ll = dx * dx + dz * dz;
  const t = ll === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / ll));
  return Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
}

export function groundRoadClearance(roadEdges: readonly RoadEdge[] | undefined, x: number, z: number): number {
  if (!Array.isArray(roadEdges)) return Infinity;
  const ground = groundOf(roadEdges);
  let best = Infinity;
  for (const edge of ground.edges) for (let i = 1; i < edge.points.length; i += 1)
    best = Math.min(best, segmentDistance(x, z, edge.points[i - 1], edge.points[i]) - edge.width / 2);
  for (const polygon of ground.polygons) {
    let inside = false, edgeDistance = Infinity;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
      const a = polygon[j], b = polygon[i];
      if ((a.z > z) !== (b.z > z) && x < a.x + ((z - a.z) * (b.x - a.x)) / (b.z - a.z)) inside = !inside;
      edgeDistance = Math.min(edgeDistance, segmentDistance(x, z, a, b));
    }
    best = Math.min(best, inside ? -edgeDistance : edgeDistance);
  }
  return best;
}
