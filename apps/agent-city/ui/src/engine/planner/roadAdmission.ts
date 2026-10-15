/** New arterial candidates use the same real-polyline relation as final verification. */
import { DetMath as Math } from "../detMath";
import type { RoadEdge, Vec2 } from "../cityLayout";
import { keyOf } from "./network";
import { crowdedPolylinePair } from "./relations";

export function roadCandidateCrowding(accepted: readonly RoadEdge[], candidates: readonly { a: Vec2; b: Vec2; arterial: boolean }[]):
  { candidateIndex: number; hostId: string } | null {
  const roads = accepted.filter((edge) => !edge.bridge && edge.kind === "arterial");
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    if (!candidate.arterial) continue;
    const a = keyOf(candidate.a), b = keyOf(candidate.b), from = `${a.x}:${a.z}`, to = `${b.x}:${b.z}`;
    const proposed: RoadEdge = { id: [from, to].sort().join("/"), from, to, width: 8, kind: "arterial", points: [a, b] };
    for (const road of roads) {
      if ([from, to].some((id) => id === road.from || id === road.to)) continue;
      // Long accepted roads may be split at later junctions. Probe their actual
      // corridor now, so subdivision cannot reveal a conflict after block publication.
      const sampled = (points: Vec2[]) => points.flatMap((p, k) => {
        if (!k) return [p];
        const a = points[k - 1], count = Math.ceil(Math.hypot(p.x - a.x, p.z - a.z) / 10);
        return Array.from({ length: count }, (_, j) => ({ x: a.x + (p.x - a.x) * (j + 1) / count, z: a.z + (p.z - a.z) * (j + 1) / count }));
      });
      if (crowdedPolylinePair(proposed.points, road.points)
        || crowdedPolylinePair(proposed.points, sampled(road.points))) return { candidateIndex: i, hostId: road.id };
    }
    roads.push(proposed);
  }
  return null;
}
