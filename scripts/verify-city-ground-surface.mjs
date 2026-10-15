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
  assert.ok(compiled.unresolved.includes("boundary-union-and-portals"));
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
for (const [name, layout] of groundSurfaceFixtures()) {
  const compiled = compileGroundRoadSurface(layout);
  assert.equal(groundGeometryDigest(compiled.layers), baseline.fixtures[name], `${name}: render geometry changed from pre-refactor source`);
  inspect(compiled);
  assertGroundRoadSurfaceMatches(compiled, layout);
  assert.throws(() => assertGroundRoadSurfaceMatches(compiled, { ...layout, extent: layout.extent + 1 }), /ground-surface-layout-mismatch/);
  const again = compileGroundRoadSurface(layout);
  assert.equal(groundGeometryDigest(again.layers), groundGeometryDigest(compiled.layers));
  assert.equal(JSON.stringify(again.pieces), JSON.stringify(compiled.pieces));
}
console.log("Ground surface: nine pre-refactor buffer baselines, semantic ownership, exact Float32 triangle views, deterministic IDs and pure import boundary passed.");

if (process.argv.includes("--cities")) {
  const { loadCity, cachedPlan } = await import("./city-kit/index.mjs");
  const { createCityPlan } = await loadCity({ "engine/cityPlan.ts": ["createCityPlan"] });
  for (const seed of [1, 7, 42, 2026, 65537]) for (const tier of [1, 2, 3]) {
    const plan = cachedPlan(createCityPlan, seed, tier);
    const compiled = compileGroundRoadSurface(plan);
    assert.equal(groundGeometryDigest(compiled.layers), baseline.generatedPlans[`${seed}/${tier}`], `seed ${seed}, tier ${tier}: pre-extraction buffer parity`);
    inspect(compiled);
    console.log(`Ground surface: seed ${seed}, planning tier ${tier}: ${compiled.pieces.length} semantic pieces, GPU/CPU parity passed.`);
  }
  console.log("15 generated planning layouts passed; this is not the 0/90/500-session display-pruning or driving passability audit.");
}
