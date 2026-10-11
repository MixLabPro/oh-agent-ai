import assert from "node:assert/strict";
import fs from "node:fs";
import { citySrc, loadCity } from "./city-kit/index.mjs";
const { SITE_CLASSES, siteClassOf, siteClassesForInstance, classifyLayoutSites, civicMinimumSize,
  GARDEN_MINIMUM_SIZE, DISTRICT_LANDMARK_ENVELOPE } = await loadCity({
  "engine/models/siteClasses.ts": ["SITE_CLASSES", "siteClassOf", "siteClassesForInstance", "classifyLayoutSites"],
  "engine/models/layoutPlacementGeometry.ts": ["civicMinimumSize", "GARDEN_MINIMUM_SIZE", "DISTRICT_LANDMARK_ENVELOPE"],
});
const catalogSource = fs.readFileSync(new URL("../apps/agent-city/ui/src/cityCatalog.ts", import.meta.url), "utf8");
const catalog = [...catalogSource.matchAll(/\{ id: "([^"]+)", group: "[^"]+", image: \w+, title: "([^"]+)", kind: "([^"]+)"/g)]
  .map(([, id, title, kind]) => ({ id, title, kind }));
assert.equal(catalog.length, 31, "catalog extraction must cover the actual declared table");
assert.equal(new Set(SITE_CLASSES.map(item => item.id)).size, SITE_CLASSES.length);
for (const item of SITE_CLASSES) {
  assert(item.pendingCapabilities.length > 0, "metadata cannot certify undeclared instance geometry");
  if (item.catalogId === null) assert(item.noCatalogReason.length >= 10);
  else {
    const entry = catalog.find(row => row.id === item.catalogId); assert(entry, item.id);
    if (item.family !== "data") assert.equal(item.title, entry.title, item.id);
  }
  assert.equal(siteClassOf(`decor:${item.id}#instance:with:colons`), item);
}
for (const entry of catalog) assert.equal(SITE_CLASSES.filter(item => item.catalogId === entry.id || item.additionalCatalogIds?.includes(entry.id)).length, 1, entry.id);
assert.equal(siteClassOf("decor:site:station").id, "public:station");
assert.equal(siteClassOf("decor:civic:school").id, "civic:school");
assert.equal(siteClassOf("decor:unknown"), null);
assert.equal(siteClassOf("decor:landmark:unknown"), null);
const layout = { civics: ["school", "mall", "hospital"].map(kind => ({ kind })), gardens: [{}], districtLandmarks: [{}], contextBuildings: [{}],
  landmarks: SITE_CLASSES.filter(item => item.family === "landmark").map(item => ({ kind: item.id.slice("landmark:".length) })),
  publicSites: ["civic", "station", "stadium", "park", "tower", "harbor"].map(kind => ({ kind })) };
for (const row of classifyLayoutSites(layout)) assert.equal(row.classes.length, 1, JSON.stringify(row));
assert.equal(siteClassesForInstance("publicSites", { kind: "future-kind" }).length, 0);
for (const kind of ["school", "mall", "hospital"]) assert.deepEqual(siteClassOf(`civic:${kind}`).placement.minimumSize(), civicMinimumSize(kind));
assert.deepEqual(siteClassOf("garden").placement.minimumSize(), GARDEN_MINIMUM_SIZE);
assert.deepEqual(siteClassOf("district-landmark").placement.minimumSize(), DISTRICT_LANDMARK_ENVELOPE);
assert.equal(siteClassOf("district-landmark").placement.mode, "face-reserve");
const source = fs.readFileSync(`${citySrc}/engine/models/siteClasses.ts`, "utf8");
assert(!/from\s+["'][^"']*(?:planRepair|planSites|planSitePolicy|three)[^"']*["']/.test(source), "pure generator declarations only");
assert(!/(?:width|depth):\s*\d/.test(source), "placement dimensions must derive from renderer declarations");
console.log("City site registry metadata: catalog coverage/titles, unique class ids, six layout-family classifiers, declared minimums and legacy lookup passed; instance geometry/pick-height/scene/editor coverage remain pending.");
