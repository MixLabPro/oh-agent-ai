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
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { Reflector } from "three/addons/objects/Reflector.js";
import type { CityModel } from "../cityModel";
import { activeTheme, setActiveTheme, skyYawOf, type CityThemeName } from "./cityTheme";
import { loadCityAssets, type CityAssets } from "./cityAssets";
import { loadBiomeFlora } from "./cityFlora";
import { planCinematic, type CinematicPlan } from "./cityCinematic";
import { layoutCity, type CityLayout } from "./cityLayout";
import { CityParts, type QualityLevel } from "./cityParts";
import { skyStateAt, type CitySkyPreset } from "./citySky";
import { CityAurora } from "./cityAurora";
import { CityAmbient } from "./cityAmbient";

export type EngineQualityMode = "auto" | "high" | "eco";
export type EngineStats = { fps: number; drawCalls: number; triangles: number; buildings: number; quality: QualityLevel; idle: boolean };

export type CityEngineOptions = {
  canvas: HTMLCanvasElement;
  onHover?: (id: string | null, clientX: number, clientY: number) => void;
  onSelect?: (id: string | null) => void;
  onStats?: (stats: EngineStats) => void;
  onTimeCursor?: (ms: number, live: boolean) => void;
  /** 航拍进度（秒）；ended=true 表示片子放完或被打断。 */
  onCinematic?: (elapsedSec: number, plan: CinematicPlan, ended: boolean) => void;
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
  private layout: CityLayout | null = null;
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
  /** 昼夜相位缓存（上次 apply 的 hour，变化才写 uniform）。 */
  private lastSkyHour = -1;
  private aurora: CityAurora | null = null;
  private ambient: CityAmbient | null = null;
  private fillLight: THREE.DirectionalLight | null = null;
  private backLight: THREE.DirectionalLight | null = null;
  /** 当前 theme 的立面自发光基线（昼夜在其上抬升）。 */
  private themeSelfLit = activeTheme().name === "vice" ? 0.24 : 0.05;
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
  private cityCenter = { x: 0, z: 0 };
  private readonly disposablesSky: Array<{ dispose: () => void }> = [];
  private readonly observers: Array<() => void> = [];
  private skyDome: THREE.Mesh | null = null;
  private assets: CityAssets | null = null;
  /** 地形种子：未拿到前不渲染城市（否则先闪一座默认岛再跳成用户自己的岛）。 */
  private seed: number | null = null;
  private composer: EffectComposer | null = null;
  /** 当前后处理链的配置键（主题霓虹 × AO）：变化时重建，避免每帧判断哪些 pass 该在。 */
  private composerKey = "";
  /** 水面平面镜：不进场景，只借它的镜像相机与渲染目标（three 的 Reflector 已处理斜裁剪面与视角判断）。 */
  private mirror: Reflector | null = null;
  private readonly mirrorMatrix = new THREE.Matrix4();
  private cinematic: { plan: CinematicPlan; startedAt: number; savedFov: number; look: THREE.Vector3 | null; lastSeconds: number } | null = null;
  private themeName: CityThemeName = "day";

  constructor(private readonly options: CityEngineOptions) {
    const canvas = options.canvas;
    const lowPower = { antialias: window.devicePixelRatio < 1.75, powerPreference: "low-power" as const, stencil: false };
    this.renderer = new THREE.WebGLRenderer({ canvas, ...lowPower });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = activeTheme().exposure;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.camera = new THREE.PerspectiveCamera(42, 1, 1.5, 8_000);
    this.camera.position.set(150, 120, 170);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = 1.42;
    this.controls.minDistance = 16;
    this.controls.maxDistance = 900;
    this.controls.autoRotate = false;
    this.controls.autoRotateSpeed = 0.45;

    const theme = activeTheme();
    this.scene.background = new THREE.Color(theme.skyHorizon);
    this.hemisphere = new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, theme.hemiIntensity);
    this.scene.add(this.hemisphere);
    this.sun = new THREE.DirectionalLight(theme.sunColor, theme.sunIntensity);
    this.sun.position.set(120, 160, 70);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 20;
    this.sun.shadow.camera.far = 620;
    this.sun.shadow.bias = -0.0006;
    // 太阳是点光源般的远光：影子边缘应当清晰。只留 PCF 自带的 1 像素过滤去锯齿，不加模糊半径。
    this.sun.shadow.radius = 1;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun, this.sun.target);
    this.skyDome = this.buildSkyDome();
    this.scene.add(this.skyDome);
    // 素材异步到达：天空原地换图，parts 按需重建（地面细节 / 立面 / 水面法线）。
    void loadCityAssets().then((assets) => {
      if (this.disposed || !assets) return;
      this.assets = assets;
      this.applySkyImage();
      this.parts?.applyAssets(assets);
    });

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
      if (this.cinematic) this.stopCinematic();
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
    const onWheel = () => { this.attracted = false; this.noteActivity(); };
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

  /** 每帧渲染一次水面倒影（画质≥1）。半分辨率：倒影本来就被波纹扰动，全分辨率是浪费。 */
  private renderMirror(): void {
    const parts = this.parts;
    if (!parts) return;
    if (this.quality < 1) {
      parts.setMirror(null, null);
      return;
    }
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const width = Math.max(256, Math.floor(size.x / 2));
    const height = Math.max(256, Math.floor(size.y / 2));
    if (!this.mirror) {
      const mirror = new Reflector(new THREE.PlaneGeometry(1, 1), { textureWidth: width, textureHeight: height, clipBias: 0.003 });
      mirror.rotation.x = -Math.PI / 2;
      mirror.position.y = parts.water.position.y;
      mirror.updateMatrixWorld();
      this.mirror = mirror;
    } else {
      const target = this.mirror.getRenderTarget();
      if (target.width !== width || target.height !== height) target.setSize(width, height);
    }
    // 渲染倒影时藏起水面自身，否则镜像相机看到的是水面背面。
    parts.water.visible = false;
    this.mirror.onBeforeRender(this.renderer, this.scene, this.camera, undefined as never, undefined as never, undefined as never);
    parts.water.visible = true;
    // Reflector 的 textureMatrix 末尾乘了它自己的 matrixWorld（对象空间输入）；水面着色器给的是世界坐标，乘回逆矩阵。
    const textureMatrix = (this.mirror.material as THREE.ShaderMaterial).uniforms.textureMatrix.value as THREE.Matrix4;
    this.mirrorMatrix.copy(textureMatrix).multiply(new THREE.Matrix4().copy(this.mirror.matrixWorld).invert());
    parts.setMirror(this.mirror.getRenderTarget().texture, this.mirrorMatrix);
  }

  /** 后处理链：环境光遮蔽（GTAO，画质≥1）给楼脚、街角、楼间缝隙压出体积感；
   *  bloom 只在霓虹主题。都不需要时直渲，省一整条链。省电档（0）两者都关。 */
  private renderFrame(): void {
    this.renderMirror();
    const wantAo = this.quality >= 1;
    const wantBloom = activeTheme().neon && this.quality >= 1;
    if (!wantAo && !wantBloom) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    const key = `${wantAo ? "ao" : ""}|${wantBloom ? "bloom" : ""}|${this.quality}`;
    if (!this.composer || this.composerKey !== key) {
      this.composer?.dispose();
      const size = this.renderer.getSize(new THREE.Vector2());
      const composer = new EffectComposer(this.renderer);
      composer.addPass(new RenderPass(this.scene, this.camera));
      if (wantAo) {
        const ao = new GTAOPass(this.scene, this.camera, size.x, size.y);
        // 城市尺度：半径以世界单位计（一层楼约 3.1），够把楼脚和街角压暗、又不把整条街染黑。
        ao.updateGtaoMaterial({ radius: 26, distanceExponent: 1, thickness: 20, distanceFallOff: 1, scale: 2.4, samples: this.quality >= 2 ? 16 : 10 });
        ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: this.quality >= 2 ? 16 : 8 });
        ao.blendIntensity = 1;
        composer.addPass(ao);
      }
      // 阈值取 HDR 值：霓虹（×3.2）越线，被光照的沙地/天空不会整片泛光。
      if (wantBloom) composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 1.0, 0.6, 2.0));
      composer.addPass(new OutputPass());
      composer.setPixelRatio(this.renderer.getPixelRatio());
      composer.setSize(size.x, size.y);
      this.composer = composer;
      this.composerKey = key;
    }
    this.composer.render();
  }

  private resize(): void {
    const parent = this.options.canvas.parentElement;
    const width = Math.max(1, parent?.clientWidth ?? this.options.canvas.clientWidth);
    const height = Math.max(1, parent?.clientHeight ?? this.options.canvas.clientHeight);
    this.renderer.setSize(width, height, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(width, height);
    }
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.layout && this.attracted) {
      const home = this.homeView();
      this.camera.position.set(home.x, home.y, home.z);
      this.controls.target.set(this.cityCenter.x, 6, this.cityCenter.z);
    }
  }

  /** 切换视觉主题：场景级（天空/光/雾/曝光）原地更新，parts 级（水、地面、植被、宿主配色）重建。 */
  setTheme(name: CityThemeName): void {
    if (name === this.themeName && this.parts) return;
    this.themeName = name;
    const theme = setActiveTheme(name);
    this.scene.background = new THREE.Color(theme.skyHorizon);
    this.hemisphere.color.set(theme.hemiSky);
    this.hemisphere.groundColor.set(theme.hemiGround);
    this.hemisphere.intensity = theme.hemiIntensity;
    this.sun.color.set(theme.sunColor);
    this.sun.intensity = theme.sunIntensity;
    this.placeSun();
    this.renderer.toneMappingExposure = theme.exposure;
    const uniforms = (this.skyDome?.material as THREE.ShaderMaterial | undefined)?.uniforms;
    if (uniforms) {
      uniforms.topColor.value.set(theme.skyTop);
      uniforms.midColor.value.set(theme.skyMid);
      uniforms.horizonColor.value.set(theme.skyHorizon);
      uniforms.uGradeTop.value.set(theme.skyGrade.top);
      uniforms.uGradeHorizon.value.set(theme.skyGrade.horizon);
      uniforms.uGradeAmount.value = theme.skyGrade.amount;
      uniforms.uSkyYaw.value = skyYawOf(theme);
      this.applySkyImage();
    }
    if (this.model) this.applyModel(this.model, true);
  }

  /** 设定地形种子。换种子 = 换一座岛：丢弃旧布局整体重排（地址不再复用）。 */
  setSeed(seed: number): void {
    if (seed === this.seed) return;
    const first = this.seed === null;
    this.seed = seed;
    this.layout = null;
    if (this.model) this.applyModel(this.model, false);
    if (!first) this.resetView();
  }

  /** reuse=false：丢弃上一布局做全量重排（分页到齐后的圈层修正）。 */
  applyModel(model: CityModel, reuse = true): void {
    this.model = model;
    if (this.seed === null) return;
    if (this.parts) {
      this.scene.remove(this.parts.group, this.parts.water);
      this.parts.dispose();
      this.parts = null;
    }
    const layout = layoutCity(model, reuse ? this.layout : null, this.seed);
    this.layout = layout;
    this.parts = new CityParts(model, layout);
    if (this.assets) this.parts.applyAssets(this.assets);
    // 生态带植被异步到达：只在 parts 仍是这一份时替换（换种子/换主题会重建 parts）。
    const parts = this.parts;
    void loadBiomeFlora(layout.biome).then((flora) => { if (this.parts === parts && !this.disposed) parts.applyFlora(flora); });
    this.scene.add(this.parts.group, this.parts.water);

    this.cityCenter = { x: (layout.urbanBounds.left + layout.urbanBounds.right) / 2, z: (layout.urbanBounds.north + layout.urbanBounds.south) / 2 };
    this.aurora?.dispose();
    this.aurora = new CityAurora(this.cityCenter, Math.max(120, layout.boundsRadius) * 0.6);
    this.scene.add(this.aurora.group);
    this.ambient?.dispose();
    this.ambient = new CityAmbient(this.cityCenter, Math.max(120, layout.boundsRadius) * 0.6, layout.terrain.height, layout.river);
    this.scene.add(this.ambient.group);
    if (!this.fillLight) {
      this.fillLight = new THREE.DirectionalLight("#cfe8ef", 0.35);
      this.backLight = new THREE.DirectionalLight("#ffffff", 0.15);
      this.scene.add(this.fillLight, this.backLight);
    }
    const bounds = Math.max(100, Math.hypot(layout.urbanBounds.right - layout.urbanBounds.left, layout.urbanBounds.south - layout.urbanBounds.north) / 2 + 35);
    this.boundsRadius = bounds;
    this.controls.maxDistance = bounds * 4.5;
    this.scene.fog = new THREE.Fog(new THREE.Color(activeTheme().fog), bounds * 2.1, bounds * 7.5);
    const shadowBox = bounds * 0.85 + 24;
    const shadowCamera = this.sun.shadow.camera as THREE.OrthographicCamera;
    this.placeSun();
    shadowCamera.far = this.sunDistance() + shadowBox * 2;
    shadowCamera.left = -shadowBox;
    shadowCamera.right = shadowBox;
    shadowCamera.top = shadowBox;
    shadowCamera.bottom = -shadowBox;
    shadowCamera.updateProjectionMatrix();

    if (this.attracted) {
      // 首个模型：入场镜头（远处高处 → 默认视角）。
      const home = this.homeView();
      this.flyTo(home, { ...this.cityCenter, y: 6 }, 900);
    }
    this.parts.setLabelsVisible(true);
    this.parts.setQualityLevel(this.quality);
    if (this.cursorMs !== null) this.parts.applyCursor(this.cursorMs, false);
  }

  private sunDistance(): number {
    return Math.max(900, this.boundsRadius * 2.2);
  }

  /** 按主题的方位/高度角放太阳。曾放在城市中心正上方约 bounds 高、水平只偏 139 处——
   *  高度角约 79°，影子只有楼高的五分之一、全藏在楼底下，看起来像「没有太阳」。 */
  private placeSun(): void {
    const theme = activeTheme();
    const azimuth = THREE.MathUtils.degToRad(theme.sunAzimuthDeg);
    const elevation = THREE.MathUtils.degToRad(theme.sunElevationDeg);
    const distance = this.sunDistance();
    this.sun.position.set(
      this.cityCenter.x + Math.cos(azimuth) * Math.cos(elevation) * distance,
      Math.sin(elevation) * distance,
      this.cityCenter.z + Math.sin(azimuth) * Math.cos(elevation) * distance,
    );
    this.sun.target.position.set(this.cityCenter.x, 0, this.cityCenter.z);
    this.sun.target.updateMatrixWorld();
  }

  private homeView(): { x: number; y: number; z: number } {
    const bounds = Math.max(120, this.boundsRadius);
    const fit = 1.2 * Math.max(1, 1 / this.camera.aspect);
    return { x: this.cityCenter.x + bounds * 0.86 * fit, y: bounds * 1.05 * fit, z: this.cityCenter.z + bounds * 1.16 * fit };
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
    this.flyTo(home, { ...this.cityCenter, y: 6 }, 900);
    this.options.onSelect?.(null);
    this.parts?.setSelected(null);
  }

  focusBuilding(id: string): boolean {
    if (!this.parts) return false;
    const anchor = this.parts.anchorFor(id);
    if (!anchor) return false;
    this.attracted = false;
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
    this.attracted = false;
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
    // 阴影盒覆盖约 1200 单位：1024 时一个阴影像素 ≈ 1.2 单位，楼宽 6–10 的影子糊成一团。
    const size = level >= 2 ? 4096 : 2048;
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

  /** 地块预算之外、被聚合为背景楼群的会话数（HUD 如实展示）。 */
  get overflowCount(): number {
    return (this.layout?.massing ?? []).reduce((sum, block) => sum + block.count, 0);
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
  private applySkyImage(): void {
    const uniforms = (this.skyDome?.material as THREE.ShaderMaterial | undefined)?.uniforms;
    if (!uniforms || !this.assets) return;
    uniforms.uSky.value = activeTheme().skyImage === "dusk" ? this.assets.sky.dusk : this.assets.sky.day;
    uniforms.uHasSky.value = 1;
  }

  private buildSkyDome(): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(6_000, 24, 14);
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(activeTheme().skyTop) },
        midColor: { value: new THREE.Color(activeTheme().skyMid) },
        horizonColor: { value: new THREE.Color(activeTheme().skyHorizon) },
        // 全景天空图（HDR 转出）；uHasSky=0 时退回上面的三色渐变。
        uSky: { value: null as THREE.Texture | null },
        uHasSky: { value: 0 },
        uGradeTop: { value: new THREE.Color(activeTheme().skyGrade.top) },
        uGradeHorizon: { value: new THREE.Color(activeTheme().skyGrade.horizon) },
        uGradeAmount: { value: activeTheme().skyGrade.amount },
        uSkyYaw: { value: skyYawOf(activeTheme()) },
        // 昼夜：渐变分支的程序星点强度；HDR 全景分支的夜间压暗（1=白天原样）。
        uStars: { value: 0 },
        uSkyDim: { value: 1 },
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
        uniform vec3 midColor;
        uniform vec3 horizonColor;
        uniform sampler2D uSky;
        uniform float uHasSky;
        uniform vec3 uGradeTop;
        uniform vec3 uGradeHorizon;
        uniform float uGradeAmount;
        uniform float uSkyYaw;
        uniform float uStars;
        uniform float uSkyDim;
        varying vec3 vDirection;
        void main() {
          vec3 dir = normalize(vDirection);
          float height = clamp(dir.y, 0.0, 1.0);
          // 地平线 → 中段 → 天顶：日落主题靠中段的粉色撑出渐变带。
          vec3 color = mix(horizonColor, midColor, smoothstep(0.0, 0.28, height));
          color = mix(color, topColor, smoothstep(0.22, 0.85, height));
          // 程序星点：方向量化到球面网格，每格 hash 决定有无星；只在上半天空。
          if (uStars > 0.01) {
            vec3 cell = floor(dir * 190.0);
            float h = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
            float star = step(0.9965, h) * smoothstep(0.22, 0.65, dir.y);
            color += vec3(0.92, 0.95, 1.0) * star * uStars * (0.55 + 0.45 * h);
          }
          if (uHasSky > 0.5) {
            // 等距柱状投影采样；地平线以下复用地平线那一行（下半球在水面以下，从不直接可见）。
            vec2 uv = vec2(atan(dir.z, dir.x) / 6.2831853 + 0.5 + uSkyYaw, asin(clamp(dir.y, 0.002, 1.0)) / 3.1415927 + 0.5);
            vec3 photo = texture2D(uSky, uv).rgb * uSkyDim;
            // 调色：按高度在两个色调之间做 overlay 式乘染（保留云的明暗，只换色相）。
            vec3 tint = mix(uGradeHorizon, uGradeTop, smoothstep(0.0, 0.6, height));
            vec3 graded = photo * tint * 1.55;
            color = mix(photo, graded, uGradeAmount);
          }
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
    this.renderFrame();
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

  /** 开拍：镜头接管相机与时间游标；用户点/拖画布即中止。 */
  startCinematic(): CinematicPlan | null {
    if (!this.layout || !this.model || !this.parts) return null;
    const plan = planCinematic(this.layout, this.model, this.parts.anchors());
    this.tween = null;
    this.playing = false;
    this.attracted = false;
    this.controls.autoRotate = false;
    this.controls.enabled = false;
    this.cinematic = { plan, startedAt: this.elapsed, savedFov: this.camera.fov, look: null, lastSeconds: 0 };
    this.camera.fov = 38; // 略长焦：压缩纵深，更像航拍镜头
    this.camera.updateProjectionMatrix();
    this.parts.setLabelsVisible(false);
    this.parts.setScaffoldVisible(false);
    this.parts.applyCursor(plan.cursor(0), false);
    this.noteActivity();
    return plan;
  }

  stopCinematic(): void {
    const state = this.cinematic;
    if (!state) return;
    this.cinematic = null;
    this.controls.enabled = true;
    this.camera.fov = state.savedFov;
    this.parts?.setScaffoldVisible(true);
    this.camera.updateProjectionMatrix();
    this.cursorMs = null;
    this.parts?.applyCursor(this.model?.windowEndMs ?? Date.now(), true);
    this.options.onTimeCursor?.(this.model?.windowEndMs ?? Date.now(), true);
    this.options.onCinematic?.(0, state.plan, true);
  }

  get isCinematic(): boolean {
    return this.cinematic !== null;
  }

  private updateCinematic(): boolean {
    const state = this.cinematic;
    if (!state) return false;
    const seconds = this.elapsed - state.startedAt;
    const clamped = Math.min(seconds, state.plan.durationSec);
    // 分页数据到达会重建 parts，标签/脚手架被重置为可见：航拍期间每帧压住。
    this.parts?.setLabelsVisible(false);
    this.parts?.setScaffoldVisible(false);
    const position = state.plan.position(clamped);
    // 相机贴地保护在航拍里同样生效：路径插值偶尔会擦过山脊。
    if (this.layout) position.y = Math.max(position.y, Math.max(0, this.layout.terrain.height(position.x, position.z)) + 6);
    this.camera.position.copy(position);
    // 注视点做临界阻尼跟随：关键帧之间注视点切换会让镜头急甩，阻尼把甩头摊到 ~0.8s。
    const desired = state.plan.target(clamped);
    const frameDt = Math.max(0, seconds - state.lastSeconds);
    state.lastSeconds = seconds;
    if (!state.look) state.look = desired.clone();
    else state.look.lerp(desired, 1 - Math.exp(-frameDt / 0.35));
    this.controls.target.copy(state.look);
    this.camera.lookAt(state.look);
    const cursor = state.plan.cursor(clamped);
    this.parts?.applyCursor(cursor, false);
    this.options.onTimeCursor?.(cursor, false);
    this.options.onCinematic?.(seconds, state.plan, false);
    this.lastActivityAt = performance.now();
    // 片尾停在全景上 4 秒再交还控制权。
    if (seconds > state.plan.durationSec + 4) this.stopCinematic();
    return true;
  }

  /** 昼夜循环：live 跟随真实本地时间，回放跟随时间轴游标的小时——
   *  拖动时间轴可以看到城市从白天进入黄昏与夜晚（亮窗/星空/水色变化）。 */
  private updateDaylight(): void {
    const now = this.cursorMs !== null ? new Date(this.cursorMs) : new Date();
    const hour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    // 插值随秒连续；仅在跨过 0.02h（~72s）时重写 uniform，避免无谓上传。
    if (Math.abs(hour - this.lastSkyHour) < 0.02) return;
    this.lastSkyHour = hour;
    const sky = skyStateAt(hour);
    this.applySky(sky);
  }

  private applySky(sky: CitySkyPreset): void {
    const domeMaterial = this.skyDome?.material as THREE.ShaderMaterial | undefined;
    if (!domeMaterial) return;
    const skyUniforms = domeMaterial.uniforms;
    (skyUniforms.topColor.value as THREE.Color).set(sky.top);
    (skyUniforms.midColor.value as THREE.Color).set(sky.middle);
    (skyUniforms.horizonColor.value as THREE.Color).set(sky.horizon);
    skyUniforms.uStars.value = sky.stars;
    skyUniforms.uSkyDim.value = 0.22 + 0.78 * Math.min(1, sky.sunIntensity / 1.2);
    (this.scene.background as THREE.Color).set(sky.fog);
    const fog = this.scene.fog;
    if (fog && fog instanceof THREE.Fog) {
      fog.color.set(sky.fog);
      const bounds = Math.max(120, this.boundsRadius);
      fog.near = bounds * sky.fogNearFactor;
      fog.far = bounds * sky.fogFarFactor;
    }
    this.hemisphere.color.set(sky.hemiSky);
    this.hemisphere.groundColor.set(sky.hemiGround);
    this.hemisphere.intensity = sky.hemiIntensity;
    this.sun.color.set(sky.sunColor);
    this.sun.intensity = sky.sunIntensity;
    if (this.fillLight && this.backLight) {
      this.fillLight.color.set(sky.fillColor);
      this.fillLight.intensity = sky.fillIntensity;
      this.backLight.color.set(sky.backColor);
      this.backLight.intensity = sky.backIntensity;
    }
    // 太阳绕城心的方位/高度角：白天高、黄昏低、夜晚是月光方向。
    const radius = 320;
    this.sun.position.set(
      this.cityCenter.x + Math.cos(sky.sunAzimuth) * Math.cos(sky.sunElevation) * radius,
      Math.sin(sky.sunElevation) * radius,
      this.cityCenter.z + Math.sin(sky.sunAzimuth) * Math.cos(sky.sunElevation) * radius,
    );
    if (this.parts) {
      const water = this.parts.waterColors;
      if (water) {
        water.uShallow.value.set(sky.waterShallow);
        water.uDeep.value.set(sky.waterDeep);
        water.uSky.value.set(sky.fog);
      }
      const clouds = this.parts.cloudMaterial;
      if (clouds) clouds.opacity = sky.cloudOpacity;
      this.aurora?.setNight(sky.stars);
      this.ambient?.setNight(sky.stars);
      // 夜晚城市亮窗：立面自发光抬升（保留 theme 基线的下限）。
      this.parts.setNightGlow(sky.selfLit);
      this.parts.applySelfLit(this.themeSelfLit);
    }
  }

  private updateScene(dt: number): void {
    this.updateDaylight();
    this.aurora?.update(dt);
    this.ambient?.update(dt, this.elapsed);
    if (this.updateCinematic()) {
      this.parts?.update(dt, this.elapsed);
      return;
    }
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
    // 相机不得沉到地形/水面以下：低机位会让近裁剪面切出一条平直的陆地边。
    if (this.layout) {
      const floor = Math.max(0, this.layout.terrain.height(this.camera.position.x, this.camera.position.z)) + 3;
      if (this.camera.position.y < floor) this.camera.position.y = floor;
    }
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
    this.composer?.dispose();
    this.composer = null;
    this.mirror?.dispose();
    this.mirror = null;
    this.controls.dispose();
    this.aurora?.dispose();
    this.aurora = null;
    this.ambient?.dispose();
    this.ambient = null;
    this.disposablesSky.forEach((disposable) => disposable.dispose());
    this.renderer.dispose();
  }
}
