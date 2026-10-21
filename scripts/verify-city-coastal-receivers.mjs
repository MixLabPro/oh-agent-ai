#!/usr/bin/env node
import assert from 'node:assert/strict';

// Beach/road/bridgehead receiver ordering on curved rendered terrain. Sand
// used to sample the raw field at just four corners and sit above asphalt.
const {loadCity}=await import('./city-kit/index.mjs');
const beachKit=await loadCity({
 'pkg:three':['* as THREE'],
 'engine/systems/seasideSystem.ts':['buildBeachRibbon'],
 'engine/surface/terrainSampling.ts':['terrainSurfaceHeight'],
 'engine/surface/groundRoadCompiler.ts':['ROAD_SURFACE_LIFT'],
 'engine/surface/structureCompiler.ts':['bridgeDeckProfile'],
});
const beachLayout={extent:384,terrain:{height:(x,z)=>1+0.3*Math.sin(x*.65)+0.2*Math.cos(z*.8)},
 coast:[{x:-20,z:-20},{x:20,z:-20},{x:20,z:20},{x:-20,z:20}],publicSites:[],river:[],
 roadEdges:[{id:'bank',from:'-20:0',to:'-30:0',width:6,kind:'local',points:[{x:-20,z:0},{x:-30,z:0}]}]};
const beachHost={layout:beachLayout,group:new beachKit.THREE.Group(),disposables:[]};
beachKit.buildBeachRibbon(beachHost);
const beach=beachHost.group.getObjectByName('city-beach');assert.ok(beach);
const positions=beach.geometry.attributes.position.array;
for(let i=0;i<positions.length;i+=9){
 for(const weights of [[1/3,1/3,1/3],[.1,.4,.5]]){
  const [x,y,z]=[0,1,2].map(axis=>weights.reduce((sum,w,v)=>sum+w*positions[i+v*3+axis],0));
  const terrain=beachKit.terrainSurfaceHeight(beachLayout,x,z);
  assert.ok(Math.abs(y-terrain-beachKit.ROAD_SURFACE_LIFT/4)<1e-5,'beach interiors stay on the rendered terrain, without holes or raised wedges');
  assert.ok(terrain+beachKit.ROAD_SURFACE_LIFT-y>.029,'road receiver remains above sand at shoreline overlaps');
 }
}
const profile=beachKit.bridgeDeckProfile(beachLayout,{x:-20,z:0},{x:20,z:0},6);
assert.equal(profile.fromLands,true);
assert.ok(Math.abs(profile.ya-beachKit.terrainSurfaceHeight(beachLayout,-20,0)-beachKit.ROAD_SURFACE_LIFT)<1e-10,'landed bridge endpoint shares the road height reference');
for(const disposable of beachHost.disposables)disposable.dispose();
console.log('Coastal receivers: beach triangle interiors conform to rendered terrain; asphalt stays above sand; landed bridge shares asphalt height.');
