import { CAR_DIMENSIONS } from "../carDimensions";
/** Conservative full steering-wheel envelope, not just the unsteered body width. */
export const DRIVING_FOOTPRINT = Object.freeze({
  halfLength: CAR_DIMENSIONS.length / 2,
  halfWidth: Math.max(CAR_DIMENSIONS.width / 2, CAR_DIMENSIONS.track / 2 + Math.hypot(CAR_DIMENSIONS.wheelRadius, CAR_DIMENSIONS.wheelWidth / 2)),
  wheelbase: CAR_DIMENSIONS.wheelbase, track: CAR_DIMENSIONS.track,
});
/** Slightly forgiving footprint for manual play. The audited footprint above
 * retains the complete tire steering envelope and its stricter clearance. */
export const GAMEPLAY_DRIVING_FOOTPRINT = Object.freeze({
  halfLength: CAR_DIMENSIONS.length / 2,
  halfWidth: CAR_DIMENSIONS.width / 2,
  wheelbase: CAR_DIMENSIONS.wheelbase, track: CAR_DIMENSIONS.track,
});
/** Horizontal collision inset in gameplay only; audits retain the full collider. */
export const GAMEPLAY_COLLISION_INSET = 0.12;
