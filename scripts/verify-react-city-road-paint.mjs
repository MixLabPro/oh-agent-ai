#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(repo, "apps/desktop/ui-dev/package.json"));
const { buildSync } = require("esbuild");
const THREE = require("three");
const out = buildSync({entryPoints:[path.join(repo,"apps/agent-city/ui/src/engine/cityRoadPaint.ts")],bundle:true,write:false,format:"cjs",platform:"node"});
const mod={exports:{}};vm.runInNewContext(out.outputFiles[0].text,{module:mod,exports:mod.exports,Map,Set});
const {roadPaintPlan,channelizedTPlan,CHANNEL_T_GAP}=mod.exports;
const edge=(id,from,to,a,b,bridge=false,width=8)=>({id,from,to,points:[a,b],width,kind:"arterial",bridge});
const a={x:0,z:0},b={x:20,z:0},c={x:40,z:0},d={x:20,z:20};
const chain=[edge("bc","b","c",b,c),edge("ab","a","b",a,b)];
let plan=roadPaintPlan(chain);
assert.equal(plan.runs.length,1,"unordered contiguous road segments merge");
assert.equal(plan.runs[0].points.length,3);
assert.equal(plan.junctions.size,0,"degree-two segmentation is not a zebra crossing");
plan=roadPaintPlan([...chain,edge("bd","b","d",b,d)]);
assert.equal(plan.runs.length,3,"T junction splits approaches");
assert.equal(plan.junctions.size,1);assert(plan.junctions.has("b"));
plan=roadPaintPlan([chain[1],edge("bridge","b","c",b,c,true)]);
assert.equal(plan.runs.length,1);assert.equal(plan.runs[0].points.length,2,"atlas road stops at real bridge");
assert.equal(roadPaintPlan([chain[1],edge("bc","b","c",b,c,false,5)]).runs.length,2,"width transitions are retained");
console.log("City road paint: chains merge, true junctions only, bridge and width boundaries passed.");

// ── 渠化 T 选口（channelizedTPlan）：与 acuteJunctions 守卫同一算法同一角度量 ──────
// 合成 T：节点 j=(0,0)，直行臂向西 (-60,0) / 向东 (60,0)，支路按 degree 抬起。宽 5/8 = 支路/次干。
const DEG=Math.PI/180;
const tee=(degree,width=5,stemWidth=width)=>[
  edge("jw","w","j",{x:-60,z:0},{x:0,z:0},false,width),
  edge("je","e","j",{x:60,z:0},{x:0,z:0},false,width),
  edge("js","s","j",{x:Math.cos(degree*DEG)*60,z:Math.sin(degree*DEG)*60},{x:0,z:0},false,stemWidth),
];
const near=(a,b,eps=1e-6)=>Math.abs(a-b)<eps;
// 30–50° 边缘带：40° T 恰好一个渠化口，位置在 j，锐角对 = 东臂 + 支路，gap = 40°。
let mouths=channelizedTPlan(tee(40));
assert.equal(mouths.length,1,"40deg three-way (edge band) gets exactly one channelized mouth");
assert.equal(mouths[0].node,"j");
assert(near(mouths[0].x,0)&&near(mouths[0].z,0),"channelized mouth sits on the junction node");
assert(near(mouths[0].gap,40*DEG),"gap uses the acuteJunctions adjacent-angle algorithm");
assert.equal(mouths[0].stem.edge.id,"js","stem is the merging approach arm");
assert.equal(mouths[0].host.edge.id,"je","host is the arm the acute wedge rides on");
assert(near(mouths[0].stem.dir.x,Math.cos(40*DEG))&&near(mouths[0].stem.dir.z,Math.sin(40*DEG)),"stem direction points from node into the arm");
// <30°（守卫违例带）也渠化：普查残留违例在渲染层同样画渠化件。
assert.equal(channelizedTPlan(tee(20)).length,1,"sub-30deg guard-violation T is channelized too");
assert.equal(channelizedTPlan(tee(29.9)).length,1,"just under the guard threshold still channelized");
// 正交 T 不渠化；50° 上限外（边缘带顶）不渠化（恰好 50.0° 落在浮点刃口上，用带外的 50.5° 断言）。
assert.equal(channelizedTPlan(tee(90)).length,0,"orthogonal T is not channelized");
assert.equal(channelizedTPlan(tee(50.5)).length,0,"gap beyond the 50deg band ceiling is not channelized");
assert.equal(channelizedTPlan(tee(49.9)).length,1,"just inside the band is channelized");
// 主干口不渠化：宽 12 的臂（无论支路侧还是直行侧）都取消资格。
assert.equal(channelizedTPlan(tee(40,5,12)).length,0,"arterial stem (width 12) mouth is not channelized");
assert.equal(channelizedTPlan(tee(40,12,5)).length,0,"arterial through (width 12) mouth is not channelized");
// 桥臂/四岔不是地面三岔：不渠化。
const bridgedTee=[...tee(40)];bridgedTee[2]={...bridgedTee[2],bridge:true};
assert.equal(channelizedTPlan(bridgedTee).length,0,"bridge arm is not a ground three-way mouth");
const cross=[...tee(40),edge("jn","n","j",{x:0,z:-60},{x:0,z:0},false,5)];
assert.equal(channelizedTPlan(cross).length,0,"four-way junctions are not three-way channelization");
// 多口场景：两个独立 T 各自选口，结果按节点 id 稳定排序。
const twin=[...tee(40),...tee(40).map((e)=>({...e,from:`${e.from}2`,to:`${e.to}2`,points:e.points.map((p)=>({x:p.x+200,z:p.z}))}))];
mouths=channelizedTPlan(twin);
assert.equal(mouths.length,2,"two independent acute T mouths are both channelized");
assert.equal(JSON.stringify(mouths.map((m)=>m.node).sort()),'["j","j2"]',"mouth ordering is deterministic by node id");
assert(near(CHANNEL_T_GAP,50*DEG),"channelization band ceiling is 50deg");
console.log("City road paint: channelized T selection matches the acuteJunctions algorithm and band.");

