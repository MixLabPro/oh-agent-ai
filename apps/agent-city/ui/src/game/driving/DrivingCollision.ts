/** C-batch swept convex collision. Translation uses interval SAT (analytic TOI).
 * Rotation isolates the earliest skin contact in a bounded time interval; uncertain
 * grazing/precision/budget never becomes a clear path. Input solids are the frozen
 * convex collision proxies supplied by B, not arbitrary renderer meshes. */
import { boxPoly, type Solid, type V3, type CollisionPose, type CollisionDimensions } from "./CollisionIndex";
export const DRIVING_COLLISION_VERSION = 2;
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
  const speed=length(delta)+radius*(Math.abs(to.heading-from.heading)+Math.abs(to.pitch-from.pitch)+Math.abs(to.roll-from.roll));
  if(!Number.isFinite(speed))return result("unresolved","invalid-input");
  const shape=poly(from,dimensions);
  const candidates:Solid[]=[];
  try {
    for(const solid of solids){spend();if(solid.maxX<Math.min(from.x,to.x)-radius-p.skin||solid.minX>Math.max(from.x,to.x)+radius+p.skin||
      solid.maxY<Math.min(from.y,to.y)-radius-p.skin||solid.minY>Math.max(from.y,to.y)+radius+p.skin||solid.maxZ<Math.min(from.z,to.z)-radius-p.skin||solid.minZ>Math.max(from.z,to.z)+radius+p.skin)continue;
      if(solid.poly.vertices.length>p.maxPolyVertices)throw new Budget();
      candidates.push(solid);if(candidates.length>p.maxCandidates)throw new Budget();}
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
        return {gap,normal};
      };
      let contact:SweepContact|null=null;
      if(!movingAngles) {
        let enter=0,exit=1,normal:V3={x:1,y:0,z:0},initialGap=-Infinity,possible=true;
        for(const axis of axes(shape)) {
          spend();const len=length(axis);if(len<1e-12)continue;const n=scale(axis,1/len),a=project(shape.vertices,n),b=project(solid.poly.vertices,n),v=dot(delta,n);
          const slack=64*Number.EPSILON*Math.max(1,...a.map(Math.abs),...b.map(Math.abs));
          const gap=Math.max(a[0]-b[1],b[0]-a[1]);
          if(gap>initialGap&&enter===0)normal=scale(n,a[0]-b[1]>=b[0]-a[1]?1:-1);
          initialGap=Math.max(initialGap,gap);
          if(Math.abs(v)<1e-15){if(gap>=p.skin-slack){possible=false;break;}continue;}
          const t0=(b[0]-p.skin-slack-a[1])/v,t1=(b[1]+p.skin+slack-a[0])/v;
          const lo=Math.min(t0,t1),hi=Math.max(t0,t1);
          if(lo>enter){enter=lo;normal=scale(n,v>0?-1:1);}exit=Math.min(exit,hi);
          if(enter>exit||exit<0||enter>1){possible=false;break;}
        }
        if(possible){
          if(initialGap< -magnitude*256*Number.EPSILON)return result("unresolved","initial-overlap");
          // A body resting at the skin may leave it freely, including reversing.
          if(exit<=p.timeTolerance&&enter===0)continue;
          const time=Math.max(0,enter);contact={solidId:solid.id,time,timeUpper:time,normal,kind:"translation"};
        }
      } else {
        const start=separation(0);if(start.gap<0)return result("unresolved","initial-overlap");
        if(start.gap<=p.skin)return result("unresolved","rotation-at-contact");
        const intervals:Array<{a:number;b:number;gap:number}>=[{a:0,b:best?.timeUpper??1,gap:start.gap}];let count=0;
        while(intervals.length){spend();if(++count>p.maxIntervals)throw new Budget();const interval=intervals.pop()!;
          if(best&&interval.a>best.timeUpper)continue;
          if(interval.gap>p.skin+speed*(interval.b-interval.a))continue; // certified clear entire interval
          const end=separation(interval.b);
          if((interval.gap+end.gap-speed*(interval.b-interval.a))/2>p.skin)continue;
          if(interval.b-interval.a<=p.timeTolerance&&end.gap<=p.skin){
            contact={solidId:solid.id,time:interval.a,timeUpper:interval.b,normal:end.normal,kind:"rotation"};break;
          }
          if(interval.b-interval.a<p.timeTolerance*1e-4)return result("unresolved","rotation-grazing");
          const mid=(interval.a+interval.b)/2;if(mid===interval.a||mid===interval.b)return result("unresolved","precision");
          const middle=separation(mid);
          intervals.push({a:mid,b:interval.b,gap:middle.gap},{a:interval.a,b:mid,gap:interval.gap});
        }
      }
      if(contact&&(!best||contact.time<best.time))best=contact;
    }
    return best?result("contact","solid",best):result("clear","none");
  }catch(error){if(error instanceof Budget)return result("unresolved","budget");throw error;}
}
