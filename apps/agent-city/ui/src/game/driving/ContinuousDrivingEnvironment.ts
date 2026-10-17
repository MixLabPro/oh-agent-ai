/** C integration, separate from B's legacy whole-step-rejection environment.
 * No recovery, route search, audit outcome attribution or release graph lives here.
 * Every segment (including tangent slides) is re-fitted to B's surface authority.
 */
import type { SurfaceRegionsBuild } from "../../engine/surface/surfaceRegions";
import type { DrivingEnvironment, DrivingMoveResult, DrivingMotion, DrivingState, DrivingTrajectoryPose, DrivingContact } from "../DrivingSimulation";
import type { Solid, CollisionDimensions } from "./CollisionIndex";
import { DEFAULT_FOOTPRINT_PARAMS, footprintSupport, validateMotion, type FootprintParams, type VehicleFootprint } from "./surfaceFootprint";
import { DRIVING_FOOTPRINT } from "./vehicleFootprint";
import { resolveDrivingCollision, type SupportedPose } from "./DrivingCollisionSolver";
import { DEFAULT_SWEEP_LIMITS, interpolateBody, type SweepLimits, type BodyPose } from "./DrivingCollision";
export const CONTINUOUS_DRIVING_QUERY_VERSION=3;
export type ContinuousWorldBinding=Readonly<{
  surfaceRevision:string;worldRevision:string;solidRevision:string;solids:readonly Solid[];
  dimensions:CollisionDimensions;centerHeight:number;isCurrent():boolean;
}>;
export type ContinuousMotionParams=Partial<SweepLimits>&Readonly<{maxSlides?:number;maxSupportSegments?:number;supportStep?:number}>;
export const CONTINUOUS_MOTION_DEFAULTS=Object.freeze({maxSlides:4,maxSupportSegments:64,supportStep:0.1});
export class ContinuousDrivingEnvironment implements DrivingEnvironment {
  private readonly solids:readonly Solid[];
  constructor(private readonly regions:SurfaceRegionsBuild,private readonly binding:ContinuousWorldBinding,
    private readonly footprint:VehicleFootprint=DRIVING_FOOTPRINT,private readonly params:FootprintParams=DEFAULT_FOOTPRINT_PARAMS,
    private readonly motionParams:ContinuousMotionParams={}) {
    if(regions.status!=="ready"||regions.revision!==binding.surfaceRevision||!binding.worldRevision||binding.solidRevision!==binding.worldRevision||typeof binding.isCurrent!=="function"||![binding.dimensions.halfLength,binding.dimensions.halfWidth,binding.dimensions.halfHeight].every(n=>Number.isFinite(n)&&n>0)||!Number.isFinite(binding.centerHeight)||binding.centerHeight<0)throw new Error("invalid-continuous-world");
    this.binding=Object.freeze({...binding,dimensions:Object.freeze({...binding.dimensions})});
    this.footprint=Object.freeze({...footprint});this.params=Object.freeze({...params});this.motionParams=Object.freeze({...motionParams});
    const maxSolids=motionParams.maxSourceSolids??DEFAULT_SWEEP_LIMITS.maxSourceSolids;
    const maxVertices=motionParams.maxPolyVertices??DEFAULT_SWEEP_LIMITS.maxPolyVertices;
    let elements=0;const maxAxes=motionParams.maxAxes??DEFAULT_SWEEP_LIMITS.maxAxes;
    if(!Number.isSafeInteger(maxAxes)||maxAxes<1||!Number.isSafeInteger(maxSolids)||maxSolids<1||!Number.isSafeInteger(maxVertices)||maxVertices<1||binding.solids.length>maxSolids||
      binding.solids.some(s=>(elements+=s.poly.vertices.length+s.poly.faces.length+s.poly.edges.length)>1000000||s.poly.vertices.length>maxVertices||s.poly.faces.length+s.poly.edges.length*3>maxAxes))throw new Error("continuous-world-budget");
    // Own proxy facts so a caller cannot change collision geometry under a lease.
    this.solids=Object.freeze(binding.solids.map(s=>Object.freeze({...s,poly:{vertices:s.poly.vertices.map(v=>Object.freeze({...v})),faces:s.poly.faces.map(v=>Object.freeze({...v})),edges:s.poly.edges.map(v=>Object.freeze({...v}))}})));
  }
  get worldRevision():string{return this.binding.worldRevision;}
  private current(){return this.binding.isCurrent()&&this.regions.status==="ready"&&this.regions.revision===this.binding.surfaceRevision;}
  private body=(pose:SupportedPose):BodyPose=>{
    const c=Math.cos(pose.heading),s=Math.sin(pose.heading),sp=Math.sin(pose.pitch),cp=Math.cos(pose.pitch),cr=Math.cos(pose.roll),sr=Math.sin(pose.roll),h=this.binding.centerHeight;
    return {...pose,x:pose.x+(-c*sp*cr+s*sr)*h,y:pose.y+cp*cr*h,z:pose.z+(-s*sp*cr-c*sr)*h};
  };
  private constrain=(from:SupportedPose,target:SupportedPose)=>{
    if(!this.current())return {ok:false as const,reason:"stale-world"};
    const check=validateMotion(this.regions,from,target,from.surfaceId,this.footprint,this.params);
    return check.ok?{ok:true as const,pose:{x:target.x,z:target.z,heading:target.heading,y:check.support.y,pitch:check.support.pitch,roll:check.support.roll,surfaceId:check.support.regionId}}
      :{ok:false as const,reason:`support:${check.reason}:${check.detail}`};
  };
  /** Safe placement uses the same relaxed gameplay footprint and frozen solids
   * as motion, so a start pose cannot be accepted inside an obstacle. */
  place(x:number,z:number,heading:number,regionId:string,y?:number):Readonly<{y:number;pitch:number;roll:number}>|null {
    if(!this.current())return null;
    const support=footprintSupport(this.regions,{x,z,heading,y},regionId,this.footprint,this.params);
    if(!support.ok)return null;
    const pose:SupportedPose={x,y:support.y,z,heading,pitch:support.pitch,roll:support.roll,surfaceId:support.regionId};
    const checked=resolveDrivingCollision(this.solids,{isCurrent:()=>this.current(),constrain:this.constrain,body:this.body},pose,pose,this.binding.dimensions,{...this.motionParams,maxSlides:0});
    return this.current()&&checked.status==="moved"&&checked.contacts.length===0
      ?Object.freeze({y:support.y,pitch:support.pitch,roll:support.roll}):null;
  }
  move(previous:DrivingState,desired:DrivingMotion):DrivingMoveResult {
    const stopped=(reason:string,unresolved=false):DrivingMoveResult=>({...previous,blocked:true,reason,travelledDistance:0,speedFraction:0,queryStatus:unresolved?"unresolved":"resolved",trajectory:Object.freeze([{...previous}])});
    if(!this.current())return stopped("stale-world",true);
    const support=footprintSupport(this.regions,previous,previous.surfaceId,this.footprint,this.params);
    if(!support.ok||Math.abs(support.y-previous.y)>1e-6||Math.abs(support.pitch-previous.pitch)>1e-6||Math.abs(support.roll-previous.roll)>1e-6)return stopped("invalid-start-support",true);
    const maxSegments=this.motionParams.maxSupportSegments??CONTINUOUS_MOTION_DEFAULTS.maxSupportSegments,step=this.motionParams.supportStep??CONTINUOUS_MOTION_DEFAULTS.supportStep;
    if(!Number.isSafeInteger(maxSegments)||maxSegments<1||!Number.isFinite(step)||step<=0)return stopped("invalid-support-budget",true);
    const count=Math.max(1,Math.ceil(Math.hypot(desired.x-previous.x,desired.z-previous.z)/step),Math.ceil(Math.abs(desired.heading-previous.heading)/this.params.maxAngleStep));
    if(count>maxSegments)return stopped("support-budget",true);
    const roadBudget=desired.travelBudget??Math.hypot(desired.x-previous.x,desired.z-previous.z)/Math.max(1e-6,Math.cos(previous.pitch));
    if(!Number.isFinite(roadBudget)||roadBudget<0)return stopped("invalid-travel-budget",true);
    let pose:SupportedPose={...previous},distance=0,contact=false,tests=0,retained=1;
    const testBudget=this.motionParams.maxTests??200000;
    const trajectory:SupportedPose[]=[pose];const contacts:DrivingContact[]=[];
    for(let i=1;i<=count;i++) {
      // Advance along the remaining requested direction rather than teleport back
      // to a pre-collision target after a slide displaced the vehicle sideways.
      const next={...pose,x:pose.x+(desired.x-previous.x)/count,z:pose.z+(desired.z-previous.z)/count,
        heading:pose.heading+(desired.heading-previous.heading)/count};
      const resolved=resolveDrivingCollision(this.solids,{isCurrent:()=>this.current(),constrain:this.constrain,body:this.body},pose,next,this.binding.dimensions,{...this.motionParams,maxTests:Math.max(1,testBudget-tests)});
      tests+=resolved.tests;
      if(tests>testBudget)return stopped("continuous-collision:budget",true);
      if(resolved.status==="unresolved")return stopped(`continuous-collision:${resolved.reason}`,true);
      contact ||= resolved.contacts.length>0;retained=Math.min(retained,resolved.speedFraction);
      contacts.push(...resolved.contacts.map(c=>Object.freeze({obstacleId:c.solidId,worldRevision:this.binding.worldRevision,
        time:(i-1+c.time)/count,timeUpper:(i-1+c.timeUpper)/count,normal:Object.freeze({...c.normal}),kind:c.kind})));
      let exhausted=false;
      for(const endpoint of resolved.path.slice(1)) {
        const length=Math.hypot(endpoint.x-pose.x,endpoint.y-pose.y,endpoint.z-pose.z),remaining=Math.max(0,roadBudget-distance);
        if(length>remaining+1e-10) {
          let fraction=remaining/length,trimmed:ReturnType<typeof resolveDrivingCollision>|null=null;
          for(let attempt=0;attempt<12;attempt++) {
            const target={...interpolateBody(pose,endpoint,fraction),surfaceId:pose.surfaceId};
            trimmed=resolveDrivingCollision(this.solids,{isCurrent:()=>this.current(),constrain:this.constrain,body:this.body},pose,target,this.binding.dimensions,{...this.motionParams,maxSlides:0,maxTests:Math.max(1,testBudget-tests)});
            tests+=trimmed.tests;
            if(tests>testBudget)return stopped("continuous-collision:budget",true);
            if(trimmed.status!=="moved")return stopped(`travel-prefix:${trimmed.reason}`,true);
            if(trimmed.distance<=remaining+1e-10)break;
            fraction*=remaining/trimmed.distance;
          }
          if(!trimmed||trimmed.distance>remaining+1e-10)return stopped("travel-prefix-precision",true);
          pose=trimmed.pose;distance+=trimmed.distance;trajectory.push(...trimmed.path.slice(1));exhausted=true;break;
        }
        distance+=length;pose=endpoint;trajectory.push(pose);
      }
      if(exhausted||resolved.status==="stopped")break;
    }
    if(!this.current())return stopped("stale-world",true);
    const requested=roadBudget;
    const moved=distance>1e-10||pose.heading!==previous.heading;
    return {...pose,blocked:!moved,reason:contact?"contact":moved?undefined:"support-stop",travelledDistance:distance,
      speedFraction:requested>0?Math.min(retained,distance/requested):retained,contact,contacts:Object.freeze(contacts),queryStatus:"resolved",trajectory:Object.freeze(trajectory.map(p=>Object.freeze({...p})))};
  }
  /** B can call this on every submitted piece instead of trusting a trace label. */
  validateTrajectory(previous:Readonly<DrivingTrajectoryPose>,next:Readonly<DrivingTrajectoryPose>,path:readonly Readonly<DrivingTrajectoryPose>[]):boolean {
    if(!this.current()||path.length<1||path.length>2048)return false;
    const same=(a:Readonly<DrivingTrajectoryPose>,b:Readonly<DrivingTrajectoryPose>)=>["x","y","z","heading","pitch","roll"].every(k=>Math.abs(a[k as "x"]-b[k as "x"])<=1e-8)&&a.surfaceId===b.surfaceId;
    if(!same(path[0],previous)||!same(path[path.length-1],next))return false;
    const start=this.constrain(path[0],path[0]);
    if(!start.ok||!same(start.pose,path[0]))return false;
    const stationary=resolveDrivingCollision(this.solids,{isCurrent:()=>this.current(),constrain:this.constrain,body:this.body},path[0],path[0],this.binding.dimensions,{...this.motionParams,maxSlides:0});
    if(stationary.status!=="moved"||stationary.contacts.length)return false;
    let tests=stationary.tests;const budget=this.motionParams.maxTests??200000;
    for(let i=1;i<path.length;i++) {
      const a=path[i-1],b=path[i];
      const support=this.constrain(a,b);if(!support.ok||!same(support.pose,b))return false;
      // resolve with zero slides: any contact means the submitted piece was not
      // collision-free. A forged endpoint or path cannot turn contact into pass.
      const checked=resolveDrivingCollision(this.solids,{isCurrent:()=>this.current(),constrain:this.constrain,body:this.body},a,b,this.binding.dimensions,{...this.motionParams,maxSlides:0,maxTests:Math.max(1,budget-tests)});
      tests+=checked.tests;
      if(tests>budget)return false;
      if(checked.status!=="moved"||checked.contacts.length||!same(checked.pose,b))return false;
    }
    return this.current();
  }
}
