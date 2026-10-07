/**
 * 城市部件：把 CityModel + CityLayout 变成 Three.js 场景（全部 InstancedMesh）。
 *
 * 一次模型刷新 = 一次 buffer 重建（毫秒级）；每帧只做增量：
 *  · 施工动画：只有显示进度在变的楼才重写矩阵（脏集驱动）。
 *  · 生命感：车 / 船 / 云 / 吊车 / 信标脉冲，均为常数成本的小矩阵更新。
 *  · 水面：自写轻量 shader（解析法线 + 菲涅尔 + 伪高光），不做反射/折射。
 */

import * as THREE from "three";
import { builtFractionAt, hashSeed, type CityBuilding, type CityModel } from "../cityModel";
import { promenadeSegments, validRuns } from "./citySeaside";
import { HOTEL_CROWN_MAX_FINS, hotelCrownPlan, type CrownPiece } from "./cityHotelCrown";
import { roadsideSignPlan, rooftopSignPlan, type RooftopSignPlan } from "./citySkylineProps";
import { buildVillaComplex } from "./cityLandmarkVilla";
import type { CityLayout, DistrictLayout, Parcel, Vec2 } from "./cityLayout";
import { activeTheme, skyYawOf } from "./cityTheme";
import type { CityAssets } from "./cityAssets";
import type { LoadedFlora } from "./cityFlora";
import { decorKindForName } from "./cityDecor";
import { makeDecoFacadeTexture, makeFacadeTexture, makeLabelSprite, paletteFor } from "./cityTextures";
import type { TerrainField } from "./cityLayout";
import { createRenderCanvas } from "./renderCanvas";
import { SegmentIndex, polygonDistance } from "./cityPlan";
import { buildAirport, planAirport, roadSamples } from "./cityAirport";
import { LANDMARK_BUILDERS } from "./models/registry";
import type { LandmarkHost } from "./models/landmarkContext";
import { buildGardens, buildCivics, buildFlags, buildPublicSites, updateCivics, writeCivic, type CivicSystemHost } from "./systems/civicSystem";
import { applyDistrictLandmarkGrowth, buildDistrictLandmarks, buildLandmarks, type LandmarkSystemHost } from "./systems/landmarkSystem";
import { LIGHT_BUDGET, activeBoost, lampTier, nightFactor, useOfZone, windowRate } from "./cityLightBudget";
import { roadPaintPlan } from "./cityRoadPaint";
import { buildGroundSpill, buildSeaMountains, buildTerrain, buildWater, type TerrainHost } from "./systems/terrainSystem";
import { applyFlora, buildTrees, type NatureHost } from "./systems/natureSystem";
import { applyCarDensity, buildBoats, buildCars, buildClouds, placeCar, type AmbientHost } from "./systems/ambientSystem";
import { buildInfrastructure, buildDistrictExpressways, buildTrussBridges, type RoadHost } from "./systems/roadSystem";
import { urbanPromenadeSegments, buildPromenade, buildBeachFurniture, buildBeachRibbon, buildMarina, buildLifeguardTowers, type SeasideHost } from "./systems/seasideSystem";

import { BOX, CYLINDER, EXPRESSWAY_DECK_THICKNESS, EXPRESSWAY_DECK_WIDTH, baseSpeedOf, expresswayDeckHeights, mergeGeometries, originOf, samplePolyline, selfLitMaterial } from "./render/shared";
import type { BuildingRuntime, Car, CarPath, NightLights, QualityLevel } from "./render/types";
export type { QualityLevel };
import { FACADE_GRIDS, facadeMaterial, type FacadeUniforms } from "./render/facadeMaterial";

