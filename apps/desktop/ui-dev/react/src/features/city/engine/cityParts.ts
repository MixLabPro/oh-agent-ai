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
import type { CityLayout, DistrictLayout, Vec2 } from "./cityLayout";
import { makeBridgeTexture, makeDistrictTexture, makeFacadeTexture, makeLabelSprite, paletteFor } from "./cityTextures";
import type { TerrainField } from "./cityLayout";

const DAY_MS = 86_400_000;
const BOX = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

export type QualityLevel = 0 | 1 | 2;

type BuildingRuntime = {
  building: CityBuilding;
  slot: Vec2;
  /** 地基海拔：楼底、吊车、选中环的基准 y。 */
  groundY: number;
  paletteWall: THREE.Color;
  display: number;
  target: number;
  district: DistrictLayout;
  shaftPrimary: number;
  shaftUpper: number;
  podium: number;
  roof: number;
  scaffold: number;
  antenna: number;
  beacon: number;
  craneMast: number;
  craneArm: number;
  cranePhase: number;
  blinkPhase: number;
};

/** terrain 非空 → 车贴地行驶；桥面路径 terrain 为空、y 固定。 */
type CarPath = { points: Vec2[]; cumulative: number[]; total: number; y: number; terrain: TerrainField | null };
type Car = { path: CarPath; distance: number; speed: number };

function facadeMaterial(map: THREE.Texture): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ map });
  // 楼层按实例属性拉伸立面纹理的 v 轴：一根 InstancedMesh 搞定所有高度。
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aFloors;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv.y *= aFloors;\n#endif");
  };
  material.customProgramCacheKey = () => "city-facade";
  return material;
}

function polyCumulative(points: Vec2[]): { cumulative: number[]; total: number } {
  const cumulative = [0];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index].x - points[index - 1].x, points[index].z - points[index - 1].z);
    cumulative.push(total);
  }
  return { cumulative, total };
}

function samplePolyline(path: CarPath, distance: number): { x: number; z: number; dx: number; dz: number } {
  const d = ((distance % path.total) + path.total) % path.total;
  let index = 1;
  while (index < path.cumulative.length - 1 && path.cumulative[index] < d) index += 1;
  const segmentStart = path.points[index - 1];
  const segmentEnd = path.points[index];
  const segmentLength = path.cumulative[index] - path.cumulative[index - 1] || 1;
  const t = (d - path.cumulative[index - 1]) / segmentLength;
  return {
    x: segmentStart.x + (segmentEnd.x - segmentStart.x) * t,
    z: segmentStart.z + (segmentEnd.z - segmentStart.z) * t,
    dx: (segmentEnd.x - segmentStart.x) / segmentLength,
    dz: (segmentEnd.z - segmentStart.z) / segmentLength,
  };
}

export class CityParts {
  readonly group = new THREE.Group();
  readonly raycastTargets: THREE.Object3D[] = [];
  readonly water: THREE.Mesh;
  private readonly runtimes: BuildingRuntime[] = [];
  private readonly runtimeById = new Map<string, BuildingRuntime>();
  private readonly shaftMeshes: THREE.InstancedMesh[] = [];
  private readonly shaftIdByInstance: Array<Map<number, string>> = [];
  private readonly disposables: Array<{ dispose: () => void }> = [];
  private readonly podiumMesh: THREE.InstancedMesh;
  private readonly roofMesh: THREE.InstancedMesh;
  private readonly scaffoldMesh: THREE.InstancedMesh;
  private readonly antennaMesh: THREE.InstancedMesh;
  private readonly beaconMesh: THREE.InstancedMesh;
  private readonly craneMastMesh: THREE.InstancedMesh;
  private readonly craneArmMesh: THREE.InstancedMesh;
  private readonly treeMesh: THREE.InstancedMesh;
  private readonly carMesh: THREE.InstancedMesh;
  private readonly boatMesh: THREE.InstancedMesh;
  private readonly cloudMesh: THREE.InstancedMesh;
  private readonly anomalyMarkers: Array<{ mesh: THREE.Mesh; ring: THREE.Mesh; baseY: number; phase: number }> = [];
  private readonly labels: THREE.Sprite[] = [];
  private readonly hoverRing: THREE.Mesh;
  private readonly selectRing: THREE.Mesh;
  private readonly cars: Car[] = [];
  private readonly boats: Array<{ radius: number; angle: number; speed: number; y: number; phase: number }> = [];
  private readonly clouds: Array<{ x: number; z: number; y: number; speed: number; scale: number }> = [];
  private readonly waterUniforms: { uTime: { value: number }; uSun: { value: THREE.Vector3 } };
  private railMaterialCache: THREE.MeshLambertMaterial | null = null;
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly scaleVector = new THREE.Vector3();
  private readonly positionVector = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private cursor = Number.NaN;
  private live = true;
  private labelsVisible = true;
  hoveredId: string | null = null;
  selectedId: string | null = null;