// ── 渠化件渲染批（buildChannelizedJunctions）：无 DOM 跑生产渲染函数（同 verify-react-city-infrastructure）。
// 合成场景断言：30–50° T 出「喇叭一盘 + 分流岛一盘」、喇叭两条臂都有、岛沿支路摆且跟随地形；
// 正交 T / 主干口（宽 12）/ 桥臂不出件；多口合并成两盘而不是一口一 Mesh。
const channelBundle = buildSync({ stdin: {
  contents: `import { buildChannelizedJunctions } from "./systems/roadSystem"; export { buildChannelizedJunctions };`,
  resolveDir: path.join(repo, "apps/agent-city/ui/src/engine"), loader: "ts",
}, bundle: true, write: false, format: "cjs", platform: "node", external: ["three"], logLevel: "silent" });
const channelMod = { exports: {} };
vm.runInNewContext(channelBundle.outputFiles[0].text, { module: channelMod, exports: channelMod.exports, require, console, Math, Map, Set });
const { buildChannelizedJunctions } = channelMod.exports;
/** 跑渠化渲染并按 mesh 名索引；terrain 可注入（平地/坡地）以验证贴地取样。 */
const renderChannels = (edges, height = () => 0) => {
  const group = new THREE.Group();
  const disposables = [];
  buildChannelizedJunctions({ layout: { roadEdges: edges, terrain: { height } }, group, disposables });
  const byName = Object.fromEntries(group.children.map((mesh) => [mesh.name, mesh]));
  return { group, byName, disposables };
};
const positionsOf = (scene, name) => scene.byName[name]?.geometry.getAttribute("position")?.array ?? [];
const verticesOf = (array) => Array.from({ length: array.length / 3 }, (_, i) => ({ x: array[i * 3], y: array[i * 3 + 1], z: array[i * 3 + 2] }));

