/**
 * GameSession：游戏模式的引擎侧编排（§3/§5/§6/§7/§8）。持有 GameModeController、
 * FlightWorld/输入/模拟/相机/造型与穿环任务（RaceCourse/RaceMission），把控制器事件
 * 映射为引擎副作用；通过回调把状态变化通知 React（HUD）。不 import React；
 * 一个 CityEngine 同时至多一个会话。倒计时与任务计时共用固定步模拟时钟（§6.2）。
 */
import type { CityEngine } from "../engine/CityEngine";
import { GameModeController, type GameSnapshot } from "./GameModeController";
import { FlightWorld } from "./FlightWorld";
import { FlightInput } from "./FlightInput";
import { FlightCamera } from "./FlightCamera";
import { FlightVisuals } from "./FlightVisuals";
import { initialSimState, flightParamsFor, stepFlight, lerpSim, PHYSICS_VERSION, type FlightParams, type FlightSimState } from "./FlightSimulation";
import { sweepFlight } from "./FlightCollision";
import { generateRaceCourse, COURSE_VERSION, type RaceCourse } from "./RaceCourse";
import { RaceMission, type RaceMissionSnapshot, type RaceResult } from "./RaceMission";
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
  /** 穿环任务（仅 race 模式；practice 为 null）。 */
  mission: RaceMissionSnapshot | null;
  /** 本会话内存最佳（G2：不标注跨重启保存）。 */
  best: RaceResult | null;
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
  private citySeed = 0;
  private variant = 0;
  private course: RaceCourse | null = null;
  private mission: RaceMission | null = null;
  private bestByCourse = new Map<string, RaceResult>();

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
    this.citySeed = layout.seed;
    const world = new FlightWorld({ layout, model, cursorMs: this.engine.replayCursor });
    const diagonal = Math.hypot(layout.urbanBounds.right - layout.urbanBounds.left, layout.urbanBounds.south - layout.urbanBounds.north);
    const params = flightParamsFor(diagonal);
    if (kind.mode === "race") {
      const course = generateRaceCourse({ world, params, citySeed: layout.seed, physicsVersion: PHYSICS_VERSION, variant: this.variant });
      if (!course) {
        this.settleFailure("这条航线暂时无法生成安全路线，可重试或先自由练习。");
        return { ok: false, reason: "no-course" };
      }
      this.course = course;
    } else {
      this.course = null;
    }
    const spawn = this.spawnFor(params, world);
    if (!spawn) {
      this.settleFailure("没有可用的安全出生点，暂不能进入飞行。");
      return { ok: false, reason: "no-safe-spawn" };
    }
    // 接管相机与循环（§4：同帧单一所有者；startCinematic 在 game 持有时会被拒绝）。
    if (!this.engine.setCameraOwner("game")) {
      this.controller.fail("相机被占用，暂时无法起飞。");
      this.emit(true);
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
    if (this.course) {
      this.visuals.setRings(this.course.rings);
      this.mission = new RaceMission(this.course, params);
    } else {
      this.mission = null;
    }
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

  /** 出生点：挑战取首环后方进近位（沿切线），练习取世界安全位。 */
  private spawnFor(params: FlightParams, world: FlightWorld): { x: number; y: number; z: number; heading: number } | null {
    const first = this.course?.rings[0];
    if (first) {
      const back = Math.max(params.maxSpeed * 1.6, 30);
      const x = first.x - first.nx * back;
      const y = first.y;
      const z = first.z - first.nz * back;
      if (world.isPointClear(x, y, z, params.planeRadius + 2)) {
        return { x, y, z, heading: Math.atan2(first.nz, first.nx) };
      }
    }
    return world.findSafeSpawn(params.planeRadius + 1.5, params.planeRadius * 5.2, params.planeRadius * 2.4);
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

  /** 重试/重新开始：挑战复用原路线（variant 不变，§7.1）。 */
  restart(): void {
    for (const event of this.controller.restart()) {
      if (event.type === "restarted") this.resetToSpawn();
    }
    this.emit(true);
  }

  /** 显式「新路线」：variant+1 重新生成（§7.1）。 */
  newCourse(): void {
    if (this.controller.snapshot.selection?.mode !== "race") return;
    this.variant += 1;
    this.course = null;
    if (this.controller.snapshot.phase === "result" || this.controller.snapshot.paused || this.controller.snapshot.error) {
      this.retryPrepare();
    }
  }

  retryPrepare(): void {
    const hadNoCourse = this.controller.snapshot.selection?.mode === "race" && !this.course;
    this.controller.retryPrepare();
    if (hadNoCourse) this.variant += 1; // 生成失败的重试换 variant，不再撞同一条死路
    // 重试准备：重建任务（练习直接重新出生；挑战沿用/重生成路线后重摆）。
    if (this.controller.snapshot.selection?.mode === "race") {
      const world = this.world;
      const params = this.params;
      if (world && params && !this.course) {
        this.course = generateRaceCourse({ world, params, citySeed: this.citySeed, physicsVersion: PHYSICS_VERSION, variant: this.variant });
        if (!this.course) {
          this.settleFailure("这条航线暂时无法生成安全路线，可重试或先自由练习。");
          return;
        }
        this.visuals?.setRings(this.course.rings);
      }
      if (this.course) this.mission = new RaceMission(this.course, params!);
    }
    this.resetToSpawn();
    this.controller.prepareDone();
    this.emit(true);
  }

  /** 退出（幂等）：停输入与模拟 → 移除对象 → 归还相机 → 通知 React 恢复与刷新。 */
  exit(): void {
    if (!this.controller.inGame) return;
    this.mission?.abort();
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
    this.mission = null;
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
      mission: this.mission?.snapshot() ?? null,
      best: this.course ? this.bestByCourse.get(this.course.courseId) ?? null : null,
    };
  }

  get physicsVersion(): number {
    return PHYSICS_VERSION;
  }

  get courseVersion(): number {
    return COURSE_VERSION;
  }

  // ── 内部 ──

  private readonly frame = (dt: number): void => {
    if (this.disposed || !this.controller.inGame) return;
    const { phase, paused, error } = this.controller.snapshot;
    if (paused || error || phase === "result" || phase === "preparing" || !this.renderSim) return; // 画面停驻
    // 倒计时：飞机冻结，任务时钟按固定步推进（§3.4/§6.2 倒计时使用模拟时钟）。
    if (phase === "countdown" && this.mission) {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
        const events = this.mission.tickCountdown(FIXED_DT * 1000);
        this.accumulator -= FIXED_DT;
        steps += 1;
        if (events.some((event) => event.type === "countdown-done")) {
          this.controller.countdownDone();
          this.accumulator = 0;
          this.emit(true);
          return;
        }
      }
      if (this.accumulator > LAG_PAUSE_SECONDS) {
        this.accumulator = 0;
        this.interrupt("lag");
        return;
      }
      this.visuals?.update(this.renderSim, 0);
      this.visuals?.updateRings(this.renderSim.simTime, this.mission.snapshot().targetIndex);
      this.emit();
      return;
    }
    if (phase !== "racing" && phase !== "practice") return;
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
      if (this.mission) this.visuals?.updateRings(this.renderSim.simTime, this.mission.snapshot().targetIndex);
      this.camera?.update(dt, this.renderSim, this.params, this.world);
      this.emit();
    }
  };

  private stepPhysics(): void {
    const sim = this.sim;
    const params = this.params;
    const world = this.world;
    if (!sim || !params || !world) return;
    const input = this.controller.snapshot.phase === "countdown"
      ? { throttleUp: false, throttleDown: false, turnLeft: false, turnRight: false, pitchUp: false, pitchDown: false }
      : this.input?.snapshot() ?? { throttleUp: false, throttleDown: false, turnLeft: false, turnRight: false, pitchUp: false, pitchDown: false };
    const next = stepFlight(sim, input, FIXED_DT, params);
    const hit = sweepFlight(world, sim, next, params.planeRadius);
    let teleported = false;
    if (hit) {
      // 温和重置（§6.3）：回到最近安全点、减速、短反馈；任务侧记罚时。
      this.collisions += 1;
      this.visuals?.pulseFeedback();
      for (const event of this.mission?.onCollision() ?? []) {
        if (event.type === "failed") this.finishRace(event.result);
      }
      const safe = this.lastSafe ?? { x: sim.x, y: sim.y, z: sim.z };
      this.sim = { ...sim, x: safe.x, y: safe.y, z: safe.z, speed: Math.max(params.minSpeed, sim.speed * 0.4), verticalSpeed: 0, turnRate: 0, bank: 0 };
      this.prevSim = this.sim;
      this.lastSafe = { ...safe };
      teleported = true;
    } else {
      this.prevSim = sim;
      this.sim = next;
      // 维护最近安全点：带余量净空才记录，避免贴墙位置成为重置点。
      if (world.isPointClear(next.x, next.y, next.z, params.planeRadius * 1.6)) {
        this.lastSafe = { x: next.x, y: next.y, z: next.z };
      }
      const distance = Math.hypot(next.x - world.bounds.centerX, next.z - world.bounds.centerZ);
      this.softOutside = distance > world.bounds.softRadius;
    }
    if (this.mission) {
      for (const event of this.mission.step(sim, this.sim, FIXED_DT * 1000, teleported)) {
        if (event.type === "finished") this.finishRace(event.result);
        else if (event.type === "failed") this.finishRace(event.result);
        else this.emit(true);
      }
    }
  }

  private finishRace(result: RaceResult): void {
    // 结算恰好一次由 RaceMission 保证；控制器再收敛到 result 相位。
    this.controller.raceFinished();
    if (result.finished && this.course) {
      const best = this.bestByCourse.get(this.course.courseId);
      if (!best || result.finalMs < best.finalMs || (result.finalMs === best.finalMs && result.collisions < best.collisions)) {
        this.bestByCourse.set(this.course.courseId, result);
      }
    }
    this.emit(true);
  }

  private resetToSpawn(): void {
    const world = this.world;
    const params = this.params;
    if (!world || !params) return;
    const spawn = this.spawnFor(params, world);
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
