#!/usr/bin/env node
import assert from 'node:assert/strict';
import { loadCity } from './city-kit/index.mjs';
import { makeFixtures } from './city-kit/surface-region-fixtures.mjs';
const m=await loadCity({
 'engine/surface/meshBoundaries.ts':['extractMeshBoundaries'],
 'engine/surface/SurfaceIndex.ts':['buildSurfaceIndex'],
 'engine/surface/surfaceRegions.ts':['buildSurfaceRegions'],
 'engine/surface/structureCompiler.ts':['boxCorners'],
 'game/driving/CollisionIndex.ts':['buildCollisionIndex'],
 'game/driving/SurfaceDrivingWorld.ts':['SurfaceDrivingEnvironment','SurfaceWorldValidator','createStructureCollisionBinding'],
 'game/driving/surfaceFootprint.ts':['DEFAULT_FOOTPRINT_PARAMS'],
 'game/driving/vehicleFootprint.ts':['DRIVING_FOOTPRINT'],
 'game/driving/DrivingKernel.ts':['DrivingKernel'],
 'game/DrivingSimulation.ts':['initialDrivingState'],
});
const { grid,patch,regionsOf }=makeFixtures(m);
const box=(id,x,y,z,sx,sy,sz,rz=0)=>({id,shape:'box',role:'pier',corners:m.boxCorners({x,y,z,sx,sy,sz,rx:0,ry:0,rz,order:'XYZ'})});
const dimensions={halfLength:1.4,halfWidth:.7,halfHeight:.5};
const run=(slope=0)=>{
 const {regions}=regionsOf([patch('road','carriageway',grid(-30,-4,30,4,30,4,x=>x*slope))]);assert.equal(regions.status,'ready');
 const regionId=regions.regions[0].id;const obstacles=[box('pier',2,0,0,.1,4,.1),box('guardrail',0,0,2.8,30,4,.1)];
 const built=m.buildCollisionIndex({revision:'world-with-structure',obstacles});assert.equal(built.status,'ready');let live=true;
 const binding=m.createStructureCollisionBinding({surfaceRevision:regions.revision,worldRevision:'world-with-structure',index:built.index,dimensions,centerHeight:.55,isCurrent:()=>live});
 const world=new m.SurfaceDrivingEnvironment(regions,m.DRIVING_FOOTPRINT,m.DEFAULT_FOOTPRINT_PARAMS,binding);
 const validator=new m.SurfaceWorldValidator(regions,()=>0,m.DRIVING_FOOTPRINT,m.DEFAULT_FOOTPRINT_PARAMS,binding);
 assert.equal(world.place(2,0,0,regionId),null,'body spawn inside pier rejected');
 assert.equal(world.place(0,2.8,0,regionId),null,'body spawn inside guardrail rejected');
 const support=world.place(0,0,0,regionId);assert.ok(support);
 let state={...m.initialDrivingState(0,0,0,regionId),...support,speed:13};assert.equal(validator.validateStart(state),'valid');
 const railCross=world.move(state,{x:0,z:2.9,heading:0});assert.equal(railCross.blocked,true);assert.match(railCross.reason,/structure-collision/);
 assert.equal(validator.validate(state,{state:{...state,z:2.9},motion:{blocked:false,reason:null}}),'simulation-invalid','independent rail crossing rejection');
 const forged={...state,x:2,y:2*slope};assert.equal(validator.validateStart(forged),'simulation-invalid');
 const identity={baseSnapshotHash:'world-with-structure',vehicleConfigHash:'fixture',kernelBuildId:'fixture',physicsVersion:1,collisionVersion:1,queryVersion:1};
 const kernel=new m.DrivingKernel(world,identity);let stopped=false;
 for(let i=0;i<20;i++){const next=kernel.step(state,{forward:true,backward:false,left:false,right:false});assert.equal(validator.validate(state,next),'valid');state={...next.state};if(next.motion.blocked){stopped=true;assert.match(next.motion.reason,/structure-collision/);break;}}
 assert.ok(stopped,'same kernel stops before pier');assert.ok(state.x<.6);
 // Independent audit rejects an accepted movement that jumps fully over the thin pier.
 const far={...state,x:4,y:4*slope,surfaceId:regionId};assert.equal(validator.validate(state,{state:far,motion:{blocked:false,reason:null}}),'simulation-invalid');
 live=false;assert.equal(world.place(-5,0,0,regionId),null);assert.equal(world.move(state,{x:state.x+.1,z:state.z,heading:state.heading}).blocked,true);
 assert.equal(validator.validateStart(state),'simulation-invalid');assert.equal(validator.validate(state,{state,motion:{blocked:true,reason:'stale'}}),'simulation-invalid');
 assert.throws(()=>new m.SurfaceDrivingEnvironment(regions,m.DRIVING_FOOTPRINT,m.DEFAULT_FOOTPRINT_PARAMS,{...binding,surfaceRevision:'wrong'}),/collision-revision/);
};
run();run(.05);
// A sloped supporting slab must stay below an explicitly offset collider; do not drop it by layer.
{
 const slope=.1;const {regions}=regionsOf([patch('deck','carriageway',grid(-20,-4,20,4,20,4,x=>x*slope))]);
 const slab=box('deck-slab',0,-.2,0,40,.2,8,Math.atan(slope));
 // box compiler defines y at local bottom; translate top onto y=slope*x.
 const top=slab.corners.filter((_,i)=>(i%4)>=2);const mean=top.reduce((n,p)=>n+p.y/top.length,0);slab.corners=slab.corners.map(p=>({...p,y:p.y-mean}));
 const built=m.buildCollisionIndex({revision:'slope',obstacles:[slab]});assert.equal(built.status,'ready');
 const b=m.createStructureCollisionBinding({surfaceRevision:regions.revision,worldRevision:'slope',index:built.index,dimensions,centerHeight:.55,isCurrent:()=>true});
 const world=new m.SurfaceDrivingEnvironment(regions,m.DRIVING_FOOTPRINT,m.DEFAULT_FOOTPRINT_PARAMS,b);assert.ok(world.place(0,0,0,regions.regions[0].id),'tilted body offset keeps support slab from false contact');
}
{
 const slope=.12;const {regions}=regionsOf([patch('cross-deck','carriageway',grid(-20,-4,20,4,20,4,(x,z)=>z*slope))]);
 const slab=box('cross-deck-slab',0,-.2,0,40,.2,8);
 slab.corners=slab.corners.map(p=>({...p,y:p.y+p.z*slope}));
 const built=m.buildCollisionIndex({revision:'cross-slope',obstacles:[slab]});assert.equal(built.status,'ready');
 const b=m.createStructureCollisionBinding({surfaceRevision:regions.revision,worldRevision:'cross-slope',index:built.index,dimensions,centerHeight:.55,isCurrent:()=>true});
 const world=new m.SurfaceDrivingEnvironment(regions,m.DRIVING_FOOTPRINT,m.DEFAULT_FOOTPRINT_PARAMS,b);assert.ok(world.place(0,0,0,regions.regions[0].id),'positive roll raises the positive lateral side');
}
console.log('Structure world binding: spawn, same-kernel pier stop, guardrail, independent sweep validator, slope offset and stale/mismatch rejection passed.');