// 40° T（边缘带内）：喇叭 + 分流岛两盘都在，喇叭两条渠化臂（stem/host）都有顶点，岛沿支路摆。
const acuteScene = renderChannels(tee(40));
assert(acuteScene.byName["city-channel-flares"], "acute T renders the merged flare batch");
assert(acuteScene.byName["city-channel-islands"], "acute T renders the merged island batch");
const flareVerts = verticesOf(positionsOf(acuteScene, "city-channel-flares"));
const armHasFlare = (dir) => flareVerts.some((v) => {
  const along = v.x * dir.x + v.z * dir.z; const across = v.x * -dir.z + v.z * dir.x;
  return along > 2 && along < 16 && Math.abs(across) < 4.5;
});
assert(armHasFlare({ x: Math.cos(40 * DEG), z: Math.sin(40 * DEG) }), "flare widens the stem (merging approach) mouth");
assert(armHasFlare({ x: 1, z: 0 }), "flare widens the host (acute-wedge through) mouth");
// 贴地取样 + z-fighting 抬高惯例：平地上喇叭顶点全部 y = FLARE_LIFT(0.035)。
for (const v of flareVerts) assert(near(v.y, 0.035, 1e-4), "flare vertices follow terrain height plus the paint lift");
// 坡地（height = 0.1x）上喇叭跟随地形：y = 0.1*x + 0.035，分流岛顶面 y = 0.1*x + 0.22。
const slopeScene = renderChannels(tee(40), (x) => 0.1 * x);
for (const v of verticesOf(positionsOf(slopeScene, "city-channel-flares"))) assert(near(v.y, 0.1 * v.x + 0.035, 1e-4), "flares sample the sloped terrain per vertex");
for (const v of verticesOf(positionsOf(slopeScene, "city-channel-islands"))) assert(near(v.y, 0.1 * v.x + 0.22, 1e-4) || near(v.y, 0.1 * v.x - 0.18, 1e-4), "island top/skirt heights ride the sloped terrain");
// 岛沿支路（stem）摆：包围盒中心落在支路走廊里（距离 4–10、与支路方向夹角 < 15°），不在直行臂上。
const islandVerts = verticesOf(positionsOf(acuteScene, "city-channel-islands"));
const box = new THREE.Box3().setFromPoints(islandVerts.map((v) => new THREE.Vector3(v.x, v.y, v.z)));
const center = box.getCenter(new THREE.Vector3());
const stemDir = { x: Math.cos(40 * DEG), z: Math.sin(40 * DEG) };
const along = center.x * stemDir.x + center.z * stemDir.z;
const across = Math.abs(center.x * -stemDir.z + center.z * stemDir.x);
assert(along > 4 && along < 10 && across < along * Math.tan(15 * DEG), "island sits along the merging approach corridor");
assert(acuteScene.disposables.length === 4, "channel batches register geometry+material for disposal");
// 正交 T、主干口（任一臂宽 12）、桥臂、四岔：不出任何渠化件。
const expectNoChannels = (edges, why) => {
  const scene = renderChannels(edges);
  assert.equal(scene.group.children.length, 0, why);
};
expectNoChannels(tee(90), "orthogonal T renders no channelization");
expectNoChannels(tee(40, 5, 12), "arterial stem mouth (width 12) renders no channelization");
expectNoChannels(tee(40, 12, 5), "arterial through mouth (width 12) renders no channelization");
expectNoChannels(bridgedTee, "bridged three-way renders no channelization");
expectNoChannels(cross, "four-way junction renders no channelization");
// 合并批：两个独立渠化口仍只有两盘（喇叭/岛各一），且顶点量随口数翻倍。
const twinScene = renderChannels(twin);
assert.equal(twinScene.group.children.length, 2, "two mouths merge into two batches, not one mesh per mouth");
assert.equal(twinScene.group.children.map((m) => m.name).sort().join(","), "city-channel-flares,city-channel-islands");
assert.equal(positionsOf(twinScene, "city-channel-flares").length, positionsOf(acuteScene, "city-channel-flares").length * 2, "flare batch grows linearly with mouth count");
assert.equal(positionsOf(twinScene, "city-channel-islands").length, positionsOf(acuteScene, "city-channel-islands").length * 2, "island batch grows linearly with mouth count");
console.log("City road paint: channelized T renders flare+island batches that follow terrain and merge across mouths.");

