import { CAR_DIMENSIONS } from "../carDimensions";
/** Conservative full steering-wheel envelope, not just the unsteered body width. */
export const DRIVING_FOOTPRINT = Object.freeze({
  halfLength: CAR_DIMENSIONS.length / 2,
  halfWidth: Math.max(CAR_DIMENSIONS.width / 2, CAR_DIMENSIONS.track / 2 + Math.hypot(CAR_DIMENSIONS.wheelRadius, CAR_DIMENSIONS.wheelWidth / 2)),
  wheelbase: CAR_DIMENSIONS.wheelbase, track: CAR_DIMENSIONS.track,
});
