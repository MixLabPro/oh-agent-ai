/**
 * useCityDriving：正式驾驶宿主入口的 React 桥（E 线最小切片）。
 * 消费 createCityCarSession：入场（冻结世界+碰撞索引+共享内核）、暂停/继续、
 * 退出释放租约；渲染由 present 回调把 CarPresentation 交给 CarVisuals。
 * HUD 只按低频快照更新（≤10Hz），不逐帧进 React。与飞机游戏/航拍/导出互斥。
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { CityEngine } from "../engine/CityEngine";
import type { DrivingState } from "./DrivingSimulation";
import { EMPTY_DRIVING_INPUT, DRIVING_DT, type DrivingInputState } from "./DrivingSimulation";
import { GameRuntime } from "./runtime/GameRuntime";
import { createCityCarSession, type CityCarEntry } from "./runtime/createCityCarSession";
import type { CollisionDimensions } from "./driving/CollisionIndex";

declare const __CITY_GAME_UAT__: boolean;

/** 标定过的车体碰撞参数——与 CarVisuals 的 CAR_DIMENSIONS 同源，不引视觉依赖。 */
export const CITY_CAR_COLLIDER: Readonly<{ dimensions: CollisionDimensions; centerHeight: number; vehicleConfigHash: string }> = Object.freeze({
  dimensions: Object.freeze({ halfLength: 1.4, halfWidth: 0.7, halfHeight: 0.575 }),
  centerHeight: 0.55,
  vehicleConfigHash: "city-car-v1",
});

export type DrivingHudSnapshot = Readonly<{
  phase: "idle" | "preparing" | "paused" | "running" | "error";
  reason: string | null;
  speed: number;
  blocked: boolean;
  coverage: string | null;
}>;

const IDLE_HUD: DrivingHudSnapshot = Object.freeze({ phase: "idle", reason: null, speed: 0, blocked: false, coverage: null });

export type DrivingPresentation = (state: Readonly<DrivingState>, blocked: boolean, reason: string | null) => void;

export function useCityDriving(
  engine: RefObject<CityEngine | null>,
  options: Readonly<{
    /** 展示回调：把插值后的车位交给 CarVisuals（调用方持有视觉对象）。 */
    present: DrivingPresentation;
    /** 出生点（SPEC §13.5 派生候选之一，经产品确认）；无则拒绝入场。 */
    spawn: Readonly<{ x: number; z: number; heading: number; layerId: string }> | null;
    cinemaActive: () => boolean;
    gameActive: () => boolean;
    busy: () => boolean;
  }>,
) {
  const [hud, setHud] = useState<DrivingHudSnapshot>(IDLE_HUD);
  const [entryError, setEntryError] = useState<string | null>(null);
  const runtimeRef = useRef<GameRuntime | null>(null);
  const activeRef = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => () => { runtimeRef.current?.dispose(); runtimeRef.current = null; activeRef.current = false; }, []);

  const emit = useCallback((phase: DrivingHudSnapshot["phase"], reason: string | null, state?: Readonly<DrivingState>, blocked = false, coverage: string | null = null) => {
    setHud(Object.freeze({ phase, reason, speed: state ? Math.abs(state.speed) : 0, blocked, coverage }));
  }, []);

  const enter = useCallback(async () => {
    const engineInstance = engine.current;
    if (!engineInstance || activeRef.current || runtimeRef.current) return;
    if (optionsRef.current.cinemaActive() || optionsRef.current.gameActive() || optionsRef.current.busy()) { setEntryError("互斥状态（航拍/游戏/忙碌）中不可驾驶。"); return; }
    const spawn = optionsRef.current.spawn;
    if (!spawn) { setEntryError("本城没有可用的驾驶出生点。"); return; }
    activeRef.current = true;
    setEntryError(null);
    emit("preparing", null);
    const runtime = new GameRuntime();
    try {
      const entry: CityCarEntry = await createCityCarSession(engineInstance, runtime, {
        x: spawn.x, z: spawn.z, heading: spawn.heading, layerId: spawn.layerId,
        collider: CITY_CAR_COLLIDER,
        present: (frame) => optionsRef.current.present(frame.state, frame.blocked, frame.reason),
      });
      if (entry.status !== "ready") {
        activeRef.current = false;
        runtime.dispose();
        setEntryError(`暂不能开始驾驶：${entry.reason}`);
        emit("idle", entry.reason);
        return;
      }
      runtimeRef.current = runtime;
      emit("paused", "entry-pause", undefined, false, entry.coverage);
    } catch (error) {
      activeRef.current = false;
      runtime.dispose();
      const reason = error instanceof Error ? error.message : "city-driving-entry-failed";
      setEntryError(`暂不能开始驾驶：${reason}`);
      emit("idle", reason);
    }
  }, [emit, engine]);

  const exit = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtimeRef.current = null;
    activeRef.current = false;
    runtime.dispose();
    emit("idle", null);
  }, [emit]);

  const pause = useCallback(() => { runtimeRef.current?.pause("user-paused"); emit("paused", "user-paused"); }, [emit]);
  const resume = useCallback(() => { if (runtimeRef.current?.resume()) emit("running", null); }, [emit]);
  const toggle = useCallback(() => {
    const phase = runtimeRef.current?.snapshot.phase;
    if (phase === "running") pause();
    else if (phase === "paused") resume();
  }, [pause, resume]);
  const setInput = useCallback((input: Partial<DrivingInputState>) => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const current = { ...EMPTY_DRIVING_INPUT, ...input };
    runtime.setInput(current);
    const snap = runtime.snapshot;
    if (snap.phase === "running") emit("running", null, undefined, false, hud.coverage);
  }, [emit, hud.coverage]);

  return { hud, entryError, clearEntryError: () => setEntryError(null), enter, exit, pause, resume, toggle, setInput, physicsStep: DRIVING_DT };
}