// ── 路口渲染几何（cityRoadJunctions.roadJunctionPlan，docs/CITY_ROAD_JUNCTION_RENDER_SPEC.md）──────
// 圆角半径按较宽一臂的等级、受 40% 边长约束；宽路直穿、窄路收口画停止线；等宽不画；桥头/滨水沿用旧画法；度 2 换宽出渐变段。
const junctionBundle = buildSync({ stdin: {
  contents: `import * as THREE from "three";
    import { roadJunctionPlan, curbRadiusFor, cornerArc } from "./cityRoadJunctions";
    import { buildInfrastructure } from "./systems/roadSystem";
    export { roadJunctionPlan, curbRadiusFor, cornerArc };
    export function curbBoxes(edges) {
      const host = { layout: { roadEdges: edges, terrain: { height: () => 0 } }, positionVector: new THREE.Vector3(), euler: new THREE.Euler(),
        quaternion: new THREE.Quaternion(), scaleVector: new THREE.Vector3(), matrix: new THREE.Matrix4(), color: new THREE.Color(),
        makeInstanced(geometry, material, count) { return this.mesh = new THREE.InstancedMesh(geometry, material, count); } };
      buildInfrastructure(host);
      const m = new THREE.Matrix4();
      // 盒子局部 x 轴（矩阵第一列）就是长度方向：不经 Euler 分解——XYZ 序的 Euler.y 在 |yaw| > 90° 时翻转，端点会算错。
      return Array.from({ length: host.mesh.count }, (_, i) => { host.mesh.getMatrixAt(i, m); const e = m.elements;
        const hx = e[0] / 2; const hz = e[2] / 2; const p = { x: e[12], z: e[14] };
        return { x: p.x, z: p.z, length: Math.hypot(e[0], e[2]), ends: [{ x: p.x - hx, z: p.z - hz }, { x: p.x + hx, z: p.z + hz }] }; });
    }`,
  resolveDir: path.join(repo, "apps/agent-city/ui/src/engine"), loader: "ts",
}, bundle: true, write: false, format: "cjs", platform: "node", external: ["three"], logLevel: "silent" });
const junctionMod = { exports: {} };
vm.runInNewContext(junctionBundle.outputFiles[0].text, { module: junctionMod, exports: junctionMod.exports, require, process, console, Math, Map, Set });
const { roadJunctionPlan, curbRadiusFor, cornerArc, curbBoxes } = junctionMod.exports;
const O = { x: 0, z: 0 };
const road = (id, to, width, extra = {}) => ({ id, from: "o", to, points: [O, to === "W" ? { x: -80, z: 0 } : to === "E" ? { x: 80, z: 0 } : to === "N" ? { x: 0, z: -60 } : { x: 0, z: 60 }], width, kind: width >= 8 ? "arterial" : "local", ...extra });
const at = (edges) => roadJunctionPlan(edges).find((j) => j.id === "o");
// 半径档位：支路 5 → 5.5、次干 8 → 8.8、主干 12 → 13.2（真实路缘半径 5–6 / 8–10 / 12–15）。
assert(near(curbRadiusFor(5), 5.5) && near(curbRadiusFor(8), 8.8) && near(curbRadiusFor(12), 13.2), "curb radius scales with road class");
// 主干 12 直行 + 支路 5 的 T：两个圆角都按主干取 13.2；支路收口，停止线在主干边缘外 0.35（6 + 0.35）。
let junction = at([road("w", "W", 12), road("e", "E", 12), road("n", "N", 5)]);
assert(junction.hierarchical, "12-through + 5-stem T is hierarchical");
assert.equal(junction.corners.length, 2, "T has exactly two curb returns (the straight side has none)");
for (const corner of junction.corners) {
  assert(near(corner.radius, 13.2, 1e-9), "T corner radius follows the wider road");
  assert(near(Math.abs(corner.sweep), Math.PI / 2, 1e-9), "orthogonal corner sweeps 90deg");
  // 切点在边线上：圆心到两切点的距离都等于半径，弧端点就是切点。
  const arc = cornerArc(corner);
  assert(near(arc[0].x, corner.a.x, 1e-9) && near(arc.at(-1).z, corner.b.z, 1e-9), "arc starts/ends on the tangent points");
}
const stem = junction.arms.find((arm) => arm.edge.id === "n");
assert.equal(stem.role, "minor"); assert(near(stem.stopAt, 6.35, 1e-9), "stop line sits just outside the wider road's edge");
assert(junction.arms.filter((arm) => arm.role === "major").every((arm) => arm.stopAt === null), "the wider road runs straight through (no stop line)");
// 40% 约束：短臂（长 20）上切点距离不超过 8，半径相应缩小。
junction = at([{ ...road("w", "W", 8), points: [O, { x: -20, z: 0 }] }, road("e", "E", 8), road("n", "N", 8)]);
for (const corner of junction.corners) {
  const arms = [junction.arms[corner.armA], junction.arms[corner.armB]];
  assert(corner.ta <= 0.4 * arms[0].length + 1e-9 && corner.tb <= 0.4 * arms[1].length + 1e-9, "curb return never exceeds 40% of either edge");
}
assert(junction.corners.some((corner) => corner.radius < 8.8 - 1e-6), "short-edge corner radius shrinks to fit");
assert(!junction.hierarchical && junction.arms.every((arm) => arm.stopAt === null), "equal-width junction is plain: no stop lines");
// 四岔主干 + 支路：两条支路各一条停止线，四个圆角。
junction = at([road("w", "W", 12), road("e", "E", 12), road("n", "N", 5), road("s", "S", 5)]);
assert.equal(junction.corners.length, 4); assert.equal(junction.arms.filter((arm) => arm.stopAt !== null).length, 2, "both minor approaches of a cross get stop lines");
// 桥头：节点挂桥面 → 任何臂都不画停止线，碰到桥面的转角不做圆角；滨水大道同样沿用旧画法。
junction = at([road("w", "W", 12), road("e", "E", 12, { bridge: true, structure: "deck" }), road("n", "N", 5)]);
assert(junction.touchesDeck && junction.arms.every((arm) => arm.stopAt === null), "never paint stop lines at a deck junction");
assert(junction.corners.every((corner) => !junction.arms[corner.armA].edge.bridge && !junction.arms[corner.armB].edge.bridge), "no curb return against a deck");
junction = at([road("w", "W", 12, { purpose: "waterfront" }), road("e", "E", 12, { purpose: "waterfront" }), road("n", "N", 5)]);
assert.equal(junction.corners.length, 0, "waterfront arms keep their legacy (un-rounded) treatment");
// 度 2 换宽：12 → 5 直行出渐变段，长 2×宽度差 = 14（受 40% 约束）；拐弯的同宽对只做圆角不做渐变。
junction = at([road("w", "W", 12), road("e", "E", 5)]);
assert(junction.taper && near(junction.taper.length, 14, 1e-9) && junction.taper.narrow.edge.id === "e", "degree-2 width change gets a 2x-width-difference taper on the narrow side");
assert.equal(junction.corners.length, 0, "a straight width change has no curb return");
// 确定性：输入边顺序打乱，结果逐字相同。
const shuffled = [road("n", "N", 5), road("e", "E", 12), road("w", "W", 12)];
const strip = (plan) => JSON.stringify(plan, (key, value) => (key === "edge" || key === "ccwNeighbor" || key === "cwNeighbor" ? value?.id : value));
assert.equal(strip(roadJunctionPlan(shuffled)), strip(roadJunctionPlan([shuffled[2], shuffled[1], shuffled[0]])), "junction plan is independent of input edge order");
console.log("City road paint: junction curb radii, 40% clip, major/minor stop lines, deck/waterfront exclusions and tapers passed.");

