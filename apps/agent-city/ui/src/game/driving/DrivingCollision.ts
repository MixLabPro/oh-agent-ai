/** C-batch swept convex collision. Translation uses interval SAT (analytic TOI).
 * Rotation isolates the earliest skin contact in a bounded time interval; uncertain
 * grazing/precision/budget never becomes a clear path. Input solids are the frozen
 * convex collision proxies supplied by B, not arbitrary renderer meshes. */
import { boxPoly, type Solid, type V3, type CollisionPose, type CollisionDimensions } from "./CollisionIndex";
export const DRIVING_COLLISION_VERSION = 3;
export type BodyPose = CollisionPose;
export type SweepLimits = Readonly<{skin:number;timeTolerance:number;maxTests:number;maxCandidates:number;maxIntervals:number;maxSourceSolids:number;maxPolyVertices:number;maxAxes:number}>;
export const DEFAULT_SWEEP_LIMITS:SweepLimits=Object.freeze({skin:1e-4,timeTolerance:1e-7,maxTests:200000,maxCandidates:4096,maxIntervals:4096,maxSourceSolids:20000,maxPolyVertices:256,maxAxes:1024});
export type SweepContact=Readonly<{solidId:string;time:number;timeUpper:number;normal:V3;kind:"translation"|"rotation"}>;
export type BodySweep=Readonly<{status:"clear"|"contact"|"unresolved";reason:string;contact:SweepContact|null;tests:number}>;
const sub=(a:V3,b:V3):V3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const dot=(a:V3,b:V3)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a:V3,b:V3):V3=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const length=(a:V3)=>Math.hypot(a.x,a.y,a.z);
const scale=(a:V3,s:number):V3=>({x:a.x*s,y:a.y*s,z:a.z*s});
export function interpolateBody(a:BodyPose,b:BodyPose,t:number):BodyPose {
  return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,heading:a.heading+(b.heading-a.heading)*t,pitch:a.pitch+(b.pitch-a.pitch)*t,roll:a.roll+(b.roll-a.roll)*t};
}
function poly(p:BodyPose,d:CollisionDimensions) {
  const c=Math.cos(p.heading),s=Math.sin(p.heading),cp=Math.cos(p.pitch),sp=Math.sin(p.pitch),cr=Math.cos(p.roll),sr=Math.sin(p.roll);
  return boxPoly(p,[scale({x:c*cp,y:sp,z:s*cp},d.halfLength),
    scale({x:-c*sp*cr+s*sr,y:cp*cr,z:-s*sp*cr-c*sr},d.halfHeight),
    scale({x:c*sp*sr+s*cr,y:-cp*sr,z:s*sp*sr-c*cr},d.halfWidth)]);
}
class Budget extends Error{}
type SolidBounds=Readonly<{minX:number;minY:number;minZ:number;maxX:number;maxY:number;maxZ:number}>;
type SolidTree=SolidBounds & Readonly<{left?:SolidTree;right?:SolidTree;solids?:readonly Solid[]}>;
const solidTrees=new WeakMap<readonly Solid[],SolidTree|null>();
function unionBounds(a:SolidBounds,b:SolidBounds):SolidBounds{return {minX:Math.min(a.minX,b.minX),minY:Math.min(a.minY,b.minY),minZ:Math.min(a.minZ,b.minZ),maxX:Math.max(a.maxX,b.maxX),maxY:Math.max(a.maxY,b.maxY),maxZ:Math.max(a.maxZ,b.maxZ)};}
function solidTree(solids:readonly Solid[],spend:()=>void):SolidTree|null {
  if(solidTrees.has(solids))return solidTrees.get(solids)!;
  for(const s of solids){spend();if(![s.minX,s.minY,s.minZ,s.maxX,s.maxY,s.maxZ].every(Number.isFinite)||s.minX>s.maxX||s.minY>s.maxY||s.minZ>s.maxZ)throw new TypeError("invalid-solid-bounds");}
  const build=(items:Solid[]):SolidTree|null=>{
    if(!items.length)return null;
    let bounds:SolidBounds=items[0];for(let i=1;i<items.length;i++)bounds=unionBounds(bounds,items[i]);
    if(items.length<=8)return {...bounds,solids:Object.freeze(items.slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0))};
    const spans=[bounds.maxX-bounds.minX,bounds.maxY-bounds.minY,bounds.maxZ-bounds.minZ],axis=spans[0]>=spans[1]&&spans[0]>=spans[2]?"x":spans[1]>=spans[2]?"y":"z";
    const lo=axis==="x"?"minX":axis==="y"?"minY":"minZ",hi=axis==="x"?"maxX":axis==="y"?"maxY":"maxZ";
    items.sort((a,b)=>((a[lo]+a[hi])-(b[lo]+b[hi]))||(a.id<b.id?-1:a.id>b.id?1:0));
    const mid=items.length>>>1;return {...bounds,left:build(items.slice(0,mid))!,right:build(items.slice(mid))!};
  };
  const tree=build(solids.slice());solidTrees.set(solids,tree);return tree;
}
function overlapsBounds(a:SolidBounds,b:SolidBounds):boolean{return a.minX<=b.maxX&&a.maxX>=b.minX&&a.minY<=b.maxY&&a.maxY>=b.minY&&a.minZ<=b.maxZ&&a.maxZ>=b.minZ;}
/** source must be an immutable snapshot, owned by the caller's versioned world. */
export function sweepBody(solids:readonly Solid[],from:BodyPose,to:BodyPose,dimensions:CollisionDimensions,options:Partial<SweepLimits>={}):BodySweep {
  const p={...DEFAULT_SWEEP_LIMITS,...options};let tests=0;
  const result=(status:BodySweep["status"],reason:string,contact:SweepContact|null=null):BodySweep=>Object.freeze({status,reason,contact:contact?Object.freeze({...contact,normal:Object.freeze({...contact.normal})}):null,tests});
  if(![from.x,from.y,from.z,from.heading,from.pitch,from.roll,to.x,to.y,to.z,to.heading,to.pitch,to.roll,dimensions.halfLength,dimensions.halfWidth,dimensions.halfHeight].every(Number.isFinite)||
    ![dimensions.halfLength,dimensions.halfWidth,dimensions.halfHeight,p.skin,p.timeTolerance].every(n=>Number.isFinite(n)&&n>0)||p.timeTolerance>=1||
    ![p.maxTests,p.maxCandidates,p.maxIntervals,p.maxSourceSolids,p.maxPolyVertices,p.maxAxes].every(n=>Number.isSafeInteger(n)&&n>0))return result("unresolved","invalid-input");
  if(solids.length>p.maxSourceSolids)return result("unresolved","budget");
  const spend=()=>{if(++tests>p.maxTests)throw new Budget();};
  const delta=sub(to,from),radius=Math.hypot(dimensions.halfLength,dimensions.halfWidth,dimensions.halfHeight);
  const magnitude=Math.max(1,...[from.x,from.y,from.z,to.x,to.y,to.z].map(Math.abs));
  const angleMagnitude=Math.max(1,Math.abs(from.heading),Math.abs(to.heading),Math.abs(from.pitch),Math.abs(to.pitch),Math.abs(from.roll),Math.abs(to.roll));
  if(magnitude*256*Number.EPSILON>p.skin*0.01||angleMagnitude*radius*256*Number.EPSILON>p.skin*0.01)return result("unresolved","precision");
  const movingAngles=from.heading!==to.heading||from.pitch!==to.pitch||from.roll!==to.roll;
  const angleTravel=Math.abs(to.heading-from.heading)+Math.abs(to.pitch-from.pitch)+Math.abs(to.roll-from.roll);
  const linearTravel=length(delta),speed=linearTravel+radius*angleTravel;
  // For each body vertex under linearly interpolated Euler angles, the norm of
  // its second derivative is at most radius * (sum of angular rates)^2.
  // Translation is linear and contributes no curvature.
  const curvature=radius*angleTravel*angleTravel;
  if(!Number.isFinite(speed))return result("unresolved","invalid-input");
  const shape=poly(from,dimensions);
  const candidates:Solid[]=[];
  try {
    const query:SolidBounds={minX:Math.min(from.x,to.x)-radius-p.skin,minY:Math.min(from.y,to.y)-radius-p.skin,minZ:Math.min(from.z,to.z)-radius-p.skin,
      maxX:Math.max(from.x,to.x)+radius+p.skin,maxY:Math.max(from.y,to.y)+radius+p.skin,maxZ:Math.max(from.z,to.z)+radius+p.skin};
    const root=solidTree(solids,spend),stack=root?[root]:[];
    while(stack.length){spend();const node=stack.pop()!;if(!overlapsBounds(node,query))continue;
      if(node.solids){for(const solid of node.solids){spend();if(!overlapsBounds(solid,query))continue;if(solid.poly.vertices.length>p.maxPolyVertices)throw new Budget();
        candidates.push(solid);if(candidates.length>p.maxCandidates)throw new Budget();}}
      else{if(node.right)stack.push(node.right);if(node.left)stack.push(node.left);}}
    candidates.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
    let best:SweepContact|null=null;
    for(const solid of candidates) {
      const axes=(a:ReturnType<typeof poly>)=>{
        if(a.faces.length+solid.poly.faces.length+a.edges.length*solid.poly.edges.length>p.maxAxes)throw new Budget();
        return [...a.faces,...solid.poly.faces,...a.edges.flatMap(x=>solid.poly.edges.map(y=>cross(x,y)))];
      };
      const project=(vertices:readonly V3[],n:V3)=>{let lo=Infinity,hi=-Infinity;for(const v of vertices){spend();const x=dot(v,n);lo=Math.min(lo,x);hi=Math.max(hi,x);}return [lo,hi] as const;};
      const separation=(t:number)=>{
        const body=poly(interpolateBody(from,to,t),dimensions);let gap=-Infinity,normal:V3={x:1,y:0,z:0};
        for(const axis of axes(body)){spend();const len=length(axis);if(len<1e-12)continue;const n=scale(axis,1/len),a=project(body.vertices,n),b=project(solid.poly.vertices,n);
          const left=a[0]-b[1],right=b[0]-a[1],roundoff=64*Number.EPSILON*Math.max(1,...a.map(Math.abs),...b.map(Math.abs));
          const g=Math.max(left,right)-roundoff;if(g>gap){gap=g;normal=scale(n,left>=right?1:-1);}}
        return {gap,normal,body};
      };
      const planeGap=(body:ReturnType<typeof poly>,n:V3)=>{
        const a=project(body.vertices,n),b=project(solid.poly.vertices,n);
        return a[0]-b[1]-64*Number.EPSILON*Math.max(1,...a.map(Math.abs),...b.map(Math.abs));
      };
      const rotatingPlaneClear=(a:number,b:number,body:ReturnType<typeof poly>)=>{
        const center=interpolateBody(from,to,a),end=interpolateBody(from,to,b),width=b-a;
        const dh=to.heading-from.heading,dp=to.pitch-from.pitch,dr=to.roll-from.roll;
        const forward=scale(body.edges[0],1/dimensions.halfLength);
        const angular={x:-dp*Math.sin(center.heading)-dr*forward.x,y:-dh-dr*forward.y,z:dp*Math.cos(center.heading)-dr*forward.z};
        if(![angular.x,angular.y,angular.z].every(Number.isFinite))return false;
        const extents=[dimensions.halfLength,dimensions.halfHeight,dimensions.halfWidth];
        for(let axis=0;axis<3;axis++)for(const sign of [1,-1]){
          const n=scale(body.edges[axis],sign/extents[axis]),derivative=cross(angular,n);let clear=true;
          if(![n.x,n.y,n.z,derivative.x,derivative.y,derivative.z].every(Number.isFinite)||Math.abs(length(n)-1)>32*Number.EPSILON)continue;
          for(const vertex of solid.poly.vertices){spend();const relative=sub(center,vertex),gap=dot(relative,n)-extents[axis];
            const distance=Math.max(length(relative),length(sub(end,vertex)));
            const roundoff=256*Number.EPSILON*Math.max(magnitude,distance,1);
            if(gap-roundoff<=p.skin){clear=false;break;}
            const rate=dot(delta,n)+dot(relative,derivative);
            const second=distance*angleTravel*angleTravel+2*linearTravel*angleTravel;
            if(![gap,rate,second].every(Number.isFinite)){clear=false;break;}
            // Each solid vertex stays behind this rotating body-face plane:
            // f(u) >= f(0)+f'(0)u-Mu²/2. The concave lower quadratic reaches
            // its interval minimum at an endpoint, including a grazing start.
            if(gap+Math.min(0,rate*width-second*width*width/2)-roundoff<=p.skin){clear=false;break;}
          }
          if(clear)return true;
        }
        return false;
      };
      let contact:SweepContact|null=null;
      if(!movingAngles) {
        let enter=0,exit=1,normal:V3={x:1,y:0,z:0},initialGap=-Infinity,possible=true;
        const startAxes:Array<{gap:number;normal:V3;slack:number}>=[];
        for(const axis of axes(shape)) {
          spend();const len=length(axis);if(len<1e-12)continue;const n=scale(axis,1/len),a=project(shape.vertices,n),b=project(solid.poly.vertices,n),v=dot(delta,n);
          const slack=64*Number.EPSILON*Math.max(1,...a.map(Math.abs),...b.map(Math.abs));
          const gap=Math.max(a[0]-b[1],b[0]-a[1]);
          startAxes.push({gap,normal:scale(n,a[0]-b[1]>=b[0]-a[1]?1:-1),slack});
          if(gap>initialGap&&enter===0)normal=scale(n,a[0]-b[1]>=b[0]-a[1]?1:-1);
          initialGap=Math.max(initialGap,gap);
          if(Math.abs(v)<1e-15){if(gap>=p.skin-slack){possible=false;break;}continue;}
          const t0=(b[0]-p.skin-slack-a[1])/v,t1=(b[1]+p.skin+slack-a[0])/v;
          const lo=Math.min(t0,t1),hi=Math.max(t0,t1);
          if(lo>enter){enter=lo;normal=scale(n,v>0?-1:1);}exit=Math.min(exit,hi);
          if(enter>exit||exit<0||enter>1){possible=false;break;}
        }
        // A pose may begin inside the conservative skin after B re-fits a sloped
        // support surface. Tangential or outward translation must be allowed to
        // leave that skin; only inward motion toward a nearest active SAT plane
        // remains a t=0 contact. Otherwise every frame re-hits the same wall and
        // burns its entire slide budget without advancing.
        if(possible&&initialGap< -magnitude*256*Number.EPSILON)return result("unresolved","initial-overlap");
        if(possible&&initialGap<=p.skin) {
          const tolerance=Math.max(p.skin*1e-6,64*Number.EPSILON*magnitude);
          const nearest=startAxes.filter(x=>x.gap>=initialGap-tolerance);
          if(nearest.length&&nearest.every(x=>dot(delta,x.normal)>=-1e-12*Math.max(1,length(delta))))possible=false;
        }
        if(possible){
          // A body resting at the skin may leave it freely, including reversing.
          if(exit<=p.timeTolerance&&enter===0)continue;
          const time=Math.max(0,enter);contact={solidId:solid.id,time,timeUpper:time,normal,kind:"translation"};
        }
      } else {
        const start=separation(0);if(start.gap<0)return result("unresolved","initial-overlap");
        if(start.gap<=p.skin)return result("unresolved","rotation-at-contact");
        type Sample=ReturnType<typeof separation>;
        const endTime=best?.timeUpper??1;
        const intervals:Array<{a:number;b:number;left:Sample;right:Sample}>=[{a:0,b:endTime,left:start,right:separation(endTime)}];let count=0;
        while(intervals.length){spend();if(++count>p.maxIntervals)throw new Budget();const interval=intervals.pop()!;
          if(best&&interval.a>best.timeUpper)continue;
          const {left,right:end}=interval,width=interval.b-interval.a;
          if(left.gap>p.skin+speed*width)continue; // certified clear entire interval
          if(rotatingPlaneClear(interval.a,interval.b,left.body))continue;
          // A fixed separating plane bounds every intermediate vertex by its
          // endpoint chord plus M*h²/8. This includes interior rotation extrema,
          // while tangent translation no longer forces thousands of subdivisions.
          const deviation=curvature*width*width/8+128*Number.EPSILON*magnitude;
          if(Math.min(left.gap,planeGap(end.body,left.normal))-deviation>p.skin||
            Math.min(end.gap,planeGap(left.body,end.normal))-deviation>p.skin)continue;
          if((left.gap+end.gap-speed*width)/2>p.skin)continue;
          if(interval.b-interval.a<=p.timeTolerance&&end.gap<=p.skin){
            contact={solidId:solid.id,time:interval.a,timeUpper:interval.b,normal:end.normal,kind:"rotation"};break;
          }
          if(interval.b-interval.a<p.timeTolerance*1e-4)return result("unresolved","rotation-grazing");
          const mid=(interval.a+interval.b)/2;if(mid===interval.a||mid===interval.b)return result("unresolved","precision");
          const middle=separation(mid);
          intervals.push({a:mid,b:interval.b,left:middle,right:end},{a:interval.a,b:mid,left,right:middle});
        }
      }
      if(contact&&(!best||contact.time<best.time))best=contact;
    }
    return best?result("contact","solid",best):result("clear","none");
  }catch(error){if(error instanceof Budget)return result("unresolved","budget");if(error instanceof TypeError&&error.message==="invalid-solid-bounds")return result("unresolved","invalid-input");throw error;}
}
