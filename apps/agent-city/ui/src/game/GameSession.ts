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
  /** 新最佳成绩（React 层负责档案持久化，§9）。 */
  onRecord?: (courseId: string, bestTimeMs: number, collisions: number) => void;
};

export type GameSessionSnapshot = {
  controller: GameSnapshot;
  /** 供 HUD 展示的飞行读数（≤10 Hz 更新，不逐帧进 React）。 */
  telemetry: { speed: number; altitude: number; heading: number } | null;
  softOutside: boolean;
  collisions: number;
  /** 穿环任务（仅 race 模式；practice 为 null）。 */
  mission: RaceMissionSnapshot | null;
  /** 本路线最佳（含跨会话载入的档案成绩）。 */
  best: RaceResult | null;
  /** 当前路线身份摘要（无业务标识几何摘要；测试与调试用）。 */
  courseId: string | null;
  /** 当前路线变体（测试与调试用）。 */
  variant: number;
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
  /** 最近一次准备失败的原因（驱动「生成失败重试换 variant」的判定）。 */
  private lastPrepareFailure: string | null = null;
  private bestByCourse = new Map<string, RaceResult>();
  /** 路线工厂（测试注入点：真实布局几乎不会生成失败，无法覆盖 no-course 分支）。 */
  private readonly courseFactory: typeof generateRaceCourse;

  constructor(
    private readonly engine: CityEngine,
    private readonly events: GameSessionEvents,
    courseFactory?: typeof generateRaceCourse,
  ) {
    this.courseFactory = courseFactory ?? generateRaceCourse;
  }

  /** 宿主互斥状态快照（进入判定用；由 React 层如实填充）。 */
  hostState(cinemaActive: boolean, filmActive: boolean, busy: boolean): EnterHostState {
    return { cityReady: !!(this.engine.currentLayout && this.engine.currentModel), cinemaActive, filmActive, busy };
  }

  enter(kind: GameSelection, host: EnterHostState): { ok: true } | { ok: false; reason: string } {
    const attempt = this.controller.enter(kind, host);
    if (!attempt.ok) return { ok: false, reason: attempt.refusal };
    const build = this.ensureRunObjects(kind);
    if (!build.ok) {
      this.settleFailure(build.message, build.reason);
      return { ok: false, reason: build.reason };
    }
    this.attachRun();
    return { ok: true };
  }

  /**
   * 准备/重试共用的对象保障：world/params 优先沿用既有冻结快照（重试复用原世界），
   * 缺失时从引擎现状态重建；race 缺 course 时按当前 variant 生成；出生点与相机接管
   * 在此检查。失败返回可识别原因——调用方进入错误面板，绝不带着半套对象起跑。
   */
  private ensureRunObjects(kind: GameSelection): { ok: true } | { ok: false; reason: string; message: string } {
    if (!this.world || !this.params) {
      const layout = this.engine.currentLayout;
      const model = this.engine.currentModel;
      if (!layout || !model) return { ok: false, reason: "not-ready", message: "城市尚未就绪，暂时无法起飞。" };
      this.citySeed = layout.seed;
      this.world = new FlightWorld({ layout, model, cursorMs: this.engine.replayCursor });
      const diagonal = Math.hypot(layout.urbanBounds.right - layout.urbanBounds.left, layout.urbanBounds.south - layout.urbanBounds.north);
      this.params = flightParamsFor(diagonal);
    }
    if (kind.mode === "race") {
      if (!this.course) {
        const course = this.courseFactory({ world: this.world, params: this.params, citySeed: this.citySeed, physicsVersion: PHYSICS_VERSION, variant: this.variant });
        if (!course) return { ok: false, reason: "no-course", message: "这条航线暂时无法生成安全路线，可重试或先自由练习。" };
        this.course = course;
      }
    } else {
      this.course = null;
    }
    if (!this.spawnFor(this.params, this.world)) {
      return { ok: false, reason: "no-safe-spawn", message: "没有可用的安全出生点，暂不能进入飞行。" };
    }
    // 接管相机与循环（§4：同帧单一所有者；startCinematic 在 game 持有时会被拒绝）。
    if (this.engine.owner !== "game" && !this.engine.setCameraOwner("game")) {
      return { ok: false, reason: "camera-busy", message: "相机被占用，暂时无法起飞。" };
    }
    if (!this.returnCamera) this.returnCamera = this.engine.captureReturnView();
    return { ok: true };
  }

  /** 挂载运行件（幂等）：造型/相机/输入/帧钩子/任务，随后重置到出生点并落成准备。 */
  private attachRun(): void {
    const params = this.params!;
    if (!this.visuals) {
      this.visuals = new FlightVisuals(params);
      this.engine.attachGameObjects(this.visuals.group);
    }
    if (this.course) this.visuals.setRings(this.course.rings);
    else this.visuals.clearRings();
    this.mission = this.course ? new RaceMission(this.course, params) : null;
    if (!this.camera) {
      const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
      this.camera = new FlightCamera(this.engine.renderCamera, reducedMotion);
    }
    if (!this.input) {
      this.input = new FlightInput({
        isGameFocused: () => this.canvasFocused(),
        shouldConsumeArrows: () => this.controller.simulating && this.canvasFocused(),
        onInterrupt: (reason) => this.interrupt(reason),
      });
      this.input.attach();
    }
    this.engine.setGameFrameHook(this.frame);
    this.resetToSpawn();
    this.controller.prepareDone();
    this.emit(true);
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
    // §5：恢复需重新确认焦点 + 清空旧键值——把焦点还给画布（点击「继续」时焦点在按钮上），
    // 之后飞行输入立即生效；焦点获取失败则等待用户点击画布。
    this.input?.clear();
    const canvas = this.engine.domCanvas;
    if (canvas instanceof HTMLElement) canvas.focus({ preventScroll: true });
    this.controller.resume();
    this.accumulator = 0;
    this.emit(true);
  }

  /** 重试/重新开始：挑战复用原路线（variant 不变，§7.1）；任务实例必须重建
   *  （上一局的 mission 已终态，不重建则重赛进度永远冻结）。 */
  restart(): void {
    for (const event of this.controller.restart()) {
      if (event.type === "restarted") this.attachRun();
    }
    this.emit(true);
  }

  /** 显式「新路线」：variant+1 重新生成（§7.1）。variant 在此递增且仅此一次；
   *  result/paused 走 restart 语义（控制器回 preparing→prepareDone），错误面板走
   *  retryPrepare——后者不得再推断式递增（曾因 result 阶段 retryPrepare 空转导致
   *  variant 双递增且相位卡死在 result）。 */
  newCourse(): void {
    const snapshot = this.controller.snapshot;
    if (snapshot.selection?.mode !== "race") return;
    if (snapshot.error) {
      // 显式换线是唯一的 variant 递增来源：清除失败标记，retryPrepare 不得再按
      // no-course 推断递增（曾因此双递增、跳过一个 variant）。
      this.variant += 1;
      this.course = null;
      this.lastPrepareFailure = null;
      this.retryPrepare();
      return;
    }
    if (snapshot.phase !== "result" && !snapshot.paused) return;
    // restart 语义（result/paused → preparing → prepareDone）。先按新 variant 生成路线，
    // 失败则保留原路线退回结果页（本次换线未生效），不带空路线进比赛。
    const previousCourse = this.course;
    this.variant += 1;
    this.course = null;
    this.lastPrepareFailure = null;
    const build = this.ensureRunObjects({ mode: "race" });
    if (!build.ok) {
      this.course = previousCourse;
      this.lastPrepareFailure = build.reason;
      this.emit(true);
      return;
    }
    for (const event of this.controller.restart()) {
      if (event.type === "restarted") this.attachRun();
    }
    this.emit(true);
  }

  retryPrepare(): void {
    const selection = this.controller.snapshot.selection;
    if (!selection) return;
    // 生成失败后的重试换 variant，不再撞同一条死路；其他失败（未就绪/无出生点/
    // 相机占用）不换——路线本身没有被否决。
    const failedCourseGeneration = this.lastPrepareFailure === "no-course";
    this.lastPrepareFailure = null;
    this.controller.retryPrepare();
    if (failedCourseGeneration && selection.mode === "race") this.variant += 1;
    // 完整重建（对象缺失时从引擎现状态补齐；相机/返回视角只在首次接管时捕获）。
    const build = this.ensureRunObjects(selection);
    if (!build.ok) {
      this.settleFailure(build.message, build.reason);
      return;
    }
    this.attachRun();
  }

  /** 退出（幂等）：停输入与模拟 → 移除对象 → 归还相机 → 通知 React 恢复与刷新。 */
  exit(): void {
    if (!this.controller.inGame) return;
    this.mission?.abort();
    this.controller.exit();
    this.input?.detach();
    this.input = null;
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
      courseId: this.course?.courseId ?? null,
      variant: this.variant,
    };
  }

  get physicsVersion(): number {
    return PHYSICS_VERSION;
  }

  /** 载入档案成绩（跨会话最佳；由 React 层在端口就绪后注入，§9）。 */
  adoptProfileRecords(records: Array<{ courseId: string; bestTimeMs: number; collisions: number }>): void {
    for (const record of records) {
      this.bestByCourse.set(record.courseId, { finished: true, elapsedMs: record.bestTimeMs, collisions: record.collisions, penaltyMs: 0, finalMs: record.bestTimeMs });
    }
    this.emit(true);
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
        this.events.onRecord?.(this.course.courseId, result.finalMs, result.collisions);
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

  private settleFailure(message: string, reason?: string): void {
    this.lastPrepareFailure = reason ?? null;
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
