import type { RoadEdge, Vec2 } from "./cityLayout";

/** Merge degree-two continuations; junctions, bridges and width changes remain boundaries. */
export function roadPaintPlan(edges: RoadEdge[]) {
  const adjacency = new Map<string, RoadEdge[]>();
  for (const edge of edges) for (const node of [edge.from, edge.to]) {
    const list = adjacency.get(node) ?? []; list.push(edge); adjacency.set(node, list);
  }
  const junctions = new Set([...adjacency].filter(([, list]) => list.length >= 3).map(([id]) => id));
  const visited = new Set<string>();
  const runs: Array<{ width: number; kind: RoadEdge["kind"]; points: Vec2[]; from: string; to: string }> = [];
  const continuation = (edge: RoadEdge, node: string) => {
    const list = adjacency.get(node)!;
    if (list.length !== 2) return undefined;
    return list.find((next) => next !== edge && !next.bridge && next.width === edge.width && next.kind === edge.kind);
  };
  const walk = (first: RoadEdge, start: string) => {
    const points: Vec2[] = []; let edge = first; let node = start;
    while (!visited.has(edge.id)) {
      visited.add(edge.id);
      const oriented = edge.from === node ? edge.points : [...edge.points].reverse();
      points.push(...(points.length ? oriented.slice(1) : oriented));
      node = edge.from === node ? edge.to : edge.from;
      const next = continuation(edge, node);
      if (!next || visited.has(next.id)) break;
      edge = next;
    }
    runs.push({ width: first.width, kind: first.kind, points, from: start, to: node });
  };
  const surface = edges.filter((edge) => !edge.bridge);
  // Start at a boundary so a chain is not split at an arbitrary input edge.
  for (const edge of surface) if (!visited.has(edge.id)) {
    if (!continuation(edge, edge.from)) walk(edge, edge.from);
    else if (!continuation(edge, edge.to)) walk(edge, edge.to);
  }
  for (const edge of surface) if (!visited.has(edge.id)) walk(edge, edge.from); // closed loops
  return { runs, junctions };
}
