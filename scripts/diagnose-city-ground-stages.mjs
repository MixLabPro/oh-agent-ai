#!/usr/bin/env node
// Read-only, reproducible tracing of synthetic City planning. No user logs or
// authority files are read/written; source instrumentation exists only in the diagnostic bundle.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { repo, citySrc } from "./city-kit/index.mjs";
const { build } = createRequire(path.join(repo, "apps/desktop/ui-dev/package.json"))("esbuild");
const seed = Number(process.argv[2] ?? 2003037141), tier = Number(process.argv[3] ?? 1);
if (!Number.isSafeInteger(seed) || ![1, 2, 5, 10].includes(tier)) throw new Error("usage: diagnose-city-ground-stages.mjs seed tier");
const sources = new Map(), stageRows = [], beforeSolve = [], shoreInputs = [];
globalThis.__groundDiagnostic = {
  stage(label, attemptRadius, models, height, inRiver, inspector, wet) {
    const owner = models.find(site => site.kind === "villa-complex");
    if (!owner) return;
    const inspection = inspector(owner, { height, inRiver });
    stageRows.push({ label, radius: attemptRadius, owner: { ...owner }, wetCircle: wet({ height, inRiver }, owner, owner.radius),
      ground: inspection.status, findings: inspection.status === "violation" ? inspection.findings.map(finding => finding.code) : [],
      belowSea: inspection.evidence?.belowRendererSeaLevel, maxGap: inspection.evidence?.maxGap });
  },
  beforeSolve(ctx, radius) {
    beforeSolve.push({ radius, ctx: { ...ctx, network: { ...ctx.network,
      nodes: new Map([...ctx.network.nodes].map(([id, node]) => [id, { ...node }])),
      edges: new Map([...ctx.network.edges].map(([id, edge]) => [id, { ...edge, points: edge.points.map(point => ({ ...point })) }])) },
      publicSites: structuredClone(ctx.publicSites), landmarks: structuredClone(ctx.landmarks), blocks: structuredClone(ctx.blocks) } });
  },
  shoreInput(ctx, radius) { shoreInputs.push({ radius, ctx: { ...ctx,
    publicSites: structuredClone(ctx.publicSites), landmarks: structuredClone(ctx.landmarks) } }); },
};
const cityPlanFile = path.join(citySrc, "engine/cityPlan.ts");
const instrument = raw => {
  let text = 'import { inspectModelGround as __diagnoseGround } from "./planner/modelGround";\nimport { wetCount as __diagnoseWet } from "./planner/footprint";\n' + raw;
  const trace = label => `globalThis.__groundDiagnostic.stage(${JSON.stringify(label)}, R, landmarks, height, inRiver, __diagnoseGround, __diagnoseWet);`;
  const markers = [
    ["restickSitesClearOfRingRuns(frontageCtx);", "restick"],
    ["retreatShoreSitesToDryLand(shoreCtx);", "retreat"],
    ["frontSitesOnTrunks(frontageCtx);", "frontage"],
    ["resnapSitesOntoDryLand(frontageCtx);", "dry-resnap"],
    ["settleHarborOnCoast(shoreCtx);", "harbor"],
    ["settleShoreSitesOnCoast(shoreCtx);", "shore-settle"],
    ["let sailOperaCandidateSets = settleSailOperaOffshore(shoreCtx);", "offshore"],
  ];
  for (const [marker, label] of markers) {
    if (!text.includes(marker)) throw new Error(`source tracing marker missing: ${label}`);
    text = text.replace(marker, `${trace(label + "-before")}\n${label === "shore-settle" ? "globalThis.__groundDiagnostic.shoreInput(shoreCtx, R);" : ""}\n${marker}\n${trace(label + "-after")}`);
  }
  const solveMarker = "const solveReport = skipSolve ? null : solvePlan(repairCtx);";
  if (!text.includes(solveMarker)) throw new Error("source tracing marker missing: solve");
  return text.replace(solveMarker, `${trace("solve-before")}\nglobalThis.__groundDiagnostic.beforeSolve(repairCtx, R);\n${solveMarker}\n${trace("solve-after")}`);
};
const output = await build({ stdin: { contents: [
  `export {createCityPlan, clearsHighways} from ${JSON.stringify(cityPlanFile)};`,
  `export {MIAMI_COASTAL} from ${JSON.stringify(path.join(citySrc, "engine/citySeaside.ts"))};`,
  `export {localResiteCandidates} from ${JSON.stringify(path.join(citySrc, "engine/planner/siting.ts"))};`,
  `export {relocatedSitePositionFailure} from ${JSON.stringify(path.join(citySrc, "engine/planner/snapJunctions.ts"))};`,
  `export {inspectModelGround, registeredModelGroundFailure} from ${JSON.stringify(path.join(citySrc, "engine/planner/modelGround.ts"))};`,
  `export {polylineDistance, nearBridgeEnd, wetCount} from ${JSON.stringify(path.join(citySrc, "engine/planner/footprint.ts"))};`,
  `export {componentOf, primaryComponentId} from ${JSON.stringify(path.join(citySrc, "engine/planner/intent.ts"))};`,
].join("\n"), resolveDir: citySrc }, bundle: true, write: false, format: "esm", platform: "node", logLevel: "silent",
  plugins: [{ name: "read-only-ground-trace", setup(builder) {
    builder.onLoad({ filter: /\.tsx?$/ }, args => {
      const raw = fs.readFileSync(args.path, "utf8"); sources.set(args.path, raw);
      return { contents: args.path === cityPlanFile ? instrument(raw) : raw, loader: args.path.endsWith("tsx") ? "tsx" : "ts" };
    });
  } }] });
