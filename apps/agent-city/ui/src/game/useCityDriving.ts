/** React bridge for the frozen city/car runtime. Presentation stays outside React;
 * HUD observes runtime errors and pauses at 10 Hz, including when frames stop. */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { CityEngine } from "../engine/CityEngine";
import { EMPTY_DRIVING_INPUT, DRIVING_DT, type DrivingState, type DrivingInputState } from "./DrivingSimulation";
import { GameRuntime } from "./runtime/GameRuntime";
import { createCityCarSession, createCityCarDiagnosticSession } from "./runtime/createCityCarSession";
import type { CollisionDimensions } from "./driving/CollisionIndex";
import type { CarPresentation } from "./runtime/CarAdapter";

export const CITY_CAR_COLLIDER: Readonly<{ dimensions: CollisionDimensions; centerHeight: number; vehicleConfigHash: string }> = Object.freeze({
  dimensions: Object.freeze({ halfLength: 1.4, halfWidth: 0.7, halfHeight: 0.575 }),
  centerHeight: 0.55, vehicleConfigHash: "city-car-gameplay-v2",
});
export type DrivingHudSnapshot = Readonly<{
  phase: "idle" | "preparing" | "paused" | "running" | "error";
  reason: string | null; speed: number; blocked: boolean; coverage: string | null;
  /** 档位（演练场同口径）：R 倒车 / B 制动 / D 前进 / N 静止。 */
  gear: "D" | "R" | "B" | "N";
}>;
const IDLE_HUD: DrivingHudSnapshot = Object.freeze({ phase: "idle", reason: null, speed: 0, blocked: false, coverage: null, gear: "N" });
export type DrivingPresentation = (state: Readonly<DrivingState>, blocked: boolean, reason: string | null, frameSeconds: number) => void;

export function useCityDriving(engine: RefObject<CityEngine | null>, options: Readonly<{
  present: DrivingPresentation;
  /** Confirmed product spawn; diagnostics use a separate explicit entry below. */
  spawn: Readonly<{ x: number; z: number; heading: number; layerId: string }> | null;
  cinemaActive: () => boolean; gameActive: () => boolean; busy: () => boolean;
}>) {
  const [hud, setHud] = useState<DrivingHudSnapshot>(IDLE_HUD);
  const [entryError, setEntryError] = useState<string | null>(null);
  const runtimeRef = useRef<GameRuntime<DrivingInputState> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const preparing = useRef(false);
  const latest = useRef({ speed: 0, blocked: false, reason: null as string | null, coverage: null as string | null, gear: "N" as DrivingHudSnapshot["gear"] });
  const optionsRef = useRef(options); optionsRef.current = options;
  const alive = useRef(true);
  const publish = useCallback(() => {
    if (!alive.current) return;
    const snap = runtimeRef.current?.snapshot;
    const phase = preparing.current ? "preparing" : snap?.phase === "disposed" ? "idle" : snap?.phase ?? "idle";
    const next = Object.freeze({ ...latest.current, phase, reason: snap?.reason ?? latest.current.reason });
    setHud((previous) => Object.keys(next).every((key) => previous[key as keyof DrivingHudSnapshot] === next[key as keyof DrivingHudSnapshot]) ? previous : next);
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; abortRef.current?.abort(); runtimeRef.current?.dispose(); runtimeRef.current = null; };
  }, []);
  useEffect(() => {
    if (hud.phase === "idle") return;
    const timer = window.setInterval(publish, 100);
    return () => window.clearInterval(timer);
  }, [hud.phase, publish]);

  const start = useCallback(async (diagnostic: boolean): Promise<boolean> => {
    const host = engine.current;
    if (!host || runtimeRef.current) return false;
    if (optionsRef.current.cinemaActive() || optionsRef.current.gameActive() || optionsRef.current.busy()) {
      setEntryError("互斥状态（航拍/游戏/忙碌）中不可驾驶。"); return false;
    }
    const spawn = optionsRef.current.spawn;
    if (!diagnostic && !spawn) { setEntryError("本城没有可用的驾驶出生点。"); return false; }
    const abort = new AbortController(); abortRef.current = abort;
    const runtime = new GameRuntime<DrivingInputState>({ dt: DRIVING_DT, emptyInput: () => ({ ...EMPTY_DRIVING_INPUT }) }); runtimeRef.current = runtime;
    preparing.current = true;
    latest.current = { speed: 0, blocked: false, reason: null, coverage: null, gear: "N" };
    setEntryError(null); setHud({ ...IDLE_HUD, phase: "preparing" });
    const request = { collider: CITY_CAR_COLLIDER, present: (frame: CarPresentation) => {
      latest.current = { ...latest.current, speed: Math.abs(frame.state.speed), blocked: frame.blocked, reason: frame.reason,
        gear: frame.state.reversing ? "R" : frame.state.braking ? "B" : frame.state.speed > 0 ? "D" : "N" };
      optionsRef.current.present(frame.state, frame.blocked, frame.reason, frame.frameSeconds);
    } };
    try {
      const entry = diagnostic
        ? await createCityCarDiagnosticSession(host, runtime, request, abort.signal)
        : await createCityCarSession(host, runtime, { ...request, ...spawn! }, abort.signal);
      if (abort.signal.aborted || runtimeRef.current !== runtime || !alive.current) { runtime.dispose(); return false; }
      preparing.current = false;
      if (entry.status !== "ready") {
        runtime.dispose(); runtimeRef.current = null;
        setEntryError(`暂不能开始驾驶：${entry.reason}`); publish(); return false;
      }
      latest.current.coverage = entry.coverage; publish(); return true;
    } catch (error) {
      runtime.dispose();
      if (runtimeRef.current === runtime) { runtimeRef.current = null; preparing.current = false; }
      if (alive.current && !abort.signal.aborted) { setEntryError(`暂不能开始驾驶：${error instanceof Error ? error.message : "city-driving-entry-failed"}`); publish(); }
      return false;
    }
  }, [engine, publish]);
  const exit = useCallback(() => {
    abortRef.current?.abort(); abortRef.current = null;
    preparing.current = false;
    runtimeRef.current?.dispose(); runtimeRef.current = null;
    latest.current = { speed: 0, blocked: false, reason: null, coverage: null, gear: "N" }; publish();
  }, [publish]);
  const pause = useCallback(() => { runtimeRef.current?.pause("user-paused"); publish(); }, [publish]);
  const resume = useCallback(() => { runtimeRef.current?.resume(); publish(); }, [publish]);
  const toggle = useCallback(() => {
    if (runtimeRef.current?.snapshot.phase === "running") pause(); else resume();
  }, [pause, resume]);
  const setInput = useCallback((input: Partial<DrivingInputState>) => { runtimeRef.current?.setInput({ ...EMPTY_DRIVING_INPUT, ...input }); }, []);
  return { hud, entryError, clearEntryError: () => setEntryError(null), enter: () => start(false), enterDiagnostic: () => start(true), exit, pause, resume, toggle, setInput, physicsStep: DRIVING_DT };
}