/** Low-poly Art Deco tower silhouette: chamfered corners, podium, and stepped crown. */
function artDecoTowerGeometry(): THREE.BufferGeometry {
  const profiles: Array<[number, number]> = [
    [0, 0.92], [0.08, 1], [0.14, 0.88], [0.82, 0.88],
    [0.9, 0.78], [0.95, 0.68], [1, 0.68],
  ];
  const corners: Array<[number, number]> = [
    [-0.36, -0.5], [0.36, -0.5], [0.5, -0.36], [0.5, 0.36],
    [0.36, 0.5], [-0.36, 0.5], [-0.5, 0.36], [-0.5, -0.36],
  ];
  const positions: number[] = []; const uvs: number[] = []; const indices: number[] = [];
  profiles.forEach(([y, scale], ring) => corners.forEach(([x, z], corner) => {
    positions.push(x * scale, y, z * scale);
    uvs.push(corner / corners.length, y);
    if (ring > 0) {
      const previous = (ring - 1) * corners.length + corner;
      const next = (ring - 1) * corners.length + (corner + 1) % corners.length;
      const current = ring * corners.length + corner;
      const currentNext = ring * corners.length + (corner + 1) % corners.length;
      indices.push(previous, current, currentNext, previous, currentNext, next);
    }
  }));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
/** 静态城（只依赖 seed 的部分：地形/基建/高架/公共设施/地标/远山/树/水面/
 *  车/船/云/花园）。模块级缓存——数据刷新重建时整段复用，重建成本只剩建筑层；
 *  只保留最近一个 seed（换岛时旧静态城整体释放）。 */

type StaticCity = {
  seed: number;
  landmarkWindows: CityParts["landmarkWindows"];
  lifeguardGlowMaterial: THREE.MeshBasicMaterial | null;
  layout: CityLayout;
  group: THREE.Group;
  disposables: Array<{ dispose: () => void }>;
  water: THREE.Mesh;
  treeMesh: THREE.InstancedMesh;
  carMesh: THREE.InstancedMesh;
  cars: Array<{ path: CarPath; distance: number; speed: number }>;
  boatMesh: THREE.InstancedMesh;
  boats: Array<{ path: CarPath; distance: number; speed: number; phase: number; wakeTimer: number }>;
  wakeMesh: THREE.InstancedMesh;
  wakes: Array<{ x: number; z: number; birth: number; driftX: number; driftZ: number }>;
  cloudMesh: THREE.InstancedMesh;
  clouds: Array<{ x: number; z: number; y: number; speed: number; scale: number }>;
  /** 缓存命中时新实例上这些字段是空的（它们在静态构建里赋值）：地面素材/水面倒影与夜间开关/摩天轮旋转/夜间灯光都要随缓存带回。 */
  terrainUniforms: Record<string, { value: unknown }> | null;
  /** 旗帜摆动的时间 uniform：材质经缓存共享，uniform 对象也必须随缓存带回。 */
  flagTime: { value: number } | null;
  waterAssetUniforms: Record<string, { value: unknown }> | null;
  landmarkSpinners: Array<{ object: THREE.Object3D; axis: "x" | "y" | "z"; speed: number }>;
  nightLights: NightLights | null;
  context: { bodies: THREE.InstancedMesh; crowns: THREE.InstancedMesh; matrices: Float32Array } | null;
};
let staticCityCache: StaticCity | null = null;

export class CityParts {
  readonly group = new THREE.Group();
  readonly raycastTargets: THREE.Object3D[] = [];
  readonly water: THREE.Mesh;
  private readonly runtimes: BuildingRuntime[] = [];
  private readonly runtimeById = new Map<string, BuildingRuntime>();
  private readonly shaftMeshes: THREE.InstancedMesh[] = [];
  private zoneById: Map<string, string> = new Map();
  private readonly shaftIdByInstance: Array<Map<number, string>> = [];
  private readonly disposables: Array<{ dispose: () => void }> = [];
  private readonly podiumMesh: THREE.InstancedMesh;
  private readonly roofMesh: THREE.InstancedMesh;
  private readonly facadeUniforms: FacadeUniforms[] = [];
  /** 海滨装饰艺术低层楼的附件：圆角转角柱、顶部阶梯女儿墙、底层遮阳棚（每栋 3 个实例）。 */
  private readonly decoTrimMesh: THREE.InstancedMesh;
  /** 屋顶轮廓网格（下标 = runtime.roof；不是这种轮廓的实例缩成 0）。 */
  private readonly roofProfiles: THREE.InstancedMesh[] = [];
  private readonly gardenTreeMesh: THREE.InstancedMesh;
  /** 城市配套（学校/商场/医院）：每个部件记住所属配套与「满高」矩阵参数，按落成进度纵向长出来。 */
  private civicPieces: Array<{ civic: number; mesh: 0 | 1 | 2; index: number; x: number; y: number; z: number; sx: number; sy: number; sz: number; yaw: number; baseY: number }> = [];
  private civicMeshes: THREE.InstancedMesh[] = [];
  private civicProgress: number[] = [];
  private civicTarget: number[] = [];
  private heroParts: { spire: THREE.Mesh; rings: THREE.Mesh[]; beam: THREE.Mesh | null } | null = null;
  private readonly decoCornerMesh: THREE.InstancedMesh;
  private nightLights: NightLights | null = null;
  private terrainUniforms: Record<string, { value: unknown }> | null = null;
  private spillTexture: THREE.Texture | null = null;
  private nightHour = 21;
  private flagTime: { value: number } | null = null;
  private waterAssetUniforms: Record<string, { value: unknown }> | null = null;
  /** 屋顶霓虹描边：比屋顶略大的自发光薄板，露出的一圈即霓虹；仅日落主题。 */
  private readonly neonMesh: THREE.InstancedMesh;
  private readonly scaffoldMesh: THREE.InstancedMesh;
  private readonly antennaMesh: THREE.InstancedMesh;
  private readonly cylinderMesh: THREE.InstancedMesh;
  private readonly beaconMesh: THREE.InstancedMesh;
  private readonly craneMastMesh: THREE.InstancedMesh;
  private readonly craneArmMesh: THREE.InstancedMesh;
  /** 海滨酒店冠（L-1）：鳍片箱心锚定（cityHotelCrown 的 y 语义），冠底霓虹带实例色跨 bloom 阈值。 */
  private readonly crownFinMesh: THREE.InstancedMesh;
  private readonly crownStripMesh: THREE.InstancedMesh;
  /** 屋顶立牌/路边广告牌（L-2）：柱/板哑光件，框/条是实例色霓虹载体；牌位上限 24 屋顶 + 8 路边。 */
  private readonly signPostMesh: THREE.InstancedMesh;
  private readonly signPanelMesh: THREE.InstancedMesh;
  private readonly signFrameMesh: THREE.InstancedMesh;
  private readonly signStripeMesh: THREE.InstancedMesh;
  /** 已编址的牌位总数（屋顶 + 路边）；四批次的 count 按它 ×件数 收口。 */
  private signPostCount = 0;
  private readonly treeMesh: THREE.InstancedMesh;
  /** 生态带植被网格（加载完成后替换程序化树；每个树种一个）。 */
  private floraMeshes: THREE.InstancedMesh[] = [];
  /** 地标里会动的部件：摩天轮转盘、灯塔光束。 */
  private landmarkSpinners: Array<{ object: THREE.Object3D; axis: "x" | "y" | "z"; speed: number }> = [];
  private readonly carMesh: THREE.InstancedMesh;
  private carKeep = 1;
  private readonly boatMesh: THREE.InstancedMesh;
  private readonly wakeMesh: THREE.InstancedMesh;
  private readonly wakes: Array<{ x: number; z: number; birth: number; driftX: number; driftZ: number }>;
  private readonly cloudMesh: THREE.InstancedMesh;
  private readonly anomalyMarkers: Array<{ mesh: THREE.Mesh; ring: THREE.Mesh; baseY: number; phase: number }> = [];
  private readonly labels: THREE.Sprite[] = [];
  private readonly hoverRing: THREE.Mesh;
  private readonly selectRing: THREE.Mesh;
  private readonly cars: Car[];
  private readonly boats: Array<{ path: CarPath; distance: number; speed: number; phase: number; wakeTimer: number }>;
  private readonly clouds: Array<{ x: number; z: number; y: number; speed: number; scale: number }>;
  private readonly waterUniforms: { uTime: { value: number }; uSun: { value: THREE.Vector3 }; uShallow: { value: THREE.Color }; uDeep: { value: THREE.Color }; uSky: { value: THREE.Color } };
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly scaleVector = new THREE.Vector3();
  private readonly positionVector = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private readonly spillWhite = new THREE.Color();
  private readonly hsl = { h: 0, s: 0, l: 0 };
  private cursor = Number.NaN;
  private live = true;
  private labelsVisible = true;
  /** 重建前各楼的显示进度（null = 首个模型，全城直接成像）。 */
  private previousDisplays: Map<string, number> | null = null;
  hoveredId: string | null = null;
  selectedId: string | null = null;

  constructor(private model: CityModel, private layout: CityLayout, previousDisplays: Map<string, number> | null = null) {
    this.previousDisplays = previousDisplays;
    const total = model.buildings.length;

    // ── 静态城（seed 决定）：缓存命中则整段复用，重建只花在建筑层 ──────
    let staticCity = staticCityCache && staticCityCache.seed === layout.seed && staticCityCache.layout.scaleTier === layout.scaleTier
      && staticCityCache.layout.coastalConfigKey === layout.coastalConfigKey
      && staticCityCache.layout.activityKey === layout.activityKey // G1：建成区变化 → 地面与路网重画
      && staticCityCache.layout.highways === layout.highways
      && JSON.stringify([staticCityCache.layout.civics, staticCityCache.layout.gardens, staticCityCache.layout.contextBuildings]) === JSON.stringify([layout.civics, layout.gardens, layout.contextBuildings]) ? staticCityCache : null;
    if (!staticCity) {
      staticCityCache?.disposables.forEach((disposable) => disposable.dispose());
      const staticBucket: Array<{ dispose: () => void }> = [];
      (this.disposables as Array<{ dispose: () => void }>) = staticBucket;
      this.buildTerrain();
      this.buildInfrastructure();
      this.buildDistrictExpressways();
      this.nightLights = this.buildNightLights();
      this.buildPublicSites();
      this.buildMarina();
      {
        // L-4 机场岛 + L-5 堤道：避开港口与海滨景观段。
        const avoid = [...this.layout.publicSites.filter((x) => x.kind === "harbor"), ...(this.layout.landmarks ?? []).filter((x) => x.kind === "sail-opera"), ...(this.layout.seaside && !this.layout.seaside.degraded ? this.layout.seaside.samples.filter((x) => x.valid).map((x) => x.waterline) : [])];
        const core = this.layout.core ?? { x: 0, z: 0 };
        const plan = planAirport(this.layout.coast, core, avoid, roadSamples(this.layout.roadEdges), (x, z) => this.layout.terrain.height(x, z) < -0.6);
        if (plan) this.group.add(buildAirport(plan, this.disposables, this.nightLights?.heads ?? null));
      }
      this.buildCivics();
      this.buildLandmarks();
      this.buildTrussBridges();
      this.buildDistrictLandmarks();
      this.buildUrbanContext();
      this.buildSeaMountains();
      this.buildBeachRibbon();
      const seaside = this.layout.seaside;
      if (seaside && !seaside.degraded) this.buildPromenade(promenadeSegments(seaside));
      this.buildPromenade(this.urbanPromenadeSegments());
      // 装饰酒店排已退役：酒店地块交给会话（cityLayout hotelBlocks），只有落户的会话才成楼。
      this.buildLifeguardTowers();
      this.buildBeachFurniture();
      // 酒店招牌随装饰酒店一起退役（它们挂在不存在的楼面上）。
      this.treeMesh = this.buildTrees();
      const carResult = this.buildCars();
      this.carMesh = carResult.mesh;
      const boatResult = this.buildBoats();
      this.boatMesh = boatResult.mesh;
      this.wakeMesh = boatResult.wakeMesh;
      this.wakes = boatResult.wakes;
      const cloudResult = this.buildClouds();
      this.cloudMesh = cloudResult.mesh;
      this.water = this.buildWater();
      this.buildGardens();
      this.buildFlags();
      staticCity = {
        seed: layout.seed,
        layout,
        group: this.group,
        disposables: staticBucket,
        water: this.water,
        treeMesh: this.treeMesh,
        carMesh: this.carMesh,
        cars: carResult.cars,
        boatMesh: this.boatMesh,
        boats: boatResult.boats,
        wakeMesh: this.wakeMesh,
        wakes: boatResult.wakes,
        cloudMesh: this.cloudMesh,
        clouds: cloudResult.clouds,
        terrainUniforms: this.terrainUniforms,
        flagTime: this.flagTime,
        waterAssetUniforms: this.waterAssetUniforms,
        landmarkSpinners: this.landmarkSpinners,
        nightLights: this.nightLights,
        context: this.context,
        landmarkWindows: this.landmarkWindows,
        lifeguardGlowMaterial: this.lifeguardGlowMaterial,
      };
      staticCityCache = staticCity;
      // this.group 曾是静态组：让位给动态组，静态组挂为其子节点。
      (this.group as THREE.Group) = new THREE.Group();
      (this.disposables as Array<{ dispose: () => void }>) = [];
    }
    this.group.add(staticCity.group);
    this.water = staticCity.water;
    this.treeMesh = staticCity.treeMesh;
    this.carMesh = staticCity.carMesh;
    this.boatMesh = staticCity.boatMesh;
    this.cloudMesh = staticCity.cloudMesh;
    this.cars = staticCity.cars;
    this.boats = staticCity.boats;
    this.clouds = staticCity.clouds;
    this.wakeMesh = staticCity.wakeMesh;
    this.wakes = staticCity.wakes;
    this.terrainUniforms = staticCity.terrainUniforms;
    this.flagTime = staticCity.flagTime;
    this.waterAssetUniforms = staticCity.waterAssetUniforms;
    this.landmarkSpinners = staticCity.landmarkSpinners;
    this.nightLights = staticCity.nightLights;
    this.context = staticCity.context;
    // 夜间材质随静态城一起复用：曾只缓存网格不缓存这两个引用，缓存命中后救生塔灯与地标亮窗夜里不再亮。
    this.landmarkWindows = staticCity.landmarkWindows;
    this.lifeguardGlowMaterial = staticCity.lifeguardGlowMaterial;
    this.captureAnimationOrigin();
    this.waterUniforms = (this.water.material as THREE.ShaderMaterial).uniforms as unknown as {
      uTime: { value: number };
      uSun: { value: THREE.Vector3 };
      uShallow: { value: THREE.Color };
      uDeep: { value: THREE.Color };
      uSky: { value: THREE.Color };
    };

    // ── 建筑：立面（3 变体 × [主体+退台] 两段）──────────────────────────
    const facades = [makeFacadeTexture(0, 11), makeFacadeTexture(1, 37), makeFacadeTexture(2, 71), makeDecoFacadeTexture()];
    facades.forEach((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      this.disposables.push(texture);
    });
    // 立面由地块分区驱动：市中心玻璃幕墙 / 商业横带 / 居住窗洞。
    const zoneById = new Map<string, string>();
    for (const district of this.layout.districts) {
      for (const [id, parcel] of district.slots) zoneById.set(id, parcel.zone);
    }
    this.zoneById = zoneById;
    const facadeCounts = [0, 0, 0, 0];
    for (const building of model.buildings) {
      if (!zoneById.has(building.id)) continue;
      facadeCounts[this.facadeFor(building)] += this.formOf(building) === "tower" || this.formOf(building) === "landmark" ? 2 : 1;
    }
    facades.forEach((texture, variant) => {
      const capacity = facadeCounts[variant] + 8;
      const geometry = BOX.clone();
      geometry.setAttribute("aFloors", new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1));
      geometry.setAttribute("aLight", new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2)); // x = 办公用途(0/1)，y = 活跃会话(0/1)
      // 装饰艺术立面一块平铺画 2 层，其余程序化立面沿用一层一块。
      const uniforms: FacadeUniforms = {
        // 一块纹理覆盖几层楼：程序化立面画的是 4 层（makeFacadeTexture），装饰艺术画 2 层。
        // 曾按「每层一块」铺，每层楼塞进 4 排窗、窗高只有四分之一——窗又扁又小，玻璃反射只落在细缝里。
        uRows: { value: variant === 3 ? 2 : 4 },
        uPhoto: { value: 0 },
        uPhotoTex: { value: null },
        uPhotoRows: { value: 1 },
        uTileWidth: { value: 1 },
        uSelfLit: { value: 0.24 },
        uWindowGlow: { value: 0 },
        uRateRes: { value: 0.4 },
        uRateOff: { value: 0.4 },
        uGrid: { value: new THREE.Vector2(...(FACADE_GRIDS[variant] ?? [4, 4])) },
        uEnv: { value: null },
        uEnvStrength: { value: 0 },
        uGradeTop: { value: new THREE.Color(activeTheme().skyGrade.top) },
        uGradeHorizon: { value: new THREE.Color(activeTheme().skyGrade.horizon) },
        uGradeAmount: { value: activeTheme().skyGrade.amount },
        uSkyYaw: { value: skyYawOf(activeTheme()) },
      };
      this.facadeUniforms.push(uniforms);
      const mesh = new THREE.InstancedMesh(geometry, facadeMaterial(texture, uniforms, String(variant)), capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.name = `city-shafts-${variant}`;
      this.shaftMeshes.push(mesh);
      this.shaftIdByInstance.push(new Map());
      this.group.add(mesh);
      this.raycastTargets.push(mesh);
      this.disposables.push(geometry, mesh.material);
    });

    // 屋顶轮廓：坡顶（三棱柱，屋脊沿 z）、尖顶（四棱锥）、退台冠（小一号的盒子）、屋顶花园（草皮板）。
    const pitched = BOX.clone();
    {
      const position = pitched.getAttribute("position") as THREE.BufferAttribute;
      for (let index = 0; index < position.count; index += 1) if (position.getY(index) > 0.99) position.setX(index, 0);
      pitched.computeVertexNormals();
    }
    const spire = new THREE.ConeGeometry(0.5, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
    const profileGeometries = [pitched, spire, BOX, BOX];
    profileGeometries.forEach((geometry, index) => {
      const mesh = this.makeInstanced(geometry, selfLitMaterial(0.18), total);
      mesh.castShadow = true;
      mesh.name = `city-roof-profile-${index + 1}`;
      this.roofProfiles.push(mesh);
    });
    this.gardenTreeMesh = this.makeInstanced(new THREE.IcosahedronGeometry(1, 0).translate(0, 1, 0), new THREE.MeshLambertMaterial({ color: activeTheme().foliage }), total * 3);
    this.gardenTreeMesh.castShadow = true;
    const decoCount = facadeCounts[3] + 4;
    this.decoTrimMesh = this.makeInstanced(BOX, selfLitMaterial(0.24), decoCount * 2);
    this.decoCornerMesh = this.makeInstanced(CYLINDER, selfLitMaterial(0.24), decoCount);
    this.podiumMesh = this.makeInstanced(BOX, new THREE.MeshLambertMaterial({ color: "#e8e2d5" }), total);
    this.roofMesh = this.makeInstanced(BOX, new THREE.MeshLambertMaterial({ color: "#ffffff" }), total);
    this.neonMesh = this.makeInstanced(BOX, new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }), total);
    this.neonMesh.castShadow = false;
    this.scaffoldMesh = this.makeInstanced(BOX, new THREE.MeshLambertMaterial({ color: "#e0a83f", transparent: true, opacity: 0.24, depthWrite: false }), total);
    this.scaffoldMesh.castShadow = false;
    {
      // L-6 圆筒玻璃塔（backlog）：竖向条纹幕墙，夜里亮窗（landmarkWindows 同一套白天/夜间贴图切换）。
      const day = createRenderCanvas(); day.width = 64; day.height = 32; const dctx = day.getContext("2d");
      if (dctx) { dctx.fillStyle = "#6f9fb4"; dctx.fillRect(0, 0, 64, 32); dctx.fillStyle = "#e8eef2"; for (let x = 0; x < 64; x += 8) dctx.fillRect(x, 0, 1.5, 32); dctx.fillRect(0, 30, 64, 2); }
      const lit = createRenderCanvas(); lit.width = 64; lit.height = 32; const lctx = lit.getContext("2d");
      if (lctx) { lctx.fillStyle = "#000"; lctx.fillRect(0, 0, 64, 32); for (let x = 0; x < 64; x += 8) { const on = hashSeed(`cyl-window:${x}`); if (on < 0.3) continue; lctx.fillStyle = on > 0.8 ? "#bfe9ff" : "#ffd89a"; lctx.fillRect(x + 2, 4, 5, 22); } }
      const dayTex = new THREE.CanvasTexture(day as HTMLCanvasElement); const litTex = new THREE.CanvasTexture(lit as HTMLCanvasElement);
      for (const t of [dayTex, litTex]) { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 10); }
      const glass = new THREE.MeshLambertMaterial({ color: "#ffffff", map: dayTex, emissive: new THREE.Color("#000000"), emissiveMap: dayTex });
      this.landmarkWindows.push({ material: glass, day: dayTex, lit: litTex, dayEmissive: new THREE.Color("#000000") });
      this.disposables.push(dayTex, litTex);
      this.cylinderMesh = this.makeInstanced(new THREE.CylinderGeometry(0.5, 0.5, 1, 20).translate(0, 0.5, 0), glass, 64);
      this.cylinderMesh.name = "city-shafts-cylinder";
    }
    this.antennaMesh = this.makeInstanced(new THREE.CylinderGeometry(0.09, 0.16, 1, 5).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: "#5d6470" }), 96);
    this.beaconMesh = this.makeInstanced(new THREE.SphereGeometry(0.32, 8, 6), new THREE.MeshBasicMaterial({ color: "#ffb02e" }), 96);
    this.craneMastMesh = this.makeInstanced(new THREE.BoxGeometry(0.85, 1, 0.85).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: "#ffb400", emissive: "#6b4300" }), 48);
    this.craneArmMesh = this.makeInstanced(new THREE.BoxGeometry(1, 0.32, 0.32), new THREE.MeshLambertMaterial({ color: "#ffb400", emissive: "#6b4300" }), 48);
    // 海滨酒店冠：容量按「已落户的酒店地块」预留（有会话落户才有楼，没落户的空地块不需要冠）。
    {
      const hotelSlots = new Set<string>();
      for (const district of this.layout.districts) for (const parcel of district.slots.values()) if (parcel.blockId.startsWith("hotel:")) hotelSlots.add(parcel.id);
      this.crownFinMesh = this.makeInstanced(new THREE.BoxGeometry(1, 1, 1), selfLitMaterial(0.18), Math.max(1, hotelSlots.size * HOTEL_CROWN_MAX_FINS));
      this.crownFinMesh.castShadow = true;
      this.crownStripMesh = this.makeInstanced(BOX, new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }), Math.max(1, hotelSlots.size));
      this.crownStripMesh.castShadow = false;
    }
    // 屋顶立牌/路边广告牌：牌位索引统一编址（屋顶 0..23，路边 24..31），四批次按 位×件数 取下标。
    this.signPostMesh = this.makeInstanced(BOX, new THREE.MeshLambertMaterial({ color: "#8a929c" }), 64);
    this.signPanelMesh = this.makeInstanced(BOX, new THREE.MeshLambertMaterial({ color: "#f6f2e8" }), 32);
    this.signFrameMesh = this.makeInstanced(BOX, new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }), 128);
    this.signStripeMesh = this.makeInstanced(BOX, new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }), 96);

    // ── 动态层：溢出楼群 / 信标 / 标签 / 选中环 / 建筑运行时 ────────────
    this.buildMassing();
    this.buildAnomalyMarkers();
    this.hoverRing = this.makeGroundRing("#087f62");
    this.selectRing = this.makeGroundRing("#c96f4a");
    this.buildRuntimes();
    this.buildLabels();
  }

  private makeInstanced(geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(capacity, 1));
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.disposables.push(geometry, material);
    return mesh;
  }

  private makeGroundRing(color: string): THREE.Mesh {
    const geometry = new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    mesh.renderOrder = 3;
    this.group.add(mesh);
    this.disposables.push(geometry, material);
    return mesh;
  }

  private buildTerrain(): void { buildTerrain(this as unknown as TerrainHost); }

  /** 平面镜反射输入：texture=null 关闭（省电档，或相机在水面以下）。 */
  setMirror(texture: THREE.Texture | null, matrix: THREE.Matrix4 | null): void {
    if (!this.waterAssetUniforms) return;
    this.waterAssetUniforms.uMirror.value = texture;
    this.waterAssetUniforms.uHasMirror.value = texture ? 1 : 0;
    if (matrix) (this.waterAssetUniforms.uMirrorMatrix.value as THREE.Matrix4).copy(matrix);
  }

  private buildGroundSpill(): void { buildGroundSpill(this as unknown as TerrainHost); }

  /** 本地小时 → 住宅/办公亮灯率（cityLightBudget.windowRate），驱动立面窗光与地面/水面光斑的强度。 */
  setNightHour(hour: number): void {
    this.nightHour = hour;
    const res = windowRate(hour, "residential"); const off = windowRate(hour, "office");
    for (const uniforms of this.facadeUniforms) { uniforms.uRateRes.value = res; uniforms.uRateOff.value = off; }
    this.applyNightOverlay();
  }

  private applyNightOverlay(): void {
    const night = nightFactor(this.nightGlow);
    const t = this.terrainUniforms;
    if (t) {
      t.uNightDim.value = night;
      t.uSpillGain.value = night * LIGHT_BUDGET.overlay.gain * (0.4 + 0.6 * Math.max(windowRate(this.nightHour, "residential"), windowRate(this.nightHour, "office")));
    }
    const w = this.waterAssetUniforms as unknown as Record<string, { value: unknown }> | null;
    if (w?.uSpillGain && t) w.uSpillGain.value = t.uSpillGain.value;
  }

  setNightWater(night: number): void {
    if (this.waterAssetUniforms) this.waterAssetUniforms.uNight.value = night;
  }

  /** 昼夜天空混合量（0 = 黄昏/夜，1 = 白天）：水面与玻璃反射的粉紫调色量随白天程度衰减。 */
  setSkyMix(dayMix: number): void {
    const amount = activeTheme().skyGrade.amount * (1 - dayMix);
    if (this.waterAssetUniforms) this.waterAssetUniforms.uGradeAmount.value = amount;
    for (const uniforms of this.facadeUniforms) uniforms.uGradeAmount.value = amount;
  }

  /** 素材到齐后原地换上：地面细节、照片立面、灰泥法线、水面法线与天空反射。 */
  applyAssets(assets: CityAssets): void {
    const theme = activeTheme();
    const mean = (texture: THREE.Texture): THREE.Vector3 => {
      const image = texture.image as CanvasImageSource & { width: number; height: number };
      const canvas = createRenderCanvas();
      canvas.width = canvas.height = 8;
      const ctx = canvas.getContext("2d");
      if (!ctx) return new THREE.Vector3(0.5, 0.5, 0.5);
      ctx.drawImage(image, 0, 0, 8, 8);
      const data = ctx.getImageData(0, 0, 8, 8).data;
      const sum = [0, 0, 0];
      for (let index = 0; index < data.length; index += 4) for (let c = 0; c < 3; c += 1) sum[c] += data[index + c];
      // 着色器里采样得到的是线性值（sRGB 纹理自动解码），均值也换算成线性。
      const toLinear = (v: number) => Math.pow(v / 255 / 64, 2.2);
      return new THREE.Vector3(toLinear(sum[0]), toLinear(sum[1]), toLinear(sum[2]));
    };
    if (this.terrainUniforms) {
      const ground = assets.ground;
      const pairs: Array<[string, { color: THREE.Texture; normal: THREE.Texture }]> = [["Asphalt", ground.asphalt], ["Concrete", ground.concrete], ["Sand", ground.sand], ["Mud", ground.mud], ["Grass", ground.grass]];
      for (const [name, layer] of pairs) {
        this.terrainUniforms[`u${name}C`].value = layer.color;
        this.terrainUniforms[`u${name}N`].value = layer.normal;
        this.terrainUniforms[`u${name}Mean`].value = mean(layer.color);
      }
      this.terrainUniforms.uDetail.value = 1;
    }
    // 照片立面：每张图的「每块平铺对应多少层」不同（窗格行数），uRows 让一层楼≈一行窗。
    // 一块平铺覆盖的楼层数与宽度（世界单位，窗宽≈2.4）：让窗格大小在三种立面间一致。
    const rows = [8, 10, 10];
    const tileWidths = [30, 32, 32];
    assets.facades.forEach((texture, variant) => {
      const uniforms = this.facadeUniforms[variant];
      if (!uniforms) return;
      uniforms.uPhotoTex.value = texture;
      uniforms.uPhoto.value = 1;
      uniforms.uPhotoRows.value = rows[variant];
      uniforms.uTileWidth.value = tileWidths[variant];
    });
    // 玻璃反射强度按立面：市中心玻璃幕墙最强，商业楼窗户次之，住宅与海滨灰泥楼的窗只带一点。
    const envStrength = [0.3, 0.7, 0.9, 0.3];
    // 反射一律用白天照片：黄昏的粉紫由 uGradeAmount 叠加（见 setSkyMix），白天不染色——和天穹的混合保持一致。
    const sky = assets.sky.day;
    this.facadeUniforms.forEach((uniforms, variant) => {
      uniforms.uEnv.value = sky;
      uniforms.uEnvStrength.value = envStrength[variant] ?? 0;
    });
    const deco = this.shaftMeshes[3]?.material as THREE.MeshLambertMaterial | undefined;
    if (deco) {
      deco.normalMap = assets.stuccoNormal;
      deco.normalScale.set(0.6, 0.6);
      deco.needsUpdate = true;
    }
    if (this.waterAssetUniforms) {
      this.waterAssetUniforms.uNormal.value = assets.waterNormal;
      this.waterAssetUniforms.uSkyTex.value = assets.sky.day;
      this.waterAssetUniforms.uHasAssets.value = 1;
    }
  }

  /** Batched city furniture and waterfront infrastructure, not selectable data. */
  private buildInfrastructure(): void { buildInfrastructure(this as unknown as RoadHost); }

  /** 区界高架：与北环高架同视觉语言（桥面/车道线/护栏/桥墩），
   *  沿规划折线分段铺装 —— harness 城区之间可辨认的硬边界。 */
  private buildDistrictExpressways(): void { buildDistrictExpressways(this as unknown as RoadHost); }

  /** 公共用地的 3D 体量：此前市政广场/车站/体育场/观景塔/港口只有地面纹理里的一块色块
   *  （海岸边那块灰色长方形就是港口）。全部由方块与圆柱拼成，局部坐标按地块 yaw 旋转。 */
  private buildPublicSites(): void { buildPublicSites(this as unknown as CivicSystemHost); }

  /** 小区中心花园：草坪 + 湖（与海面同一套水面材质，能映倒影）+ 湖石驳岸 + 假山叠石 + 亭 + 环湖树。 */
  /** 旗帜（tinyskies FlagSystem 手法）：各区花园一杆 harness 色旗 + 观测塔一面大旗。
   *  布料摆动在顶点着色器里做——摆幅从旗杆（x=0）到自由端渐增，双频叠加更像风。 */
  private buildFlags(): void { buildFlags(this as unknown as CivicSystemHost); }

  private buildGardens(): void { buildGardens(this as unknown as CivicSystemHost); }

  /** 夜间照明（静态，随 seed 缓存）：沿主干道两侧交错的路灯（杆 + 自发光灯头 + 地面光斑）、高架灯带。
   *  曾只有每条主干道路段中点一盏不发光的灯，夜里道路是一片黑——现在街道有"灯线"，这是夜景像城市的关键。 */
  private buildNightLights(): NightLights {
    const heads = new THREE.MeshBasicMaterial({ color: "#ffc773", toneMapped: false });
    // 光斑用径向渐变贴图（中心亮、边缘衰减到 0）：纯色圆片在夜里像一个个米色沙盘圆点，不像灯光。
    const glow = createRenderCanvas();
    glow.width = glow.height = 64;
    const gctx = glow.getContext("2d");
    if (gctx) {
      const gradient = gctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, "rgba(255,255,255,1)");
      gradient.addColorStop(0.35, "rgba(255,255,255,0.45)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      gctx.fillStyle = gradient;
      gctx.fillRect(0, 0, 64, 64);
    }
    const glowTexture = new THREE.CanvasTexture(glow);
    const pools = new THREE.MeshBasicMaterial({ color: "#ff9e4d", map: glowTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.disposables.push(glowTexture);
    pools.visible = false;
    const strips = new THREE.MeshBasicMaterial({ color: "#ffb366", toneMapped: false });
    const neon = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false });
    const poles = this.makeInstanced(new THREE.CylinderGeometry(0.1, 0.14, 1, 5).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: "#59636a" }), 4600);
    const headMesh = this.makeInstanced(new THREE.BoxGeometry(0.5, 0.22, 0.9), heads, 4600);
    const poolMesh = this.makeInstanced(new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2), pools, 4600);
    poolMesh.renderOrder = 2;
    const stripMesh = this.makeInstanced(BOX, strips, 2200);
    const spacing = 30;
    let lamps = 0;
    const lamp = (x: number, z: number, nx: number, nz: number, base: number, yaw: number, poolReach = 3.2, poolRadius = 9.5, tier = 1) => {
      if (lamps >= 4600) return;
      poolRadius *= 0.6 + 0.4 * tier; // N3：路灯按道路等级分档——主干最亮最大，支路/步道小而暗
      headMesh.setColorAt(lamps, this.color.setScalar(0.5 + 0.5 * tier));
      poolMesh.setColorAt(lamps, this.color.setScalar(0.4 + 0.6 * tier));
      this.compose(x, base, z, 0, 1, 4.6, 1);
      poles.setMatrixAt(lamps, this.matrix);
      // 灯头悬在路中心一侧（臂长 0.7），朝路面。
      this.compose(x - nx * 0.45, base + 4.55, z - nz * 0.45, yaw, 1, 1, 1); // 灯头长 0.9：一端贴住灯杆，不再悬空
      headMesh.setMatrixAt(lamps, this.matrix);
      this.compose(x - nx * poolReach, base + 0.12, z - nz * poolReach, 0, poolRadius, 1, poolRadius);
      poolMesh.setMatrixAt(lamps, this.matrix);
      lamps += 1;
    };
    // 沿合并后的整条路（roadPaintPlan 的 run）按弧长每 30 放一盏，间距跨路段累计。曾逐条路段放、
    // 且跳过 <18 的段：滨海大道细分成 ~15 的短段，整条一盏灯都没有（真机夜景：海滨道路漆黑）。
    for (const run of roadPaintPlan(this.layout.roadEdges).runs) {
      if (run.kind !== "arterial") continue;
      const tier = lampTier(run.width);
      let walked = 0; let next = spacing / 2; let index = 0;
      for (let i = 1; i < run.points.length; i += 1) {
        const a = run.points[i - 1]; const b = run.points[i];
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        if (length < 1e-3) continue;
        const dx = (b.x - a.x) / length; const dz = (b.z - a.z) / length;
        const nx = -dz; const nz = dx;
        const yaw = -Math.atan2(dz, dx);
        while (next <= walked + length) {
          const t = next - walked;
          const side = index % 2 === 0 ? 1 : -1; // 两侧交错
          const x = a.x + dx * t + nx * side * (run.width / 2 + 0.9);
          const z = a.z + dz * t + nz * side * (run.width / 2 + 0.9);
          lamp(x, z, nx * side, nz * side, Math.max(0, this.layout.terrain.height(x, z)), yaw, 3.2, 9.5, tier);
          next += spacing * (tier >= 1 ? 1 : tier >= 0.6 ? 1.2 : 1.5); index += 1;
        }
        walked += length;
      }
    }
    // 公园：沿园路一圈路灯（外圈 8 盏），灯头朝内。
    for (const site of this.layout.publicSites) {
      if (site.kind !== "park") continue;
      const ring = Math.max(10, site.radius * 0.7);
      for (let i = 0; i < 8; i += 1) {
        const t = (i / 8) * Math.PI * 2;
        const ox = Math.cos(t); const oz = Math.sin(t);
        const x = site.x + ox * ring; const z = site.z + oz * ring;
        lamp(x, z, ox, oz, Math.max(0, this.layout.terrain.height(x, z)), -Math.atan2(ox, -oz) + Math.PI / 2);
      }
    }
    // 高架：桥面两侧交错路灯，灯头朝路中心。立在行车面（板顶）上；光斑圆心落到桥面中线、
    // 半径不超过半幅桥宽——地面路灯的 9.5 光斑在 10.5 宽桥面上大半悬空，看起来是灯光穿透到桥下。
    for (const run of this.layout.highways ?? []) {
      const heights = expresswayDeckHeights(run, (x, z) => this.layout.terrain.height(x, z));
      let carry = 0;
      for (let i = 1; i < run.length; i += 1) {
        const a = run[i - 1]; const b = run[i];
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        if (length < 1) continue;
        const dx = (b.x - a.x) / length; const dz = (b.z - a.z) / length;
        const yaw = -Math.atan2(dz, dx);
        for (let t = 14 - carry; t < length; t += 34) {
          const side = Math.floor((t + length * 0.37 + a.x) / 34) % 2 === 0 ? 1 : -1;
          const deckTop = heights[i - 1] + (heights[i] - heights[i - 1]) * (t / length) + EXPRESSWAY_DECK_THICKNESS;
          lamp(a.x + dx * t - dz * side * 5.1, a.z + dz * t + dx * side * 5.1, -dz * side, dx * side, deckTop, yaw, 5.1, EXPRESSWAY_DECK_WIDTH / 2 - 0.3);
        }
        carry = (length - (14 - carry)) % 34;
      }
    }
    poles.count = lamps; headMesh.count = lamps; poolMesh.count = lamps;
    for (const mesh of [poles, headMesh, poolMesh]) { mesh.instanceMatrix.needsUpdate = true; mesh.frustumCulled = false; }
    for (const mesh of [headMesh, poolMesh]) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // 高架灯带：沿环线两侧护栏上沿的发光细条（桥面高 8.2，护栏在 ±5.1）。
    let strip = 0;
    for (const run of this.layout.highways ?? []) {
      const heights = expresswayDeckHeights(run, (x, z) => this.layout.terrain.height(x, z));
      for (let i = 1; i < run.length && strip < 2190; i += 1) {
        const a = run[i - 1]; const b = run[i];
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        if (length < 6) continue;
        if (Math.abs(heights[i] - heights[i - 1]) > 0.15) continue; // 匝道坡段不挂水平灯带（会悬空/插进桥面）
        const yaw = -Math.atan2(b.z - a.z, b.x - a.x);
        const sx = Math.sin(yaw); const sz = Math.cos(yaw);
        for (const offset of [-5.1, 5.1]) {
          this.compose((a.x + b.x) / 2 + sx * offset, (heights[i] + heights[i - 1]) / 2 + EXPRESSWAY_DECK_THICKNESS + 0.35, (a.z + b.z) / 2 + sz * offset, yaw, length, 0.14, 0.14);
          stripMesh.setMatrixAt(strip, this.matrix);
          strip += 1;
        }
      }
    }
    stripMesh.count = strip;
    stripMesh.instanceMatrix.needsUpdate = true;
    stripMesh.frustumCulled = false;
    this.disposables.push(heads, pools, strips, neon);
    return { heads, pools, strips, neon };
  }

  /** 致敬型地标（程序化几何，不复刻具体建筑）。城市身份地标有 70 单位最低天际线预算，
   *  不随会话数缩小；会话楼仍保留真实 token 高度，数据建筑与装饰地标语义分离。 */
  private buildLandmarks(): void { buildLandmarks(this as unknown as LandmarkSystemHost); }

  /** 学校 / 商场 / 医院：由方块与圆柱拼成，局部坐标按街区朝向旋转。纯装饰，不进拾取。 */
  private buildCivics(): void { buildCivics(this as unknown as CivicSystemHost); }

  /** 按进度写一座配套的部件矩阵：从地面纵向长出来（y 方向缩放），进度 0 时整座藏起。 */
  private writeCivic(civicIndex: number): void { writeCivic(this as unknown as CivicSystemHost, civicIndex); }

  private updateCivics(dt: number): void { updateCivics(this as unknown as CivicSystemHost, dt); }

  /** 屋顶轮廓选择：只依赖 (分区, 楼型, 立面, seed)，同一份数据永远同一种屋顶。 */
  private roofKindFor(building: CityBuilding, facade: number): number {
    if (facade === 3) return 0; // 装饰艺术楼有自己的阶梯冠
    const zone = this.zoneById.get(building.id);
    const r = building.seed;
    if (this.formOf(building) === "landmark" || this.formOf(building) === "tower") return r > 0.66 ? 2 : r > 0.3 ? 3 : 0;
    if ((zone === "residential" || zone === "waterfront") && building.height < 30) return r < 0.55 ? 1 : 0;
    if (zone === "commercial") return r < 0.4 ? 4 : r < 0.6 ? 3 : 0;
    if (zone === "downtown") return r < 0.35 ? 3 : 0;
    return 0;
  }

  /** 地标塔冠顶：金属尖顶 + 三道自发光灯环；日落霓虹主题再加一道向上的光束（进 bloom）。 */
  private buildHeroCrown(hero: BuildingRuntime): void {
    const palette = paletteFor(hero.building.districtId);
    const spireMaterial = new THREE.MeshLambertMaterial({ color: "#dfe6ea", emissive: new THREE.Color(palette.accent).multiplyScalar(0.12) });
    const spire = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 8, 1).translate(0, 0.5, 0), spireMaterial);
    spire.castShadow = true;
    const ringMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.accent).multiplyScalar(activeTheme().neon ? 3 : 1.4), toneMapped: false });
    const rings = [0, 1, 2].map(() => new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 40).rotateX(Math.PI / 2), ringMaterial));
    let beam: THREE.Mesh | null = null;
    const disposables: Array<{ dispose(): void }> = [spire.geometry, spireMaterial, ringMaterial, ...rings.map((ring) => ring.geometry)];
    if (activeTheme().neon) {
      const beamMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.accent).lerp(new THREE.Color("#ffffff"), 0.4).multiplyScalar(2.2), transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      // 光柱自下而上淡出（加色混合下顶点色 → 黑 = 透明）：曾是等亮度的 900 高圆柱，近看顶端是一截平切的白块。
      const beamGeometry = new THREE.CylinderGeometry(0.6, 1.6, 1, 16, 6, true).translate(0, 0.5, 0);
      const fade = new Float32Array(beamGeometry.attributes.position.count * 3);
      for (let i = 0; i < beamGeometry.attributes.position.count; i += 1) {
        const y = beamGeometry.attributes.position.getY(i);
        const k = Math.min(1, y / 0.03) * Math.pow(1 - y, 1.6); // 底部 ~12 单位淡入：近看不再是一截硬边白块
        fade[i * 3] = fade[i * 3 + 1] = fade[i * 3 + 2] = k;
      }
      beamGeometry.setAttribute("color", new THREE.BufferAttribute(fade, 3));
      beamMaterial.vertexColors = true;
      beamMaterial.visible = false; // 只在夜里亮（setNightGlow），白天天上不再挂一根白线
      beam = new THREE.Mesh(beamGeometry, beamMaterial);
      beam.renderOrder = 5;
      disposables.push(beam.geometry, beamMaterial);
      this.group.add(beam);
    }
    this.group.add(spire, ...rings);
    this.disposables.push(...disposables);
    this.heroParts = { spire, rings, beam };
  }

  private placeHeroCrown(x: number, top: number, z: number, width: number, depth: number, h: number, capped: boolean): void {
    const parts = this.heroParts;
    if (!parts) return;
    const visible = capped;
    const radius = Math.min(width, depth) * 0.42;
    const spireHeight = Math.max(14, h * 0.4);
    parts.spire.visible = visible;
    parts.spire.position.set(x, top, z);
    parts.spire.scale.set(radius, spireHeight, radius);
    parts.rings.forEach((ring, index) => {
      ring.visible = visible;
      const t = 0.12 + index * 0.2;
      ring.position.set(x, top + spireHeight * t, z);
      const r = radius * (1 - t) + 0.6;
      ring.scale.set(r, 1, r);
    });
    if (parts.beam) {
      parts.beam.visible = visible;
      parts.beam.position.set(x, top + spireHeight, z);
      parts.beam.scale.set(1, 420, 1);
    }
  }

  /** 分区驱动立面：downtown 玻璃 / commercial 横带 / residential 窗洞 /
   *  waterfront 混合。无地块信息的楼（不应出现）退回模型层的 hash 立面。 */
  /** 城区地标（S5「每个区也需要有自己的地标建筑物」）：离城区中心最近的空地块上一座三级收分的装饰艺术塔，
   *  墙身取区色粉彩、玻璃带窗、霓虹勾边与塔尖，夜里亮窗（与双子塔同一套 landmarkWindows）。
   *  高度取本区最高会话楼 × 1.15（58–110）——城区天际线的峰值；装饰，不代表会话。 */
  /** 城区地标高度（绝对口径，用户确认）：下限 = 全城最高会话楼 × 1.1（≈40，不低于会话楼），每个会话 +0.37，上限 160。
   *  只随本区会话数增长，别的城区增长不会把它压矮；回放中按「截至游标已开始的会话数」逐层加盖（applyCursor）。
   *  实测（700 模拟会话）：DeepSeek 43 → 56，ZCode 82 → 70，Claude Code 120 → 84，Codex 135 → 90。
   *  曾按「最少 → 最多城区」相对插值：最大城区恒为 90、最小恒为 40，全体同比增长时高度不变，别区增长还会变矮。 */
  districtLandmarkHeight(districtId: string, sessions?: number): number {
    const own = sessions ?? this.model.districts.find((d) => d.id === districtId)?.sessionCount ?? 0;
    const floor = Math.max(30, ...this.model.buildings.map((b) => b.height)) * 1.1;
    return Math.min(160, floor + 0.37 * own);
  }

  private districtLandmarkGroups: THREE.Object3D[] | null = null;
  /** 回放：地标按截至游标已开始的会话数缩放到对应高度（live 时为完整高度）。 */
  private applyDistrictLandmarkGrowth(cursor: number, live: boolean): void { applyDistrictLandmarkGrowth(this as unknown as LandmarkSystemHost, cursor, live); }

  private buildDistrictLandmarks(): void { buildDistrictLandmarks(this as unknown as LandmarkSystemHost); }

  private landValueCache: Map<string, number> | null = null;
  /** 地价驱动形态（S5，用户「同区建筑颜色风格一致，但形态随地块价值变化」）：区内地价前 25% 读作
   *  塔楼（细、退台、塔冠），后 30% 读作板楼/街坊楼（宽、浅）；中段保留数据给的原型；数据地标原样。
   *  楼高不动——token 决定大小，地价只决定长成什么样。 */
  formOf(building: CityBuilding): CityBuilding["archetype"] {
    if (building.archetype === "landmark") return "landmark";
    if (!this.landValueCache) {
      this.landValueCache = new Map();
      // 区内相对地价（百分位）：绝对值在各区都偏低（实测最高 0.55），绝对阈值一栋塔都切不出来；
      // 地价本来就是相对的——区内最贵的四分之一盖塔楼，最便宜的三成盖板楼/街坊楼。
      for (const district of this.layout.districts) {
        const ranked = [...(district.landValue ?? [])].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
        ranked.forEach(([id], index) => this.landValueCache!.set(id, ranked.length > 1 ? index / (ranked.length - 1) : 0.5));
      }
    }
    const percentile = this.landValueCache.get(building.id);
    if (percentile === undefined) return building.archetype;
    return percentile >= 0.75 ? "tower" : percentile < 0.3 ? (building.seed < 0.5 ? "slab" : "block") : building.archetype;
  }

  private percentileOf(building: CityBuilding): number | undefined {
    if (!this.landValueCache) this.formOf(building);
    return this.landValueCache?.get(building.id);
  }


  facadeFor(building: CityBuilding): number {
    const zone = this.zoneById.get(building.id);
    if (!zone) return building.facade;
    // 海滨（非地标、楼高 ≤ 36）→ 装饰艺术灰泥立面：粉彩墙、水平饰带、圆角转角。曾限定「低于 22」，
    // 但楼高由 token 决定，真实会话几乎都高于 22，一栋都没命中；迈阿密海滨的装饰艺术酒店本来也有十几层。
    // 楼高仍由 token 决定（数据语义不变），只是低矮的海滨楼换一种建筑语汇。
    if (zone === "waterfront" && building.height <= 36 && this.formOf(building) !== "landmark") return 3;
    // S5：地块只有 ~7 宽，体量差异被地块裁平（截图验收：同区仍千篇一律）。地价改由材质读出来——
    // 区内最贵的四分之一用玻璃幕墙（downtown 立面），最便宜的三成用住宅立面。
    const percentile = this.percentileOf(building);
    if (percentile !== undefined && percentile >= 0.75) return 2;
    if (percentile !== undefined && percentile < 0.3) return 0;
    if (zone === "downtown") return 2;
    if (zone === "commercial") return 1;
    if (zone === "residential") return 0;
    return building.seed > 0.5 ? 1 : 0;
  }

  /** 溢出会话的背景楼群：低细节体量块，可数不可点——数据没被丢，只是不占独立地块。 */
  private buildMassing(): void {
    const blocks = this.layout.massing ?? [];
    if (!blocks.length) return;
    const mesh = this.makeInstanced(BOX, new THREE.MeshLambertMaterial({ color: "#c9c7bd" }), blocks.length);
    blocks.forEach((block, index) => {
      this.compose(block.x, block.y, block.z, hashSeed(`mass:${block.districtId}:${index}`) * 0.6 - 0.3, 16, block.height, 12);
      mesh.setMatrixAt(index, this.matrix);
      mesh.setColorAt(index, this.color.set(index % 2 ? "#c4c2b6" : "#cdcbbf"));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;
    mesh.name = "city-massing";
  }

  /** Deterministic Miami skyline fabric on vacant inner commercial lots.
   *  Decorative only: no session id, label, hit target, growth or HUD count.
   *  Two instanced batches keep the skyline affordable even on low-end GPUs. */
  private buildUrbanContext(): void {
    const buildings = this.layout.contextBuildings ?? [];
    if (!buildings.length) return;
    const facade = makeDecoFacadeTexture();
    facade.colorSpace = THREE.SRGBColorSpace;
    facade.repeat.set(8, 5.5); // one facade tile per chamfered face; 2-floor tile × 5.5 gives ~11-floor rhythm.
    const bodyGeometry = artDecoTowerGeometry();
    const bodyMaterial = new THREE.MeshLambertMaterial({ map: facade });
    const bodies = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, buildings.length);
    const crownGeometry = BOX.clone();
    const crownMaterial = new THREE.MeshLambertMaterial({ color: "#f4e5d3" });
    const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, buildings.length);
    const colorsByZone: Record<string, string[]> = {
      downtown: ["#91c8cf", "#d89bb6", "#b4a4d5", "#dfc49a"],
      commercial: ["#a8c9bf", "#d9ad9e", "#c5b9a2", "#9dbdcc"],
      waterfront: ["#e6c6a9", "#e5a8ad", "#b1d3cd", "#ead6b9"],
      residential: ["#c8c2a9", "#b5c3b0", "#d5bfa9", "#b8c3c5"],
    };
    for (let index = 0; index < buildings.length; index += 1) {
      const building = buildings[index];
      const colors = colorsByZone[building.zone] ?? colorsByZone.commercial;
      this.compose(building.x, building.y, building.z, building.yaw, building.width, building.height, building.depth);
      bodies.setMatrixAt(index, this.matrix);
      // F3：降饱和、略压明度——远看仍是统一天际线，近看一眼分出「我的楼」（会话楼保持执行环境色相与屋顶霓虹）。
      this.color.set(colors[Math.floor(building.seed * colors.length) % colors.length]);
      this.color.getHSL(this.hsl);
      bodies.setColorAt(index, this.color.setHSL(this.hsl.h, this.hsl.s * 0.45, this.hsl.l * 0.92));
      const roofScale = building.zone === "residential" ? 0.88 : 0.68;
      this.compose(building.x, building.y + building.height, building.z, building.yaw, building.width * roofScale, 1.2 + building.seed * 2.1, building.depth * roofScale);
      crowns.setMatrixAt(index, this.matrix);
      crowns.setColorAt(index, this.color.set(building.zone === "downtown"
        ? colors[(Math.floor(building.seed * colors.length) + 1) % colors.length]
        : colors[Math.floor(building.seed * colors.length) % colors.length]).multiplyScalar(building.zone === "residential" ? 0.9 : 1.05));
    }
    for (const mesh of [bodies, crowns]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
    }
    bodies.name = "city-vice-context-facades";
    crowns.name = "city-vice-context-rooftops";
    // F2：记下每栋的完整矩阵（落成态），回放时按进度在 y 方向缩放写回。
    const matrices = new Float32Array(buildings.length * 32);
    for (let index = 0; index < buildings.length; index += 1) {
      bodies.getMatrixAt(index, this.matrix); this.matrix.toArray(matrices, index * 32);
      crowns.getMatrixAt(index, this.matrix); this.matrix.toArray(matrices, index * 32 + 16);
    }
    this.context = { bodies, crowns, matrices };
    this.group.add(bodies, crowns);
    this.disposables.push(bodyGeometry, bodyMaterial, facade, crownGeometry, crownMaterial);
  }

  private context: { bodies: THREE.InstancedMesh; crowns: THREE.InstancedMesh; matrices: Float32Array } | null = null;
  private contextTarget = new Float32Array(0);
  private contextProgress = new Float32Array(0);
  private readonly contextScratch = new THREE.Matrix4();
  private readonly contextScale = new THREE.Matrix4();

  /** 背景楼进度 → 矩阵：落成态矩阵左乘「以楼底为原点的 y 缩放」（BOX/塔几何都以底面为原点，直接右乘缩放即可）。 */
  private writeContext(): void {
    const context = this.context;
    if (!context) return;
    const count = Math.min(this.contextProgress.length, context.bodies.count);
    for (let index = 0; index < count; index += 1) {
      const t = this.contextProgress[index];
      const ease = t * t * (3 - 2 * t);
      for (const [mesh, offset] of [[context.bodies, 0], [context.crowns, 16]] as const) {
        this.contextScratch.fromArray(context.matrices, index * 32 + offset);
        // 屋顶冠在楼顶：楼还在长时先藏起（就地缩放会悬在半空），封顶后再出现。
        if (ease <= 0.001 || (offset === 16 && ease < 0.999)) this.contextScratch.makeScale(0, 0, 0).setPosition(0, -40, 0);
        else if (ease < 0.999) this.contextScratch.multiply(this.contextScale.makeScale(1, ease, 1));
        mesh.setMatrixAt(index, this.contextScratch);
      }
    }
    context.bodies.instanceMatrix.needsUpdate = true;
    context.crowns.instanceMatrix.needsUpdate = true;
  }

  private updateContext(dt: number): void {
    let dirty = false;
    for (let index = 0; index < this.contextTarget.length; index += 1) {
      const current = this.contextProgress[index];
      const target = this.contextTarget[index];
      if (current === target) continue;
      this.contextProgress[index] = target > current ? Math.min(target, current + dt / 1.2) : Math.max(target, current - dt / 0.6);
      dirty = true;
    }
    if (dirty) this.writeContext();
  }

  private buildSeaMountains(): void { buildSeaMountains(this as unknown as TerrainHost); }

  applyFlora(flora: LoadedFlora): void { applyFlora(this as unknown as NatureHost, flora); }

  /** 滨海步道（VICE B3）：沿 promenade 折线的浅色铺装缎带——人行道语义，不进
   *  roadEdges/carPaths（机动车不会开上步道）。单 BufferGeometry，静态缓存段。 */
  /** S3「滨海景观带随用地走」：环岛滨海路在建成区（会话楼 160 内）旁的岸段，向海一侧 9 处铺同一套步道
   *  （粉色铺装 + 白色矮墙 + 路灯）。曾只有海滨那一段 85° 弧有景观带，住宅区一直排到海边、景观带却停了（真机截图）。 */
  private urbanPromenadeSegments(): Vec2[][] { return urbanPromenadeSegments(this as unknown as SeasideHost); }

  private buildPromenade(segments: Vec2[][]): void { buildPromenade(this as unknown as SeasideHost, segments); }

  /** 救生塔（VICE S1）：架高值守小屋 + 平台 + 檐顶 + 楼梯——架高结构是
   *  Lifeguard Tower 的第一特征（不是灯塔的窄圆柱）。条纹为辅助色。夜间
   *  自发光由独立 MeshBasic 材质驱动（不依赖路灯照亮），随 setNightGlow 亮起。
   *  合法沙带内最多 3 座，确定性 seed。 */
  private buildLifeguardTowers(): void { buildLifeguardTowers(this as unknown as SeasideHost); }

  /** 沙滩设施：遮阳伞（伞杆 + 伞面）与躺椅，成组散布在干沙上——真机反馈「看不到沙滩和海滨设施」。
   *  沿连续合法岸段每 ~9 单位一组，位置/颜色由确定性 hash 抖动；救生塔附近留空。 */
  private buildBeachFurniture(): void { buildBeachFurniture(this as unknown as SeasideHost); }

  /** 沙排场 + 沙滩人物。人物是静态的、真实比例（身高 ~1.75，躺椅长 1.9，与之同尺度），
   *  比楼小得多：曾经的街区行人是刻意超比例的人偶，且沿车行路网走（真机：「在公路上走」）。
   *  人形 = 双腿 + 躯干（衣色）+ 双臂 + 头（肤色），两个 InstancedMesh 共用矩阵。 */
  /** 沙滩网格：沿整条海岸线（地形的岸线就是这条 96 点折线）铺贴地色带——浪花 / 湿沙 / 干沙，
   *  每条色带是独立的平面四边形，边缘锐利。海滨段铺全宽（干沙 + 路缘），其余海岸铺窄的自然沙滩；
   *  山坡/悬崖、港口与河口处不铺。曾只有海滨那 85° 一段有沙滩，且画在低分辨率贴图里（真机：糊、少）。
   *  向海一侧延伸到水下 6 单位，水线由水面与地形自然相交给出。 */
  private buildBeachRibbon(): void { buildBeachRibbon(this as unknown as SeasideHost); }

  /** 港口码头（G3「水上活动」）：港口用地朝开阔水面的方向伸出 4 条白色栈桥，两侧泊着游艇/小艇。
   *  曾只有一块灰色港区地坪，水上几乎没有生活（多视角评估）。方向取港口周边最深的一侧，栈桥从岸线起步。 */
  private buildMarina(): void { buildMarina(this as unknown as SeasideHost); }

  /** 红色穿式桁架桥（backlog L-7）：悬索桥之外、跨距 40–160 的过河桥加一套格构桁架——上下弦 + 竖杆 + 交替斜腹杆，
   *  深红涂装。只换造型不改路网（同悬索桥做法）；桥面高度与 buildInfrastructure 一致。 */
  private buildTrussBridges(): void { buildTrussBridges(this as unknown as RoadHost); }

  private buildTrees(): THREE.InstancedMesh { return buildTrees(this as unknown as NatureHost); }

  private buildCars(): { mesh: THREE.InstancedMesh; cars: Car[] } { return buildCars(this as unknown as AmbientHost); }

  private buildBoats(): { mesh: THREE.InstancedMesh; boats: Array<{ path: CarPath; distance: number; speed: number; phase: number; wakeTimer: number }>; wakeMesh: THREE.InstancedMesh; wakes: Array<{ x: number; z: number; birth: number; driftX: number; driftZ: number }> } { return buildBoats(this as unknown as AmbientHost); }

  private buildClouds(): { mesh: THREE.InstancedMesh; clouds: Array<{ x: number; z: number; y: number; speed: number; scale: number }> } { return buildClouds(this as unknown as AmbientHost); }

  private buildAnomalyMarkers(): void {
    for (const district of this.layout.districts) {
      if (!district.anomaly) continue;
      const color = district.anomaly.severity === "critical" ? "#d64545" : district.anomaly.severity === "warning" ? "#e0940f" : "#4a7fa0";
      const geometry = new THREE.OctahedronGeometry(1.15);
      const material = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(district.plaza.x, district.plaza.y + 9, district.plaza.z);
      mesh.renderOrder = 2;
      const ringGeometry = new THREE.RingGeometry(2.6, 3.0, 44).rotateX(-Math.PI / 2);
      const ringMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.position.set(district.plaza.x, district.plaza.y + 0.16, district.plaza.z);
      ring.renderOrder = 3;
      this.group.add(mesh, ring);
      this.anomalyMarkers.push({ mesh, ring, baseY: district.plaza.y + 9, phase: hashSeed(`anom:${district.id}`) * Math.PI * 2 });
      this.disposables.push(geometry, material, ringGeometry, ringMaterial);
    }
  }

  private buildLabels(): void {
    for (const district of this.layout.districts) {
      const palette = paletteFor(district.id);
      const detail = `${district.sessionCount} sessions`;
      const { texture, aspect } = makeLabelSprite(district.label, detail, palette.accent);
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true, sizeAttenuation: false });
      const sprite = new THREE.Sprite(material);
      // 标签略放大，且彼此靠近（<150）时逐个抬高，避免重叠（多视角评估：标签小且叠在一起）。
      const height = 0.024;
      sprite.scale.set(height * aspect, height, 1);
      sprite.renderOrder = 20;
      // 标签立在本区地标正上方（用户：把城区标签放到地标建筑上方）；没有地标时退回城区中心上空。
      const landmark = (this.layout.districtLandmarks ?? []).find((l) => l.districtId === district.id);
      if (landmark) sprite.position.set(landmark.x, Math.max(0.3, landmark.y) + this.districtLandmarkHeight(district.id) + 22, landmark.z);
      else {
        const crowd = this.labels.filter((other) => Math.hypot(other.position.x - district.center.x, other.position.z - district.center.z) < 150).length;
        sprite.position.set(district.center.x, district.plaza.y + 45 + crowd * 34, district.center.z);
      }
      this.group.add(sprite);
      this.labels.push(sprite);
      this.disposables.push(material, texture);
    }
  }

  private buildWater(): THREE.Mesh { return buildWater(this as unknown as TerrainHost); }

  private buildRuntimes(): void {
    const districtsById = new Map(this.layout.districts.map((district) => [district.id, district]));
    let podiumCount = 0;
    let roofCount = 0;
    let scaffoldCount = 0;
    let antennaCount = 0;
    let beaconCount = 0;
    let craneCount = 0;
    let cylinderCount = 0;
    const shaftCursor = [0, 0, 0, 0];
    let decoCursor = 0;
    let crownCursor = 0;
    let crownFinCursor = 0;
    let signCursor = 0;

    const ordered = [...this.model.buildings].sort((left, right) => left.startedAt - right.startedAt);
    for (const building of ordered) {
      const district = districtsById.get(building.districtId);
      const slot = district?.slots.get(building.id);
      if (!district || !slot) continue;
      const palette = paletteFor(building.districtId);
      const runtime: BuildingRuntime = {
        building,
        slot,
        facade: -1,
        groundY: district.grounds.get(building.id) ?? 0,
        paletteWall: new THREE.Color(palette.wall).multiplyScalar(0.92 + building.seed * 0.16),
        display: this.previousDisplays?.get(building.id) ?? 0,
        target: building.builtFraction,
        settled: this.previousDisplays ? this.previousDisplays.has(building.id) : true,
        district,
        shaftPrimary: -1,
        shaftUpper: -1,
        podium: -1,
        roof: -1,
        scaffold: -1,
        antenna: -1,
        beacon: -1,
        craneMast: -1,
        craneArm: -1,
        cranePhase: building.seed * Math.PI * 2,
        craneX: 0,
        craneZ: 0,
        blinkPhase: hashSeed(`blink:${building.id}`) * Math.PI * 2,
        deco: -1,
        roofKind: 0,
        hero: false,
        cylinder: -1,
        crownBase: -1,
        crown: null,
        signBase: -1,
        signPlan: null,
      };

      runtime.facade = this.facadeFor(building);
      if (runtime.facade === 3) {
        runtime.deco = decoCursor;
        decoCursor += 1;
        // 装饰艺术楼墙面用执行环境强调色的粉彩版（而不是执行环境的浅墙色）：浅墙色在黄昏暖光下被压成灰，
        // 海滨要的是一眼能认出的粉、薄荷、青、紫。
        runtime.paletteWall = new THREE.Color(palette.accent).lerp(new THREE.Color("#ffffff"), 0.52).multiplyScalar(0.96 + building.seed * 0.08);
        // 转角柱与墙同色略亮；女儿墙与遮阳棚用执行环境强调色的粉彩版——海滨一眼看出是哪个执行环境。
        const accent = new THREE.Color(palette.accent).lerp(new THREE.Color("#ffffff"), 0.35);
        this.decoCornerMesh.setColorAt(runtime.deco, runtime.paletteWall.clone().multiplyScalar(1.06));
        this.decoTrimMesh.setColorAt(runtime.deco * 2, accent);
        this.decoTrimMesh.setColorAt(runtime.deco * 2 + 1, accent.clone().multiplyScalar(0.92));
      }
      const mesh = this.shaftMeshes[runtime.facade];
      const instanceMap = this.shaftIdByInstance[runtime.facade];
      const wantsUpper = this.formOf(building) === "tower" || this.formOf(building) === "landmark";
      const zone = this.zoneById.get(building.id);
      if (this.formOf(building) === "tower" && zone !== "waterfront" && hashSeed(`cylinder:${building.id}`) < 0.14 && cylinderCount < 64) { runtime.cylinder = cylinderCount; cylinderCount += 1; }
      runtime.shaftPrimary = shaftCursor[runtime.facade];
      mesh.setColorAt(runtime.shaftPrimary, runtime.paletteWall);
      (mesh.geometry.getAttribute("aFloors") as THREE.InstancedBufferAttribute).setX(runtime.shaftPrimary, Math.max(2, Math.round(building.height / 3.1)));
      (mesh.geometry.getAttribute("aLight") as THREE.InstancedBufferAttribute).setXY(runtime.shaftPrimary, useOfZone(zone) === "office" ? 1 : 0, building.active ? 1 : 0);
      instanceMap.set(runtime.shaftPrimary, building.id);
      shaftCursor[runtime.facade] += 1;
      if (wantsUpper) {
        runtime.shaftUpper = shaftCursor[runtime.facade];
        mesh.setColorAt(runtime.shaftUpper, runtime.paletteWall.clone().multiplyScalar(0.94));
        (mesh.geometry.getAttribute("aFloors") as THREE.InstancedBufferAttribute).setX(runtime.shaftUpper, Math.max(2, Math.round((building.height * 0.28) / 3.1)));
        (mesh.geometry.getAttribute("aLight") as THREE.InstancedBufferAttribute).setXY(runtime.shaftUpper, useOfZone(zone) === "office" ? 1 : 0, building.active ? 1 : 0);
        instanceMap.set(runtime.shaftUpper, building.id);
        shaftCursor[runtime.facade] += 1;
      }

      const needsPodium = this.formOf(building) !== "tower" && this.formOf(building) !== "landmark";
      if (needsPodium) {
        runtime.podium = podiumCount;
        this.podiumMesh.setColorAt(podiumCount, runtime.paletteWall.clone().multiplyScalar(0.88));
        podiumCount += 1;
      }
      runtime.roof = roofCount;
      this.roofMesh.setColorAt(roofCount, new THREE.Color(palette.roof).multiplyScalar(0.94 + building.seed * 0.12));
      runtime.roofKind = this.roofKindFor(building, runtime.facade);
      const roofColor = new THREE.Color(palette.roof).multiplyScalar(0.94 + building.seed * 0.12);
      const profileColors = [roofColor, new THREE.Color(palette.accent).lerp(new THREE.Color("#e8eef0"), 0.55), runtime.paletteWall.clone().multiplyScalar(0.96), new THREE.Color("#7fae6a")];
      this.roofProfiles.forEach((mesh, index) => mesh.setColorAt(roofCount, profileColors[index]));
      // 乘 3.2 让亮度越过 bloom 阈值（MeshBasicMaterial 不吃光照，toneMapped=false 保留 HDR 值）。
      // N1：霓虹描边只留给高楼与酒店冠，普通会话楼不再每栋一圈彩边（荧光玩具感）；其余实例色置黑 = 不发光。
      this.neonMesh.setColorAt(roofCount, new THREE.Color(palette.accent).multiplyScalar(building.height >= 24 || slot.blockId.startsWith("hotel:") ? LIGHT_BUDGET.neon.roof : 0));
      roofCount += 1;
      // 海滨酒店冠（L-1）：方案在建模期算一次存住；冠底霓虹带走独立实例（neonMesh 与 roofCount
      // 是 1:1 索引，每楼可变条数会破坏该映射）。
      if (slot.blockId.startsWith("hotel:")) {
        const plan = hotelCrownPlan(slot.width, slot.depth, building.height, building.seed);
        if (plan) {
          runtime.crown = plan;
          runtime.crownBase = crownCursor;
          crownFinCursor += plan.fins.length;
          this.crownStripMesh.setColorAt(crownCursor, new THREE.Color(palette.accent).multiplyScalar(3.2));
          crownCursor += 1;
        }
      } else if (runtime.roofKind === 0 && (slot.zone === "commercial" || slot.zone === "downtown" || (this.percentileOf(building) ?? 0) >= 0.6) && building.height >= 18 && signCursor < 24) {
        // 屋顶立牌（L-2）：商业区高楼的尺度符号；已有尖顶/退台冠的楼让位（roofKind ≠ 0 不立牌）。
        // roofY 传 0：模块给的件 y 都是「屋顶面相对高度」，写矩阵时再加地面 + 楼高。
        const plan = rooftopSignPlan(slot.width, slot.depth, 0, building.seed);
        if (plan) {
          runtime.signPlan = plan;
          runtime.signBase = signCursor;
          const frameColor = new THREE.Color(palette.accent).multiplyScalar(3.2);
          plan.frame.forEach((_, k) => this.signFrameMesh.setColorAt(signCursor * 4 + k, frameColor));
          const stripeColors = [new THREE.Color(palette.accent).multiplyScalar(2.4), new THREE.Color("#f8f4ea").multiplyScalar(2.4), new THREE.Color(palette.roof).multiplyScalar(2.4)];
          plan.stripes.forEach((_, k) => this.signStripeMesh.setColorAt(signCursor * 3 + k, stripeColors[k % 3]));
          signCursor += 1;
        }
      }
      runtime.scaffold = scaffoldCount;
      scaffoldCount += 1;
      // C-2 轮廓配件：≥24 高、无尖顶冠（roofKind 0）的楼按种子约三成立天线 + 航空灯，打断板楼单调的天际线（backlog C-2）。
      const roofline = runtime.roofKind === 0 && !slot.blockId.startsWith("hotel:") && building.height >= 24 && hashSeed(`roofline:${building.id}`) < 0.32;
      if ((this.formOf(building) === "landmark" || roofline) && antennaCount < 94) {
        runtime.antenna = antennaCount;
        antennaCount += 1;
        runtime.beacon = beaconCount;
        beaconCount += 1;
      }
      if (building.active && craneCount < 46) {
        runtime.craneMast = craneCount;
        runtime.craneArm = craneCount;
        craneCount += 1;
      }

      this.runtimes.push(runtime);
      this.runtimeById.set(building.id, runtime);
    }
    this.buildGroundSpill();

    this.shaftMeshes.forEach((mesh, variant) => {
      mesh.count = shaftCursor[variant];
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
    this.podiumMesh.count = podiumCount;
    if (this.podiumMesh.instanceColor) this.podiumMesh.instanceColor.needsUpdate = true;
    this.roofMesh.count = roofCount;
    for (const mesh of this.roofProfiles) {
      mesh.count = roofCount;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.gardenTreeMesh.count = roofCount * 3;
    // 天际线焦点：token 最多的会话。楼高本就是 token 的单调函数，它已是（或几乎是）最高楼；
    // 这里只给它专属冠顶，不改高度——高度是数据语义。
    let hero: BuildingRuntime | null = null;
    for (const runtime of this.runtimes) if (!hero || runtime.building.tokensTotal > hero.building.tokensTotal) hero = runtime;
    if (hero) {
      hero.hero = true;
      hero.roofKind = 0;
      this.buildHeroCrown(hero);
    }
    this.neonMesh.count = activeTheme().neon ? roofCount : 0;
    if (this.neonMesh.instanceColor) this.neonMesh.instanceColor.needsUpdate = true;
    if (this.roofMesh.instanceColor) this.roofMesh.instanceColor.needsUpdate = true;
    this.scaffoldMesh.count = scaffoldCount;
    this.antennaMesh.count = antennaCount;
    this.cylinderMesh.count = cylinderCount;
    this.beaconMesh.count = beaconCount;
    this.craneMastMesh.count = craneCount;
    this.decoCornerMesh.count = decoCursor;
    this.decoTrimMesh.count = decoCursor * 2;
    if (this.decoCornerMesh.instanceColor) this.decoCornerMesh.instanceColor.needsUpdate = true;
    if (this.decoTrimMesh.instanceColor) this.decoTrimMesh.instanceColor.needsUpdate = true;
    this.craneArmMesh.count = craneCount;
    // 霓虹载体（冠底带/牌框/色条）与 neonMesh 同一门控：非霓虹主题整体收起，物理件（鳍片/柱/板）常在。
    // 鳍片按实际片数收口——曾漏设 count（makeInstanced 初始为 0），城里所有酒店冠都不渲染。
    this.crownFinMesh.count = crownFinCursor;
    this.crownStripMesh.count = activeTheme().neon ? crownCursor : 0;
    if (this.crownStripMesh.instanceColor) this.crownStripMesh.instanceColor.needsUpdate = true;
    this.buildRoadsideSigns(signCursor);
    // 路边牌占位后才知道四批次的实际用量：屋顶牌 0..signCursor-1，路边牌 signCursor..。
    this.signPostMesh.count = this.signPostCount * 2;
    this.signPanelMesh.count = this.signPostCount;
    this.signFrameMesh.count = activeTheme().neon ? this.signPostCount * 4 : 0;
    this.signStripeMesh.count = activeTheme().neon ? this.signPostCount * 3 : 0;
    if (this.signFrameMesh.instanceColor) this.signFrameMesh.instanceColor.needsUpdate = true;
    if (this.signStripeMesh.instanceColor) this.signStripeMesh.instanceColor.needsUpdate = true;

    // 初次落矩阵：回访的楼按已知高度写（settled），新到的楼从 display=0 藏起，
    // 由 update 循环长入——immediate=true 会按 target 写满高，新楼会先闪一下。
    for (const runtime of this.runtimes) this.applyConstruction(runtime, runtime.settled);
  }

  /** 路边双柱广告牌（L-2）：主干道长段中点的外侧净空点，静态摆件；牌位编址接在屋顶牌之后。
   *  与屋顶牌共用四批次网格，但不动施工状态——路面和牌不随会话生长。 */
  private buildRoadsideSigns(rooftopCount: number): void {
    // 按合并后的整条路取候选：路网被 T 路口切分、滨海路按 ~15 细分后，单条路段几乎没有 ≥60 的，
    // 曾因此一块牌都没立（实例全藏在 y=-40，建筑说明取景时发现）。整条路 ≥60 时取其最长一段的中点。
    const candidates = roadPaintPlan(this.layout.roadEdges ?? [])
      .runs.filter((run) => run.kind === "arterial" && run.width >= 8)
      .flatMap((run) => {
        let best: { a: Vec2; b: Vec2; len: number } | null = null; let total = 0;
        for (let i = 1; i < run.points.length; i += 1) {
          const a = run.points[i - 1]; const b = run.points[i]; const len = Math.hypot(b.x - a.x, b.z - a.z);
          total += len; if (!best || len > best.len) best = { a, b, len };
        }
        return best && total >= 60 && best.len >= 14 ? [{ edge: { width: run.width }, a: best.a, b: best.b, total }] : [];
      })
      .sort((p, q) => q.total - p.total);
    // 宿主边自己距牌位 ≥ 10（width/2+6），closerThan(7) 命中的只会是路口和邻路。
    const otherRoads = new SegmentIndex((this.layout.roadEdges ?? []).map((edge) => [edge.points[0], edge.points[edge.points.length - 1]]));
    const placed: Vec2[] = [];
    let cursor = rooftopCount;
    for (const { edge, a, b } of candidates) {
      if (cursor >= 32 || placed.length >= 8) break;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      const normal = { x: -(b.z - a.z) / len, z: (b.x - a.x) / len };
      const pos = { x: mid.x + normal.x * (edge.width / 2 + 6), z: mid.z + normal.z * (edge.width / 2 + 6) };
      const groundY = this.layout.terrain.height(pos.x, pos.z);
      if (groundY < 0.5) continue; // 水面/桥上不立牌
      if (otherRoads.closerThan(pos, 7)) continue;
      if (placed.some((p) => Math.hypot(p.x - pos.x, p.z - pos.z) < 140)) continue;
      // 面板法线（局部 +Z）朝道路法向：牌面平行道路，双向车流都读到（模块两面同构图）。
      const yaw = Math.atan2(normal.x, normal.z);
      const plan = roadsideSignPlan(yaw, groundY, hashSeed(`roadsign:${pos.x.toFixed(1)}:${pos.z.toFixed(1)}`));
      const place = (pieces: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number; rotY: number }>, mesh: THREE.InstancedMesh, stride: number) => {
        // 件的 x/z 是牌的局部偏移（未旋转）：按 compose 约定（局部 x = (cos, −sin)，局部 z = (sin, cos)）旋转后加上牌位。
        // 曾直接当世界坐标写——全城路边牌都叠在原点附近，路边一块都看不到（建筑说明取景时发现）。
        const c = Math.cos(yaw); const sn = Math.sin(yaw);
        pieces.forEach((piece, index) => {
          const wx = pos.x + piece.x * c + piece.z * sn; const wz = pos.z - piece.x * sn + piece.z * c;
          this.compose(wx, piece.y, wz, piece.rotY, piece.sx, piece.sy, piece.sz);
          mesh.setMatrixAt(cursor * stride + index, this.matrix);
        });
      };
      place(plan.pieces.slice(0, 2), this.signPostMesh, 2);
      place([plan.pieces[2]], this.signPanelMesh, 1);
      place(plan.frame, this.signFrameMesh, 4);
      place(plan.stripes, this.signStripeMesh, 3);
      // 路边牌不属于任何执行环境城区，框/条用主题外的中性 Vice 色板（与街区霓虹不抢色相）。
      plan.frame.forEach((_, k) => this.signFrameMesh.setColorAt(cursor * 4 + k, new THREE.Color("#38e8ff").multiplyScalar(3.2)));
      plan.stripes.forEach((_, k) => this.signStripeMesh.setColorAt(cursor * 3 + k, new THREE.Color(k % 2 ? "#ff4fd8" : "#ffd166").multiplyScalar(2.4)));
      placed.push(pos);
      cursor += 1;
    }
    this.signPostCount = cursor;
  }

  private compose(x: number, y: number, z: number, rotationY: number, sx: number, sy: number, sz: number): void {
    this.euler.set(0, rotationY, 0);
    this.quaternion.setFromEuler(this.euler);
    this.positionVector.set(x, y, z);
    this.scaleVector.set(Math.max(sx, 0.0001), Math.max(sy, 0.0001), Math.max(sz, 0.0001));
    this.matrix.compose(this.positionVector, this.quaternion, this.scaleVector);
  }

  /** 施工矩阵：显示进度 display ∈ [0,1] → 主体/退台/屋面/脚手架/天线/吊车。
   *  所有 y 以地基海拔 groundY 为基准 —— 楼长在起伏地形上。 */
  private applyConstruction(runtime: BuildingRuntime, immediate: boolean): void {
    const building = runtime.building;
    const { x, z } = runtime.slot;
    const g = runtime.groundY;
    const visible = immediate ? runtime.target : runtime.display;
    const fraction = Math.max(0, Math.min(1, visible));
    if (fraction <= 0.001) {
      this.hideAll(runtime);
      return;
    }
    const h = building.height;
    const fp = building.footprint;
    const built = Math.max(0.5, fraction * h);
    const split = this.formOf(building) === "tower" || this.formOf(building) === "landmark" ? 0.72 : 1;
    const podiumHeight = runtime.podium >= 0 ? Math.min(built, 1.5) : 0;

    let widths: [number, number];
    if (this.formOf(building) === "slab") widths = [fp * 1.3, fp * 0.58];
    else if (this.formOf(building) === "block") widths = [fp * 1.2, fp * 0.85];
    else if (this.formOf(building) === "tower" || this.formOf(building) === "landmark") widths = [fp * 0.72, fp * 0.72]; // 细方塔（曾 0.86×0.55，与板楼裁平后难分）
    else widths = [fp, fp];
    const streetWidth = runtime.slot.width * (runtime.slot.zone === "downtown" ? 0.8 : 0.88);
    if (this.formOf(building) !== "tower" && this.formOf(building) !== "landmark") widths[0] = Math.max(widths[0], streetWidth);
    widths[0] = Math.min(widths[0], runtime.slot.width - 0.8);
    widths[1] = Math.min(widths[1], runtime.slot.depth - 2);
    // 海滨酒店地块上的会话楼：铺满宽地块成为一栋酒店（低楼走装饰艺术立面，见 facadeFor 的海滨规则）。
    // 楼高仍由 token 决定——酒店是会话，不是装饰。
    if (runtime.slot.blockId.startsWith("hotel:")) widths = [runtime.slot.width * 0.92, runtime.slot.depth * 0.9];

    // Parcel frontage owns orientation; podium, shaft and roof share it.
    const yaw = runtime.slot.yaw;
    // 主体段。
    const shaftBottom = g + podiumHeight;
    const shaftTop = g + Math.min(built, h * split);
    const shaftHeight = Math.max(0, shaftTop - shaftBottom);
    if (runtime.shaftPrimary >= 0) {
      if (shaftHeight < 0.15) {
        this.compose(x, -40, z, 0, 0, 0, 0);
      } else {
        this.compose(x, shaftBottom, z, yaw, widths[0], shaftHeight, widths[1]);
      }
      if (runtime.cylinder >= 0) {
        // 圆筒塔：圆柱取代方形主体与退台（直径取较短边 × 1.1），方楼实例藏起。
        const dia = Math.min(widths[0], widths[1]) * 1.1;
        this.compose(x, shaftBottom, z, yaw, dia, Math.max(0, g + built - shaftBottom), dia);
        this.cylinderMesh.setMatrixAt(runtime.cylinder, this.matrix);
        this.compose(x, -40, z, 0, 0, 0, 0);
      }
      this.shaftMeshes[runtime.facade].setMatrixAt(runtime.shaftPrimary, this.matrix);
    }
    // 退台段（tower/landmark）。
    if (runtime.shaftUpper >= 0) {
      const upperHeight = Math.max(0, built - h * split);
      if (upperHeight < 0.15) {
        this.compose(x, -40, z, 0, 0, 0, 0);
      } else {
        this.compose(x, g + h * split, z, yaw, widths[0] * 0.72, upperHeight, widths[1] * 0.72);
      }
      if (runtime.cylinder >= 0) this.compose(x, -40, z, 0, 0, 0, 0);
      this.shaftMeshes[runtime.facade].setMatrixAt(runtime.shaftUpper, this.matrix);
    }
    if (runtime.podium >= 0) {
      this.compose(x, g, z, yaw, fp * 1.16, podiumHeight > 0.1 ? podiumHeight : 0, fp * 1.16);
      this.podiumMesh.setMatrixAt(runtime.podium, this.matrix);
    }
    if (runtime.roof >= 0) {
      const roofY = g + Math.max(0.4, built - 0.18);
      const roofWidth = runtime.shaftUpper >= 0 && built > h * split ? widths[0] * 0.78 : widths[0] * 1.06;
      const roofDepth = runtime.shaftUpper >= 0 && built > h * split ? widths[1] * 0.78 : widths[1] * 1.06;
      this.compose(x, roofY, z, yaw, roofWidth, 0.34, roofDepth);
      this.roofMesh.setMatrixAt(runtime.roof, this.matrix);
      this.compose(x, roofY - 0.12, z, yaw, roofWidth * 1.16, 0.3, roofDepth * 1.16);
      this.neonMesh.setMatrixAt(runtime.roof, this.matrix);
      // 屋顶轮廓只在封顶后出现：施工中的楼顶是脚手架。
      const capped = fraction > 0.985;
      const top = roofY + 0.34;
      this.roofProfiles.forEach((mesh, index) => {
        const kind = index + 1;
        if (!capped || runtime.roofKind !== kind) this.compose(x, -40, z, 0, 0, 0, 0);
        else if (kind === 1) this.compose(x, top, z, yaw, roofWidth, Math.min(roofWidth, roofDepth) * 0.42, roofDepth);
        else if (kind === 2) this.compose(x, top, z, yaw, roofWidth * 0.92, Math.max(6, h * 0.22), roofDepth * 0.92);
        else if (kind === 3) this.compose(x, top, z, yaw, roofWidth * 0.62, Math.max(2.4, h * 0.06), roofDepth * 0.62);
        else this.compose(x, top, z, yaw, roofWidth * 0.86, 0.35, roofDepth * 0.86);
        mesh.setMatrixAt(runtime.roof, this.matrix);
      });
      for (let tree = 0; tree < 3; tree += 1) {
        if (capped && runtime.roofKind === 4) {
          const angle = runtime.building.seed * 6.283 + tree * 2.1;
          const reach = Math.min(roofWidth, roofDepth) * 0.28;
          const scale = 0.7 + ((runtime.building.seed * 7 + tree) % 1) * 0.5;
          this.compose(x + Math.cos(angle) * reach, top + 0.3, z + Math.sin(angle) * reach, 0, scale, scale * 1.1, scale);
        } else this.compose(x, -40, z, 0, 0, 0, 0);
        this.gardenTreeMesh.setMatrixAt(runtime.roof * 3 + tree, this.matrix);
      }
      if (runtime.hero) this.placeHeroCrown(x, roofY + 0.34, z, roofWidth, roofDepth, h, capped);
    }
    // 脚手架：包住"计划高度"的剩余部分——楼还没到的地方先看见壳。
    if (runtime.scaffold >= 0) {
      const remaining = h - built;
      if (fraction < 0.985 && remaining > 0.6) {
        this.compose(x, g + built, z, yaw, widths[0] * 1.14, remaining, widths[1] * 1.14);
      } else {
        this.compose(x, -40, z, 0, 0, 0, 0);
      }
      this.scaffoldMesh.setMatrixAt(runtime.scaffold, this.matrix);
    }
    // 装饰艺术附件：圆角转角柱随楼长高；封顶后立起阶梯女儿墙；底层有遮阳棚。
    if (runtime.deco >= 0) {
      const local = (lx: number, lz: number) => ({ x: x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z: z - lx * Math.sin(yaw) + lz * Math.cos(yaw) });
      const radius = Math.min(widths[0], widths[1]) * 0.24;
      const corner = local(widths[0] / 2 - radius * 0.55, widths[1] / 2 - radius * 0.55);
      this.compose(corner.x, g, corner.z, 0, radius, Math.max(0.2, built + 0.4), radius);
      this.decoCornerMesh.setMatrixAt(runtime.deco, this.matrix);
      const done = fraction > 0.985;
      const crown = local(0, widths[1] * 0.1);
      this.compose(crown.x, g + built, crown.z, yaw, done ? widths[0] * 0.42 : 0, done ? 2.4 : 0, done ? widths[1] * 0.7 : 0);
      this.decoTrimMesh.setMatrixAt(runtime.deco * 2, this.matrix);
      const awning = local(-widths[0] * 0.08, widths[1] / 2 + 0.8);
      const awningOn = built > 3.4;
      this.compose(awning.x, g + 2.7, awning.z, yaw, awningOn ? widths[0] * 0.66 : 0, awningOn ? 0.28 : 0, awningOn ? 1.7 : 0);
      this.decoTrimMesh.setMatrixAt(runtime.deco * 2 + 1, this.matrix);
    }
    // 海滨酒店冠（L-1）：封顶才戴上。鳍片几何是箱心锚定（crownFinMesh 用了不带 translate 的
    // BoxGeometry），所以 y 直接写 fin.y；冠底霓虹带走底面锚定的 BOX，底边贴 stripY。
    if (runtime.crown && runtime.crownBase >= 0) {
      const capped = fraction > 0.985;
      const crownLocal = (lx: number, lz: number) => ({ x: x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z: z - lx * Math.sin(yaw) + lz * Math.cos(yaw) });
      runtime.crown.fins.forEach((fin, index) => {
        if (!capped) this.compose(x, -40, z, 0, 0, 0, 0);
        else {
          const p = crownLocal(fin.x, fin.z);
          this.compose(p.x, g + fin.y, p.z, yaw, fin.sx, fin.sy, fin.sz);
        }
        this.crownFinMesh.setMatrixAt(runtime.crownBase + index, this.matrix);
      });
      if (!capped) this.compose(x, -40, z, 0, 0, 0, 0);
      else this.compose(x, g + runtime.crown.stripY, z, yaw, runtime.slot.width * 0.88, 0.28, runtime.slot.depth * 0.8);
      this.crownStripMesh.setMatrixAt(runtime.crownBase, this.matrix);
    }
    // 屋顶立牌（L-2）：封顶后立起；件 y 是屋顶面相对高度（建模期 roofY 传 0），世界 y = 地面 + 楼高。
    if (runtime.signPlan && runtime.signBase >= 0) {
      const capped = fraction > 0.985;
      const signY = g + h;
      const signLocal = (lx: number, lz: number) => ({ x: x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z: z - lx * Math.sin(yaw) + lz * Math.cos(yaw) });
      const place = (pieces: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number; rotY: number }>, mesh: THREE.InstancedMesh, stride: number) => {
        pieces.forEach((piece, index) => {
          if (!capped) this.compose(x, -40, z, 0, 0, 0, 0);
          else {
            const p = signLocal(piece.x, piece.z);
            this.compose(p.x, signY + piece.y, p.z, yaw + piece.rotY, piece.sx, piece.sy, piece.sz);
          }
          mesh.setMatrixAt(runtime.signBase * stride + index, this.matrix);
        });
      };
      place(runtime.signPlan.posts, this.signPostMesh, 2);
      place([runtime.signPlan.panel], this.signPanelMesh, 1);
      place(runtime.signPlan.frame, this.signFrameMesh, 4);
      place(runtime.signPlan.stripes, this.signStripeMesh, 3);
    }
    // 天线（landmark 封顶后立起）。
    if (runtime.antenna >= 0) {
      const done = fraction > 0.985;
      this.compose(x, g + h, z, 0, 1, done ? h * 0.1 + 3.4 : 0, 1);
      this.antennaMesh.setMatrixAt(runtime.antenna, this.matrix);
      this.compose(x, g + h + (done ? h * 0.1 + 3.4 : 0), z, 0, 1, 1, 1);
      this.beaconMesh.setMatrixAt(runtime.beacon >= 0 ? runtime.beacon : 0, this.matrix);
    }
    // 吊车（活跃会话）。
    if (runtime.craneMast >= 0) {
      const mastHeight = h * 1.02 + 6.5;
      // 立柱立在地块局部坐标的一角（随 slot.yaw 旋转），不再按世界轴偏移而被楼体吞掉。
      const localX = widths[0] * 0.5 + 0.6;
      const localZ = widths[1] * 0.5 + 0.6;
      const cornerX = x + localX * Math.cos(yaw) + localZ * Math.sin(yaw);
      const cornerZ = z - localX * Math.sin(yaw) + localZ * Math.cos(yaw);
      runtime.craneX = cornerX;
      runtime.craneZ = cornerZ;
      this.compose(cornerX, g, cornerZ, 0, 1, mastHeight, 1);
      this.craneMastMesh.setMatrixAt(runtime.craneMast, this.matrix);
      this.applyCraneArm(runtime, cornerX, cornerZ, g, mastHeight, 0);
    }
  }

  private applyCraneArm(runtime: BuildingRuntime, cornerX: number, cornerZ: number, groundY: number, mastHeight: number, armRotation: number): void {
    const armLength = runtime.building.footprint * 2.4 + 3.4;
    const angle = runtime.cranePhase + armRotation;
    const centerX = cornerX + Math.cos(angle) * armLength * 0.34;
    const centerZ = cornerZ - Math.sin(angle) * armLength * 0.34;
    // three.js 绕 Y 转 θ 后 x 轴指向 (cosθ, -sinθ)，与上面的中心偏移同向，必须传 +angle；
    // 曾传 -angle，悬臂被镜像到另一侧，脱离立柱悬在空中。
    this.compose(centerX, groundY + mastHeight + 0.1, centerZ, angle, armLength, 2.2, 2.2);
    this.craneArmMesh.setMatrixAt(runtime.craneArm, this.matrix);
  }

  private hideAll(runtime: BuildingRuntime): void {
    this.compose(0, -40, 0, 0, 0, 0, 0);
    const building = runtime.building;
    if (runtime.shaftPrimary >= 0) this.shaftMeshes[runtime.facade].setMatrixAt(runtime.shaftPrimary, this.matrix);
    if (runtime.shaftUpper >= 0) this.shaftMeshes[runtime.facade].setMatrixAt(runtime.shaftUpper, this.matrix);
    if (runtime.cylinder >= 0) this.cylinderMesh.setMatrixAt(runtime.cylinder, this.matrix);
    if (runtime.podium >= 0) this.podiumMesh.setMatrixAt(runtime.podium, this.matrix);
    if (runtime.deco >= 0) {
      this.decoCornerMesh.setMatrixAt(runtime.deco, this.matrix);
      this.decoTrimMesh.setMatrixAt(runtime.deco * 2, this.matrix);
      this.decoTrimMesh.setMatrixAt(runtime.deco * 2 + 1, this.matrix);
    }
    if (runtime.roof >= 0) {
      this.roofMesh.setMatrixAt(runtime.roof, this.matrix);
      this.neonMesh.setMatrixAt(runtime.roof, this.matrix);
      for (const mesh of this.roofProfiles) mesh.setMatrixAt(runtime.roof, this.matrix);
      for (let tree = 0; tree < 3; tree += 1) this.gardenTreeMesh.setMatrixAt(runtime.roof * 3 + tree, this.matrix);
      if (runtime.hero && this.heroParts) this.placeHeroCrown(0, -40, 0, 0, 0, 0, false);
    }
    if (runtime.scaffold >= 0) this.scaffoldMesh.setMatrixAt(runtime.scaffold, this.matrix);
    if (runtime.crown && runtime.crownBase >= 0) {
      for (let index = 0; index < runtime.crown.fins.length; index += 1) this.crownFinMesh.setMatrixAt(runtime.crownBase + index, this.matrix);
      this.crownStripMesh.setMatrixAt(runtime.crownBase, this.matrix);
    }
    if (runtime.signPlan && runtime.signBase >= 0) {
      for (let index = 0; index < 2; index += 1) this.signPostMesh.setMatrixAt(runtime.signBase * 2 + index, this.matrix);
      this.signPanelMesh.setMatrixAt(runtime.signBase, this.matrix);
      for (let index = 0; index < 4; index += 1) this.signFrameMesh.setMatrixAt(runtime.signBase * 4 + index, this.matrix);
      for (let index = 0; index < 3; index += 1) this.signStripeMesh.setMatrixAt(runtime.signBase * 3 + index, this.matrix);
    }
    if (runtime.antenna >= 0) this.antennaMesh.setMatrixAt(runtime.antenna, this.matrix);
    if (runtime.beacon >= 0) this.beaconMesh.setMatrixAt(runtime.beacon, this.matrix);
    if (runtime.craneMast >= 0) {
      this.craneMastMesh.setMatrixAt(runtime.craneMast, this.matrix);
      this.craneArmMesh.setMatrixAt(runtime.craneArm, this.matrix);
    }
  }

  /** pace>0 时按回放节奏夹住升起时长（见 builtFractionAt）；live 或未回放时传 0。 */
  applyCursor(cursor: number, live: boolean, paceMsPerSec = 0): void {
    this.cursor = cursor;
    this.live = live;
    (this.layout.civics ?? []).forEach((civic, index) => { this.civicTarget[index] = live || cursor >= civic.unlockAt ? 1 : 0; });
    const context = this.layout.contextBuildings ?? [];
    if (this.contextTarget.length !== context.length) { this.contextTarget = new Float32Array(context.length).fill(1); this.contextProgress = new Float32Array(context.length).fill(1); }
    context.forEach((building, index) => { this.contextTarget[index] = live || cursor >= building.appearAt ? 1 : 0; });
    this.applyDistrictLandmarkGrowth(cursor, live);
    for (const runtime of this.runtimes) {
      runtime.target = builtFractionAt(runtime.building, cursor, live, paceMsPerSec);
      if (live && runtime.building.active) runtime.target = Math.max(runtime.target, runtime.building.builtFraction);
    }
  }

  /** 重建前的显示进度快照：applyModel 把它交给下一份 CityParts——回访的楼保持
   *  高度（不重演生长），新到的楼从 0 长入（分页/失效刷新的「逐步长全」）。 */
  displaySnapshot(): Map<string, number> {
    const out = new Map<string, number>();
    for (const [id, runtime] of this.runtimeById) out.set(id, runtime.display);
    return out;
  }

  /** display/civicProgress 直接对齐 target：模型重建后的第一步。重建时 display
   *  被初始化为「已完工」（closed 的 builtFraction=1，civic 全 1），回放中若任由
   *  动画循环追赶，整城会先闪满高、再被压回时间轴进度——数据加载不应改变城市
   *  已呈现的样子。 */
  snapToTargets(): void {
    this.contextProgress.set(this.contextTarget);
    this.writeContext();
    for (const runtime of this.runtimes) {
      if (!runtime.settled) continue; // 新楼交给 update 循环长入
      runtime.display = runtime.target;
      this.applyConstruction(runtime, true);
    }
    for (let index = 0; index < this.civicTarget.length; index += 1) {
      if (this.civicProgress[index] !== this.civicTarget[index]) {
        this.civicProgress[index] = this.civicTarget[index];
        this.writeCivic(index);
      }
    }
    for (const mesh of this.shaftMeshes) mesh.instanceMatrix.needsUpdate = true;
    this.podiumMesh.instanceMatrix.needsUpdate = true;
    this.decoCornerMesh.instanceMatrix.needsUpdate = true;
    this.decoTrimMesh.instanceMatrix.needsUpdate = true;
    for (const mesh of this.roofProfiles) mesh.instanceMatrix.needsUpdate = true;
    this.gardenTreeMesh.instanceMatrix.needsUpdate = true;
    this.roofMesh.instanceMatrix.needsUpdate = true;
    this.neonMesh.instanceMatrix.needsUpdate = true;
    this.scaffoldMesh.instanceMatrix.needsUpdate = true;
    this.antennaMesh.instanceMatrix.needsUpdate = true; this.cylinderMesh.instanceMatrix.needsUpdate = true;
    this.craneMastMesh.instanceMatrix.needsUpdate = true;
    this.crownFinMesh.instanceMatrix.needsUpdate = true;
    this.crownStripMesh.instanceMatrix.needsUpdate = true;
    this.signPostMesh.instanceMatrix.needsUpdate = true;
    this.signPanelMesh.instanceMatrix.needsUpdate = true;
    this.signFrameMesh.instanceMatrix.needsUpdate = true;
    this.signStripeMesh.instanceMatrix.needsUpdate = true;
  }

  setQualityLevel(level: QualityLevel): void {
    this.cloudMesh.visible = level >= 1;
    this.carKeep = level >= 1 ? 1 : 0.5;
    this.applyCarDensity();
  }

  private applyCarDensity(): void { applyCarDensity(this as unknown as AmbientHost); }

  private placeCar(car: Car, index: number, visible: boolean): void { placeCar(this as unknown as AmbientHost, car, index, visible); }

  /** 航拍时隐藏「计划高度」脚手架壳：低机位下它是悬在天上的半透明大方块。 */
  setScaffoldVisible(visible: boolean): void {
    this.scaffoldMesh.visible = visible;
  }

  /** 拍照用：暂时藏起标签与悬停/选中环（不改 labelsVisible 偏好），返回恢复函数。 */
  hideOverlaysForPhoto(): () => void {
    const labels = this.labels.map((label) => label.visible);
    const rings = [this.hoverRing.visible, this.selectRing.visible];
    const scaffold = this.scaffoldMesh.visible;
    // 「计划高度」脚手架壳在照片里读作悬空的半透明方块（航拍/导出也藏它）。
    this.scaffoldMesh.visible = false;
    for (const label of this.labels) label.visible = false;
    this.hoverRing.visible = false;
    this.selectRing.visible = false;
    return () => {
      this.labels.forEach((label, index) => { label.visible = labels[index]; });
      this.hoverRing.visible = rings[0];
      this.selectRing.visible = rings[1];
      this.scaffoldMesh.visible = scaffold;
    };
  }

  setLabelsVisible(visible: boolean): void {
    this.labelsVisible = visible;
    for (const label of this.labels) label.visible = visible;
  }

  private decorTargetsCache: THREE.Object3D[] | null = null;

  /** 非会话建筑的拾取目标（酒店、地标、配套、市政设施、背景楼、聚合楼群、海滨装饰、火山）：
   *  首次使用时沿场景树按网格名收集一次；它们曾不在拾取范围内，点了毫无反应。 */
  get decorTargets(): THREE.Object3D[] {
    if (this.decorTargetsCache) return this.decorTargetsCache;
    const out: THREE.Object3D[] = [];
    this.group.traverse((object) => {
      if (!(object as THREE.Mesh).isMesh || !object.visible) return;
      for (let node: THREE.Object3D | null = object; node; node = node.parent) {
        if (decorKindForName(node.name)) { out.push(object); return; }
      }
    });
    this.decorTargetsCache = out;
    return out;
  }

  /** 命中的非会话网格 → `decor:<kind>[:<detail>]`；配套按实例反查学校/商场/医院。 */
  decorAt(mesh: THREE.Object3D, instanceId: number | undefined, point?: THREE.Vector3): string | null {
    for (let node: THREE.Object3D | null = mesh; node; node = node.parent) {
      const kind = decorKindForName(node.name);
      if (!kind) continue;
      if (kind === "civic" && instanceId !== undefined) {
        const meshIndex = this.civicMeshes.indexOf(mesh as THREE.InstancedMesh);
        const piece = this.civicPieces.find((item) => item.mesh === meshIndex && item.index === instanceId);
        const civic = piece ? (this.layout.civics ?? [])[piece.civic] : undefined;
        return civic ? `decor:civic:${civic.kind}` : "decor:civic";
      }
      // 公共用地是一批合并网格：按命中点找最近的用地，市政厅（civic）面板展示全城信息。
      if (kind === "site" && point) {
        const site = [...this.layout.publicSites].sort((a, b) => Math.hypot(a.x - point.x, a.z - point.z) - Math.hypot(b.x - point.x, b.z - point.z))[0];
        if (site && Math.hypot(site.x - point.x, site.z - point.z) < site.radius * 1.4) return `decor:site:${site.kind}`;
      }
      return `decor:${kind}`;
    }
    return null;
  }

  idAt(mesh: THREE.Object3D, instanceId: number): string | null {
    const index = this.shaftMeshes.indexOf(mesh as THREE.InstancedMesh);
    if (index < 0) return null;
    return this.shaftIdByInstance[index].get(instanceId) ?? null;
  }

  /** 所有楼的锚点（航拍挑主角用）：只读快照，不暴露 runtime。 */
  anchors(): Map<string, { x: number; z: number; height: number; ground: number }> {
    const out = new Map<string, { x: number; z: number; height: number; ground: number }>();
    for (const [id, runtime] of this.runtimeById) out.set(id, { x: runtime.slot.x, z: runtime.slot.z, height: runtime.building.height, ground: runtime.groundY });
    return out;
  }

  /** 云层材质（昼夜循环驱动透明度）。 */
  get cloudMaterial(): (THREE.Material & { opacity: number }) | null {
    return this.cloudMesh ? (this.cloudMesh.material as THREE.Material & { opacity: number }) : null;
  }

  /** 水色 uniform（昼夜循环驱动深浅两色）。 */
  get waterColors(): { uShallow: { value: THREE.Color }; uDeep: { value: THREE.Color }; uSky: { value: THREE.Color } } | null {
    return this.water ? ((this.water.material as THREE.ShaderMaterial).uniforms as unknown as { uShallow: { value: THREE.Color }; uDeep: { value: THREE.Color }; uSky: { value: THREE.Color } }) : null;
  }

  /** 夜晚城市亮窗：抬升立面自发光，保留 theme 基线下限（白天≈基线不变）。
   *  theme 切换会重设 uSelfLit 基线，下一次昼夜 tick 会在其上再抬升。 */
  private nightGlow = 0;
  private lifeguardGlowMaterial: THREE.MeshBasicMaterial | null = null;
  landmarkWindows: Array<{ material: THREE.MeshLambertMaterial; day: THREE.Texture; lit: THREE.Texture; dayEmissive: THREE.Color }> = [];
  private signageNeonMaterial: THREE.MeshBasicMaterial | null = null;
  private yachtMesh: THREE.InstancedMesh | null = null;
  private yachtIndices: number[] = [];

  setNightGlow(selfLit: number): void {
    this.nightGlow = selfLit;
    // 电灯用自己的「夜」量：DAY 档 selfLit = 0.05（立面的白天余光），直接拿来点灯会让正午的光斑/霓虹
    // 越过 0.03/0.04 的开灯阈值、灯头也带着亮度（审计实测正午灯全开）。≤0.1 一律算白天 = 0。
    const night = nightFactor(selfLit);
    this.applyNightOverlay();
    const beamMaterial = this.heroParts?.beam?.material as THREE.MeshBasicMaterial | undefined;
    if (beamMaterial) {
      beamMaterial.visible = night > 0.05;
      beamMaterial.opacity = 0.22 * Math.min(1, night * 1.5);
    }
    const lights = this.nightLights;
    if (lights) {
      // 电灯白天完全熄灭（0），随 night 线性亮起：此前留的 0.12/0.1「白天底线」
      // 在 4600 盏灯的规模下肉眼可见，读作「灯没关」；灯杆由 Lambert 灰呈现，
      // 灯头不需要白天亮度。
      lights.heads.color.setRGB(1, 0.78, 0.45).multiplyScalar(night * LIGHT_BUDGET.street.head);
      lights.pools.color.setRGB(1, 0.62, 0.3).multiplyScalar(night * LIGHT_BUDGET.street.pool);
      lights.pools.visible = night > 0.03;
      lights.strips.color.setRGB(1, 0.7, 0.4).multiplyScalar(night * LIGHT_BUDGET.street.strip);
      // 霓虹/边缘光：实例色决定色相（青/洋红/暖白），这里只管亮度；白天熄灭。
      lights.neon.color.setRGB(1, 1, 1).multiplyScalar(night * LIGHT_BUDGET.neon.bridge);
      // 白天整体关掉：近黑的实例色在日光下读作一块块深色方块（桥塔上的霓虹点实测）。
      lights.neon.visible = night > 0.04;
    }
    // 地标玻璃幕墙：夜里换亮窗贴图并加亮，白天回到立面贴图 + 少量托底自发光。
    for (const entry of this.landmarkWindows) {
      const lit = night > 0.05;
      if (lit) { entry.material.emissiveMap = entry.lit; entry.material.emissive.setRGB(1, 1, 1).multiplyScalar(LIGHT_BUDGET.landmark.base + night * LIGHT_BUDGET.landmark.gain); }
      else { entry.material.emissiveMap = entry.day; entry.material.emissive.copy(entry.dayEmissive); }
    }
    // 救生塔夜间指示灯（VICE S1）：独立 MeshBasic，不依赖路灯照亮。
    if (this.lifeguardGlowMaterial) {
      const parent = this.lifeguardGlowMaterial.opacity !== undefined;
      this.lifeguardGlowMaterial.transparent = true;
      this.lifeguardGlowMaterial.opacity = night;
      // 通过材质找到 mesh 并切可见性。
      this.group.traverse((child) => {
        if (child instanceof THREE.InstancedMesh && child.material === this.lifeguardGlowMaterial) {
          child.visible = night > 0.05;
        }
      });
    }
    // 酒店招牌霓虹（VICE S2）：白天完全熄灭，夜间亮起。
    if (this.signageNeonMaterial) {
      this.group.traverse((child) => {
        if (child instanceof THREE.InstancedMesh && child.material === this.signageNeonMaterial) {
          child.visible = night > 0.05;
        }
      });
    }
  }

  /** theme 基线 + 夜晚抬升的合成值（theme 切换后由昼夜 tick 重新应用）。 */
  applySelfLit(themeBase: number): void {
    for (const uniforms of this.facadeUniforms) {
      // 夜里不再抬升墙面自发光（只点亮窗格，见 uWindowGlow）；墙面保持主题基线。
      // N1：墙面按自身颜色发光是「塑料」感的来源——夜里把基线随夜色压到 ~10%，只有窗格是光源。
      const night = Math.max(0, (this.nightGlow - 0.1) / 0.9);
      uniforms.uSelfLit.value = themeBase * (1 - 0.9 * Math.min(1, night));
      uniforms.uWindowGlow.value = this.nightGlow;
    }
  }

  anchorFor(id: string): { x: number; z: number; height: number; ground: number } | null {
    const runtime = this.runtimeById.get(id);
    if (!runtime) return null;
    return { x: runtime.slot.x, z: runtime.slot.z, height: runtime.building.height, ground: runtime.groundY };
  }

  setHovered(id: string | null): void {
    this.hoveredId = id;
    const anchor = id ? this.anchorFor(id) : null;
    if (!anchor) {
      this.hoverRing.visible = false;
      return;
    }
    const runtime = id ? this.runtimeById.get(id) : null;
    const ringRadius = runtime ? runtime.building.footprint * 1.5 : 3;
    this.hoverRing.scale.set(ringRadius, 1, ringRadius);
    this.hoverRing.position.set(anchor.x, anchor.ground + 0.18, anchor.z);
    this.hoverRing.visible = true;
  }

  setSelected(id: string | null): void {
    this.selectedId = id;
    const anchor = id ? this.anchorFor(id) : null;
    if (!anchor) {
      this.selectRing.visible = false;
      return;
    }
    const runtime = id ? this.runtimeById.get(id) : null;
    const ringRadius = runtime ? runtime.building.footprint * 1.7 : 3.4;
    this.selectRing.scale.set(ringRadius, 1, ringRadius);
    this.selectRing.position.set(anchor.x, anchor.ground + 0.2, anchor.z);
    this.selectRing.visible = true;
  }

  /** 每帧增量更新。返回是否有矩阵写入（供引擎决定是否强制重绘）。 */
  update(dt: number, elapsed: number): boolean {
    this.waterUniforms.uTime.value = elapsed;
    if (this.flagTime) this.flagTime.value = elapsed;
    this.updateCivics(dt);
    this.updateContext(dt);
    for (const spinner of this.landmarkSpinners) spinner.object.rotation[spinner.axis] += spinner.speed * dt;

    let dirty = false;
    const rate = Math.min(1, dt * 1.35);
    for (const runtime of this.runtimes) {
      if (Math.abs(runtime.display - runtime.target) > 0.0012) {
        runtime.display += (runtime.target - runtime.display) * rate;
        this.applyConstruction(runtime, false);
        dirty = true;
      } else if (runtime.display !== runtime.target) {
        runtime.display = runtime.target;
        runtime.settled = true;
        this.applyConstruction(runtime, false);
        dirty = true;
      }
    }
    if (dirty || Number.isNaN(this.cursor)) {
      for (const mesh of this.shaftMeshes) mesh.instanceMatrix.needsUpdate = true;
      this.podiumMesh.instanceMatrix.needsUpdate = true;
      this.decoCornerMesh.instanceMatrix.needsUpdate = true;
      this.decoTrimMesh.instanceMatrix.needsUpdate = true;
      for (const mesh of this.roofProfiles) mesh.instanceMatrix.needsUpdate = true;
      this.gardenTreeMesh.instanceMatrix.needsUpdate = true;
      this.roofMesh.instanceMatrix.needsUpdate = true;
      this.neonMesh.instanceMatrix.needsUpdate = true;
      this.scaffoldMesh.instanceMatrix.needsUpdate = true;
      this.antennaMesh.instanceMatrix.needsUpdate = true; this.cylinderMesh.instanceMatrix.needsUpdate = true;
      this.craneMastMesh.instanceMatrix.needsUpdate = true;
      this.crownFinMesh.instanceMatrix.needsUpdate = true;
      this.crownStripMesh.instanceMatrix.needsUpdate = true;
      this.signPostMesh.instanceMatrix.needsUpdate = true;
      this.signPanelMesh.instanceMatrix.needsUpdate = true;
      this.signFrameMesh.instanceMatrix.needsUpdate = true;
      this.signStripeMesh.instanceMatrix.needsUpdate = true;
    }

    // 吊车臂：活跃楼的节奏 = 繁忙度。
    for (const runtime of this.runtimes) {
      if (runtime.craneArm < 0 || runtime.display <= 0.002 || (runtime.craneX === 0 && runtime.craneZ === 0)) continue;
      const spin = (0.25 + runtime.building.busyness * 0.85) * dt;
      runtime.cranePhase += spin;
      const mastHeight = runtime.building.height * 1.02 + 6.5;
      // 曾在此处重算旧公式（x + fp*0.72，无 yaw/楼宽），把 applyConstruction 里修正的立柱位置
      // 每帧覆盖回去：吊臂绕着错误的点转，与立柱脱节。
      const cornerX = runtime.craneX;
      const cornerZ = runtime.craneZ;
      this.applyCraneArm(runtime, cornerX, cornerZ, runtime.groundY, mastHeight, 0);
      this.craneArmMesh.instanceMatrix.needsUpdate = true;
      // 吊车顶警示灯。
      if (runtime.beacon >= 0) {
        const blink = 0.55 + 0.45 * Math.sin(elapsed * 2.4 + runtime.blinkPhase);
        this.compose(cornerX, runtime.groundY + mastHeight + 0.3, cornerZ, 0, blink, blink, blink);
        this.beaconMesh.setMatrixAt(runtime.beacon, this.matrix);
        this.beaconMesh.instanceMatrix.needsUpdate = true;
      }
    }

    // 车辆。
    let carsMoved = false;
    this.cars.forEach((car, index) => {
      if (car.speed === 0) return;
      car.distance += car.speed * dt;
      this.placeCar(car, index, true);
      carsMoved = true;
    });
    if (carsMoved) this.carMesh.instanceMatrix.needsUpdate = true;

    // 船只（沿海岸航道折线推进 + 起伏）+ 尾迹泡沫在船尾持续吐出。
    let wakeCursor = 0;
    this.boats.forEach((boat, index) => {
      boat.distance += boat.speed * dt;
      const sample = samplePolyline(boat.path, boat.distance);
      const bob = Math.sin(elapsed * 0.9 + boat.phase) * 0.12;
      this.compose(sample.x, -0.3 + bob, sample.z, Math.atan2(-sample.dz, sample.dx), 1, 1, 1);
      this.boatMesh.setMatrixAt(index, this.matrix);
      boat.wakeTimer -= dt;
      if (boat.wakeTimer <= 0) {
        boat.wakeTimer = 0.3 + 0.08 * Math.sin(elapsed * 1.7 + boat.phase);
        const puff = this.wakes[wakeCursor];
        wakeCursor = (wakeCursor + 1) % this.wakes.length;
        const side = Math.sin(elapsed * 5.3 + boat.phase + index);
        puff.x = sample.x - sample.dx * 6.4 - sample.dz * side * 1.6;
        puff.z = sample.z - sample.dz * 6.4 + sample.dx * side * 1.6;
        puff.birth = elapsed;
        puff.driftX = -sample.dx * 0.5 - sample.dz * side * 0.35;
        puff.driftZ = -sample.dz * 0.5 + sample.dx * side * 0.35;
      }
    });
    this.boatMesh.instanceMatrix.needsUpdate = true;
    // 飞桥游艇（VICE S3）：在对应船位渲染游艇（隐藏原船实例色→改为游艇色）。
    if (this.yachtMesh && this.yachtIndices.length) {
      for (let y = 0; y < this.yachtIndices.length; y += 1) {
        const boat = this.boats[this.yachtIndices[y]];
        if (!boat) continue;
        const sample = samplePolyline(boat.path, boat.distance);
        const bob = Math.sin(elapsed * 0.9 + boat.phase) * 0.12;
        this.compose(sample.x, -0.3 + bob, sample.z, Math.atan2(-sample.dz, sample.dx), 1, 1, 1);
        this.yachtMesh.setMatrixAt(y, this.matrix);
      }
      this.yachtMesh.instanceMatrix.needsUpdate = true;
    }
    // 尾迹推进：放大 + 漂移，寿命 2.8s 后藏起。
    let wakesMoved = false;
    for (let index = 0; index < this.wakes.length; index += 1) {
      const puff = this.wakes[index];
      if (puff.birth < 0) continue;
      const age = elapsed - puff.birth;
      if (age > 2.8) {
        puff.birth = -1;
        this.compose(0, -60, 0, 0, 0.0001, 0.0001, 0.0001);
      } else {
        puff.x += puff.driftX * dt;
        puff.z += puff.driftZ * dt;
        this.compose(puff.x, -0.44, puff.z, age * 0.5, 1.1 + age * 2.3, 1, 1.1 + age * 2.3);
      }
      this.wakeMesh.setMatrixAt(index, this.matrix);
      wakesMoved = true;
    }
    if (wakesMoved) this.wakeMesh.instanceMatrix.needsUpdate = true;

    // 云。
    const bounds = this.layout.boundsRadius + 60;
    this.clouds.forEach((cloud, index) => {
      cloud.x += cloud.speed * dt;
      if (cloud.x > bounds) cloud.x = -bounds;
      const blob = 9.5 * cloud.scale;
      this.compose(cloud.x, cloud.y, cloud.z, 0, blob * 1.6, blob * 0.34, blob * 0.8);
      this.cloudMesh.setMatrixAt(index, this.matrix);
    });
    if (this.cloudMesh.visible) this.cloudMesh.instanceMatrix.needsUpdate = true;

    // 异常信标。
    for (const marker of this.anomalyMarkers) {
      marker.mesh.position.y = marker.baseY + Math.sin(elapsed * 1.4 + marker.phase) * 0.6;
      marker.mesh.rotation.y = elapsed * 0.9 + marker.phase;
      marker.mesh.rotation.x = Math.sin(elapsed * 0.7 + marker.phase) * 0.18;
      const pulse = 0.86 + 0.14 * Math.sin(elapsed * 2.6 + marker.phase);
      marker.ring.scale.set(pulse, 1, pulse);
      (marker.ring.material as THREE.MeshBasicMaterial).opacity = 0.32 + 0.3 * (0.5 + 0.5 * Math.sin(elapsed * 2.6 + marker.phase));
    }

    // 悬停/选中环呼吸（透明度脉动，不改 scale——scale 由选中目标决定）。
    const ringPulse = 0.55 + 0.3 * (0.5 + 0.5 * Math.sin(elapsed * 3.2));
    if (this.hoverRing.visible) (this.hoverRing.material as THREE.MeshBasicMaterial).opacity = ringPulse;
    if (this.selectRing.visible) (this.selectRing.material as THREE.MeshBasicMaterial).opacity = 0.6 + 0.3 * (0.5 + 0.5 * Math.sin(elapsed * 2.4));

    return dirty || carsMoved;
  }

  private captureAnimationOrigin(): void {
    for (const car of this.cars) { originOf(car, car.distance); baseSpeedOf(car); }
    for (const boat of this.boats) originOf(boat, boat.distance);
    for (const cloud of this.clouds) originOf(cloud, cloud.x);
    for (const spinner of this.landmarkSpinners) originOf(spinner, spinner.object.rotation[spinner.axis]);
  }

  /** 把所有随帧累加的动画状态放回起点，楼与配套直接落到目标进度（不再有生长插值）。
   *  胶片导出开拍前调用：同一份数据 + seed，任何时候导出都从同一个状态开始。 */
  resetAnimation(): void {
    this.contextProgress.set(this.contextTarget);
    this.writeContext();
    for (const car of this.cars) car.distance = originOf(car, car.distance);
    this.applyCarDensity();
    for (const boat of this.boats) boat.distance = originOf(boat, boat.distance);
    for (const cloud of this.clouds) cloud.x = originOf(cloud, cloud.x);
    for (const spinner of this.landmarkSpinners) spinner.object.rotation[spinner.axis] = originOf(spinner, spinner.object.rotation[spinner.axis]);
    // 每栋都重写一遍实例矩阵（不只是进度变了的）：吊臂角度、信标闪烁等姿态只在楼可见时逐帧写，
    // 楼一旦藏起就停在上一部片子留下的样子——只按进度判脏会漏掉它们。
    for (const runtime of this.runtimes) {
      runtime.cranePhase = runtime.building.seed * Math.PI * 2;
      runtime.display = runtime.target;
      runtime.settled = true;
      this.applyConstruction(runtime, false);
    }
    for (const mesh of [...this.shaftMeshes, ...this.roofProfiles, this.podiumMesh, this.decoCornerMesh, this.decoTrimMesh, this.gardenTreeMesh, this.roofMesh, this.neonMesh, this.scaffoldMesh, this.antennaMesh, this.craneMastMesh, this.craneArmMesh, this.beaconMesh]) {
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (let index = 0; index < this.civicTarget.length; index += 1) {
      if (this.civicProgress[index] === this.civicTarget[index]) continue;
      this.civicProgress[index] = this.civicTarget[index];
      this.writeCivic(index);
    }
  }

  districtAnchor(districtId: string): { x: number; z: number; y: number; radius: number } | null {
    const district = this.layout.districts.find((item) => item.id === districtId);
    return district ? { x: district.center.x, z: district.center.z, y: district.plaza.y, radius: district.radius } : null;
  }

  dispose(): void {
    // 只拆动态层：静态城（地形/基建/车船云）留在模块级缓存，同一 seed 的下一次
    // 重建直接复用；换 seed 时由构造函数统一释放旧缓存。
    this.group.removeFromParent();
    if (staticCityCache && staticCityCache.seed === this.layout.seed) {
      this.group.remove(staticCityCache.group);
    }
    for (const disposable of this.disposables) disposable.dispose();
  }
}
