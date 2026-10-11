import assert from "node:assert/strict";
import { loadCity } from "./city-kit/index.mjs";
const { resolveModelEnvelope, inspectEnvelopeRoad, inspectEnvelopePair, footprintUnionDistance, footprintPolylineDistance } = await loadCity({
  "engine/planner/modelEnvelope.ts": ["resolveModelEnvelope", "inspectEnvelopeRoad", "inspectEnvelopePair", "footprintUnionDistance", "footprintPolylineDistance"],
});
const p = (x, z) => ({ x, z });
const rect = (x, z, width = 2, depth = 2) => ({ parts: [{ shape: "rect", center: p(x, z), width, depth }] });
const circle = (x, z, radius) => ({ parts: [{ shape: "circle", center: p(x, z), radius }] });
assert.equal(footprintUnionDistance(rect(0, 0), rect(5, 0)), 3);
assert.equal(footprintUnionDistance(rect(0, 0), rect(0, 0)), 0);
assert.equal(footprintUnionDistance(circle(0, 0, 1), rect(5, 0)), 3);
assert.equal(footprintPolylineDistance(rect(0, 0), [p(-100, 50), p(-50, 50), p(0, 0)]), 0);
assert.equal(footprintPolylineDistance(rect(0, 0), [p(-10, 5), p(10, 5)]), 4);
assert.equal(footprintPolylineDistance(rect(0, 0), [p(5, 0)]), 4);
for (const bad of [{ parts: [] }, { parts: [{ shape: "circle", center: p(0, 0), radius: -1 }] },
  { parts: [{ shape: "convex", vertices: [p(0, 0), p(2, 0), p(1, 1), p(2, 2), p(0, 2)] }] },
  { parts: [{ shape: "rect", center: p(NaN, 0), width: 2, depth: 2 }] },
  { parts: Array(100).fill(rect(0, 0).parts[0]) }]) assert(Number.isNaN(footprintUnionDistance(bad, rect(0, 0))));
assert(Number.isNaN(footprintPolylineDistance(rect(0, 0), [p(NaN, 0)])));
const owner = { id: "landmark:villa-complex", kind: "villa-complex", x: 0, z: 0, yaw: 0, radius: 34 };
const before = JSON.stringify(owner), envelope = resolveModelEnvelope(owner);
assert.equal(envelope.status, "partial"); assert.equal(envelope.wholeModelReady, false);
assert.equal(JSON.stringify(owner), before);
assert.equal(envelope.plotReservation.semantic, "nominal-plot-reservation");
assert.equal(inspectEnvelopePair(owner, { ...owner, id: "other-villa" }).entity.relation, "conflict", "zero requested setback cannot exempt overlapping entities");
assert.equal(inspectEnvelopePair(owner, { ...owner, id: "far-villa", x: 200 }).entity.relation, "clear");
assert.equal(inspectEnvelopeRoad(owner, { width: 12, points: [p(-100, 0), p(100, 0)] }).entity.relation, "conflict");
assert.equal(inspectEnvelopeRoad(owner, { width: 12, points: [p(-100, 100), p(100, 100)] }).entity.relation, "clear");
assert.equal(inspectEnvelopeRoad(owner, { width: 12, points: [p(0, NaN), p(100, 0)] }).status, "unsupported");
const unknown = { ...owner, kind: "unregistered-model" };
assert.equal(inspectEnvelopePair(owner, unknown).status, "unsupported");
assert.equal(inspectEnvelopePair(owner, unknown).proxySemantic, "actual-projection-and-nominal-plot");
assert.equal(resolveModelEnvelope({ ...unknown, radius: 0 }).status, "unsupported");
const rotate = point => p(point.z, -point.x);
const road = { width: 8, points: [p(-100, 100), p(0, 0), p(100, 100)] };
const original = inspectEnvelopeRoad(owner, road);
const transformed = inspectEnvelopeRoad({ ...owner, yaw: Math.PI / 2 }, { ...road, points: road.points.map(rotate) });
assert.equal(transformed.entity.relation, original.entity.relation);
assert(Math.abs(transformed.entity.distance - original.entity.distance) < 1e-9);
console.log("City model envelope: true unions/rotation/whole polylines, separate nominal plots, zero-setback overlap refusal, unknown coverage and bounded malformed geometry rejection passed. XY facts remain partial, not foundation/entrance admission.");
