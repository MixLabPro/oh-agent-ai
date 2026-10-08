/**
 * GameSession：游戏模式的引擎侧编排（§3/§5/§6/§8）。持有 GameModeController、
 * FlightWorld/输入/模拟/相机/造型，把控制器事件映射为引擎副作用；通过回调把
 * 状态变化通知 React（HUD）。不 import React；一个 CityEngine 同时至多一个会话。
 */
import type { CityEngine } from "../engine/CityEngine";
import { GameModeController, type GameSnapshot } from "./GameModeController";
import { FlightWorld } from "./FlightWorld";
import { FlightInput } from "./FlightInput";
import { FlightCamera } from "./FlightCamera";
import { FlightVisuals } from "./FlightVisuals";
import { initialSimState, flightParamsFor, stepFlight, lerpSim, PHYSICS_VERSION, type FlightParams, type FlightSimState } from "./FlightSimulation";
import { sweepFlight } from "./FlightCollision";
import type { EnterHostState, GamePauseReason, GameSelection, ReturnCameraView } from "./types";

const FIXED_DT = 1 / 60;
const MAX_STEPS_PER_FRAME = 5;
const LAG_PAUSE_SECONDS = 0.25;
const HUD_HZ = 10;

export type GameSessionEvents = {
  /** 状态快照变化（HUD 重渲染的唯一来源）。 */
  onState: (snapshot: GameSessionSnapshot) => void;
  /** 退出已完成（相机已归还）；React 层再恢复 UI 状态并触发投影刷新。 */
  onExited: () => void;
};

export type GameSessionSnapshot = {
  controller: GameSnapshot;
  /** 供 HUD 展示的飞行读数（≤10 Hz 更新，不逐帧进 React）。 */
  telemetry: { speed: number; altitude: number; heading: number } | null;
  softOutside: boolean;
  collisions: number;
};

export class GameSession {
  readonly controller = new GameModeController();
  private world: FlightWorld | null = null;
  private params: FlightParams | null = null;
  private sim: FlightSimState | null = null;
  private prevSim: FlightSimState | null = null;
  private renderSim: FlightSimState | null = null;
  private lastSafe: { x: number; y: number; z: number } | null = null;
  private visuals: FlightVisuals | null = null;
  private camera: FlightCamera | null = null;
  private input: FlightInput | null = null;
  private returnCamera: ReturnCameraView | null = null;
  private accumulator = 0;
  private collisions = 0;
  private softOutside = false;
  private hudAt = 0;
  private disposed = false;

  constructor(
    private readonly engine: CityEngine,
    private readonly events: GameSessionEvents,
  ) {}

  /** 宿主互斥状态快照（进入判定用；由 React 层如实填充）。 */
  hostState(cinemaActive: boolean, filmActive: boolean, busy: boolean): EnterHostState {
    return { cityReady: !!(this.engine.currentLayout && this.engine.currentModel), cinemaActive, filmActive, busy };
  }

