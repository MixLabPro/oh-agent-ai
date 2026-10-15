#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { groundSurfaceFixtures, groundGeometryDigest } from "./city-kit/ground-surface-fixtures.mjs";
const require = createRequire(new URL("../apps/agent-city/ui/package.json", import.meta.url));
const { buildSync } = require("esbuild");
const built = buildSync({ entryPoints: [new URL("../apps/agent-city/ui/src/engine/surface/groundRoadCompiler.ts", import.meta.url).pathname], bundle: true, write: false, platform: "node", format: "cjs", metafile: true });
for (const input of Object.keys(built.metafile.inputs)) {
  assert.ok(!/node_modules|engine\/systems|host\.ts|cityPlan\.ts|cityLayout\.ts|\/data\//.test(input), `CPU compiler leaked runtime dependency ${input}`);
}
const mod = { exports: {} }; vm.runInNewContext(built.outputFiles[0].text, { module: mod, exports: mod.exports });
const { compileGroundRoadSurface, groundPieceTriangles, assertGroundRoadSurfaceMatches } = mod.exports;
const baseline = JSON.parse(readFileSync(new URL("../fixtures/city-driving/ground-surface-baseline.json", import.meta.url), "utf8"));
const inspect = (compiled) => {
  assert.equal(compiled.readiness, "geometry-only");
  assert.deepEqual([...compiled.unresolved], ["validated-portals", "channelized-islands", "bridge-and-expressway-decks", "cul-de-sac-surfaces"]);
  const ids = new Set(); const coverage = compiled.layers.map((layer) => new Uint8Array(layer.index.length));
  for (const piece of compiled.pieces) {
    assert.ok(!ids.has(piece.id)); ids.add(piece.id);
    assert.ok(piece.indexCount > 0 && piece.indexCount % 3 === 0);
    assert.equal(piece.kind === "sidewalk", piece.layer === 0);
    if (piece.kind === "junction") assert.equal(piece.layer, 1);
    const { positions, indices } = groundPieceTriangles(compiled, piece);
    const layer = compiled.layers[piece.layer];
    assert.ok([...positions].every(Number.isFinite));
    for (let i = 0; i < indices.length; i++) {
      assert.ok(indices[i] < piece.vertexCount);
      const sourceIndex = layer.index[piece.firstIndex + i];
      for (let axis = 0; axis < 3; axis++) assert.equal(positions[indices[i] * 3 + axis], Math.fround(layer.positions[sourceIndex * 3 + axis]), "physics view must use exact GPU quantization");
      coverage[piece.layer][piece.firstIndex + i]++;
    }
  }
  for (const layer of coverage) assert.ok([...layer].every((n) => n === 1), "each rendered triangle has exactly one semantic owner");
  assert.throws(() => groundPieceTriangles(compiled, { ...compiled.pieces[0] }), /foreign-ground-piece/);
};
assert.deepEqual(Object.keys(baseline.corrected.fixtures).sort(), ["closed-loop", "wavy-tee"], "only non-flat/closed fixtures may differ from the pre-refactor renderer");
const kit = await import("./city-kit/index.mjs");
const { terrainSurfaceHeight, extractMeshBoundaries, ROAD_SURFACE_LIFT } = await kit.loadCity({
  "engine/surface/terrainSampling.ts": ["terrainSurfaceHeight"], "engine/surface/meshBoundaries.ts": ["extractMeshBoundaries"], "engine/surface/groundRoadCompiler.ts": ["ROAD_SURFACE_LIFT"] });
/** Independent of the compiler's own deviation function: dense barycentric samples of every
 * Float32 triangle against the rendered terrain, plus manifold boundaries for every piece. */
const fitAndTopology = (name, compiled, layout, samples = 5) => {
  const tolerance = ROAD_SURFACE_LIFT / 2; let worst = 0; const unresolved = [];
  for (const piece of compiled.pieces) {
    assert.ok(piece.terrainDeviation <= tolerance + 1e-12, `${name}: ${piece.id} reports terrain deviation ${piece.terrainDeviation}`);
    const { positions: v, indices } = groundPieceTriangles(compiled, piece);
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [indices[t] * 3, indices[t + 1] * 3, indices[t + 2] * 3];
      for (let i = 0; i <= samples; i++) for (let j = 0; j <= samples - i; j++) {
        const wa = i / samples, wb = j / samples, wc = 1 - wa - wb;
        const x = wa * v[a] + wb * v[b] + wc * v[c], z = wa * v[a + 2] + wb * v[b + 2] + wc * v[c + 2], y = wa * v[a + 1] + wb * v[b + 1] + wc * v[c + 1];
        worst = Math.max(worst, Math.abs(y - terrainSurfaceHeight(layout, x, z) - ROAD_SURFACE_LIFT));
      }
    }
    if (extractMeshBoundaries(v, indices).status !== "complete") unresolved.push(piece);
  }
  // Float32 positions add ~1e-5 at these heights; the compiler bound is exact in float64.
  assert.ok(worst <= tolerance + 1e-4, `${name}: sampled terrain deviation ${worst.toFixed(4)} > ${tolerance}`);
  assert.deepEqual(unresolved.filter((p) => p.kind !== "sidewalk").map((p) => p.id), [], `${name}: drivable pieces must have manifold boundaries`);
  return { worst, sidewalkUnresolved: unresolved.length };
};
{
  // Terrain alternating by grid vertex: a chord's midpoint can sit exactly on the linear
  // interpolation while its quarter points are 0.25 off — the old midpoint test accepted it.
  const cell = 400 / 192;
  const zigzag = { height: (x) => 2 + 0.5 * (((Math.round((x + 200) / cell) % 2) + 2) % 2) };
  const edge = (id, from, to, a, b, width = 8) => ({ id, from, to, points: [a, b], width, kind: width >= 8 ? "arterial" : "local", bridge: false });
  const zig = { extent: 400, terrain: zigzag, roadEdges: [edge("w", "w", "o", { x: -60, z: 0.3 }, { x: 0, z: 0.3 }), edge("e", "o", "e", { x: 0, z: 0.3 }, { x: 60, z: 0.3 })] };
  const compiledZig = compileGroundRoadSurface(zig);
  assert.ok(compiledZig.pieces.some((p) => p.vertexCount > 8), "kinked terrain is followed, not bridged");
  fitAndTopology("zigzag", compiledZig, zig);
  // A 1.4 stub after a 64° bend: the mitred inner corner reaches past the stub end (seed 7 tier 1).
  const turn = 64 * Math.PI / 180;
  const stub = { extent: 400, terrain: { height: () => 2 }, roadEdges: [
    edge("s", "a", "b", { x: 0, z: 0 }, { x: 1.4, z: 0 }, 5),
    edge("l", "b", "c", { x: 1.4, z: 0 }, { x: 1.4 + 40 * Math.cos(turn), z: 40 * Math.sin(turn) }, 5)] };
  fitAndTopology("stub-bend", compileGroundRoadSurface(stub), stub);
  // Closed loop welds into a ring: one outer loop plus one hole per carriageway.
  const [, loop] = groundSurfaceFixtures().find(([n]) => n === "closed-loop");
  const ring = compileGroundRoadSurface(loop);
  for (const piece of ring.pieces.filter((p) => p.kind === "carriageway")) {
    const { positions, indices } = groundPieceTriangles(ring, piece);
    const b = extractMeshBoundaries(positions, indices);
    assert.equal(b.status, "complete"); assert.deepEqual(b.loops.map((l) => l.hole).sort(), [false, true], "closed run welds at its seam");
  }
}
for (const [name, layout] of groundSurfaceFixtures()) {
  const compiled = compileGroundRoadSurface(layout);
  // Flat fixtures must still equal the pre-refactor renderer byte for byte; the two that the
  // terrain-conforming fix deliberately changed are pinned in baseline.corrected with the reason.
  const expected = baseline.corrected.fixtures[name] ?? baseline.fixtures[name];
  assert.equal(groundGeometryDigest(compiled.layers), expected, `${name}: render geometry changed (${name in baseline.corrected.fixtures ? "corrected" : "pre-refactor"} baseline)`);
  fitAndTopology(name, compiled, layout);
  inspect(compiled);
  assertGroundRoadSurfaceMatches(compiled, layout);
  assert.throws(() => assertGroundRoadSurfaceMatches(compiled, { ...layout, extent: layout.extent + 1 }), /ground-surface-layout-mismatch/);
  const again = compileGroundRoadSurface(layout);
  assert.equal(groundGeometryDigest(again.layers), groundGeometryDigest(compiled.layers));
  assert.equal(JSON.stringify(again.pieces), JSON.stringify(compiled.pieces));
}
console.log("Ground surface: seven flat pre-refactor buffer baselines + two corrected, exact terrain fit (dense samples), manifold drivable pieces, kinked terrain, stub bend, closed-loop seam, semantic ownership, Float32 views, deterministic IDs and pure import boundary passed.");

