// Synthetic data only. Actual production scene/instances; no golden refresh,
// browser, physical envelope, placement success or editor readiness claim.
import assert from "node:assert/strict";
import { loadCity } from "./city-kit/index.mjs";
import { installCanvasShim } from "./city-kit/scene-hash.mjs";
installCanvasShim(); globalThis.window ??= globalThis; globalThis.devicePixelRatio ??= 1;
const { buildCityModel, layoutCity, CityParts, MIAMI_COASTAL, classifyLayoutSites, siteClassesForMesh,
  decorKindForName, decorDistrictId, describeDecor } = await loadCity({
  "cityModel.ts": ["buildCityModel"], "engine/cityLayout.ts": ["layoutCity"], "engine/cityParts.ts": ["CityParts"],
  "engine/citySeaside.ts": ["MIAMI_COASTAL"], "engine/models/siteClasses.ts": ["classifyLayoutSites", "siteClassesForMesh"],
  "engine/cityDecor.ts": ["decorKindForName", "decorDistrictId", "describeDecor"],
});
// Independently retain pre-B2 routing (52faeefe), not the new registry's rules.
function legacyRoute(name) {
  if (name.startsWith("city-landmark-")) return `landmark:${name.slice("city-landmark-".length)}`;
  if (name.startsWith("city-civic-")) return "civic";
  if (name.startsWith("city-public-sites-")) return "site";
  if (name.startsWith("city-garden-")) return "garden";
  if (["city-vice-context-facades", "city-vice-context-rooftops"].includes(name)) return "backdrop";
  if (name === "city-massing") return "massing";
  if (["city-lifeguard-towers", "city-yachts", "city-beach-furniture", "city-beach-people", "city-volleyball-courts", "city-promenade-props", "city-marina"].includes(name)) return "seaside";
  if (name === "city-sea-volcano") return "volcano";
  return null;
}
const generatedAt = Date.UTC(2026, 9, 7, 12), harnesses = ["codex", "claude-code", "dsh", "harness:zcode"];
function modelFor(count) {
  const rows = Array.from({ length: count }, (_, index) => ({ session_ref: `session:${index}`, harness: harnesses[index % harnesses.length],
    first_event_at: new Date(generatedAt - (index + 1) * 60000).toISOString(), last_event_at: new Date(generatedAt - index * 60000).toISOString(),
    event_count: 10, model_ids: ["gpt-5"], tokens: { uncached_input_tokens: 2000, cache_read_tokens: 5000,
      cache_write_tokens: 1000, output_tokens: 2000, total: 10000 }, peak_tokens: 3000,
    cost_minor: { amount_minor: 10, currency: "USD", basis: "api_equivalent" }, cost_status: { state: "estimated", reason: "", has_unresolved: false } }));
  return buildCityModel({ rows, findings: [], windowStartMs: generatedAt - 30 * 86400000, windowEndMs: generatedAt,
    windowLabel: "30d", totalSessions: count, truncated: false, generatedAt });
}
for (const count of [380, 1600]) {
  const model = modelFor(count), layout = layoutCity(model, null, 1927, MIAMI_COASTAL, "full");
  const identities = new Set(), rows = classifyLayoutSites(layout), counts = {};
  for (const row of rows) {
    assert.equal(row.classes.length, 1, `${count}/${row.array}/${JSON.stringify(row.raw)}`);
    const id = row.array === "districtLandmarks" ? `district-landmark:${row.raw.districtId}` : row.raw.id;
    assert.equal(typeof id, "string"); assert(id.length); assert(!identities.has(id), `duplicate layout identity: ${id}`); identities.add(id);
    counts[row.array] = (counts[row.array] ?? 0) + 1;
  }
  for (const array of ["civics", "gardens", "districtLandmarks", "contextBuildings", "landmarks", "publicSites"]) assert(counts[array] > 0, `${array} must not be vacuous`);
  const parts = new CityParts(model, layout, null);
  try {
    for (const night of [0, 1]) {
      parts.setNightGlow(night); parts.applySelfLit(0.24);
      const legacyMeshes = [], currentMeshes = [], routes = new Map();
      parts.group.traverse(mesh => {
        if (!mesh.isMesh || !mesh.visible) return;
        let previous = null, current = null;
        for (let node = mesh; node; node = node.parent) {
          previous ??= legacyRoute(node.name); current ??= decorKindForName(node.name);
          if (decorKindForName(node.name)) {
            const matches = siteClassesForMesh(node.name);
            assert.equal(new Set(matches.map(item => item.family)).size, 1, node.name);
          }
        }
        if (previous) legacyMeshes.push(mesh);
        if (current) { currentMeshes.push(mesh); routes.set(mesh, current); }
        if (previous?.startsWith("landmark:district:")) assert.equal(current, "district-landmark");
        else assert.equal(current, previous, `unexpected real mesh route change: ${mesh.name}`);
      });
      assert(currentMeshes.length > 0); assert.deepEqual(currentMeshes, legacyMeshes);
      assert.deepEqual(parts.decorTargets, currentMeshes);
      let civicPieces = 0, districts = 0;
      for (const piece of parts.civicPieces) {
        const civic = layout.civics[piece.civic]; assert(civic);
        const id = parts.decorAt(parts.civicMeshes[piece.mesh], piece.index);
        assert.equal(id, `decor:civic:${civic.kind}#${civic.id}`); assert.equal(describeDecor(id).title, describeDecor(`decor:civic:${civic.kind}`).title);
        civicPieces++;
      }
      for (const [mesh, route] of routes) if (route === "district-landmark") {
        const id = parts.decorAt(mesh), district = decorDistrictId(id);
        assert(layout.districtLandmarks.some(item => item.districtId === district)); districts++;
      }
      assert(civicPieces > 0 && districts > 0);
      console.log(JSON.stringify({ count, night, classifiedInstances: identities.size, counts, pickableMeshes: currentMeshes.length, civicPieces, districtMeshes: districts,
        scope: "actual scene classification/identity; model footprint/height and browser/editor validation pending" }));
    }
  } finally { parts.dispose(); }
}
console.log("City site registry scenes: 380/1600 full-backdrop × day/night instance classification, unchanged pickable mesh set and civic/district identity passed.");