  enter(kind: GameSelection, host: EnterHostState): { ok: true } | { ok: false; reason: string } {
    const attempt = this.controller.enter(kind, host);
    if (!attempt.ok) return { ok: false, reason: attempt.refusal };
    const layout = this.engine.currentLayout;
    const model = this.engine.currentModel;
    if (!layout || !model) {
      this.settleFailure("城市尚未就绪，暂时无法起飞。");
      return { ok: false, reason: "not-ready" };
    }
    const world = new FlightWorld({ layout, model, cursorMs: this.engine.replayCursor });
    const diagonal = Math.hypot(layout.urbanBounds.right - layout.urbanBounds.left, layout.urbanBounds.south - layout.urbanBounds.north);
    const params = flightParamsFor(diagonal);
    const spawn = world.findSafeSpawn(params.planeRadius + 1.5, params.planeRadius * 5.2, params.planeRadius * 2.4);
    if (!spawn) {
      this.settleFailure("没有可用的安全出生点，暂不能进入飞行。");
      return { ok: false, reason: "no-safe-spawn" };
    }
    // 接管相机与循环（§4：同帧单一所有者；startCinematic 在 game 持有时会被拒绝）。
    if (!this.engine.setCameraOwner("game")) {
      this.controller.fail("相机被占用，暂时无法起飞。");
      this.emit();
      return { ok: false, reason: "camera-busy" };
    }
    this.returnCamera = this.engine.captureReturnView();
    this.world = world;
    this.params = params;
    this.sim = initialSimState(spawn, params);
    this.prevSim = this.sim;
    this.renderSim = this.sim;
    this.lastSafe = { x: spawn.x, y: spawn.y, z: spawn.z };
    this.collisions = 0;
    this.softOutside = false;
    this.accumulator = 0;
    this.visuals = new FlightVisuals(params);
    this.engine.attachGameObjects(this.visuals.group);
    const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    this.camera = new FlightCamera(this.engine.renderCamera, reducedMotion);
    this.camera.reset(this.sim, params);
    this.visuals.update(this.sim, 0);
    this.input = new FlightInput({
      shouldConsumeArrows: () => this.controller.simulating && this.canvasFocused(),
      onInterrupt: (reason) => this.interrupt(reason),
    });
    this.input.attach();
    this.engine.setGameFrameHook(this.frame);
    this.controller.prepareDone();
    this.emit(true);
    return { ok: true };
  }

  pause(reason: GamePauseReason): void {
    this.input?.clear();
    this.controller.pause(reason);
    this.emit(true);
  }

  resume(): void {
    if (!this.controller.snapshot.paused) return;
    // §5：恢复需重新确认焦点 + 清空旧键值。
    this.input?.clear();
    this.controller.resume();
    this.accumulator = 0;
    this.emit(true);
  }

  restart(): void {
    for (const event of this.controller.restart()) {
      if (event.type === "restarted") this.resetToSpawn();
    }
    this.emit(true);
  }

  retryPrepare(): void {
    this.controller.retryPrepare();
    // 重试准备：直接重新出生（世界快照沿用 §7.1：重试复用原路线/布局）。
    this.resetToSpawn();
    this.controller.prepareDone();
    this.emit(true);
  }

  /** 退出（幂等）：停输入与模拟 → 移除对象 → 归还相机 → 通知 React 恢复与刷新。 */
  exit(): void {
    if (!this.controller.inGame) return;
    this.controller.exit();
    this.input?.detach();
    this.engine.setGameFrameHook(null);
    if (this.visuals) {
      this.engine.detachGameObjects(this.visuals.group);
      this.visuals.dispose();
      this.visuals = null;
    }
    this.camera?.dispose();
    this.camera = null;
    this.engine.setCameraOwner("orbit");
    if (this.returnCamera) this.engine.restoreReturnView(this.returnCamera);
    this.returnCamera = null;
    this.world = null;
    this.sim = this.prevSim = this.renderSim = null;
    this.controller.exitSettled();
    this.emit(true);
    this.events.onExited();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.exit();
  }

  snapshot(): GameSessionSnapshot {
    return {
      controller: this.controller.snapshot,
      telemetry: this.renderSim ? { speed: this.renderSim.speed, altitude: this.renderSim.y, heading: this.renderSim.heading } : null,
      softOutside: this.softOutside,
      collisions: this.collisions,
    };
  }

  get physicsVersion(): number {
    return PHYSICS_VERSION;
  }

  // ── 内部 ──

