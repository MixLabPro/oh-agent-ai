#!/usr/bin/env node
import assert from 'node:assert/strict';
import {loadCity} from './city-kit/index.mjs';
const k=await loadCity({'engine/cityAirport.ts':['buildAirport'],'engine/surface/sceneSolids.ts':['collectSceneSolids'],
  'game/driving/CollisionIndex.ts':['buildCollisionIndex'],'game/driving/DrivingCollision.ts':['sweepBody']});
const plan={shore:{x:0,z:0},centre:{x:0,z:140},outward:{x:0,z:1},yaw:0};
const dims={halfLength:1.5,halfWidth:1.032,halfHeight:.575};
const pose=x=>({x,y:1.24+.675,z:0,heading:0,pitch:0,roll:0});
for(const clear of [false,true]){
 const disposables=[],root=k.buildAirport(plan,disposables,null,clear?(x,z)=>Math.abs(z)<=6&&Math.abs(x)<=80?1.24:null:undefined);
 const solids=k.buildCollisionIndex(k.collectSceneSolids(root)).solids();
 const result=k.sweepBody(solids,pose(-30),pose(30),dims);
 assert.equal(result.status,clear?'clear':'contact',`actual causeway meshes: ${result.reason}`);
 assert.ok(solids.length>50,'airport keeps its rendered physical solids');
 for(const d of disposables)d.dispose();
}
console.log('Airport clearance: former 1.1-high causeway blocks calibrated full car; raised rendered geometry permits continuous passage with all airport solids retained.');