if (process.argv.includes("--cities")) {
  const { loadCity, cachedPlan } = await import("./city-kit/index.mjs");
  const { createCityPlan } = await loadCity({ "engine/cityPlan.ts": ["createCityPlan"] });
  for (const seed of [1, 7, 42, 2026, 65537]) for (const tier of [1, 2, 3]) {
    const plan = cachedPlan(createCityPlan, seed, tier);
    const compiled = compileGroundRoadSurface(plan);
    assert.equal(groundGeometryDigest(compiled.layers), baseline.corrected.generatedPlans[`${seed}/${tier}`], `seed ${seed}, tier ${tier}: corrected buffer baseline`);
    inspect(compiled);
    const fit = fitAndTopology(`seed ${seed} tier ${tier}`, compiled, plan, 2);
    assert.ok(fit.sidewalkUnresolved <= 1, `seed ${seed} tier ${tier}: ${fit.sidewalkUnresolved} sidewalk pieces without manifold boundary`);
    const vertices = compiled.layers.reduce((n, layer) => n + layer.positions.length / 3, 0);
    console.log(`Ground surface: seed ${seed}, planning tier ${tier}: ${compiled.pieces.length} pieces, ${vertices} vertices, sampled terrain deviation ≤ ${fit.worst.toFixed(4)}, ${fit.sidewalkUnresolved} sidewalk boundary unresolved.`);
  }
  console.log("15 generated planning layouts passed; this is not the 0/90/500-session display-pruning or driving passability audit.");
}
