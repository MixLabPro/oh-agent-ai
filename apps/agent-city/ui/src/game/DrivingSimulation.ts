/** Fixed-step arcade bicycle model. No renderer, DOM, input listeners or persistence.
 * World units are deliberately not labelled metres or km/h. +heading points toward +Z.
 */
import { CAR_DIMENSIONS } from "./carDimensions";

export const DRIVING_PHYSICS_VERSION = 1;
export const DRIVING_DT = 1 / 60;
export const DRIVING_PARAMS = Object.freeze({
  wheelbase: CAR_DIMENSIONS.wheelbase, maxForward: 13, maxReverse: 4, acceleration: 5.5,
  reverseAcceleration: 3, braking: 12, coastDrag: 1.2, maxSteering: 0.48,
  steeringResponse: 8, zeroSpeed: 0.08,
});
export type DrivingInputState = { forward: boolean; backward: boolean; left: boolean; right: boolean };
export const EMPTY_DRIVING_INPUT: DrivingInputState = { forward: false, backward: false, left: false, right: false };
export type DrivingState = {
  x: number; y: number; z: number; heading: number; speed: number;
  steering: number; distance: number; braking: boolean; reversing: boolean;
  pitch: number; roll: number; surfaceId: string;
};
export type DrivingMotion = { x: number; z: number; heading: number };
export type DrivingMoveResult = DrivingMotion & {
  y: number; pitch: number; roll: number; surfaceId: string;
  blocked: boolean; reason?: string;
};
export interface DrivingEnvironment {
  move(previous: DrivingState, desired: DrivingMotion): DrivingMoveResult;
}
export function initialDrivingState(x = 0, z = 0, heading = 0, surfaceId = "pad"): DrivingState {
  return { x, y: 0, z, heading, speed: 0, steering: 0, distance: 0,
    braking: false, reversing: false, pitch: 0, roll: 0, surfaceId };
}
const approachZero = (speed: number, amount: number) => Math.sign(speed) * Math.max(0, Math.abs(speed) - amount);

export function stepDriving(previous: DrivingState, input: DrivingInputState, world: DrivingEnvironment): DrivingState {
  const p = DRIVING_PARAMS;
  let speed = previous.speed;
  const direction = Number(input.forward) - Number(input.backward);
  const opposing = direction !== 0 && Math.sign(speed) !== direction && Math.abs(speed) > p.zeroSpeed;
  const braking = (input.forward && input.backward) || opposing;
  if (braking) speed = approachZero(speed, p.braking * DRIVING_DT);
  else if (direction) {
    // Pass through rest before switching gears; never reverse a moving car in one step.
    if (Math.abs(speed) <= p.zeroSpeed && Math.sign(speed) !== direction) speed = 0;
    speed += direction * (direction > 0 ? p.acceleration : p.reverseAcceleration) * DRIVING_DT;
  } else speed = approachZero(speed, p.coastDrag * DRIVING_DT);
  speed = Math.max(-p.maxReverse, Math.min(p.maxForward, speed));
  const turn = Number(input.right) - Number(input.left);
  const target = turn * p.maxSteering / (1 + Math.abs(speed) * 0.07);
  const steering = previous.steering + (target - previous.steering) * (1 - Math.exp(-p.steeringResponse * DRIVING_DT));
  const yaw = speed / p.wheelbase * Math.tan(steering) * DRIVING_DT;
  const desired = {
    x: previous.x + Math.cos(previous.heading + yaw / 2) * speed * DRIVING_DT,
    z: previous.z + Math.sin(previous.heading + yaw / 2) * speed * DRIVING_DT,
    heading: previous.heading + yaw,
  };
  const result = world.move(previous, desired);
  const travelled = Math.hypot(result.x - previous.x, result.z - previous.z) * Math.sign(speed);
  return { ...previous, x: result.x, y: result.y, z: result.z,
    heading: result.heading, steering, speed: result.blocked ? 0 : speed,
    pitch: result.pitch, roll: result.roll, surfaceId: result.surfaceId,
    distance: previous.distance + travelled, braking: braking || result.blocked,
    reversing: !result.blocked && speed < -p.zeroSpeed };
}
