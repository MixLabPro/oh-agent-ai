/** Flight mapping over the common keyboard lifecycle. */
import { EMPTY_INPUT, type FlightInputState, type GamePauseReason } from "./types";
import { KeyboardInput } from "./runtime/KeyboardInput";
const KEY_MAP: Readonly<Record<string, keyof FlightInputState>> = {
  KeyW: "throttleUp", KeyS: "throttleDown", KeyA: "turnLeft", KeyD: "turnRight", ArrowUp: "pitchUp", ArrowDown: "pitchDown",
};
export type FlightInputOptions = {
  isGameFocused: () => boolean;
  focusTarget: () => HTMLElement | null;
  onInterrupt: (reason: Extract<GamePauseReason, "focus-lost" | "host-hidden">) => void;
};
export class FlightInput {
  private readonly source: KeyboardInput<FlightInputState>;
  constructor(options: FlightInputOptions) {
    this.source = new KeyboardInput({ keys: KEY_MAP, emptyInput: () => ({ ...EMPTY_INPUT }), isFocused: options.isGameFocused,
      focusTarget: options.focusTarget,
      onInterrupt: (reason) => options.onInterrupt(reason === "host-suspended" ? "host-hidden" : reason) });
  }
  attach(): void { this.source.attach(); }
  detach(): void { this.source.detach(); }
  snapshot(): FlightInputState { return this.source.snapshot(); }
  clear(): void { this.source.clear(); }
}
