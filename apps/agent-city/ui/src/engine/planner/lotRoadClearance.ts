/** Exact rectangle/capsule admission on every accepted polyline segment. */
import type { RoadEdge } from "../cityLayout";
import { orientedRectPolygon, segmentToPolygonDistance, type OrientedRect } from "./footprint";

export function lotClearsRoads(lot: OrientedRect, roads: readonly RoadEdge[]): boolean {
  if (![lot.x, lot.z, lot.yaw, lot.width, lot.depth].every(Number.isFinite) || lot.width <= 0 || lot.depth <= 0) return false;
  // footprint's planar convention is opposite to renderer rotationY.
  const polygon = orientedRectPolygon({ ...lot, yaw: -lot.yaw });
  return roads.every(edge => Number.isFinite(edge.width) && edge.width > 0 && edge.points.length >= 2
    && edge.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.z))
    && edge.points.slice(1).every((b, i) => segmentToPolygonDistance(edge.points[i], b, polygon) >= edge.width / 2 + 0.5));
}