// 路缘（roadSystem.buildInfrastructure）跟随同一圆弧：T 口不再有路缘伸进路口——
// 每个路缘盒的两个端点都不落在路口「路面区域」内（任一臂路面带 + 圆角楔形）。
const tCurbs = curbBoxes([road("w", "W", 12), road("e", "E", 12), road("n", "N", 5)]);
const insidePavement = (p) => (Math.abs(p.z) < 6 - 0.05) || (p.z < 0 && Math.abs(p.x) < 2.5 - 0.05);
for (const box of tCurbs) for (const end of box.ends) assert(!insidePavement(end), `curb piece end (${end.x.toFixed(2)}, ${end.z.toFixed(2)}) intrudes into the junction pavement`);
const arcPieces = tCurbs.filter((box) => box.length < 4);
assert(arcPieces.length >= 8, "both T curb returns are built from short arc pieces");
for (const box of arcPieces) {
  const dist = Math.min(Math.hypot(box.x - (2.5 + 13.2), box.z - (-6 - 13.2)), Math.hypot(box.x + (2.5 + 13.2), box.z - (-6 - 13.2)));
  assert(Math.abs(dist - (13.2 - 0.25)) < 0.3, "arc curb pieces ride the r-0.25 concentric arc");
}
// 直行侧（南）路缘接到节点、东西两段连成一条：南侧两段在 x=0 处相接。
const south = tCurbs.filter((box) => box.length > 4 && box.z > 0);
assert.equal(south.length, 2); assert(south.every((box) => box.ends.some((end) => Math.abs(end.x) < 1e-6)), "through-side curbs run continuously across the junction");
console.log("City road paint: curbs follow the junction curb returns and stay continuous along the through side.");

