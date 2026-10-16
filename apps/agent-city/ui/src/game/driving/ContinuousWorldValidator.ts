/** C's trajectory verifier for B's GateAuditObserver. This does not change audit
 * outcomes: rejected/incomplete physics is simulation-invalid, never road proof. */
import {DRIVING_DT,DRIVING_PARAMS,type DrivingState} from "../DrivingSimulation";
import {validDrivingState,type KernelStep} from "./DrivingKernel";
import type {AuditWorldValidator,StepValidation} from "./audit/contracts";
import type {ContinuousDrivingEnvironment} from "./ContinuousDrivingEnvironment";
export class ContinuousWorldValidator implements AuditWorldValidator {
  constructor(private readonly environment:ContinuousDrivingEnvironment,private readonly corridorProgress:(state:Readonly<DrivingState>)=>number){}
  validateStart(state:Readonly<DrivingState>):StepValidation {
    return validDrivingState(state)&&this.environment.validateTrajectory(state,state,[state])?"valid":"simulation-invalid";
  }
  validate(previous:Readonly<DrivingState>,step:KernelStep):StepValidation {
    const state=step.state,path=step.motion.trajectory;
    if(!validDrivingState(previous)||!validDrivingState(state)||step.motion.queryStatus!=="resolved"||!path||
      !this.environment.validateTrajectory(previous,state,path))return "simulation-invalid";
    let distance=0;for(let i=1;i<path.length;i++)distance+=Math.hypot(path[i].x-path[i-1].x,path[i].y-path[i-1].y,path[i].z-path[i-1].z);
    const maximum=DRIVING_PARAMS.maxForward*DRIVING_DT+1e-6;
    const angular=DRIVING_PARAMS.maxForward/DRIVING_PARAMS.wheelbase*Math.tan(DRIVING_PARAMS.maxSteering)*DRIVING_DT+1e-6;
    if(distance>maximum||Math.abs(Math.abs(state.distance-previous.distance)-distance)>1e-6||
      Math.abs(state.heading-previous.heading)>angular||state.speed>DRIVING_PARAMS.maxForward+1e-6||state.speed< -DRIVING_PARAMS.maxReverse-1e-6||
      step.motion.blocked&&(distance>1e-9||state.heading!==previous.heading))return "simulation-invalid";
    return "valid";
  }
  progress(state:Readonly<DrivingState>):number{return this.corridorProgress(state);}
}
