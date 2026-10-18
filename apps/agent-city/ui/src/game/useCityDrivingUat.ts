/** Development-only UI ownership. Diagnostic entry cannot persist/confirm spawns. */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { CityEngine } from "../engine/CityEngine";
import { CarVisuals } from "./CarVisuals";
import { useCityDriving } from "./useCityDriving";
import { DRIVING_PARAMS, EMPTY_DRIVING_INPUT, type DrivingInputState } from "./DrivingSimulation";
import type { VtolInputState } from "./driving/vtolDriving";
import { KeyboardInput } from "./runtime/KeyboardInput";
import type { InputInterrupt } from "./runtime/KeyboardInput";
import { DrivingSfx } from "./driving/DrivingSfx";
import type { CityCarSceneCapability } from "./runtime/createCityCarSession";
import type { CameraClearanceQuery } from "./VehicleChaseCamera";
import { closeOpenGameDisclosure } from "./ui/closeOpenDisclosure";

declare const __CITY_GAME_UAT__: boolean;
export const CITY_DRIVING_UAT = typeof __CITY_GAME_UAT__ !== "undefined" && __CITY_GAME_UAT__;

export function useCityDrivingUat(engine: RefObject<CityEngine | null>, host: Readonly<{
  cinemaActive(): boolean; gameActive(): boolean; busy(): boolean;
}>) {
  const visuals = useRef<CarVisuals | null>(null);
  const visualScene = useRef<CityCarSceneCapability | null>(null);
  const inputSource = useRef<KeyboardInput<VtolInputState> | null>(null);
  const blockedSeen = useRef(false);
  const sfxRef = useRef<DrivingSfx | null>(null);
  const [soundVolume, setSoundVolumeState] = useState(0.7);
  const [sfxEnabled, setSfxEnabled] = useState(true);
  const [soundAvailable, setSoundAvailable] = useState(false);
  const [initialPaused, setInitialPaused] = useState(false);
  // ?vtol=1 开启飞行车会话（Space=推进器）；默认纯驾驶。暂停统一由 Esc / HUD 按钮承担。
  const vtolEnabled = typeof window !== "undefined" && typeof location !== "undefined" && new URLSearchParams(location.search).get("vtol") === "1";
  const removeVisuals = useCallback(() => {
    const currentVisuals = visuals.current;
    if (currentVisuals) visualScene.current?.detach([currentVisuals.root]);
    currentVisuals?.dispose(); visuals.current = null; visualScene.current = null; blockedSeen.current = false;
  }, []);
  const car = useCityDriving(engine, {
    ...host, spawn: null, confirmationEnabled: false, vtol: vtolEnabled,
    present: (state, blocked, _reason, frameSeconds, cameraSweep: CameraClearanceQuery, scene: CityCarSceneCapability) => {
      const current = engine.current;
      if (!current) return;
      if (!visuals.current) { visuals.current = new CarVisuals(); visualScene.current = scene; scene.attach([visuals.current.root]); }
      // 撞击反馈与音效都只在接触上升沿触发，不把 blocked 持续帧当多次碰撞。
      if (blocked && !blockedSeen.current) {
        visuals.current.pulseImpact(); current.pulseDrivingImpact();
        if (phaseRef.current === "running" && sfxEnabledRef.current) sfxRef.current?.collision();
      }
      blockedSeen.current = blocked;
      if (phaseRef.current === "running") sfxRef.current?.update({ speed: state.speed, maxSpeed: DRIVING_PARAMS.maxForward,
        braking: state.braking, reversing: state.reversing, rainIntensity: current.environmentState?.rainIntensity ?? 0 });
      visuals.current.update(state); return current.presentDrivingCamera(state, frameSeconds, cameraSweep, scene);
    },
  });
  const phaseRef = useRef(car.hud.phase);
  const soundVolumeRef = useRef(soundVolume); soundVolumeRef.current = soundVolume;
  const sfxEnabledRef = useRef(sfxEnabled); sfxEnabledRef.current = sfxEnabled;
  phaseRef.current = car.hud.phase;
  const active = car.hud.phase !== "idle";
  const focusCanvas = useCallback(() => {
    const canvas = engine.current?.domCanvas;
    if (canvas instanceof HTMLElement) canvas.focus({ preventScroll: true });
  }, [engine]);
  const enter = useCallback(() => {
    if (!CITY_DRIVING_UAT) return;
    setInitialPaused(false);
    void car.enterDiagnostic().then((ready) => { if (ready) { setInitialPaused(true); focusCanvas(); } });
  }, [car.enterDiagnostic, focusCanvas]);
  const resume = useCallback(() => {
    inputSource.current?.clear();
    if (!sfxRef.current) sfxRef.current = new DrivingSfx();
    const sfx = sfxRef.current;
    sfx.setVolume(soundVolumeRef.current); sfx.setMuted(!sfxEnabledRef.current); sfx.resume();
    setSoundAvailable(sfx.available);
    setInitialPaused(false); car.resume(); focusCanvas();
  }, [car.resume, focusCanvas]);
  const pause = useCallback((reason?: string) => { inputSource.current?.clear(); car.pause(reason); sfxRef.current?.suspend(); }, [car.pause]);
  const exit = useCallback(() => { inputSource.current?.clear(); car.exit(); removeVisuals(); sfxRef.current?.dispose(); sfxRef.current = null; setSoundAvailable(false); setInitialPaused(false); }, [car.exit, removeVisuals]);
  const openUiContext = useCallback(() => { inputSource.current?.clear(); if (phaseRef.current === "running") car.pause(); sfxRef.current?.suspend(); }, [car.pause]);
  useEffect(() => {
    if (car.hud.phase !== "running") { inputSource.current?.clear(); sfxRef.current?.suspend(); }
  }, [car.hud.phase]);
  useEffect(() => {
    if (car.hud.phase === "idle" || car.hud.phase === "error") removeVisuals();
  }, [car.hud.phase, removeVisuals]);
  useEffect(() => removeVisuals, [removeVisuals]);
  useEffect(() => {
    if (!active) return;
    const source = new KeyboardInput<VtolInputState>({
      keys: { KeyW: "forward", ArrowUp: "forward", KeyS: "backward", ArrowDown: "backward", KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right", ...(vtolEnabled ? { Space: "thruster" } : {}) },
      emptyInput: () => ({ ...EMPTY_DRIVING_INPUT, thruster: false }), capture: true,
      focusTarget: () => {
        const target = engine.current?.domCanvas;
        return target instanceof HTMLElement ? target : null;
      },
      isFocused: () => document.activeElement === engine.current?.domCanvas,
      onInput: car.setInput,
      onInterrupt: (reason: InputInterrupt) => {
        inputSource.current?.clear(); sfxRef.current?.suspend();
        if (reason === "host-suspended") exit();
        else if (reason === "focus-lost" || reason === "host-hidden") car.pause(reason);
      },
      onCommand: (event) => {
        if (event.code === "Escape") {
          event.preventDefault(); event.stopImmediatePropagation();
          if (event.repeat) return true;
          if (closeOpenGameDisclosure()) return true;
          if (phaseRef.current === "preparing") exit();
          else if (phaseRef.current === "running") pause();
          else if (phaseRef.current === "paused") resume();
          return true;
        }
        // VTOL 会话中 Space 是推进器（进 keys 映射）；非 VTOL 保留 Space=暂停/继续。
        if (!vtolEnabled && event.code === "Space" && !(event.target instanceof HTMLElement && event.target.closest("button, summary, input, select, [role='dialog']"))) {
          event.preventDefault(); event.stopImmediatePropagation(); if (!event.repeat) { source.clear(); if (phaseRef.current === "running") pause(); else if (phaseRef.current === "paused") resume(); } return true;
        }
        return false;
      },
    });
    inputSource.current = source; source.attach();
    const canvas = engine.current?.domCanvas;
    canvas?.addEventListener("webglcontextlost", exit);
    return () => { source.detach(); if (inputSource.current === source) inputSource.current = null; canvas?.removeEventListener("webglcontextlost", exit); };

  }, [active, car.setInput, engine, exit, pause, resume]);
  useEffect(() => () => { sfxRef.current?.dispose(); sfxRef.current = null; }, []);
  const setSoundVolume = useCallback((value: number) => {
    const next = Math.max(0, Math.min(1, value)); soundVolumeRef.current = next; setSoundVolumeState(next); sfxRef.current?.setVolume(next);
  }, []);
  const toggleSfx = useCallback(() => { const next = !sfxEnabledRef.current; sfxEnabledRef.current = next; setSfxEnabled(next); sfxRef.current?.setMuted(!next); }, []);
  const sound = soundAvailable ? { volume: soundVolume, onVolume: setSoundVolume, sfx: { enabled: sfxEnabled, onToggle: toggleSfx } } : undefined;
  return { ...car, active, enter, exit, resume, pause, openUiContext, initialPaused, sound };
}
