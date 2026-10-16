/** Frozen CPU solid queries. No layer filtering: bridge piers span several height layers.
 * Pose is the CENTRE of the body box, not the wheel support height. Angles interpolate
 * literally (no implicit shortest arc). Sweep is conservative advancement of the full
 * rotating OBB; it never certifies clearance from endpoint samples alone.
 */
import type { StructureObstacle } from "../../engine/surface/compileSurface";

export const COLLISION_RULES_VERSION = 1;
type V = Readonly<{ x: number; y: number; z: number }>;
export type CollisionPose = V & Readonly<{ heading: number; pitch: number; roll: number }>;
export type CollisionDimensions = Readonly<{ halfLength: number; halfWidth: number; halfHeight: number }>;
export type CollisionLimits = Readonly<{ maxObstacles: number; maxVertices: number; maxNodes: number; maxCandidates: number; maxTests: number; maxIterations: number; skin: number }>;
export const DEFAULT_COLLISION_LIMITS: CollisionLimits = Object.freeze({ maxObstacles: 100000, maxVertices: 1000000, maxNodes: 400000,
  maxCandidates: 4096, maxTests: 1000000, maxIterations: 512, skin: 1e-5 });
export type CollisionResult = Readonly<{ status: "clear" | "contact" | "unresolved"; revision: string;
  reason: "none" | "solid" | "initial-overlap" | "budget" | "invalid-input" | "precision";
  /** Certified collision-free prefix, excluding the contact skin. */
  lastSafeFraction: number; contact: Readonly<{ obstacleId: string; toi: number; normal: V; point: V }> | null; tests: number }>;
type Bound = { min: V; max: V };
type Solid = { id: string; vertices: readonly V[]; normals: readonly V[]; edges: readonly V[]; bound: Bound };
type Node = Bound & { left?: Node; right?: Node; solids?: readonly Solid[] };
const add = (a: V, b: V): V => ({ x: a.x+b.x, y: a.y+b.y, z: a.z+b.z });
const sub = (a: V, b: V): V => ({ x: a.x-b.x, y: a.y-b.y, z: a.z-b.z });
const mul = (a: V, n: number): V => ({ x:a.x*n,y:a.y*n,z:a.z*n });
const dot = (a: V,b: V) => a.x*b.x+a.y*b.y+a.z*b.z;
const cross = (a: V,b: V): V => ({ x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x });
const length = (a: V) => Math.hypot(a.x,a.y,a.z);
const unit = (a: V): V => mul(a,1/length(a));
const finite = (a: V) => Number.isFinite(a.x)&&Number.isFinite(a.y)&&Number.isFinite(a.z);
const bounds = (v: readonly V[]): Bound => ({ min:{x:Math.min(...v.map(p=>p.x)),y:Math.min(...v.map(p=>p.y)),z:Math.min(...v.map(p=>p.z))},
  max:{x:Math.max(...v.map(p=>p.x)),y:Math.max(...v.map(p=>p.y)),z:Math.max(...v.map(p=>p.z))} });
