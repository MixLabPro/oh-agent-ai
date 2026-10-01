/**
 * CityEngine：Three.js 场景的唯一所有者。React 只通过本类的窄 API 驱动它
 * （换模型 / 时间游标 / 画质 / 聚焦 / 事件回调），业务数据不接触 3D 对象。
 *
 * 常驻成本控制：
 *  · 页面卸载 → dispose()（几何/材质/纹理/renderer 全部释放）。
 *  · 文档隐藏 → 停止 rAF 循环；恢复可见再续。
 *  · 空闲（无输入且相机静止 12s）→ 降为 ~20fps 的环境帧率；交互立即恢复。
 *  · 自适应画质：非空闲时统计帧率，连续低帧自动降档（阴影/像素比/生命感部件），
 *    富余时升档。"auto" 之外可由用户钉死。
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { CityModel } from "../cityModel";
import { layoutCity } from "./cityLayout";
import { CityParts, type QualityLevel } from "./cityParts";

export type EngineQualityMode = "auto" | "high" | "eco";
export type EngineStats = { fps: number; drawCalls: number; triangles: number; buildings: number; quality: QualityLevel; idle: boolean };

export type CityEngineOptions = {
  canvas: HTMLCanvasElement;
  onHover?: (id: string | null, clientX: number, clientY: number) => void;
  onSelect?: (id: string | null) => void;
  onStats?: (stats: EngineStats) => void;
  onTimeCursor?: (ms: number, live: boolean) => void;
  onFirstFrame?: () => void;
};

const IDLE_AFTER_MS = 12_000;
const IDLE_FRAME_INTERVAL_MS = 50;

export class CityEngine {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private parts: CityParts | null = null;
  private model: CityModel | null = null;
  private frame = 0;
  private raf = 0;
  private lastTime = 0;
  private elapsed = 0;
  private lastRenderAt = 0;
  private disposed = false;
  private documentHidden = false;
  private firstFrameSent = false;

  // 时间轴（replay）状态。
  private cursorMs: number | null = null; // null = live（跟随现在）
  private playing = false;
  private playbackSpeed = 3_600; // 1 秒 = 1 小时（默认）

  // 空闲与自适应画质。
  private lastActivityAt = 0;
  private qualityMode: EngineQualityMode = "auto";
  private quality: QualityLevel = 1;
  private frameCount = 0;
  private lastTierCheckAt = 0;
  private lastStatsAt = 0;
  private fps = 60;

  // 聚焦 tween。
  private tween: { fromPos: THREE.Vector3; toPos: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3; start: number; duration: number } | null = null;

  // 拾取状态。
  private pointerClient: { x: number; y: number } | null = null;
  private pointerMoved = false;
  private hoveredId: string | null = null;
  private pointerDown: { x: number; y: number; at: number } | null = null;
  private attracted = true;
  private boundsRadius = 150;
  private readonly disposablesSky: Array<{ dispose: () => void }> = [];
  private readonly observers: Array<() => void> = [];

  constructor(private readonly options: CityEngineOptions) {
    const canvas = options.canvas;
    const lowPower = { antialias: window.devicePixelRatio < 1.75, powerPreference: "low-power" as const, stencil: false };
    this.renderer = new THREE.WebGLRenderer({ canvas, ...lowPower });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 3_000);
    this.camera.position.set(150, 120, 170);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = 1.42;
    this.controls.minDistance = 16;
    this.controls.maxDistance = 900;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.45;

    this.scene.background = new THREE.Color("#d9ecf1");
    this.hemisphere = new THREE.HemisphereLight("#eaf6fa", "#cbbfa6", 0.6);
    this.scene.add(this.hemisphere);
    this.sun = new THREE.DirectionalLight("#fff3de", 1.55);
    this.sun.position.set(120, 160, 70);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 20;
    this.sun.shadow.camera.far = 620;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(this.buildSkyDome());

    this.applyQualityLevel(1);

    const onPointerMove = (event: PointerEvent) => {
      this.pointerClient = { x: event.clientX, y: event.clientY };
      const rect = canvas.getBoundingClientRect();
      this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      this.pointerMoved = true;
      this.noteActivity();
    };
    const onPointerDown = (event: PointerEvent) => {
      this.pointerDown = { x: event.clientX, y: event.clientY, at: performance.now() };
      if (this.attracted) {
        this.attracted = false;
        this.controls.autoRotate = false;
      }
      this.noteActivity();
    };
    const onPointerUp = (event: PointerEvent) => {
      const down = this.pointerDown;
      this.pointerDown = null;
      this.noteActivity();
      if (!down) return;
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      if (moved > 7 || performance.now() - down.at > 500) return; // 拖拽不是点击
      this.handleClick();
    };
    const onWheel = () => this.noteActivity();
    const onVisibility = () => {
      this.documentHidden = document.visibilityState === "hidden";
      if (this.documentHidden) this.stopLoop();
      else this.startLoop();
    };

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    this.observers.push(
      () => canvas.removeEventListener("pointermove", onPointerMove),
      () => canvas.removeEventListener("pointerdown", onPointerDown),
      () => canvas.removeEventListener("pointerup", onPointerUp),
      () => canvas.removeEventListener("wheel", onWheel),
      () => document.removeEventListener("visibilitychange", onVisibility),
    );

    const resize = () => this.resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas.parentElement ?? canvas);
    this.observers.push(() => observer.disconnect());
    this.resize();

    this.startLoop();
  }

  private noteActivity(): void {
    this.lastActivityAt = performance.now();
  }

  private resize(): void {
    const parent = this.options.canvas.parentElement;
    const width = Math.max(1, parent?.clientWidth ?? this.options.canvas.clientWidth);
    const height = Math.max(1, parent?.clientHeight ?? this.options.canvas.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  applyModel(model: CityModel): void {
    this.model = model;
    if (this.parts) {
      this.scene.remove(this.parts.group, this.parts.water);
      this.parts.dispose();
      this.parts = null;
    }
    const layout = layoutCity(model);
    this.parts = new CityParts(model, layout);
    this.scene.add(this.parts.group, this.parts.water);

    const bounds = Math.max(120, layout.boundsRadius);
    this.boundsRadius = bounds;
    this.controls.maxDistance = bounds * 4.5;
    this.scene.fog = new THREE.Fog(new THREE.Color("#dfeef2"), bounds * 2.1, bounds * 7.5);
    const shadowBox = bounds * 0.85 + 24;
    const shadowCamera = this.sun.shadow.camera as THREE.OrthographicCamera;
    shadowCamera.left = -shadowBox;
    shadowCamera.right = shadowBox;
    shadowCamera.top = shadowBox;
    shadowCamera.bottom = -shadowBox;
    shadowCamera.updateProjectionMatrix();

    if (this.frame < 5) {
      // 首个模型：入场镜头（远处高处 → 默认视角）。
      const home = this.homeView();
      this.camera.position.set(home.x * 2.1, home.y * 2.4, home.z * 2.1);
      this.controls.target.set(0, 6, 0);
      this.flyTo(home, { x: 0, y: 6, z: 0 }, 2_000);
    }
    this.parts.setLabelsVisible(true);
    this.parts.setQualityLevel(this.quality);
    if (this.cursorMs !== null) this.parts.applyCursor(this.cursorMs, false);
  }

  private homeView(): { x: number; y: number; z: number } {
    const bounds = Math.max(120, this.boundsRadius);
    return { x: bounds * 0.98, y: bounds * 0.82, z: bounds * 1.12 };
  }

  private flyTo(position: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }, duration: number): void {
    this.tween = {
      fromPos: this.camera.position.clone(),
      toPos: new THREE.Vector3(position.x, position.y, position.z),
      fromTarget: this.controls.target.clone(),
      toTarget: new THREE.Vector3(target.x, target.y, target.z),
      start: this.elapsed,
      duration: duration / 1000,
    };
  }

  resetView(): void {
    const home = this.homeView();
    this.flyTo(home, { x: 0, y: 6, z: 0 }, 900);
    this.options.onSelect?.(null);
    this.parts?.setSelected(null);
  }

  focusBuilding(id: string): boolean {
    if (!this.parts) return false;
    const anchor = this.parts.anchorFor(id);
    if (!anchor) return false;
    const distance = Math.max(26, anchor.height * 2.1);
    const direction = new THREE.Vector3().subVectors(this.camera.position, this.controls.target).setY(0).normalize();
    if (direction.lengthSq() < 0.01) direction.set(0.8, 0, 0.6).normalize();
    const position = new THREE.Vector3(anchor.x, anchor.ground, anchor.z).addScaledVector(direction, distance).add(new THREE.Vector3(0, distance * 0.62, 0));
    this.flyTo(position, { x: anchor.x, y: anchor.ground + Math.max(4, anchor.height * 0.45), z: anchor.z }, 850);
    return true;
  }

  focusDistrict(districtId: string): boolean {
    if (!this.parts) return false;
    const anchor = this.parts.districtAnchor(districtId);
    if (!anchor) return false;
    const distance = anchor.radius * 2.6;
    const direction = new THREE.Vector3().subVectors(this.camera.position, this.controls.target).setY(0).normalize();
    if (direction.lengthSq() < 0.01) direction.set(0.8, 0, 0.6).normalize();
    const position = new THREE.Vector3(anchor.x, anchor.y, anchor.z).addScaledVector(direction, distance).add(new THREE.Vector3(0, distance * 0.7, 0));
    this.flyTo(position, { x: anchor.x, y: anchor.y, z: anchor.z }, 900);
    return true;
  }

  setQualityMode(mode: EngineQualityMode): void {
    this.qualityMode = mode;
    if (mode === "high") this.applyQualityLevel(2);
    else if (mode === "eco") this.applyQualityLevel(0);
    else this.applyQualityLevel(1);
  }

  private applyQualityLevel(level: QualityLevel): void {
    this.quality = level;
    const dprCap = level >= 2 ? 2 : level === 1 ? 1.5 : 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    this.renderer.shadowMap.enabled = level >= 1;
    const size = level >= 2 ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.parts?.setQualityLevel(level);
    this.resize();
  }

  setLabelsVisible(visible: boolean): void {
    this.parts?.setLabelsVisible(visible);
  }

  /** 模型重建后恢复选中态（刷新不打断用户的浏览上下文）。 */
  setSelected(id: string | null): void {
    this.parts?.setSelected(id);
  }

  /** 时间游标：null = live（跟随现在）；play = 以 speed 倍率回放。 */
  setTimeCursor(ms: number | null, options?: { playing?: boolean; speed?: number }): void {
    this.cursorMs = ms;
    if (options?.playing !== undefined) this.playing = options.playing;
    if (options?.speed !== undefined) this.playbackSpeed = options.speed;
    if (ms !== null) this.parts?.applyCursor(ms, false);
    else if (this.model) this.parts?.applyCursor(this.model.windowEndMs, true);
    this.noteActivity();
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  private handleClick(): void {
    if (!this.parts) return;
    const id = this.pick();
    if (id) {
      this.parts.setSelected(id);
      this.focusBuilding(id);
      this.options.onSelect?.(id);
    } else {
      this.parts.setSelected(null);
      this.options.onSelect?.(null);
    }
  }

  private pick(): string | null {
    if (!this.parts || !this.pointerClient) return null;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.parts.raycastTargets, false);
    for (const hit of hits) {
      if (hit.instanceId === undefined) continue;
      const id = this.parts.idAt(hit.object, hit.instanceId);
      if (id) return id;
    }
    return null;
  }

  /** 天穹：内翻大球，顶部到地平线的垂直渐变，1 次绘制的"天空感"。 */
  private buildSkyDome(): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(1_400, 24, 14);
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color("#a3cee6") },
        horizonColor: { value: new THREE.Color("#eef6ee") },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDirection;
        void main() {
          vDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        varying vec3 vDirection;
        void main() {
          float height = clamp(vDirection.y, 0.0, 1.0);
          vec3 color = mix(horizonColor, topColor, pow(height, 0.62));
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }
      `,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = -10;
    this.disposablesSky.push(geometry, material);
    return mesh;
  }

  private startLoop(): void {
    if (this.disposed || this.raf) return;
    this.lastTime = performance.now();
    // 首个统计窗口从现在起算，而不是从 epoch 起（否则第一次 fps 恒为 0，
    // 会把 auto 画质立刻错误降档）。
    this.lastStatsAt = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  private stopLoop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private tick = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    if (this.documentHidden) return;
    const dt = Math.min(0.1, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;
    this.elapsed += dt;
    this.noteActivityIfNeeded();

    const idle = now - this.lastActivityAt > IDLE_AFTER_MS && !this.tween && !this.playing;
    if (idle && now - this.lastRenderAt < IDLE_FRAME_INTERVAL_MS) return;

    this.updateScene(dt);
    this.renderer.render(this.scene, this.camera);
    this.lastRenderAt = now;
    this.accountFrame(now, idle);

    if (!this.firstFrameSent) {
      this.firstFrameSent = true;
      this.options.onFirstFrame?.();
    }
  };

  private noteActivityIfNeeded(): void {
    // 相机在动（阻尼/自动环绕）也算活动：环境帧率只在真正静止时启用。
    if (this.controls.autoRotate || this.tween) this.lastActivityAt = performance.now();
  }

  private updateScene(dt: number): void {
    // 回放推进。
    if (this.playing && this.model) {
      const next = (this.cursorMs ?? this.model.windowStartMs) + dt * 1000 * this.playbackSpeed;
      if (next >= this.model.windowEndMs) {
        this.cursorMs = this.model.windowEndMs;
        this.playing = false;
      } else {
        this.cursorMs = next;
      }
      this.parts?.applyCursor(this.cursorMs, false);
      this.options.onTimeCursor?.(this.cursorMs, false);
    }

    // 聚焦 tween。
    if (this.tween) {
      const progress = Math.min(1, (this.elapsed - this.tween.start) / this.tween.duration);
      const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      this.camera.position.lerpVectors(this.tween.fromPos, this.tween.toPos, eased);
      this.controls.target.lerpVectors(this.tween.fromTarget, this.tween.toTarget, eased);
      if (progress >= 1) this.tween = null;
    }

    this.controls.update();
    this.parts?.update(dt, this.elapsed);

    // 悬停拾取（每帧至多一次，且只在指针动过或相机在动时）。
    if (this.parts && this.pointerClient && (this.pointerMoved || this.tween)) {
      this.pointerMoved = false;
      const id = this.pick();
      if (id !== this.hoveredId) {
        this.hoveredId = id;
        this.parts.setHovered(id);
      }
      if (id) this.options.onHover?.(id, this.pointerClient.x, this.pointerClient.y);
      else this.options.onHover?.(null, 0, 0);
    }
  }

  private accountFrame(now: number, idle: boolean): void {
    this.frameCount += 1;
    // 帧率统计（以 stats 周期计算滑动平均）。
    if (this.lastStatsAt === 0) {
      this.lastStatsAt = now;
      this.frameCount = 0;
      return;
    }
    if (now - this.lastStatsAt > 1_000) {
      const measured = this.frameCount * 1000 / Math.max(1, now - this.lastStatsAt);
      this.fps = measured;
      this.frameCount = 0;
      this.lastStatsAt = now;
      this.options.onStats?.({
        fps: Math.round(measured),
        drawCalls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
        buildings: this.model?.buildings.length ?? 0,
        quality: this.quality,
        idle,
      });
      this.maybeRetier(measured, idle);
    }
  }

  private maybeRetier(fps: number, idle: boolean): void {
    if (this.qualityMode !== "auto" || idle) return;
    const now = performance.now();
    if (now - this.lastTierCheckAt < 3_500) return;
    this.lastTierCheckAt = now;
    if (fps < 27 && this.quality > 0) this.applyQualityLevel((this.quality - 1) as QualityLevel);
    else if (fps > 52 && this.quality < 2) this.applyQualityLevel((this.quality + 1) as QualityLevel);
  }

  dispose(): void {
    this.disposed = true;
    this.stopLoop();
    this.observers.forEach((cleanup) => cleanup());
    if (this.parts) {
      this.scene.remove(this.parts.group, this.parts.water);
      this.parts.dispose();
      this.parts = null;
    }
    this.controls.dispose();
    this.disposablesSky.forEach((disposable) => disposable.dispose());
    this.renderer.dispose();
  }
}