// 生成器把直路切成 10–15 长的短边（度 2 节点）。40% 约束按「直路链」算：短边链上的路口照样有足尺圆角，
// 路缘退让顺延到第二、三条短边上——而不是像按单边算那样圆角被压没、5.5 退让的路缘落进主路路面。
const chained = [
  { id: "w1", from: "o", to: "w1", points: [O, { x: -12, z: 0 }], width: 12, kind: "arterial" },
  { id: "w2", from: "w1", to: "w2", points: [{ x: -12, z: 0 }, { x: -24, z: 0 }], width: 12, kind: "arterial" },
  { id: "w3", from: "w2", to: "W", points: [{ x: -24, z: 0 }, { x: -80, z: 0 }], width: 12, kind: "arterial" },
  road("e", "E", 12),
  { id: "n1", from: "o", to: "n1", points: [O, { x: 0, z: -10 }], width: 5, kind: "local" },
  { id: "n2", from: "n1", to: "N", points: [{ x: 0, z: -10 }, { x: 0, z: -60 }], width: 5, kind: "local" },
];
junction = at(chained);
assert.equal(junction.arms.find((arm) => arm.edge.id === "w1").chain.length, 3, "arm reach walks collinear same-width degree-2 continuations");
assert(junction.corners.length === 2 && junction.corners.every((corner) => near(corner.radius, 13.2, 1e-9)), "short first edges still get full-size curb returns");
assert(junction.arms.find((arm) => arm.edge.id === "n1").stopAt !== null, "short first edge on the minor arm still gets its stop line");
const chainCurbs = curbBoxes(chained);
for (const box of chainCurbs) for (const end of box.ends) assert(!insidePavement(end), `chained curb end (${end.x.toFixed(2)}, ${end.z.toFixed(2)}) intrudes into the junction pavement`);
assert(!chainCurbs.some((box) => box.length > 4 && Math.abs(box.z + 6.25) < 1e-3 && box.ends.some((end) => end.x > -15.7 + 1e-3 && end.x < -1e-3)), "curb trim spills past the 12-long first edge up to the tangent point");
console.log("City road paint: junction reach follows short-edge chains and curb trims spill along them.");

// 整城：任何路缘盒的端点都不落在别的地面路的路面带里（真机十字口路面上的白色折线即此类）。
// 生成器留下大量 < 14 的短边（种子 1927 档 2 约三分之一），旧代码「短边不画路缘」把问题藏住了，所以按整城扫。
// 走 city-kit 原生加载（vm 沙箱里规划慢约 8 倍）。0.12 容差 = 弧段两端各多出的 0.06 咬合量 + 浮点余量。
const { loadCity, cachedPlan } = await import("./city-kit/index.mjs");
const kit = await loadCity({ "engine/cityPlan.ts": ["createCityPlan"], "engine/systems/roadSystem.ts": ["buildInfrastructure"], "pkg:three": ["* as THREE"] });
for (const seed of [1927, 42]) {
  const plan = cachedPlan(kit.createCityPlan, seed, 2);
  const host = { layout: plan, positionVector: new kit.THREE.Vector3(), euler: new kit.THREE.Euler(), quaternion: new kit.THREE.Quaternion(),
    scaleVector: new kit.THREE.Vector3(), matrix: new kit.THREE.Matrix4(), color: new kit.THREE.Color(),
    makeInstanced(geometry, material, count) { return this.mesh = new kit.THREE.InstancedMesh(geometry, material, count); } };
  kit.buildInfrastructure(host);
  const m = new kit.THREE.Matrix4(); const color = new kit.THREE.Color();
  const ground = plan.roadEdges.filter((edge) => !edge.bridge && edge.structure !== "deck");
  let intrusions = 0; let checked = 0; const where = [];
  for (let i = 0; i < host.mesh.count; i += 1) {
    host.mesh.getColorAt(i, color); if (color.getHexString() !== "cbc6ba") continue; // 只查路缘（桥面/护栏另有颜色）
    host.mesh.getMatrixAt(i, m); const e = m.elements;
    for (const end of [{ x: e[12] - e[0] / 2, z: e[14] - e[2] / 2 }, { x: e[12] + e[0] / 2, z: e[14] + e[2] / 2 }]) {
      checked += 1;
      for (const edge of ground) {
        const [a, b] = edge.points; const len = Math.hypot(b.x - a.x, b.z - a.z); if (len < 1e-6) continue;
        const ux = (b.x - a.x) / len; const uz = (b.z - a.z) / len;
        const along = (end.x - a.x) * ux + (end.z - a.z) * uz; const across = Math.abs((end.x - a.x) * -uz + (end.z - a.z) * ux);
        if (along > 0.05 && along < len - 0.05 && across < edge.width / 2 - 0.12) { intrusions += 1; where.push(`${end.x.toFixed(1)},${end.z.toFixed(1)}`); break; }
      }
    }
  }
  assert(checked > 400, `seed ${seed}: city has curbs to check`);
  assert.equal(intrusions, 0, `seed ${seed}: ${intrusions} curb ends sit on road pavement (${where.slice(0, 5).join(" ")})`);
}
console.log("City road paint: no curb lands on road pavement across whole generated cities (seeds 1927, 42).");
