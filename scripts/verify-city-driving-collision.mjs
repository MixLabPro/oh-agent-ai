#!/usr/bin/env node
import assert from 'node:assert/strict';
import { loadCity } from './city-kit/index.mjs';
const { buildCollisionIndex, boxCorners, boxSolidFromCorners, carBody } = await loadCity({
  'game/driving/CollisionIndex.ts':['buildCollisionIndex','boxSolidFromCorners','carBody'],
  'engine/surface/structureCompiler.ts':['boxCorners'],
});
const box=(id,x,y,z,sx,sy,sz,extra={})=>({id,role:'pier',shape:'box',corners:boxCorners({x,y,z,sx,sy,sz,rx:0,ry:0,rz:0,order:'XYZ',...extra})});
const pose=(x=0,y=1,z=0,heading=0,pitch=0,roll=0)=>({x,y,z,heading,pitch,roll});
const dims={halfLength:1.4,halfWidth:0.7,halfHeight:0.5};
const index=(obstacles,limits={})=>{const result=buildCollisionIndex({revision:'world-fixture',obstacles},limits);assert.equal(result.status,'ready');return result.index;};
const pier=index([box('pier',0,0,0,0.1,3,0.1)]);
assert.equal(pier.overlap(pose(),dims).status,'contact');
assert.equal(pier.overlap(pose(0,5),dims).status,'clear','height intervals separate bridge top and underpass');
const crossing=pier.sweep(pose(-20),pose(20),dims);
assert.equal(crossing.status,'contact');assert.equal(crossing.revision,'world-fixture');
assert.ok(crossing.contact.toi>0.46&&crossing.contact.toi<0.47);
assert.ok(crossing.contact.normal.x<-.99);assert.ok(crossing.lastSafeFraction<=crossing.contact.toi);
assert.equal(pier.overlap(pose(-20),dims).status,'clear');assert.equal(pier.overlap(pose(20),dims).status,'clear');
const rail=index([box('rail',0,0,1.3,0.1,3,0.1)]);
assert.equal(rail.overlap(pose(0,1,0,-Math.PI/4),dims).status,'clear');
assert.equal(rail.overlap(pose(0,1,0,Math.PI/4),dims).status,'clear');
assert.equal(rail.sweep(pose(0,1,0,-Math.PI/4),pose(0,1,0,-Math.PI*7/4),dims).status,'contact','literal long-angle sweep catches rotation between clear endpoints');
const pitchBarrier=index([box('overhead',1,1.8,0,0.1,0.1,1)]);
assert.equal(pitchBarrier.overlap(pose(),dims).status,'clear');
assert.equal(pitchBarrier.sweep(pose(),pose(0,1,0,0,Math.PI/2),dims).status,'contact','pitch rotation is part of CCD');
const slanted=index([box('tilted',0,2,0,8,.2,8,{rz:.3})]);
assert.equal(slanted.overlap(pose(-3,.8),dims).status,'contact','tilted underside not AABB-only slab');
assert.equal(slanted.overlap(pose(3,.8),{halfLength:.1,halfWidth:.1,halfHeight:.1}).status,'clear');
const island={id:'concave-island',role:'island',shape:'prism',ring:[{x:0,z:0},{x:4,z:0},{x:4,z:1},{x:1,z:1},{x:1,z:4},{x:0,z:4}],yMin:0,yMax:2};
const concave=index([island]);const tiny={halfLength:.1,halfWidth:.1,halfHeight:.1};
assert.equal(concave.overlap(pose(2,1,2),tiny).status,'clear','concavity is not filled by a convex hull');
assert.equal(concave.sweep(pose(2,1,2),pose(-2,1,2),tiny).status,'contact');
const input=[box('owned',0,0,0,1,2,1)];const owned=index(input);input[0].corners.forEach(p=>p.x+=100);
assert.equal(owned.overlap(pose(),dims).status,'contact','input mutation cannot change frozen solids');
assert.equal(index([],{}).sweep(pose(-10),pose(10),dims).status,'clear');
assert.equal(pier.sweep(pose(),pose(Infinity),dims).reason,'invalid-input');
assert.equal(index([box('one',0,0,0,1,2,1)],{maxTests:10}).sweep(pose(-10),pose(10),dims).status,'unresolved');
assert.equal(index([box('one',0,0,0,1,2,1)],{maxIterations:1}).sweep(pose(-10),pose(10),dims).status,'unresolved');
assert.equal(buildCollisionIndex({revision:'x',obstacles:[box('a',0,0,0,1,1,1),box('b',0,0,0,1,1,1)]},{maxObstacles:1}).reason,'budget');
assert.equal(index([box('a',0,0,0,1,1,1),box('b',0,0,0,1,1,1)],{maxCandidates:1}).overlap(pose(),dims).reason,'budget');
const bad=box('bad',0,0,0,1,1,1);bad.corners[0].x+=.2;
assert.equal(buildCollisionIndex({revision:'x',obstacles:[bad]}).reason,'invalid-input');
assert.equal(buildCollisionIndex({revision:'x',obstacles:[{...island,ring:[{x:0,z:0},{x:1,z:1},{x:0,z:1},{x:1,z:0}]}]}).reason,'invalid-input');
for(let i=0;i<30;i++){
  const angle=i*.173,dx=Math.cos(angle),dz=Math.sin(angle),r=.05;
  const world=index([box(`needle-${i}`,0,0,0,r,3,r)]);
  const a=pose(-20*dx,1,-20*dz,angle),b=pose(20*dx,1,20*dz,angle);
  const hit=world.sweep(a,b,dims);assert.equal(hit.status,'contact',`needle crossing ${i}`);
  assert.equal(world.overlap(a,dims).status,'clear');assert.equal(world.overlap(b,dims).status,'clear');
}
const ordered=index([box('z',0,0,0,1,3,1),box('a',0,0,0,1,3,1)]).overlap(pose(),dims);
assert.equal(ordered.contact.obstacleId,'a','simultaneous contact tie uses stable obstacle id');
{
 const c=box('legacy-box',0,0,0,1,3,1);const legacy=buildCollisionIndex([boxSolidFromCorners(c.id,'building',c.corners)]);
 assert.equal(legacy.report.byRole.building,1);assert.equal(legacy.report.rejected,0);
 assert.equal(legacy.hit(carBody({x:0,z:0,heading:0},{y:0,pitch:0,roll:0},1.4,.7)).status,'hit');
 assert.equal(legacy.hit(carBody({x:10,z:0,heading:0},{y:0,pitch:0,roll:0},1.4,.7)).status,'clear');
 assert.throws(()=>{legacy.solids()[0].poly.vertices[0].x=123;},TypeError,'compatibility solids are immutable too');
 const budgeted=buildCollisionIndex([boxSolidFromCorners('first','building',c.corners),boxSolidFromCorners('second','building',c.corners)],{cellSize:8,maxCellsPerSolid:1,maxCandidates:1});
 assert.equal(budgeted.hit(carBody({x:0,z:0,heading:0},{y:0,pitch:0,roll:0},1.4,.7)).status,'budget');
}
console.log('CollisionIndex: owned BVH, vertical separation, tilted solids, concave prism, fast/rotating/pitch CCD, stable ties, invalid input and closed budgets passed.');
if(process.argv.includes('--cities')){
  const { cachedPlan }=await import('./city-kit/index.mjs');
  const { createCityPlan, compileCitySurface }=await loadCity({'engine/cityPlan.ts':['createCityPlan'],'engine/surface/compileSurface.ts':['compileCitySurface']});
  for(const seed of [1,7,42,2026,65537])for(const tier of [1,2,3]){
    const city=compileCitySurface(cachedPlan(createCityPlan,seed,tier));
    const built=buildCollisionIndex({revision:`city:${seed}/${tier}`,obstacles:city.obstacles});
    assert.equal(built.status,'ready',`${seed}/${tier}: ${built.reason}`);
    for(const obstacle of city.obstacles.filter(o=>o.shape==='box')){
      const centre=obstacle.corners.reduce((p,c)=>({x:p.x+c.x/8,y:p.y+c.y/8,z:p.z+c.z/8}),{x:0,y:0,z:0});
      const hit=built.index.overlap({...centre,heading:0,pitch:0,roll:0},tiny);
      assert.equal(hit.status,'contact',`${seed}/${tier} centre ${obstacle.id}`);
    }
    console.log(`Collision city ${seed}/${tier}: ${city.obstacles.length} structural obstacles indexed; all box centres block.`);
  }
}
