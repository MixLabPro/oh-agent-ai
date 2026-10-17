/** Development-only UI ownership. Diagnostic entry cannot persist/confirm spawns. */
import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { CityEngine } from "../engine/CityEngine";
import { CarVisuals } from "./CarVisuals";
import { useCityDriving } from "./useCityDriving";
import { EMPTY_DRIVING_INPUT, type DrivingInputState } from "./DrivingSimulation";
import { KeyboardInput } from "./runtime/KeyboardInput";

declare const __CITY_GAME_UAT__: boolean;
export const CITY_DRIVING_UAT = typeof __CITY_GAME_UAT__ !== "undefined" && __CITY_GAME_UAT__;

export function useCityDrivingUat(engine: RefObject<CityEngine | null>, host: Readonly<{
  cinemaActive(): boolean; gameActive(): boolean; busy(): boolean;
}>) {
  const visuals = useRef<CarVisuals | null>(null);
  const inputSource = useRef<KeyboardInput<DrivingInputState> | null>(null);
  const blockedSeen = useRef(false);
  const removeVisuals = useCallback(() => { visuals.current?.dispose(); visuals.current = null; blockedSeen.current = false; }, []);
  const car = useCityDriving(engine, {
    ...host, spawn: null,
    present: (state, blocked, _reason, frameSeconds) => {
      const current = engine.current;
      if (!current) return;
      if (!visuals.current) { visuals.current = new CarVisuals(); current.addOverlay(visuals.current.root); }
      // 撞击反馈（演练场同款）：blocked 上升沿——暖光脉冲 + 相机抖动。
      if (blocked && !blockedSeen.current) { visuals.current.pulseImpact(); current.pulseDrivingImpact(); }
      blockedSeen.current = blocked;
      visuals.current.update(state); current.presentDrivingCamera(state, frameSeconds);
    },
  });
  const active = car.hud.phase !== "idle";
  const focusCanvas = useCallback(() => {
    const canvas = engine.current?.domCanvas;
    if (canvas instanceof HTMLElement) canvas.focus({ preventScroll: true });
  }, [engine]);
  const enter = useCallback(() => {
    if (!CITY_DRIVING_UAT) return;
    void car.enterDiagnostic().then((ready) => { if (ready) focusCanvas(); });
  }, [car.enterDiagnostic, focusCanvas]);
  const resume = useCallback(() => { inputSource.current?.clear(); car.resume(); focusCanvas(); }, [car.resume, focusCanvas]);
  const pause = useCallback(() => { inputSource.current?.clear(); car.pause(); }, [car.pause]);
  const exit = useCallback(() => { inputSource.current?.clear(); car.exit(); removeVisuals(); }, [car.exit, removeVisuals]);
  useEffect(() => { if (car.hud.phase !== "running") inputSource.current?.clear(); }, [car.hud.phase]);
  useEffect(() => {
    if (car.hud.phase === "idle" || car.hud.phase === "error") removeVisuals();
  }, [car.hud.phase, removeVisuals]);
  useEffect(() => removeVisuals, [removeVisuals]);
  useEffect(() => {
    if (!active) return;
    const source = new KeyboardInput<DrivingInputState>({
      keys: { KeyW: "forward", ArrowUp: "forward", KeyS: "backward", ArrowDown: "backward", KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right" },
      emptyInput: () => ({ ...EMPTY_DRIVING_INPUT }), capture: true,
      focusTarget: () => {
        const target = engine.current?.domCanvas;
        return target instanceof HTMLElement ? target : null;
      },
      isFocused: () => document.activeElement === engine.current?.domCanvas,
      onInput: car.setInput,
      onInterrupt: (reason) => { if (reason === "host-suspended") exit(); else car.pause(); },
      onCommand: (event) => {
        if (event.code === "Escape") {
          event.preventDefault(); event.stopImmediatePropagation(); if (!event.repeat) exit(); return true;
        }
        if (event.code === "Space" && !(event.target instanceof HTMLElement && event.target.closest("button"))) {
          event.preventDefault(); if (!event.repeat) { source.clear(); car.toggle(); } return true;
        }
        return false;
      },
    });
    inputSource.current = source; source.attach();
    const canvas = engine.current?.domCanvas;
    canvas?.addEventListener("webglcontextlost", exit);
    return () => { source.detach(); if (inputSource.current === source) inputSource.current = null; canvas?.removeEventListener("webglcontextlost", exit); };

  }, [active, car.setInput, car.toggle, car.pause, engine, exit]);
  return { ...car, active, enter, exit, resume, pause };
}
