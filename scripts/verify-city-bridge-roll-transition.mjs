#!/usr/bin/env node
// The seed-7 connector must meet both bank leans and carry the full colliding car.
import assert from "node:assert/strict";
import {loadCity,cachedPlan} from "./city-kit/index.mjs";
const k=await loadCity({
  "engine/cityPlan.ts":["createCityPlan"],
  "engine/surface/structureCompiler.ts":["bridgeDeckParts","bridgeDeckProfile"],
  "engine/surface/compileSurface.ts":["compileCitySurface","landingConnectivity"],
  "engine/surface/SurfaceIndex.ts":["buildSurfaceIndex"],
  "engine/surface/surfaceRegions.ts":["buildSurfaceRegions"],
  "game/driving/citySolids.ts":["cityCollisionIndex"],
  "game/driving/surfaceFootprint.ts":["footprintSupport"],
  "game/driving/ContinuousDrivingEnvironment.ts":["ContinuousDrivingEnvironment"],
  "game/driving/ContinuousWorldValidator.ts":["ContinuousWorldValidator"],
  "game/driving/createContinuousDrivingKernel.ts":["createContinuousDrivingKernel"],
  "game/driving/audit/RoadPassabilityAudit.ts":["CONTINUOUS_AUDIT_COLLIDER"],
  "game/DrivingSimulation.ts":["initialDrivingState"],
});
const plan=cachedPlan(k.createCityPlan,7,1),c=k.compileCitySurface(plan),surface={...c.surface,revision:"seed7-roll-regression"};
const regions=k.buildSurfaceRegions(surface,k.buildSurfaceIndex(surface));assert.equal(regions.status,"ready");
const edges=plan.roadEdges.filter(e=>e.bridge&&k.bridgeDeckParts(e,plan).filter(p=>p.role==="bridge-deck").length>1);
assert.ok(edges.length>0,"seed 7 must exercise opposite bank leans");
const solids=k.cityCollisionIndex(c.obstacles).solids();
let ticks=0;
for(const edge of edges){
  const ends=k.landingConnectivity({...c,surface},regions).filter(l=>l.landing.structureId===`bridge:${edge.id}`);
  assert.equal(ends.length,2);assert.ok(ends.every(l=>l.connected),JSON.stringify(ends));
  for(const reverse of [false,true]){
    const [a,b]=reverse?[...edge.points].reverse():edge.points,dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),ux=dx/length,uz=dz/length,heading=Math.atan2(dz,dx);
    const x=a.x+ux*3,z=a.z+uz*3,at=regions.classify(x,z,"ground");assert.equal(at.status,"drivable");
    const support=k.footprintSupport(regions,{x,z,heading},at.regionId);assert.ok(support.ok);
    const env=new k.ContinuousDrivingEnvironment(regions,{surfaceRevision:surface.revision,worldRevision:surface.revision,solidRevision:surface.revision,
      solids,...k.CONTINUOUS_AUDIT_COLLIDER,isCurrent:()=>true});
    const kernel=k.createContinuousDrivingKernel(env,{worldRevision:surface.revision,vehicleConfigHash:"roll-regression-calibrated",kernelBuildId:"roll-regression"});
    const validator=new k.ContinuousWorldValidator(env,s=>(s.x-a.x)*ux+(s.z-a.z)*uz);
    let state={...k.initialDrivingState(x,z,heading,at.regionId),y:support.y,pitch:support.pitch,roll:support.roll},reached=false;
    assert.equal(validator.validateStart(state),"valid");
    for(let i=0;i<1200;i++){
      const next=kernel.step(state,{forward:true,backward:false,left:false,right:false});
      assert.equal(next.motion.queryStatus,"resolved",next.motion.reason);assert.equal(validator.validate(state,next),"valid");
      assert.equal(next.motion.blocked,false,`${edge.id}: ${next.motion.reason}`);state=next.state;ticks++;
      if(validator.progress(state)>=length-3){reached=true;break;}
    }
    assert.ok(reached,"segmented connector must carry the full car in both directions");
  }
}
console.log(`Bridge roll transition: seed 7/1 ${edges.length} connector(s), both bank landings connected, ${ticks} full-body/solid independently verified ticks across both directions.`);
