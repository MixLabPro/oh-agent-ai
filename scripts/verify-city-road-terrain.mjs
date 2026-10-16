#!/usr/bin/env node
import assert from 'node:assert/strict';
import {sceneKit,buildParts} from './city-kit/scene-parts.mjs';
const k=await sceneKit({
 'engine/surface/terrainSampling.ts':['TERRAIN_SEGMENTS'],
 'engine/surface/compileSurface.ts':['compileCitySurface'],
 'engine/surface/SurfaceIndex.ts':['buildSurfaceIndex'],
 'engine/surface/surfaceRegions.ts':['buildSurfaceRegions'],
 'game/driving/surfaceFootprint.ts':['footprintSupport','DEFAULT_FOOTPRINT_PARAMS'],
 'game/driving/citySolids.ts':['cityCollisionIndex'],
 'game/driving/ContinuousDrivingEnvironment.ts':['ContinuousDrivingEnvironment'],
 'game/driving/ContinuousWorldValidator.ts':['ContinuousWorldValidator'],
 'game/driving/createContinuousDrivingKernel.ts':['createContinuousDrivingKernel'],
 'game/driving/audit/RoadPassabilityAudit.ts':['CONTINUOUS_AUDIT_COLLIDER'],
 'game/DrivingSimulation.ts':['initialDrivingState'],
});
assert.equal(k.DEFAULT_FOOTPRINT_PARAMS.maxWheelResidual,.06,'wheel tolerance must not change');
const {parts,layout}=buildParts(k,0,1),lease=parts.acquireDrivingWorldSource();
try {
 const c=k.compileCitySurface(layout),surface={...c.surface,revision:'terrain-resolution-384-0-1'},regions=k.buildSurfaceRegions(surface,k.buildSurfaceIndex(surface));
 assert.equal(regions.status,'ready');
 let vertices=0;
 parts.group.traverse(o=>{
  const p=o.geometry?.attributes?.position;
  if(o.geometry?.type!=='PlaneGeometry'||p?.count!==(k.TERRAIN_SEGMENTS+1)**2)return;
  for(let i=0;i<p.count;i++)assert.ok(Math.abs(p.getY(i)-layout.terrain.height(p.getX(i),p.getZ(i)))<1e-5,'rendered terrain shares original height source');
  vertices+=p.count;
 });
 assert.equal(vertices,(k.TERRAIN_SEGMENTS+1)**2,'verify the real rendered terrain mesh');
 const at=regions.classify(158.7,429.1,'ground');assert.equal(at.status,'drivable');
 let maxResidual=0;
 for(let i=0;i<32;i++){
  const s=k.footprintSupport(regions,{x:158.7,z:429.1,heading:i*Math.PI/16},at.regionId);
  assert.ok(s.ok,`formerly twisted footprint heading ${i}: ${JSON.stringify(s)}`);
  const residual=Math.abs((s.wheels[0]-s.wheels[1])-(s.wheels[2]-s.wheels[3]))/2;
  assert.ok(residual<=k.DEFAULT_FOOTPRINT_PARAMS.maxWheelResidual);maxResidual=Math.max(maxResidual,residual);
 }
 const heading=Math.atan2(20,12.18),ux=Math.cos(heading),uz=Math.sin(heading);
 const env=new k.ContinuousDrivingEnvironment(regions,{surfaceRevision:surface.revision,worldRevision:surface.revision,solidRevision:surface.revision,
  solids:k.cityCollisionIndex(c.obstacles,lease.source.solids()).solids(),...k.CONTINUOUS_AUDIT_COLLIDER,isCurrent:()=>true});
 const kernel=k.createContinuousDrivingKernel(env,{worldRevision:surface.revision,vehicleConfigHash:'calibrated-road-terrain',kernelBuildId:'terrain-384-regression-v1'});
 for(const reverse of [false,true]){
  const sign=reverse?-1:1,x=158.7-ux*sign*5,z=429.1-uz*sign*5,h=heading+(reverse?Math.PI:0);
  const s=k.footprintSupport(regions,{x,z,heading:h},at.regionId);assert.ok(s.ok);
  let state={...k.initialDrivingState(x,z,h,at.regionId),y:s.y,pitch:s.pitch,roll:s.roll},travel=0;
  const v=new k.ContinuousWorldValidator(env,next=>(next.x-x)*ux*sign+(next.z-z)*uz*sign);assert.equal(v.validateStart(state),'valid');
  for(let i=0;i<500&&travel<10;i++){
   const next=kernel.step(state,{forward:true,backward:false,left:false,right:false});
   assert.equal(next.motion.queryStatus,'resolved',next.motion.reason);assert.equal(next.motion.blocked,false,next.motion.reason);
   assert.equal(v.validate(state,next),'valid');state=next.state;travel=v.progress(state);
  }
  assert.ok(travel>=10,'full colliding car crosses old wheel-twist site in both directions');
 }
 console.log(`Road terrain: resolution ${k.TERRAIN_SEGMENTS}; ${vertices} real terrain vertices match original height field; old 0/1 twist site supports 32 headings (max residual ${maxResidual.toFixed(6)}) and two independently validated continuous full-body runs at unchanged 0.06 tolerance.`);
}finally{lease.release();parts.dispose();}
