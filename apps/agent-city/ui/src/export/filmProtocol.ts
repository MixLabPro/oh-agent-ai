import type { CityModel } from "../cityModel";
import type { CinematicCut } from "../engine/cityCinematic";

/** Only scene statistics enter the job; no excerpts, log paths or host access. */
export type FilmJob = {
  model: CityModel; seed: number; cut: CinematicCut;
  width: number; height: number; fps: number; bitrate: number;
};
export type FilmWorkerMessage =
  | { type: "ready" }
  | { type: "pulse" }
  | { type: "profile"; width: number; height: number; software: boolean }
  | { type: "progress"; frame: number; total: number }
  | { type: "preview"; bitmap: ImageBitmap; frame: number }
  | { type: "complete"; blob: Blob }
  | { type: "error"; code: string };

export function supportsBackgroundFilm(): boolean {
  return typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined" && typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";
}