  private readonly frame = (dt: number): void => {
    if (this.disposed || !this.controller.inGame) return;
    if (!this.controller.simulating || !this.renderSim) return; // 暂停/错误/结果：画面停驻
    this.accumulator += dt;
    if (this.accumulator > LAG_PAUSE_SECONDS) {
      // §6.2：单帧间隔超 250ms 进入 paused:lag，清空积压。
      this.accumulator = 0;
      this.interrupt("lag");
      return;
    }
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      this.stepPhysics();
      this.accumulator -= FIXED_DT;
      steps += 1;
    }
    if (steps >= MAX_STEPS_PER_FRAME && this.accumulator > FIXED_DT * MAX_STEPS_PER_FRAME) {
      this.accumulator = 0;
      this.interrupt("lag");
      return;
    }
    // 渲染插值：帧内位置取物理步之间的 lerp（§6.2 画面按渲染帧插值）。
    const alpha = Math.max(0, Math.min(1, this.accumulator / FIXED_DT));
    if (this.sim && this.prevSim) this.renderSim = lerpSim(this.prevSim, this.sim, alpha);
    if (this.renderSim && this.params && this.world) {
      this.visuals?.update(this.renderSim, dt);
      this.camera?.update(dt, this.renderSim, this.params, this.world);
      this.emit();
    }
  };

  private stepPhysics(): void {
    const sim = this.sim;
    const params = this.params;
    const world = this.world;
    if (!sim || !params || !world) return;
    const input = this.input?.snapshot() ?? { throttleUp: false, throttleDown: false, turnLeft: false, turnRight: false, pitchUp: false, pitchDown: false };
    const next = stepFlight(sim, input, FIXED_DT, params);
    const hit = sweepFlight(world, sim, next, params.planeRadius);
    if (hit) {
      // 温和重置（§6.3）：回到最近安全点、减速、短反馈；软边界只提示不重置。
      this.collisions += 1;
      this.visuals?.pulseFeedback();
      const safe = this.lastSafe ?? { x: sim.x, y: sim.y, z: sim.z };
      this.sim = { ...sim, x: safe.x, y: safe.y, z: safe.z, speed: Math.max(params.minSpeed, sim.speed * 0.4), verticalSpeed: 0, turnRate: 0, bank: 0 };
      this.prevSim = this.sim;
      this.lastSafe = { ...safe };
      return;
    }
    this.prevSim = sim;
    this.sim = next;
    // 维护最近安全点：带余量净空才记录，避免贴墙位置成为重置点。
    if (world.isPointClear(next.x, next.y, next.z, params.planeRadius * 1.6)) {
      this.lastSafe = { x: next.x, y: next.y, z: next.z };
    }
    const distance = Math.hypot(next.x - world.bounds.centerX, next.z - world.bounds.centerZ);
    this.softOutside = distance > world.bounds.softRadius;
  }

  private resetToSpawn(): void {
    const world = this.world;
    const params = this.params;
    if (!world || !params) return;
    const spawn = world.findSafeSpawn(params.planeRadius + 1.5, params.planeRadius * 5.2, params.planeRadius * 2.4);
    if (!spawn) {
      this.controller.fail("没有可用的安全出生点。");
      return;
    }
    this.sim = initialSimState(spawn, params);
    this.prevSim = this.sim;
    this.renderSim = this.sim;
    this.lastSafe = { x: spawn.x, y: spawn.y, z: spawn.z };
    this.collisions = 0;
    this.softOutside = false;
    this.accumulator = 0;
    this.input?.clear();
    this.camera?.reset(this.sim, params);
    this.visuals?.update(this.sim, 0);
  }

  private interrupt(reason: Extract<GamePauseReason, "focus-lost" | "host-hidden" | "lag">): void {
    this.accumulator = 0;
    this.input?.clear();
    this.controller.pause(reason);
    this.emit(true);
  }

  private settleFailure(message: string): void {
    this.controller.fail(message);
    this.emit(true);
  }

  private canvasFocused(): boolean {
    return typeof document !== "undefined" && document.activeElement === this.engine.domCanvas;
  }

  private emit(force = false): void {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (!force && now - this.hudAt < 1000 / HUD_HZ) return;
    this.hudAt = now;
    this.events.onState(this.snapshot());
  }
}