const intersects = (a: Bound,b: Bound) => a.min.x<=b.max.x&&a.max.x>=b.min.x&&a.min.y<=b.max.y&&a.max.y>=b.min.y&&a.min.z<=b.max.z&&a.max.z>=b.min.z;
const union = (a: Bound,b: Bound): Bound => ({min:{x:Math.min(a.min.x,b.min.x),y:Math.min(a.min.y,b.min.y),z:Math.min(a.min.z,b.min.z)},max:{x:Math.max(a.max.x,b.max.x),y:Math.max(a.max.y,b.max.y),z:Math.max(a.max.z,b.max.z)}});
const lexical = (a: string,b: string) => a < b ? -1 : a > b ? 1 : 0;
class Invalid extends Error {}
class Budget extends Error {}
function shape(id: string, vertices: readonly V[], faces: readonly (readonly number[])[]): Solid {
  const normals: V[]=[]; const edges: V[]=[];
  for (const f of faces) {
    const n=cross(sub(vertices[f[1]],vertices[f[0]]),sub(vertices[f[2]],vertices[f[0]]));
    if (!(length(n)>1e-12)) throw new Invalid();
    const normal=unit(n); normals.push(normal);
    // Every face must be planar, with the entire convex polyhedron on one side.
    const distances=vertices.map(v=>dot(normal,sub(v,vertices[f[0]])));
    const scale=Math.max(1,...vertices.map(v=>length(sub(v,vertices[f[0]]))));
    if (f.some(i=>Math.abs(distances[i])>128*Number.EPSILON*scale) || (Math.min(...distances)<-128*Number.EPSILON*scale&&Math.max(...distances)>128*Number.EPSILON*scale)) throw new Invalid();
    for (let i=0;i<f.length;i++) { const e=sub(vertices[f[(i+1)%f.length]],vertices[f[i]]); if (!(length(e)>1e-12)) throw new Invalid(); edges.push(unit(e)); }
  }
  return {id,vertices,normals,edges,bound:bounds(vertices)};
}
const boxFaces = [[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]];
const orient = (a: V,b: V,c: V) => (b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
/** Ear-clipping simple prisms preserves concave islands instead of blocking their convex hull. */
function prism(obstacle: Extract<StructureObstacle,{shape:"prism"}>, spend: () => void): Solid[] {
  const {ring,yMin,yMax,id}=obstacle;
  if (ring.length<3||!Number.isFinite(yMin)||!Number.isFinite(yMax)||!(yMin<yMax)) throw new Invalid();
  const vertices=ring.map(p=>({x:p.x,y:yMin,z:p.z})); if(vertices.some(p=>!finite(p)))throw new Invalid();
  const on=(a:V,b:V,p:V)=>orient(a,b,p)===0&&p.x>=Math.min(a.x,b.x)&&p.x<=Math.max(a.x,b.x)&&p.z>=Math.min(a.z,b.z)&&p.z<=Math.max(a.z,b.z);
  for(let i=0;i<vertices.length;i++)for(let j=i+1;j<vertices.length;j++) {
    spend(); if(j===i+1||(i===0&&j===vertices.length-1))continue;
    const a=vertices[i],b=vertices[(i+1)%vertices.length],c=vertices[j],d=vertices[(j+1)%vertices.length];
    if((orient(a,b,c)*orient(a,b,d)<0&&orient(c,d,a)*orient(c,d,b)<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))throw new Invalid();
  }
  const area=vertices.reduce((n,p,i)=>n+p.x*vertices[(i+1)%vertices.length].z-p.z*vertices[(i+1)%vertices.length].x,0);
  if(!Number.isFinite(area)||area===0)throw new Invalid();
  const remaining=vertices.map((_,i)=>i); if(area<0)remaining.reverse(); const triangles:number[][]=[];
  while(remaining.length>3){let clipped=false; for(let i=0;i<remaining.length;i++) {
    spend();const a=remaining[(i+remaining.length-1)%remaining.length],b=remaining[i],c=remaining[(i+1)%remaining.length];
    if(orient(vertices[a],vertices[b],vertices[c])<=0)continue;
    if(remaining.some(k=>{spend();return k!==a&&k!==b&&k!==c&&orient(vertices[a],vertices[b],vertices[k])>=0&&orient(vertices[b],vertices[c],vertices[k])>=0&&orient(vertices[c],vertices[a],vertices[k])>=0;}))continue;
    triangles.push([a,b,c]);remaining.splice(i,1);clipped=true;break;
  } if(!clipped)throw new Invalid();}
  triangles.push(remaining);
  return triangles.map(t=>{const low=t.map(i=>vertices[i]), high=low.map(p=>({...p,y:yMax})); return shape(id,[...low,...high],[[0,1,2],[3,5,4],[0,3,4,1],[1,4,5,2],[2,5,3,0]]);});
}
function body(p: CollisionPose,d: CollisionDimensions): Solid {
  // Long axis matches DrivingSimulation: heading 0 points +X; pitch raises the nose.
  const c=Math.cos(p.heading),s=Math.sin(p.heading),cp=Math.cos(p.pitch),sp=Math.sin(p.pitch),cr=Math.cos(p.roll),sr=Math.sin(p.roll);
  const forward:V={x:c*cp,y:sp,z:s*cp}, up0:V={x:-c*sp,y:cp,z:-s*sp}, side0:V={x:-s,y:0,z:c};
  const up=add(mul(up0,cr),mul(side0,-sr)),side=add(mul(side0,cr),mul(up0,sr));
  const vertices=[-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>add(p,add(mul(forward,x*d.halfLength),add(mul(up,y*d.halfHeight),mul(side,z*d.halfWidth)))))));
  return {id:"body",vertices,normals:[forward,up,side],edges:[forward,up,side],bound:bounds(vertices)};
}
/** SAT projection gap is a lower bound on Euclidean separation, sufficient for safe advancement. */
function separation(a: Solid,b: Solid,spend:()=>void): {gap:number;normal:V} {
  let gap=-Infinity,normal:V={x:1,y:0,z:0};
  const test=(axis:V)=>{spend();const len=length(axis);if(len<1e-12)return;const n=mul(axis,1/len);
    const av=a.vertices.map(v=>dot(v,n)),bv=b.vertices.map(v=>dot(v,n));const left=Math.min(...av)-Math.max(...bv),right=Math.min(...bv)-Math.max(...av);
    const roundoff=64*Number.EPSILON*Math.max(1,...av.map(Math.abs),...bv.map(Math.abs));
    const g=Math.max(left,right)-roundoff;if(g>gap){gap=g;normal=mul(n,left>=right?1:-1);}};
  for(const n of a.normals)test(n);for(const n of b.normals)test(n);for(const x of a.edges)for(const y of b.edges)test(cross(x,y));
  return {gap,normal};
}
function valid(p:CollisionPose,d:CollisionDimensions){return finite(p)&&[p.heading,p.pitch,p.roll,d.halfLength,d.halfWidth,d.halfHeight].every(Number.isFinite)&&d.halfLength>0&&d.halfWidth>0&&d.halfHeight>0;}
export type CollisionIndexBuild = Readonly<{status:"ready";index:CollisionIndex}> | Readonly<{status:"unresolved";reason:"invalid-input"|"budget"}>;
export function buildCollisionIndex(input: Readonly<{revision:string;obstacles:readonly StructureObstacle[]}>, options: Partial<CollisionLimits> = {}): CollisionIndexBuild {
  const limits={...DEFAULT_COLLISION_LIMITS,...options};let tests=0;
  const spend=()=>{if(++tests>limits.maxTests)throw new Budget();};
  try {
    if(!input.revision||!Number.isFinite(limits.skin)||limits.skin<=0||Object.entries(limits).some(([k,v])=>k!=="skin"&&(!Number.isSafeInteger(v)||v<1)))throw new Invalid();
    if(input.obstacles.length>limits.maxObstacles)throw new Budget();
    const ids=new Set<string>();const solids:Solid[]=[];let vertexCount=0;
    for(const obstacle of input.obstacles){spend();if(!obstacle.id||ids.has(obstacle.id))throw new Invalid();ids.add(obstacle.id);
      vertexCount+=obstacle.shape==="box"?obstacle.corners.length:Math.max(0,6*(obstacle.ring.length-2));if(vertexCount>limits.maxVertices)throw new Budget();
      if(obstacle.shape==="box") {if(obstacle.corners.length!==8||obstacle.corners.some(p=>!finite(p)))throw new Invalid();solids.push(shape(obstacle.id,obstacle.corners.map(p=>({...p})),boxFaces));}
      else if(obstacle.shape==="prism")solids.push(...prism(obstacle,spend));else throw new Invalid();
    }
    let nodes=0;
    const tree=(items:Solid[]):Node|null=>{if(!items.length)return null;if(++nodes>limits.maxNodes)throw new Budget();spend();let bound=items[0].bound;for(const s of items)bound=union(bound,s.bound);
      if(items.length<=4)return {...bound,solids:items};const axes=["x","y","z"] as const;const axis=axes.reduce((best,a)=>bound.max[a]-bound.min[a]>bound.max[best]-bound.min[best]?a:best,"x");
      items.sort((a,b)=>(a.bound.min[axis]+a.bound.max[axis])-(b.bound.min[axis]+b.bound.max[axis])||lexical(a.id,b.id));const mid=Math.floor(items.length/2);
      return {...bound,left:tree(items.slice(0,mid))!,right:tree(items.slice(mid))!};};
    return Object.freeze({status:"ready",index:new CollisionIndex(input.revision,tree(solids),Object.freeze(limits))});
  } catch(e){if(e instanceof Invalid||e instanceof Budget)return Object.freeze({status:"unresolved",reason:e instanceof Budget?"budget":"invalid-input"});throw e;}
}
export class CollisionIndex {
  constructor(readonly revision:string, private readonly root:Node|null, readonly limits:CollisionLimits){}
  overlap(pose:CollisionPose,dimensions:CollisionDimensions):CollisionResult{return this.sweep(pose,pose,dimensions);}
  sweep(from:CollisionPose,to:CollisionPose,dimensions:CollisionDimensions):CollisionResult {
    let tests=0,lastSafeFraction=0;
    const result=(status:CollisionResult["status"],reason:CollisionResult["reason"],contact:CollisionResult["contact"]=null):CollisionResult=>Object.freeze({status,reason,revision:this.revision,lastSafeFraction,contact,tests});
    const spend=()=>{if(++tests>this.limits.maxTests)throw new Budget();};
    if(!valid(from,dimensions)||!valid(to,dimensions))return result("unresolved","invalid-input");
    const coordinateScale=Math.max(1,Math.abs(from.x),Math.abs(from.y),Math.abs(from.z),Math.abs(to.x),Math.abs(to.y),Math.abs(to.z));
    if(coordinateScale*128*Number.EPSILON>this.limits.skin)return result("unresolved","precision");
    const radius=Math.hypot(dimensions.halfLength,dimensions.halfWidth,dimensions.halfHeight);
    const delta=sub(to,from),motion=length(delta)+radius*(Math.abs(to.heading-from.heading)+Math.abs(to.pitch-from.pitch)+Math.abs(to.roll-from.roll));
    if(!Number.isFinite(motion))return result("unresolved","invalid-input");
    const broad:Bound={min:{x:Math.min(from.x,to.x)-radius-this.limits.skin,y:Math.min(from.y,to.y)-radius-this.limits.skin,z:Math.min(from.z,to.z)-radius-this.limits.skin},max:{x:Math.max(from.x,to.x)+radius+this.limits.skin,y:Math.max(from.y,to.y)+radius+this.limits.skin,z:Math.max(from.z,to.z)+radius+this.limits.skin}};
    try {
      const candidates:Solid[]=[];const stack=this.root?[this.root]:[];
      while(stack.length){spend();const node=stack.pop()!;if(!intersects(node,broad))continue;if(node.solids){for(const solid of node.solids){spend();if(intersects(solid.bound,broad)){candidates.push(solid);if(candidates.length>this.limits.maxCandidates)throw new Budget();}}}else{if(node.right)stack.push(node.right);if(node.left)stack.push(node.left);}}
      candidates.sort((a,b)=>lexical(a.id,b.id));if(!candidates.length){lastSafeFraction=1;return result("clear","none");}
      let t=0;
      for(let iteration=0;iteration<this.limits.maxIterations;iteration++){
        const p:CollisionPose={x:from.x+delta.x*t,y:from.y+delta.y*t,z:from.z+delta.z*t,heading:from.heading+(to.heading-from.heading)*t,pitch:from.pitch+(to.pitch-from.pitch)*t,roll:from.roll+(to.roll-from.roll)*t};
        const vehicle=body(p,dimensions);let nearest:{solid:Solid;gap:number;normal:V}|null=null;
        for(const solid of candidates){const found=separation(vehicle,solid,spend);if(!Number.isFinite(found.gap))return result("unresolved","precision");if(!nearest||found.gap<nearest.gap)nearest={solid,...found};}
        const hit=nearest!;
        if(hit.gap<=this.limits.skin){const point=vehicle.vertices.reduce((best,v)=>dot(v,hit.normal)<dot(best,hit.normal)?v:best,vehicle.vertices[0]);return result("contact",t===0&&hit.gap<0?"initial-overlap":"solid",Object.freeze({obstacleId:hit.solid.id,toi:t,normal:Object.freeze(hit.normal),point:Object.freeze({...point})}));}
        lastSafeFraction=t;
        if(t===1||motion===0){lastSafeFraction=1;return result("clear","none");}
        // Any point travels at most motion per unit t. This step cannot pass a solid.
        const step=(hit.gap-this.limits.skin)/motion;
        if(!(step>0))return result("unresolved","precision");
        if(step<1e-12){const point=vehicle.vertices.reduce((best,v)=>dot(v,hit.normal)<dot(best,hit.normal)?v:best,vehicle.vertices[0]);return result("contact","solid",Object.freeze({obstacleId:hit.solid.id,toi:t,normal:Object.freeze(hit.normal),point:Object.freeze({...point})}));}
        if(t+step===t)return result("unresolved","precision");
        const next=Math.min(1,t+step);
        t=next;
      }
      return result("unresolved","budget");
    }catch(e){if(e instanceof Budget)return result("unresolved","budget");throw e;}
  }
}
