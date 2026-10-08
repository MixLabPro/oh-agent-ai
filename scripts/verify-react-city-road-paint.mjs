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
