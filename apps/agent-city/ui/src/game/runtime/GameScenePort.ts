/** Host-internal capability contracts, NOT plugin IPC. Implementation belongs to
 * CityEngine. Do not implement acquire as a camera-only lock: geometry must freeze. */
export type GameSelection =
  | Readonly<{ vehicle: "plane"; activity: "practice" | "race" }>
  | Readonly<{ vehicle: "car"; activity: "free" }>;
export type CameraPose = Readonly<{
  position: readonly [number, number, number]; target: readonly [number, number, number]; fov: number;
}>;
export interface GameSceneLease<Snapshot, VisualObject> {
  readonly token: symbol;
  readonly revision: string;
  readonly snapshot: Snapshot;
  attach(objects: readonly VisualObject[]): void;
  detach(objects: readonly VisualObject[]): void;
  setFrameHook(callback: ((dt: number) => void) | null): void;
  setCamera(pose: CameraPose): void;
  setAmbientCarsVisible(visible: boolean): void;
  /** Token-checked, idempotent; restores return state and latest pending projection. */
  release(): void;
}
export interface GameScenePort<Snapshot, VisualObject> {
  acquire(selection: GameSelection, runId: number, signal: AbortSignal): Promise<GameSceneLease<Snapshot, VisualObject>>;
}
export interface VehicleAdapter {
  prepare(signal: AbortSignal): Promise<void>;
  fixedStep(): void;
  present(alpha: number): void;
  reset(): void;
  dispose(): void;
}