  constructor(private model: CityModel, private layout: CityLayout) {
    const total = model.buildings.length;

    // ── 建筑：立面（3 变体 × [主体+退台] 两段）──────────────────────────
    const facades = [makeFacadeTexture(0, 11), makeFacadeTexture(1, 37), makeFacadeTexture(2, 71)];
    facades.forEach((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      this.disposables.push(texture);
    });
    const facadeCounts = [0, 0, 0];
    for (const building of model.buildings) facadeCounts[building.facade] += building.archetype === "tower" || building.archetype === "landmark" ? 2 : 1;
    facades.forEach((texture, variant) => {
      const capacity = facadeCounts[variant] + 8;
      const geometry = BOX.clone();
      geometry.setAttribute("aFloors", new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1));
      const mesh = new THREE.InstancedMesh(geometry, facadeMaterial(texture), capacity);
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
      this.disposables.push(geometry);
    });

    this.podiumMesh = this.makeInstanced(BOX, new THREE.MeshLambertMaterial({ color: "#e8e2d5" }), total);
    this.roofMesh = this.makeInstanced(BOX, new THREE.MeshLambertMaterial({ color: "#ffffff" }), total);
    this.scaffoldMesh = this.makeInstanced(BOX, new THREE.MeshLambertMaterial({ color: "#e0a83f", transparent: true, opacity: 0.24, depthWrite: false }), total);
    this.scaffoldMesh.castShadow = false;
    this.antennaMesh = this.makeInstanced(new THREE.CylinderGeometry(0.09, 0.16, 1, 5).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: "#5d6470" }), 96);
    this.beaconMesh = this.makeInstanced(new THREE.SphereGeometry(0.32, 8, 6), new THREE.MeshBasicMaterial({ color: "#ffb02e" }), 96);
    this.craneMastMesh = this.makeInstanced(new THREE.BoxGeometry(0.5, 1, 0.5).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: "#e8b73f" }), 48);
    this.craneArmMesh = this.makeInstanced(new THREE.BoxGeometry(1, 0.32, 0.32), new THREE.MeshLambertMaterial({ color: "#e8b73f" }), 48);

    // ── 地形：岛 / 桥 / 树 ────────────────────────────────────────────
    this.buildIslands();
    this.buildBridges();
    this.treeMesh = this.buildTrees();

    // ── 生命感：车 / 船 / 云 ───────────────────────────────────────────
    const carResult = this.buildCars();
    this.carMesh = carResult.mesh;
    this.cars.push(...carResult.cars);
    const boatResult = this.buildBoats();
    this.boatMesh = boatResult.mesh;
    this.boats.push(...boatResult.boats);
    const cloudResult = this.buildClouds();
    this.cloudMesh = cloudResult.mesh;
    this.clouds.push(...cloudResult.clouds);

    // ── 异常信标 & 标签 & 选中环 ───────────────────────────────────────
    this.buildAnomalyMarkers();
    this.hoverRing = this.makeGroundRing("#087f62");
    this.selectRing = this.makeGroundRing("#c96f4a");

    this.water = this.buildWater();
    this.waterUniforms = (this.water.material as THREE.ShaderMaterial).uniforms as unknown as {
      uTime: { value: number };
      uSun: { value: THREE.Vector3 };
    };

    this.buildRuntimes();
    this.buildLabels();
  }

  private makeInstanced(geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(capacity, 1));
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.disposables.push(geometry);
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

  /** 地形 mesh：高度场位移的 PlaneGeometry；UV 与区纹理的世界映射严格一致。 */
  private buildIslands(): void {
    for (const district of this.layout.districts) {
      const extent = district.radius * 2.72;
      const segments = 128;
      const geometry = new THREE.PlaneGeometry(extent, extent, segments, segments).rotateX(-Math.PI / 2);
      const position = geometry.attributes.position as THREE.BufferAttribute;
      for (let index = 0; index < position.count; index += 1) {
        const worldX = district.center.x + position.getX(index);
        const worldZ = district.center.z + position.getZ(index);
        position.setXYZ(index, worldX, district.terrain.height(worldX, worldZ), worldZ);
      }
      geometry.computeVertexNormals();
      const texture = makeDistrictTexture(district, paletteFor(district.id));
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.MeshLambertMaterial({ map: texture });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.disposables.push(geometry, material, texture);
    }
    // 装饰远山：同源高度场 + 顶点色（无纹理，省 3 张 canvas）。
    for (const mountain of this.layout.decorMountains) {
      const extent = mountain.radius * 2.72;
      const segments = 96;
      const geometry = new THREE.PlaneGeometry(extent, extent, segments, segments).rotateX(-Math.PI / 2);
      const position = geometry.attributes.position as THREE.BufferAttribute;
      const colors = new Float32Array(position.count * 3);
      const sea = new THREE.Color("#7ba9b0");
      const beach = new THREE.Color("#e7dcb4");
      const grass = new THREE.Color("#b4c8a0");
      const rock = new THREE.Color("#b8b2a4");
      const high = new THREE.Color("#d8d2c6");
      const tint = new THREE.Color();
      for (let index = 0; index < position.count; index += 1) {
        const worldX = mountain.center.x + position.getX(index);
        const worldZ = mountain.center.z + position.getZ(index);
        const h = mountain.terrain.height(worldX, worldZ);
        position.setXYZ(index, worldX, h, worldZ);
        if (h < 0.4) tint.copy(sea).lerp(beach, Math.max(0, (h + 1) / 1.4));
        else if (h < 3.5) tint.copy(beach).lerp(grass, (h - 0.4) / 3.1);
        else if (h < 9) tint.copy(grass).lerp(rock, (h - 3.5) / 5.5);
        else tint.copy(rock).lerp(high, Math.min(1, (h - 9) / 8));
        colors[index * 3] = tint.r;
        colors[index * 3 + 1] = tint.g;
        colors[index * 3 + 2] = tint.b;
      }
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geometry.computeVertexNormals();
      const material = new THREE.MeshLambertMaterial({ vertexColors: true });
      const mesh = new THREE.Mesh(geometry, material);
      this.group.add(mesh);
      this.disposables.push(geometry, material);
    }
  }

  private buildBridges(): void {
    // 河上小桥：河中段一架，连接两岸（贴岸高度）。
    for (const district of this.layout.districts) {
      if (!district.river || district.river.length < 6) continue;
      const mid = district.river[Math.floor(district.river.length * 0.46)];
      const next = district.river[Math.floor(district.river.length * 0.46) + 1];
      const tangent = { x: next.x - mid.x, z: next.z - mid.z };
      const tangentLength = Math.hypot(tangent.x, tangent.z) || 1;
      const normal = { x: -tangent.z / tangentLength, z: tangent.x / tangentLength };
      const halfSpan = district.riverHalfWidth * 2.9;
      const bankA = { x: mid.x + normal.x * halfSpan, z: mid.z + normal.z * halfSpan };
      const bankB = { x: mid.x - normal.x * halfSpan, z: mid.z - normal.z * halfSpan };
      const deckY = Math.max(district.terrain.height(bankA.x, bankA.z), district.terrain.height(bankB.x, bankB.z)) + 0.34;
      const span = halfSpan * 2;
      const angle = Math.atan2(bankB.z - bankA.z, bankB.x - bankA.x);
      const deckGeometry = new THREE.BoxGeometry(span + 1.4, 0.42, 2.6);
      const deck = new THREE.Mesh(deckGeometry, this.railMaterialCache ??= new THREE.MeshLambertMaterial({ color: "#cfc9bb" }));
      deck.position.set((bankA.x + bankB.x) / 2, deckY, (bankA.z + bankB.z) / 2);
      deck.rotation.y = -angle;
      deck.castShadow = true;
      this.group.add(deck);
      this.disposables.push(deckGeometry);
      for (const offset of [-1.2, 1.2]) {
        const railGeometry = new THREE.BoxGeometry(span + 1.4, 0.3, 0.18);
        const rail = new THREE.Mesh(railGeometry, deck.material as THREE.Material);
        rail.position.copy(deck.position);
        rail.position.y += 0.32;
        rail.rotation.copy(deck.rotation);
        rail.translateZ(offset);
        this.group.add(rail);
        this.disposables.push(railGeometry);
      }
    }
    const texture = makeBridgeTexture();
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.repeat.set(3, 1);
    this.disposables.push(texture);
    const deckMaterial = new THREE.MeshLambertMaterial({ map: texture });
    const railMaterial = new THREE.MeshLambertMaterial({ color: "#cfc9bb" });
    this.disposables.push(deckMaterial, railMaterial);
    const [mainDistrict, ...satellites] = this.layout.districts;
    for (const bridge of this.layout.bridges) {
      // 桥面高程取两端地形高度的平均，桥台加大埋入岸坡，消除悬空。
      const fromY = mainDistrict.terrain.height(bridge.from.x, bridge.from.z);
      const district = satellites.find((item) => Math.hypot(item.center.x - bridge.to.x, item.center.z - bridge.to.z) < item.radius + 6) ?? mainDistrict;
      const toY = district.terrain.height(bridge.to.x, bridge.to.z);
      const deckY = Math.max(0.55, (fromY + toY) / 2 + 0.32);
      const deckGeometry = new THREE.BoxGeometry(bridge.length + 3.2, 0.95, 4.2);
      const deck = new THREE.Mesh(deckGeometry, deckMaterial);
      deck.position.set((bridge.from.x + bridge.to.x) / 2, deckY, (bridge.from.z + bridge.to.z) / 2);
      deck.rotation.y = -bridge.angle;
      deck.castShadow = true;
      deck.receiveShadow = true;
      this.group.add(deck);
      this.disposables.push(deckGeometry);
      for (const offset of [-2.0, 2.0]) {
        const railGeometry = new THREE.BoxGeometry(bridge.length + 3.2, 0.42, 0.26);
        const rail = new THREE.Mesh(railGeometry, railMaterial);
        rail.position.copy(deck.position);
        rail.position.y += 0.5;
        rail.rotation.copy(deck.rotation);
        rail.translateZ(offset);
        rail.castShadow = true;
        this.group.add(rail);
        this.disposables.push(railGeometry);
      }
      for (const [end, endY] of [[bridge.from, fromY], [bridge.to, toY]] as Array<[Vec2, number]>) {
        const abutGeometry = new THREE.BoxGeometry(4.6, Math.max(3.2, deckY - endY + 2.6), 5.4);
        const abut = new THREE.Mesh(abutGeometry, railMaterial);
        abut.position.set(end.x, endY - 0.9, end.z);
        abut.rotation.y = -bridge.angle;
        this.group.add(abut);
        this.disposables.push(abutGeometry);
      }
    }
  }

  private buildTrees(): THREE.InstancedMesh {
    const spots: Array<{ x: number; z: number; y: number; seed: number }> = [];
    for (const district of this.layout.districts) spots.push(...district.trees);
    const trunk = new THREE.CylinderGeometry(0.14, 0.2, 0.9, 5).translate(0, 0.45, 0);
    const crown = new THREE.IcosahedronGeometry(0.78, 0).translate(0, 1.35, 0);
    const trunkColor = new THREE.Color("#8a6a4c");
    const crownColor = new THREE.Color("#6f9d63");
    const colors = new Float32Array(trunk.getAttribute("position").count * 3 + crown.getAttribute("position").count * 3);
    let offset = 0;
    for (let index = 0; index < trunk.getAttribute("position").count; index += 1) {
      colors[offset++] = trunkColor.r;
      colors[offset++] = trunkColor.g;
      colors[offset++] = trunkColor.b;
    }
    for (let index = 0; index < crown.getAttribute("position").count; index += 1) {
      colors[offset++] = crownColor.r;
      colors[offset++] = crownColor.g;
      colors[offset++] = crownColor.b;
    }
    const treeGeometry = mergeGeometries([trunk, crown]);
    treeGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.InstancedMesh(treeGeometry, material, Math.max(spots.length, 1));
    mesh.castShadow = true;
    spots.forEach((spot, index) => {
      const scale = 0.8 + spot.seed * 0.9;
      this.compose(spot.x, spot.y - 0.1, spot.z, spot.seed * Math.PI * 2, scale, scale, scale);
      mesh.setMatrixAt(index, this.matrix);
    });
    mesh.count = spots.length;
    this.group.add(mesh);
    this.disposables.push(treeGeometry, material, trunk, crown);
    return mesh;
  }

  private buildCars(): { mesh: THREE.InstancedMesh; cars: Car[] } {
    const paths: CarPath[] = [];
    for (const district of this.layout.districts) {
      for (const path of district.carPaths) {
        const { cumulative, total } = polyCumulative(path);
        paths.push({ points: path, cumulative, total, y: 0.08, terrain: district.terrain });
      }
    }
    for (const bridge of this.layout.bridges) {
      const points = [bridge.from, bridge.to, bridge.from];
      const { cumulative, total } = polyCumulative(points);
      paths.push({ points, cumulative, total, y: 0.5, terrain: null });
    }
    const cars: Car[] = [];
    paths.forEach((path, pathIndex) => {
      const count = Math.min(18, Math.max(4, Math.round(path.total / 16)));
      for (let index = 0; index < count; index += 1) {
        const seed = hashSeed(`car:${pathIndex}:${index}`);
        cars.push({ path, distance: (index / count) * path.total + seed * 5, speed: 6.5 + seed * 6 });
      }
    });
    const carColors = ["#f8f5ec", "#c96f4a", "#4d7ca8", "#3f8f7a", "#d8a13c", "#8d5a5a"];
    const geometry = new THREE.BoxGeometry(4.2, 1.3, 1.9).translate(0, 0.65, 0);
    const material = new THREE.MeshLambertMaterial({ color: "#ffffff" });
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(cars.length, 1));
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    cars.forEach((car, index) => {
      const tint = carColors[Math.floor(hashSeed(`carc:${index}`) * carColors.length)];
      mesh.setColorAt(index, this.color.set(tint));
    });
    mesh.count = cars.length;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.disposables.push(geometry, material);
    return { mesh, cars };
  }

  private buildBoats(): { mesh: THREE.InstancedMesh; boats: Array<{ radius: number; angle: number; speed: number; y: number; phase: number }> } {
    const boats: Array<{ radius: number; angle: number; speed: number; y: number; phase: number }> = [];
    this.layout.boatLanes.forEach((lane, laneIndex) => {
      const count = 2 + (laneIndex % 2);
      for (let index = 0; index < count; index += 1) {
        boats.push({
          radius: lane.radius + (hashSeed(`br:${laneIndex}:${index}`) - 0.5) * 6,
          angle: lane.phase + (index / count) * Math.PI * 2,
          speed: lane.speed * (0.8 + hashSeed(`bs:${laneIndex}:${index}`) * 0.5),
          y: -0.22,
          phase: hashSeed(`bp:${laneIndex}:${index}`) * Math.PI * 2,
        });
      }
    });
    const hull = new THREE.BoxGeometry(6.4, 1.1, 2.2).translate(0, 0.55, 0);
    const cabin = new THREE.BoxGeometry(2.4, 1.0, 1.6).translate(0.8, 1.6, 0);
    const geometry = mergeGeometries([hull, cabin]);
    const material = new THREE.MeshLambertMaterial({ color: "#f2efe6" });
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(boats.length, 1));
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    boats.forEach((boat, index) => {
      mesh.setColorAt(index, this.color.set(index % 3 === 0 ? "#c96f4a" : index % 3 === 1 ? "#5d7f9a" : "#e8e2d5"));
    });
    mesh.count = boats.length;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.disposables.push(geometry, material, hull, cabin);
    return { mesh, boats };
  }

  private buildClouds(): { mesh: THREE.InstancedMesh; clouds: Array<{ x: number; z: number; y: number; speed: number; scale: number }> } {
    const clouds: Array<{ x: number; z: number; y: number; speed: number; scale: number }> = [];
    const bounds = this.layout.boundsRadius + 40;
    for (let index = 0; index < 12; index += 1) {
      const seed = hashSeed(`cloud:${index}`);
      clouds.push({
        x: (seed - 0.5) * bounds * 2,
        z: (hashSeed(`cz:${index}`) - 0.5) * bounds * 2,
        y: 104 + seed * 44,
        speed: 0.65 + seed * 0.7,
        scale: 1 + seed * 1.4,
      });
    }
    const geometry = new THREE.SphereGeometry(1, 8, 6);
    const material = new THREE.MeshLambertMaterial({ color: "#ffffff", transparent: true, opacity: 0.88, fog: false });
    const mesh = new THREE.InstancedMesh(geometry, material, clouds.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    clouds.forEach((cloud, index) => {
      const blob = 9.5 * cloud.scale;
      this.compose(cloud.x, cloud.y, cloud.z, 0, blob * 1.6, blob * 0.34, blob * 0.8);
      mesh.setMatrixAt(index, this.matrix);
    });
    mesh.count = clouds.length;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.disposables.push(geometry, material);
    return { mesh, clouds };
  }

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
      const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
      const sprite = new THREE.Sprite(material);
      const height = 6.4;
      sprite.scale.set(height * aspect, height, 1);
      sprite.renderOrder = 20;
      sprite.position.set(district.center.x, district.plaza.y + district.radius * 0.5 + 21, district.center.z);
      this.group.add(sprite);
      this.labels.push(sprite);
      this.disposables.push(material, texture);
    }
  }

  private buildWater(): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(2600, 2600, 1, 1).rotateX(-Math.PI / 2);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSun: { value: new THREE.Vector3(0.55, 0.75, 0.36).normalize() },
        uDeep: { value: new THREE.Color("#57a3b4") },
        uShallow: { value: new THREE.Color("#a5d6da") },
        uSky: { value: new THREE.Color("#dff0f2") },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uSun;
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        uniform vec3 uSky;
        varying vec3 vWorld;
        float wave(vec2 p, float t) {
          float h = sin(p.x * 0.09 + t * 0.8) * cos(p.y * 0.075 - t * 0.6) * 0.5;
          h += sin((p.x + p.y) * 0.16 + t * 1.1) * 0.28;
          h += sin((p.x * 0.6 - p.y * 0.8) * 0.23 - t * 0.9) * 0.18;
          return h;
        }
        void main() {
          vec2 p = vWorld.xz;
          float e = 0.65;
          float h0 = wave(p, uTime);
          float hx = wave(p + vec2(e, 0.0), uTime);
          float hz = wave(p + vec2(0.0, e), uTime);
          vec3 n = normalize(vec3((h0 - hx) * 1.8, e * 1.7, (h0 - hz) * 1.8));
          vec3 view = normalize(cameraPosition - vWorld);
          float fresnel = pow(1.0 - max(dot(n, view), 0.0), 2.4);
          vec3 base = mix(uShallow, uDeep, clamp(length(p) / 420.0, 0.0, 1.0));
          vec3 color = mix(base, uSky, fresnel * 0.6);
          float specular = pow(max(dot(reflect(-normalize(uSun), n), view), 0.0), 64.0);
          color += vec3(1.0, 0.97, 0.88) * specular * 1.05;
          color += vec3(0.05) * smoothstep(0.5, 0.95, h0);
          // 碎波光：高频相位格在波峰处闪，俯视也有“粼粼”质感。
          vec2 cell = floor(p * 1.35);
          float sparkle = sin(dot(cell, vec2(127.1, 311.7)) + uTime * 2.2) * 0.5 + 0.5;
          sparkle = pow(sparkle, 7.0) * smoothstep(0.35, 0.9, h0);
          color += vec3(1.0, 0.99, 0.92) * sparkle * 0.5;
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = -0.55;
    this.disposables.push(geometry, material);
    return mesh;
  }

  private buildRuntimes(): void {
    const districtsById = new Map(this.layout.districts.map((district) => [district.id, district]));
    let podiumCount = 0;
    let roofCount = 0;
    let scaffoldCount = 0;
    let antennaCount = 0;
    let beaconCount = 0;
    let craneCount = 0;
    const shaftCursor = [0, 0, 0];

    const ordered = [...this.model.buildings].sort((left, right) => left.startedAt - right.startedAt);
    for (const building of ordered) {
      const district = districtsById.get(building.districtId);
      const slot = district?.slots.get(building.id);
      if (!district || !slot) continue;
      const palette = paletteFor(building.districtId);
      const runtime: BuildingRuntime = {
        building,
        slot,
        groundY: district.grounds.get(building.id) ?? 0,
        paletteWall: new THREE.Color(palette.wall).multiplyScalar(0.92 + building.seed * 0.16),
        display: 0,
        target: building.builtFraction,
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
        blinkPhase: hashSeed(`blink:${building.id}`) * Math.PI * 2,
      };

      const mesh = this.shaftMeshes[building.facade];
      const instanceMap = this.shaftIdByInstance[building.facade];
      const wantsUpper = building.archetype === "tower" || building.archetype === "landmark";
      runtime.shaftPrimary = shaftCursor[building.facade];
      mesh.setColorAt(runtime.shaftPrimary, runtime.paletteWall);
      (mesh.geometry.getAttribute("aFloors") as THREE.InstancedBufferAttribute).setX(runtime.shaftPrimary, Math.max(2, Math.round(building.height / 3.1)));
      instanceMap.set(runtime.shaftPrimary, building.id);
      shaftCursor[building.facade] += 1;
      if (wantsUpper) {
        runtime.shaftUpper = shaftCursor[building.facade];
        mesh.setColorAt(runtime.shaftUpper, runtime.paletteWall.clone().multiplyScalar(0.94));
        (mesh.geometry.getAttribute("aFloors") as THREE.InstancedBufferAttribute).setX(runtime.shaftUpper, Math.max(2, Math.round((building.height * 0.28) / 3.1)));
        instanceMap.set(runtime.shaftUpper, building.id);
        shaftCursor[building.facade] += 1;
      }

      const needsPodium = building.archetype !== "tower" && building.archetype !== "landmark";
      if (needsPodium) {
        runtime.podium = podiumCount;
        this.podiumMesh.setColorAt(podiumCount, runtime.paletteWall.clone().multiplyScalar(0.88));
        podiumCount += 1;
      }
      runtime.roof = roofCount;
      this.roofMesh.setColorAt(roofCount, new THREE.Color(palette.roof).multiplyScalar(0.94 + building.seed * 0.12));
      roofCount += 1;
      runtime.scaffold = scaffoldCount;
      scaffoldCount += 1;
      if (building.archetype === "landmark" && antennaCount < 94) {
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

    this.shaftMeshes.forEach((mesh, variant) => {
      mesh.count = shaftCursor[variant];
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
    this.podiumMesh.count = podiumCount;
    if (this.podiumMesh.instanceColor) this.podiumMesh.instanceColor.needsUpdate = true;
    this.roofMesh.count = roofCount;
    if (this.roofMesh.instanceColor) this.roofMesh.instanceColor.needsUpdate = true;
    this.scaffoldMesh.count = scaffoldCount;
    this.antennaMesh.count = antennaCount;
    this.beaconMesh.count = beaconCount;
    this.craneMastMesh.count = craneCount;
    this.craneArmMesh.count = craneCount;

    for (const runtime of this.runtimes) this.applyConstruction(runtime, true);
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
    const split = building.archetype === "tower" || building.archetype === "landmark" ? 0.72 : 1;
    const podiumHeight = runtime.podium >= 0 ? Math.min(built, 1.5) : 0;

    let widths: [number, number];
    if (building.archetype === "slab") widths = [fp * 1.3, fp * 0.58];
    else if (building.archetype === "block") widths = [fp * 1.2, fp * 0.85];
    else if (building.archetype === "tower" || building.archetype === "landmark") widths = [fp * 0.86, fp * 0.55];
    else widths = [fp, fp];

    // 楼体朝向：以广场为参照的切向 + hash 抖动，破除正交网格感。
    const yaw = Math.atan2(z - runtime.district.plaza.z, x - runtime.district.plaza.x) + Math.PI / 2 + (building.seed - 0.5) * 0.5;
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
      this.shaftMeshes[building.facade].setMatrixAt(runtime.shaftPrimary, this.matrix);
    }
    // 退台段（tower/landmark）。
    if (runtime.shaftUpper >= 0) {
      const upperHeight = Math.max(0, built - h * split);
      if (upperHeight < 0.15) {
        this.compose(x, -40, z, 0, 0, 0, 0);
      } else {
        this.compose(x, g + h * split, z, yaw, widths[0] * 0.72, upperHeight, widths[1] * 0.72);
      }
      this.shaftMeshes[building.facade].setMatrixAt(runtime.shaftUpper, this.matrix);
    }
    if (runtime.podium >= 0) {
      this.compose(x, g, z, 0, fp * 1.16, podiumHeight > 0.1 ? podiumHeight : 0, fp * 1.16);
      this.podiumMesh.setMatrixAt(runtime.podium, this.matrix);
    }
    if (runtime.roof >= 0) {
      const roofY = g + Math.max(0.4, built - 0.18);
      const roofWidth = runtime.shaftUpper >= 0 && built > h * split ? widths[0] * 0.78 : widths[0] * 1.06;
      const roofDepth = runtime.shaftUpper >= 0 && built > h * split ? widths[1] * 0.78 : widths[1] * 1.06;
      this.compose(x, roofY, z, 0, roofWidth, 0.34, roofDepth);
      this.roofMesh.setMatrixAt(runtime.roof, this.matrix);
    }
    // 脚手架：包住"计划高度"的剩余部分——楼还没到的地方先看见壳。
    if (runtime.scaffold >= 0) {
      const remaining = h - built;
      if (fraction < 0.985 && remaining > 0.6) {
        this.compose(x, g + built, z, 0, widths[0] * 1.14, remaining, widths[1] * 1.14);
      } else {
        this.compose(x, -40, z, 0, 0, 0, 0);
      }
      this.scaffoldMesh.setMatrixAt(runtime.scaffold, this.matrix);
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
      const cornerX = x + fp * 0.72;
      const cornerZ = z + fp * 0.72;
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
    this.compose(centerX, groundY + mastHeight + 0.1, centerZ, -angle, armLength, 1, 1);
    this.craneArmMesh.setMatrixAt(runtime.craneArm, this.matrix);
  }

  private hideAll(runtime: BuildingRuntime): void {
    this.compose(0, -40, 0, 0, 0, 0, 0);
    const building = runtime.building;
    if (runtime.shaftPrimary >= 0) this.shaftMeshes[building.facade].setMatrixAt(runtime.shaftPrimary, this.matrix);
    if (runtime.shaftUpper >= 0) this.shaftMeshes[building.facade].setMatrixAt(runtime.shaftUpper, this.matrix);
    if (runtime.podium >= 0) this.podiumMesh.setMatrixAt(runtime.podium, this.matrix);
    if (runtime.roof >= 0) this.roofMesh.setMatrixAt(runtime.roof, this.matrix);
    if (runtime.scaffold >= 0) this.scaffoldMesh.setMatrixAt(runtime.scaffold, this.matrix);
    if (runtime.antenna >= 0) this.antennaMesh.setMatrixAt(runtime.antenna, this.matrix);
    if (runtime.beacon >= 0) this.beaconMesh.setMatrixAt(runtime.beacon, this.matrix);
    if (runtime.craneMast >= 0) {
      this.craneMastMesh.setMatrixAt(runtime.craneMast, this.matrix);
      this.craneArmMesh.setMatrixAt(runtime.craneArm, this.matrix);
    }
  }

  applyCursor(cursor: number, live: boolean): void {
    this.cursor = cursor;
    this.live = live;
    for (const runtime of this.runtimes) {
      runtime.target = builtFractionAt(runtime.building, cursor, live);
      if (live && runtime.building.active) runtime.target = Math.max(runtime.target, runtime.building.builtFraction);
    }
  }

  setQualityLevel(level: QualityLevel): void {
    this.cloudMesh.visible = level >= 1;
    const keep = level >= 1 ? 1 : 0.5;
    const visibleCars = Math.floor(this.cars.length * keep);
    this.cars.forEach((car, index) => {
      car.speed = index < visibleCars ? car.speed : 0;
    });
  }

  setLabelsVisible(visible: boolean): void {
    this.labelsVisible = visible;
    for (const label of this.labels) label.visible = visible;
  }

  idAt(mesh: THREE.Object3D, instanceId: number): string | null {
    const index = this.shaftMeshes.indexOf(mesh as THREE.InstancedMesh);
    if (index < 0) return null;
    return this.shaftIdByInstance[index].get(instanceId) ?? null;
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

    let dirty = false;
    const rate = Math.min(1, dt * 1.35);
    for (const runtime of this.runtimes) {
      if (Math.abs(runtime.display - runtime.target) > 0.0012) {
        runtime.display += (runtime.target - runtime.display) * rate;
        this.applyConstruction(runtime, false);
        dirty = true;
      } else if (runtime.display !== runtime.target) {
        runtime.display = runtime.target;
        this.applyConstruction(runtime, false);
        dirty = true;
      }
    }
    if (dirty || Number.isNaN(this.cursor)) {
      for (const mesh of this.shaftMeshes) mesh.instanceMatrix.needsUpdate = true;
      this.podiumMesh.instanceMatrix.needsUpdate = true;
      this.roofMesh.instanceMatrix.needsUpdate = true;
      this.scaffoldMesh.instanceMatrix.needsUpdate = true;
      this.antennaMesh.instanceMatrix.needsUpdate = true;
      this.craneMastMesh.instanceMatrix.needsUpdate = true;
    }

    // 吊车臂：活跃楼的节奏 = 繁忙度。
    for (const runtime of this.runtimes) {
      if (runtime.craneArm < 0 || runtime.display <= 0.002) continue;
      const spin = (0.25 + runtime.building.busyness * 0.85) * dt;
      runtime.cranePhase += spin;
      const mastHeight = runtime.building.height * 1.02 + 6.5;
      const cornerX = runtime.slot.x + runtime.building.footprint * 0.72;
      const cornerZ = runtime.slot.z + runtime.building.footprint * 0.72;
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
      const sample = samplePolyline(car.path, car.distance);
      const y = car.path.terrain ? car.path.terrain.height(sample.x, sample.z) + car.path.y : car.path.y;
      this.compose(sample.x, y, sample.z, Math.atan2(-sample.dz, sample.dx), 1, 1, 1);
      this.carMesh.setMatrixAt(index, this.matrix);
      carsMoved = true;
    });
    if (carsMoved) this.carMesh.instanceMatrix.needsUpdate = true;

    // 船只。
    this.boats.forEach((boat, index) => {
      boat.angle += boat.speed * dt;
      const x = Math.cos(boat.angle) * boat.radius;
      const z = Math.sin(boat.angle) * boat.radius;
      const bob = Math.sin(elapsed * 0.9 + boat.phase) * 0.12;
      const heading = boat.angle + (boat.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
      this.compose(x, boat.y + bob, z, heading, 1, 1, 1);
      this.boatMesh.setMatrixAt(index, this.matrix);
    });
    this.boatMesh.instanceMatrix.needsUpdate = true;

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

  districtAnchor(districtId: string): { x: number; z: number; y: number; radius: number } | null {
    const district = this.layout.districts.find((item) => item.id === districtId);
    return district ? { x: district.center.x, z: district.center.z, y: district.plaza.y, radius: district.radius } : null;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const disposable of this.disposables) disposable.dispose();
  }
}

/** 简易几何合并（部件都是 position/normal/uv 布局，不值得引 utils）。 */
function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "uv"] as const) {
    const first = geometries[0].getAttribute(name);
    if (!first) continue;
    const combined = new Float32Array(geometries.reduce((sum, geometry) => sum + (geometry.getAttribute(name)?.array.length ?? 0), 0));
    let offset = 0;
    for (const geometry of geometries) {
      const attribute = geometry.getAttribute(name);
      if (!attribute) continue;
      combined.set(attribute.array as Float32Array, offset);
      offset += attribute.array.length;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(combined, first.itemSize));
  }
  const indices: number[] = [];
  let vertexOffset = 0;
  for (const geometry of geometries) {
    if (geometry.index) {
      for (const index of geometry.index.array as unknown as number[]) indices.push(index + vertexOffset);
    } else {
      for (let index = 0; index < geometry.getAttribute("position").count; index += 1) indices.push(index + vertexOffset);
    }
    vertexOffset += geometry.getAttribute("position").count;
  }
  merged.setIndex(indices);
  return merged;
}