const module = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);
const began = performance.now(), plan = module.createCityPlan(seed, tier, module.MIAMI_COASTAL);
const sourceDigest = crypto.createHash("sha256");
for (const [file, raw] of [...sources].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) sourceDigest.update(path.relative(citySrc, file)).update("\0").update(raw);
console.log(JSON.stringify({ seed, tier, loadedSourceDigest: sourceDigest.digest("hex"), ms: Math.round(performance.now() - began),
  radius: plan.islandRadius, capacity: plan.capacity, outcome: plan.planningOutcome, stages: stageRows }));

const tally = (rows, counter, reason, at) => { counter[reason] = (counter[reason] ?? 0) + 1; if (!rows[reason]) rows[reason] = { ...at }; };
for (const { radius, ctx } of shoreInputs.filter(row => row.radius === plan.islandRadius)) {
  const owner = ctx.landmarks.find(site => site.kind === "villa-complex"); if (!owner) continue;
    const others = [...ctx.publicSites, ...ctx.landmarks].filter(site => site.id !== owner.id && site.radius), counts = {}, examples = {}, groundAdmissibleRejectedBy = {}, groundAdmissibleExamples = {};
  let attempts = 0;
  for (let rr = 6; rr <= 70; rr += 6) for (let k = 0; k < 24; k += 1) {
    attempts += 1; const angle = k * Math.PI * 2 / 24, at = { x: owner.x + Math.cos(angle) * rr, z: owner.z + Math.sin(angle) * rr };
    let reason;
    if (module.wetCount({ height: ctx.height, inRiver: ctx.inRiver, riverBank: ctx.riverBank }, at, owner.radius, { river: true, riverBank: 14 }) > 2) reason = "legacy-wet-circle";
    else if (ctx.height(at.x, at.z) <= 0.5) reason = "centre-water";
    else if (module.polylineDistance(ctx.trunkRuns, at) < owner.radius + 4) reason = "legacy-circle-trunk-setback";
    else if (!module.clearsHighways(at, owner.radius * 2, owner.radius * 2, ctx.ringRuns)) reason = "legacy-square-highway-envelope";
    else if (others.some(other => Math.hypot(other.x - at.x, other.z - at.z) < owner.radius + other.radius)) reason = "owner-spacing";
    else reason = module.registeredModelGroundFailure({ ...owner, ...at }, { height: ctx.height, inRiver: ctx.inRiver }) ?? "candidate-admitted";
    tally(examples, counts, reason, at);
    if (module.inspectModelGround({ ...owner, ...at }, { height: ctx.height, inRiver: ctx.inRiver }).status === "partial")
      tally(groundAdmissibleExamples, groundAdmissibleRejectedBy, reason, at);
  }
  console.log(JSON.stringify({ stage: "initial-shore-local-tier", radius, owner, attempts, firstRejectionCounts: counts, examples,
    groundAdmissibleRejectedBy, groundAdmissibleExamples }));
}
for (const { radius, ctx } of beforeSolve.filter(row => row.radius === plan.islandRadius)) {
  const owner = ctx.landmarks.find(site => site.kind === "villa-complex"); if (!owner) continue;
  const view = { roadNodes: [...ctx.network.nodes.values()], roadEdges: [...ctx.network.edges.values()], publicSites: ctx.publicSites, landmarks: ctx.landmarks,
    core: ctx.core, coast: ctx.coast, coastRoads: ctx.coastRoadRuns.slice(0, ctx.coastalRunCount), riverRoadRuns: ctx.riverRoadRuns,
    river: ctx.geo.river, seaside: ctx.seaside, primaryAnchorNodeId: ctx.primaryAnchorNodeId, siteObligations: ctx.siteObligations, demandCatalogue: ctx.demandCatalogue };
  const components = module.componentOf(view), primary = module.primaryComponentId(view, components);
  const primaryRoads = view.roadEdges.filter(edge => !edge.bridge && components.get(edge.from) === primary).map(edge => edge.points);
  const counts = {}, examples = {}, groundAdmissibleRejectedBy = {}, groundAdmissibleExamples = {}; let attempts = 0;
  for (const at of module.localResiteCandidates(owner)) {
    attempts += 1;
    let reason = module.relocatedSitePositionFailure(ctx, owner, at, true);
    if (!reason && module.polylineDistance(primaryRoads, at) > owner.radius + 20) reason = "primary-service-bound";
    if (!reason && ctx.blocks.some(block => block.parcels.some(parcel => Math.hypot(parcel.x - at.x, parcel.z - at.z)
      < owner.radius + 9 + Math.hypot(parcel.width, parcel.depth) / 2))) reason = "reserved-parcel-envelope";
    reason ??= module.registeredModelGroundFailure({ ...owner, ...at }, { height: ctx.height, inRiver: ctx.inRiver });
    tally(examples, counts, reason ?? "candidate-admitted", at);
    if (module.inspectModelGround({ ...owner, ...at }, { height: ctx.height, inRiver: ctx.inRiver }).status === "partial")
      tally(groundAdmissibleExamples, groundAdmissibleRejectedBy, reason ?? "candidate-admitted", at);
  }
  console.log(JSON.stringify({ stage: "pre-solve-wet-local-tier", radius, owner, attempts, firstRejectionCounts: counts, examples,
    groundAdmissibleRejectedBy, groundAdmissibleExamples }));
}
delete globalThis.__groundDiagnostic;
