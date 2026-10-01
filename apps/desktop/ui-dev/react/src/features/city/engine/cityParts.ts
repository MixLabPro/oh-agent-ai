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
import { fbm } from "./cityNoise";
import type { CityLayout, DistrictLayout, Parcel, Vec2 } from "./cityLayout";
import { activeTheme } from "./cityTheme";
import { makeCityTexture, makeFacadeTexture, makeLabelSprite, paletteFor } from "./cityTextures";
import type { TerrainField } from "./cityLayout";

const BOX = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
/** 单位圆柱（半径 1、高 1、底面为原点）：sx/sz 当半径、sy 当高度。 */
const CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 14).translate(0, 0.5, 0);

export type QualityLevel = 0 | 1 | 2;

type BuildingRuntime = {
  building: CityBuilding;
  slot: Parcel;
  /** 渲染立面（地块分区驱动，覆盖模型层 hash）。 */
  facade: number;
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
  /** 吊车立柱的世界坐标：applyConstruction 按地块 yaw 与楼宽算出，逐帧的吊臂旋转复用同一份。 */
  craneX: number;
  craneZ: number;
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
  private zoneById: Map<string, string> = new Map();
  private readonly shaftIdByInstance: Array<Map<number, string>> = [];
  private readonly disposables: Array<{ dispose: () => void }> = [];
  private readonly podiumMesh: THREE.InstancedMesh;
  private readonly roofMesh: THREE.InstancedMesh;
  /** 屋顶霓虹描边：比屋顶略大的自发光薄板，露出的一圈即霓虹；仅日落主题。 */
  private readonly neonMesh: THREE.InstancedMesh;
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
  private readonly boats: Array<{ path: CarPath; distance: number; speed: number; phase: number }> = [];
  private readonly clouds: Array<{ x: number; z: number; y: number; speed: number; scale: number }> = [];
  private readonly waterUniforms: { uTime: { value: number }; uSun: { value: THREE.Vector3 } };
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
    // 立面由地块分区驱动：市中心玻璃幕墙 / 商业横带 / 居住窗洞。
    const zoneById = new Map<string, string>();
    for (const district of this.layout.districts) {
      for (const [id, parcel] of district.slots) zoneById.set(id, parcel.zone);
    }
    this.zoneById = zoneById;
    const facadeCounts = [0, 0, 0];
    for (const building of model.buildings) {
      if (!zoneById.has(building.id)) continue;
      facadeCounts[this.facadeFor(building)] += building.archetype === "tower" || building.archetype === "landmark" ? 2 : 1;
    }
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
      this.disposables.push(geometry, mesh.material);
    });

    this.podiumMesh = this.makeInstanced(BOX, new THREE.MeshLambertMaterial({ color: "#e8e2d5" }), total);
    this.roofMesh = this.makeInstanced(BOX, new THREE.MeshLambertMaterial({ color: "#ffffff" }), total);
    this.neonMesh = this.makeInstanced(BOX, new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }), total);
    this.neonMesh.castShadow = false;
    this.scaffoldMesh = this.makeInstanced(BOX, new THREE.MeshLambertMaterial({ color: "#e0a83f", transparent: true, opacity: 0.24, depthWrite: false }), total);
    this.scaffoldMesh.castShadow = false;
    this.antennaMesh = this.makeInstanced(new THREE.CylinderGeometry(0.09, 0.16, 1, 5).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: "#5d6470" }), 96);
    this.beaconMesh = this.makeInstanced(new THREE.SphereGeometry(0.32, 8, 6), new THREE.MeshBasicMaterial({ color: "#ffb02e" }), 96);
    this.craneMastMesh = this.makeInstanced(new THREE.BoxGeometry(0.85, 1, 0.85).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: "#ffb400", emissive: "#6b4300" }), 48);
    this.craneArmMesh = this.makeInstanced(new THREE.BoxGeometry(1, 0.32, 0.32), new THREE.MeshLambertMaterial({ color: "#ffb400", emissive: "#6b4300" }), 48);

    // ── 地形：岛 / 桥 / 树 / 背景楼群 / 远山 ──────────────────────────
    this.buildTerrain();
    this.buildInfrastructure();
    this.buildDistrictExpressways();
    this.buildPublicSites();
    this.buildMassing();
    this.buildSeaMountains();
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

  /** 地形 mesh：高度场位移的 PlaneGeometry；UV 与区纹理的世界映射严格一致。 */
  private buildTerrain(): void {
    {
      const extent = this.layout.extent;
      const segments = 192;
      const geometry = new THREE.PlaneGeometry(extent, extent, segments, segments).rotateX(-Math.PI / 2);
      const position = geometry.attributes.position as THREE.BufferAttribute;
      for (let index = 0; index < position.count; index += 1) {
        const worldX = position.getX(index);
        const worldZ = position.getZ(index);
        position.setXYZ(index, worldX, this.layout.terrain.height(worldX, worldZ), worldZ);
      }
      geometry.computeVertexNormals();
      const texture = makeCityTexture(this.layout);
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.MeshLambertMaterial({ map: texture });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.disposables.push(geometry, material, texture);
    }
  }

  /** Batched city furniture and waterfront infrastructure, not selectable data. */
  private buildInfrastructure(): void {
    type Part = { x: number; y: number; z: number; sx: number; sy: number; sz: number; color: string; tilt?: number };
    const parts: Part[] = [];
    const add = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, tilt = 0) => parts.push({ x, y, z, sx, sy, sz, color, tilt });
    // Curbs and street lights are real geometry; asphalt and markings share the atlas.
    for (const edge of this.layout.roadEdges) {
      // 过河的桥路段没有桥面可依附：路缘石/路灯会悬在水面上，像河里一排排虚线。
      if (edge.bridge) continue;
      const [a, b] = edge.points;
      const horizontal = a.z === b.z;
      const length = Math.hypot(b.x - a.x, b.z - a.z) - 11;
      const x = (a.x + b.x) / 2; const z = (a.z + b.z) / 2;
      for (const side of [-1, 1]) {
        const offset = side * (edge.width / 2 + 0.25);
        add(x + (horizontal ? 0 : offset), 1.22, z + (horizontal ? offset : 0), horizontal ? length : 0.35, 0.18, horizontal ? 0.35 : length, "#cbc6ba");
      }
      if (edge.kind === "arterial") {
        const lx = x + (horizontal ? 0 : edge.width / 2 + 0.9);
        const lz = z + (horizontal ? edge.width / 2 + 0.9 : 0);
        add(lx, 1.2, lz, 0.2, 4.5, 0.2, "#697477");
        add(lx, 5.65, lz, horizontal ? 0.3 : 1.6, 0.2, horizontal ? 1.6 : 0.3, "#d8d3b8");
      }
    }
    const { left, right, north, south } = this.layout.urbanBounds;
    const highwayZ = north - 12;
    const highwayWidth = right - left + 36;
    // 北环高架只铺在「陆地/河面上、且地形低于桥面」的路段：原先整条直线铺满，
    // 在北侧山体里被埋、出海岸线后又悬在海上（断头桥）。
    const terrain = this.layout.terrain;
    const ringStep = 9;
    const samples: Array<{ x: number; land: boolean; low: boolean }> = [];
    for (let x = left - 18; x <= right + 18; x += ringStep) {
      const h = terrain.height(x, highwayZ);
      samples.push({ x, land: h >= -0.3, low: h < 4.8 });
    }
    const firstLand = samples.findIndex((sample) => sample.land && sample.low);
    const lastLand = samples.length - 1 - [...samples].reverse().findIndex((sample) => sample.land && sample.low);
    const rampEnds: Array<{ x: number; dir: number }> = [];
    if (firstLand >= 0 && lastLand > firstLand) {
      let runStart = -1;
      const flush = (end: number) => {
        if (runStart < 0 || end <= runStart) { runStart = -1; return; }
        const x0 = samples[runStart].x;
        const x1 = samples[end].x;
        add((x0 + x1) / 2, 7.4, highwayZ, x1 - x0, 0.9, 9, "#6a7071");
        for (const offset of [-4.4, 0, 4.4]) add((x0 + x1) / 2, 8.3, highwayZ + offset, x1 - x0, 0.5, 0.28, "#c6c6bb");
        for (let x = x0; x <= x1; x += 27) {
          const ground = Math.max(-3, terrain.height(x, highwayZ));
          add(x, ground, highwayZ, 1.6, 7.4 - ground, 5.8, "#a9aaa0");
          for (const offset of [-2.2, 2.2]) add(x, 8.32, highwayZ + offset, 9, 0.03, 0.18, "#ddd4aa");
        }
        runStart = -1;
      };
      for (let index = firstLand; index <= lastLand; index += 1) {
        if (samples[index].low) {
          if (runStart < 0) runStart = index;
        } else flush(index - 1);
      }
      flush(lastLand);
      if (samples[firstLand].x <= left + 20) rampEnds.push({ x: left, dir: -1 });
      if (samples[lastLand].x >= right - 20) rampEnds.push({ x: right, dir: 1 });
    }
    // Long east/west approaches descend onto the perimeter streets — only where the ring really lands on ground.
    for (const end of rampEnds) {
      const rampLength = 66;
      add(end.x, 4.25, highwayZ + rampLength / 2, 6, 0.65, rampLength, "#737a79", Math.atan2(7.1, rampLength));
    }
    // Port: two piers, warehouses, container stacks and two gantry cranes.
    for (let index = 0; index < 2; index += 1) {
      const x = right - 80 + index * 55;
      add(x, 0.15, south + 58, 16, 1.05, 60, "#a8a899");
      add(x, 1.2, south + 35, 21, 5, 12, "#bbc0b7");
      add(x, 6.2, south + 35, 23, 0.45, 14, "#7c8988");
      for (const dx of [-6, 6]) add(x + dx, 1.2, south + 65, 0.8, 15, 0.8, "#b19364");
      add(x, 16.2, south + 65, 15, 0.9, 1, "#b19364");
      add(x + 4, 16.7, south + 65, 23, 0.5, 0.5, "#b19364");
      for (let item = 0; item < 8; item += 1) {
        add(x + (item % 2 ? 3 : -3), 1.2, south + 47 + Math.floor(item / 2) * 7, 4.5, 2.4, 5.8, ["#a9684f", "#647f84", "#bab092"][item % 3]);
      }
    }
    const mesh = this.makeInstanced(BOX, new THREE.MeshLambertMaterial({ color: "#ffffff" }), parts.length);
    parts.forEach((part, index) => {
      this.positionVector.set(part.x, part.y, part.z);
      this.euler.set(part.tilt ?? 0, 0, 0);
      this.quaternion.setFromEuler(this.euler);
      this.scaleVector.set(part.sx, part.sy, part.sz);
      this.matrix.compose(this.positionVector, this.quaternion, this.scaleVector);
      mesh.setMatrixAt(index, this.matrix); mesh.setColorAt(index, this.color.set(part.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.count = parts.length;
    mesh.name = "city-infrastructure-decorative";
  }

  /** 区界高架：与北环高架同视觉语言（桥面/车道线/护栏/桥墩），
   *  沿规划折线分段铺装 —— host 城区之间可辨认的硬边界。 */
  private buildDistrictExpressways(): void {
    type Piece = { x: number; y: number; z: number; sx: number; sy: number; sz: number; yaw: number; color: string };
    const pieces: Piece[] = [];
    const deckY = 8.2;
    for (const points of this.layout.highways ?? []) {
      // Piers every ~34 units by mileage, anchored into the terrain or riverbed
      // (over water the pier reaches below the surface — a real bridge span).
      let accumulated = 0;
      let nextPier = 0;
      for (let index = 0; index < points.length; index += 1) {
        const point = points[index];
        if (index > 0) accumulated += Math.hypot(point.x - points[index - 1].x, point.z - points[index - 1].z);
        if (accumulated >= nextPier) {
          nextPier = accumulated + 34;
          const groundY = Math.max(-3, this.layout.terrain.height(point.x, point.z));
          // 墩顶止于桥面底面（咬合 0.05）：桥面板在任何视角下都完整包住墩顶，
          // 不会出现"桥墩穿透路面"的视觉交叠。
          // BOX 以底面为原点：y 是墩底而不是中心。曾按「中心」写成 (地面+墩顶)/2，
          // 桥墩悬在半空且戳出桥面（截图里河中那个方块）。
          const pierTop = deckY + 0.05;
          // 桥墩随该点处桥面走向旋转（横截面垂直于桥），盖梁宽度覆盖桥面。
          const neighbor = points[Math.min(index + 1, points.length - 1)];
          const prev = points[Math.max(index - 1, 0)];
          const pierYaw = -Math.atan2(neighbor.z - prev.z, neighbor.x - prev.x);
          pieces.push({ x: point.x, y: groundY, z: point.z, sx: 1.8, sy: pierTop - groundY, sz: 8.4, yaw: pierYaw, color: "#a9aaa0" });
        }
      }
      for (let index = 1; index < points.length; index += 1) {
        const a = points[index - 1];
        const b = points[index];
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        if (length < 6) continue;
        const yaw = -Math.atan2(b.z - a.z, b.x - a.x);
        const mx = (a.x + b.x) / 2;
        const mz = (a.z + b.z) / 2;
        pieces.push({ x: mx, y: deckY, z: mz, sx: length + 0.5, sy: 0.9, sz: 10.5, yaw, color: "#6a7071" });
        // 车道线/护栏沿桥面横向偏移（offset 之前被忽略，全叠在中线上），且要在桥面顶面（deckY+0.9）之上。
        const sideX = Math.sin(yaw);
        const sideZ = Math.cos(yaw);
        for (const offset of [-3.6, 0, 3.6]) pieces.push({ x: mx + sideX * offset, y: deckY + 0.9, z: mz + sideZ * offset, sx: length, sy: 0.05, sz: 0.3, yaw, color: "#c6c6bb" });
        for (const offset of [-5.1, 5.1]) pieces.push({ x: mx + sideX * offset, y: deckY + 0.9, z: mz + sideZ * offset, sx: length, sy: 0.55, sz: 0.3, yaw, color: "#b9bcb2" });
      }
    }
    if (!pieces.length) return;
    const geometry = BOX.clone();
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ color: "#ffffff" }), pieces.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    pieces.forEach((piece, index) => {
      this.positionVector.set(piece.x, piece.y, piece.z);
      this.euler.set(0, piece.yaw, 0);
      this.quaternion.setFromEuler(this.euler);
      this.scaleVector.set(piece.sx, piece.sy, piece.sz);
      this.matrix.compose(this.positionVector, this.quaternion, this.scaleVector);
      mesh.setMatrixAt(index, this.matrix);
      mesh.setColorAt(index, this.color.set(piece.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.name = "city-district-expressways";
    this.group.add(mesh);
    this.disposables.push(geometry, mesh.material);
  }

  /** 公共用地的 3D 体量：此前市政广场/车站/体育场/观景塔/港口只有地面纹理里的一块色块
   *  （海岸边那块灰色长方形就是港口）。全部由方块与圆柱拼成，局部坐标按地块 yaw 旋转。 */
  private buildPublicSites(): void {
    type Piece = { x: number; y: number; z: number; sx: number; sy: number; sz: number; yaw: number; color: string };
    const boxes: Piece[] = [];
    const cylinders: Piece[] = [];
    for (const site of this.layout.publicSites) {
      if (site.kind === "park") continue;
      const r = site.radius;
      const base = Math.max(0, this.layout.terrain.height(site.x, site.z));
      const cos = Math.cos(site.yaw);
      const sin = Math.sin(site.yaw);
      // 局部 (lx, lz) → 世界；与吊车/地块同一套 yaw 约定。
      const place = (lx: number, lz: number) => ({ x: site.x + lx * cos + lz * sin, z: site.z - lx * sin + lz * cos });
      const box = (lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, color: string, extraYaw = 0) => {
        const p = place(lx, lz);
        boxes.push({ x: p.x, y: base + ly, z: p.z, sx, sy, sz, yaw: site.yaw + extraYaw, color });
      };
      const cyl = (lx: number, ly: number, lz: number, radius: number, height: number, color: string) => {
        const p = place(lx, lz);
        cylinders.push({ x: p.x, y: base + ly, z: p.z, sx: radius, sy: height, sz: radius, yaw: 0, color });
      };
      if (site.kind === "civic") {
        box(0, 0, 0, r * 1.2, 1.6, r * 0.9, "#e4dcc8");
        box(0, 1.6, 0, r * 0.9, 9, r * 0.55, "#efe7d6");
        for (let column = -3; column <= 3; column += 1) cyl(column * r * 0.12, 1.6, r * 0.34, 0.75, 9, "#f6f0e2");
        box(0, 10.6, 0, r * 0.98, 1.1, r * 0.62, "#cdbf9f");
        cyl(0, 11.7, 0, r * 0.27, 4.2, "#d6c9a8");
        cyl(0, 15.9, 0, r * 0.2, 3.4, "#5fa7a3");
        cyl(0, 19.3, 0, 0.4, 6, "#c9b98f");
      } else if (site.kind === "station") {
        box(0, 0, 0, r * 1.5, 0.7, r * 1.1, "#cfc7b3");
        for (const track of [-18, -10, -2, 6]) box(track, 0.7, 0, 0.5, 0.15, r * 1.1, "#6f7773");
        box(0, 7.4, 0, r * 1.4, 0.55, r * 0.9, "#8e9a9c");
        for (const px of [-r * 0.6, 0, r * 0.6]) for (const pz of [-r * 0.38, r * 0.38]) cyl(px, 0.7, pz, 0.55, 6.7, "#a9b0b0");
        box(0, 0, -r * 0.62, r * 1.3, 11, 7, "#d9cdb5");
        cyl(r * 0.5, 11, -r * 0.62, 1.6, 10, "#c8bba0");
        cyl(r * 0.5, 21, -r * 0.62, 2.1, 1.2, "#f4efe0");
      } else if (site.kind === "stadium") {
        const segments = 18;
        for (let index = 0; index < segments; index += 1) {
          const t = (index / segments) * Math.PI * 2;
          const lx = Math.cos(t) * 27;
          const lz = Math.sin(t) * 19.5;
          // 椭圆切线方向：看台段首尾相接。
          const tangent = Math.atan2(19.5 * Math.cos(t), -27 * Math.sin(t));
          box(lx, 0, lz, 10.5, index % 4 === 0 ? 11 : 8, 5.5, index % 4 === 0 ? "#c05a4f" : "#dcd8ca", -tangent);
        }
        for (const [lx, lz] of [[-30, -22], [30, -22], [-30, 22], [30, 22]]) {
          cyl(lx, 0, lz, 0.55, 24, "#9aa0a0");
          box(lx, 24, lz, 4, 1.4, 2.4, "#fff3c4");
        }
      } else if (site.kind === "tower") {
        cyl(0, 0, 0, 6.5, 3.2, "#c4c7c6");
        cyl(0, 3.2, 0, 2.3, 42, "#cfd3d6");
        cyl(0, 42, 0, 6.4, 3.8, "#eaf0f2");
        cyl(0, 45.8, 0, 4.2, 2.2, "#7fb4c2");
        cyl(0, 48, 0, 0.45, 15, "#d45a4a");
      } else if (site.kind === "harbor") {
        box(0, 0, 0, r * 1.5, 0.5, r * 1.2, "#8e9490");
        box(0, 0.5, -r * 0.5, r * 1.1, 6.5, 10, "#bab4a3");
        const containerColors = ["#a9684f", "#4f7f8a", "#c9a24a", "#6a8a62", "#8a5a7a", "#d8d2c0"];
        for (let col = 0; col < 5; col += 1) {
          for (let row = 0; row < 3; row += 1) {
            const stack = 1 + Math.floor(hashSeed(`ctn:${site.id}:${col}:${row}`) * 3);
            for (let level = 0; level < stack; level += 1) {
              box(-r * 0.55 + col * 7, 0.5 + level * 2.7, -r * 0.1 + row * 4.4, 6.2, 2.6, 3.8, containerColors[Math.floor(hashSeed(`ctc:${site.id}:${col}:${row}:${level}`) * containerColors.length)]);
            }
          }
        }
        for (const [lx, lz] of [[-r * 0.65, r * 0.38], [-r * 0.65, r * 0.62], [r * 0.15, r * 0.38], [r * 0.15, r * 0.62]]) cyl(lx, 0.5, lz, 0.6, 17, "#c9532f");
        box(-r * 0.25, 17.5, r * 0.5, r * 1.1, 1.3, 1.5, "#c9532f");
        box(-r * 0.25 + r * 0.55, 17.2, r * 0.5, 14, 1, 1, "#d9d3c2", 0);
      }
    }
    if (!boxes.length) return;
    const build = (geometry: THREE.BufferGeometry, pieces: Piece[], name: string) => {
      if (!pieces.length) return;
      const material = new THREE.MeshLambertMaterial({ color: "#ffffff" });
      const mesh = new THREE.InstancedMesh(geometry.clone(), material, pieces.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      pieces.forEach((piece, index) => {
        this.positionVector.set(piece.x, piece.y, piece.z);
        this.euler.set(0, piece.yaw, 0);
        this.quaternion.setFromEuler(this.euler);
        this.scaleVector.set(piece.sx, piece.sy, piece.sz);
        this.matrix.compose(this.positionVector, this.quaternion, this.scaleVector);
        mesh.setMatrixAt(index, this.matrix);
        mesh.setColorAt(index, this.color.set(piece.color));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.name = name;
      this.group.add(mesh);
      this.disposables.push(mesh.geometry, material);
    };
    build(BOX, boxes, "city-public-sites-boxes");
    build(CYLINDER, cylinders, "city-public-sites-cylinders");
  }

  /** 分区驱动立面：downtown 玻璃 / commercial 横带 / residential 窗洞 /
   *  waterfront 混合。无地块信息的楼（不应出现）退回模型层的 hash 立面。 */
  private facadeFor(building: CityBuilding): number {
    const zone = this.zoneById.get(building.id);
    if (!zone) return building.facade;
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

  /** 海平线远山：低模锥形剪影 + fbm 顶点扰动，两侧海域各一座。 */
  private buildSeaMountains(): void {
    const mountains = this.layout.seaMountains ?? [];
    if (!mountains.length) return;
    for (const mountain of mountains) {
      const geometry = new THREE.ConeGeometry(mountain.radius, mountain.height, 11, 4);
      const position = geometry.attributes.position as THREE.BufferAttribute;
      const colors = new Float32Array(position.count * 3);
      const rock = new THREE.Color("#a9a496");
      const high = new THREE.Color("#d6d0c2");
      const tint = new THREE.Color();
      for (let index = 0; index < position.count; index += 1) {
        const x = position.getX(index);
        const y = position.getY(index);
        const z = position.getZ(index);
        const wobble = 1 + fbm(x * 0.03 + mountain.seed, z * 0.03 - mountain.seed, mountain.seed, 3) * 0.22;
        position.setX(index, x * wobble);
        position.setZ(index, z * wobble);
        tint.copy(rock).lerp(high, Math.max(0, (y + mountain.height / 2) / mountain.height));
        colors[index * 3] = tint.r;
        colors[index * 3 + 1] = tint.g;
        colors[index * 3 + 2] = tint.b;
      }
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geometry.computeVertexNormals();
      const material = new THREE.MeshLambertMaterial({ vertexColors: true, fog: false });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(mountain.center.x, 0, mountain.center.z);
      mesh.name = "city-sea-mountain";
      this.group.add(mesh);
      this.disposables.push(geometry, material);
    }
  }

  /** 树位：规划层的 parkTrees（此前算出来却从没渲染，district.trees 恒为空）+
   *  棕榈主题下沿街行道树（避开桥、水面和路口）。 */
  private treeSpots(): Array<{ x: number; z: number; y: number; seed: number }> {
    const theme = activeTheme();
    const spots: Array<{ x: number; z: number; y: number; seed: number }> = [];
    for (const district of this.layout.districts) spots.push(...district.trees);
    spots.push(...(this.layout.parkTrees ?? []));
    if (theme.streetTreeSpacing > 0) {
      const terrain = this.layout.terrain;
      for (const edge of this.layout.roadEdges) {
        if (edge.bridge) continue;
        const [a, b] = edge.points;
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        if (length < 20) continue;
        const dx = (b.x - a.x) / length;
        const dz = (b.z - a.z) / length;
        const spacing = theme.streetTreeSpacing * (edge.kind === "arterial" ? 0.8 : 1);
        // 两端各留出路口宽度，沿路两侧交错栽种。
        for (let along = 9, index = 0; along < length - 9; along += spacing, index += 1) {
          const side = index % 2 === 0 ? 1 : -1;
          const offset = edge.width / 2 + 2.4;
          const x = a.x + dx * along - dz * offset * side;
          const z = a.z + dz * along + dx * offset * side;
          const y = terrain.height(x, z);
          if (y < 1.2) continue;
          spots.push({ x, z, y, seed: hashSeed(`street:${edge.id}:${index}`) });
        }
      }
    }
    return spots;
  }

  /** 圆冠树：树干 + 二十面体树冠。 */
  private roundTreeGeometry(): THREE.BufferGeometry {
    const theme = activeTheme();
    const trunk = new THREE.CylinderGeometry(0.14, 0.2, 0.9, 5).translate(0, 0.45, 0);
    const crown = new THREE.IcosahedronGeometry(0.78, 0).translate(0, 1.35, 0);
    return this.tintedMerge([[trunk, theme.trunk], [crown, theme.foliage]]);
  }

  /** 棕榈：略弯的细高树干 + 一圈下垂的羽叶（每片叶 = 前倾的扁长方体）。 */
  private palmGeometry(): THREE.BufferGeometry {
    const theme = activeTheme();
    const height = 4.6;
    const trunk = new THREE.CylinderGeometry(0.1, 0.19, height, 6).translate(0, height / 2, 0);
    // 树干顶端微微偏向一侧，避免整齐得像电线杆。
    const position = trunk.getAttribute("position") as THREE.BufferAttribute;
    for (let index = 0; index < position.count; index += 1) {
      const t = position.getY(index) / height;
      position.setX(index, position.getX(index) + t * t * 0.55);
    }
    trunk.computeVertexNormals();
    const parts: Array<[THREE.BufferGeometry, string]> = [[trunk, theme.trunk]];
    const fronds = 8;
    for (let index = 0; index < fronds; index += 1) {
      const frond = new THREE.BoxGeometry(2.3, 0.05, 0.42).translate(1.15, 0, 0);
      frond.rotateZ(-0.42 - (index % 2) * 0.22); // 叶尖下垂
      frond.rotateY((index / fronds) * Math.PI * 2);
      frond.translate(0.55, height - 0.05, 0);
      parts.push([frond, index % 3 === 0 ? "#27a868" : theme.foliage]);
    }
    return this.tintedMerge(parts);
  }

  private tintedMerge(parts: Array<[THREE.BufferGeometry, string]>): THREE.BufferGeometry {
    let total = 0;
    for (const [geometry] of parts) total += geometry.getAttribute("position").count;
    const colors = new Float32Array(total * 3);
    let offset = 0;
    const color = new THREE.Color();
    for (const [geometry, hex] of parts) {
      color.set(hex);
      for (let index = 0; index < geometry.getAttribute("position").count; index += 1) {
        colors[offset++] = color.r;
        colors[offset++] = color.g;
        colors[offset++] = color.b;
      }
    }
    const merged = mergeGeometries(parts.map(([geometry]) => geometry));
    merged.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    for (const [geometry] of parts) geometry.dispose();
    return merged;
  }

  private buildTrees(): THREE.InstancedMesh {
    const spots = this.treeSpots();
    const palm = activeTheme().vegetation === "palm";
    const treeGeometry = palm ? this.palmGeometry() : this.roundTreeGeometry();
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.InstancedMesh(treeGeometry, material, Math.max(spots.length, 1));
    mesh.castShadow = true;
    spots.forEach((spot, index) => {
      const scale = palm ? 1.25 + spot.seed * 0.7 : 0.8 + spot.seed * 0.9;
      this.compose(spot.x, spot.y - 0.1, spot.z, spot.seed * Math.PI * 2, scale, scale, scale);
      mesh.setMatrixAt(index, this.matrix);
    });
    mesh.count = spots.length;
    this.group.add(mesh);
    this.disposables.push(treeGeometry, material);
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
    const cars: Car[] = [];
    paths.forEach((path, pathIndex) => {
      const count = 3;
      for (let index = 0; index < count; index += 1) {
        const seed = hashSeed(`car:${pathIndex}:${index}`);
        cars.push({ path, distance: (index / count) * path.total + seed * 5, speed: 6.5 + seed * 6 });
      }
    });
    const carColors = ["#f8f5ec", "#c96f4a", "#4d7ca8", "#3f8f7a", "#d8a13c", "#8d5a5a"];
    const geometry = new THREE.BoxGeometry(2.5, 0.8, 1.2).translate(0, 0.4, 0);
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

  private buildBoats(): { mesh: THREE.InstancedMesh; boats: Array<{ path: CarPath; distance: number; speed: number; phase: number }> } {
    // 船沿海岸外扩航道巡航（折线推进，与车辆同一套采样）。
    const boats: ReturnType<CityParts["buildBoats"]>["boats"] = [];
    this.layout.boatLoops?.forEach((loop, laneIndex) => {
      const { cumulative, total } = polyCumulative(loop);
      const count = 3 + (laneIndex % 2);
      for (let index = 0; index < count; index += 1) {
        boats.push({
          path: { points: loop, cumulative, total, y: -0.3, terrain: null },
          distance: (index / count) * total + hashSeed(`bd:${laneIndex}:${index}`) * 40,
          speed: (laneIndex % 2 === 0 ? 1 : -1) * (2.6 + hashSeed(`bs:${laneIndex}:${index}`) * 1.6),
          phase: hashSeed(`bp:${laneIndex}:${index}`) * Math.PI * 2,
        });
      }
    });
    const hull = new THREE.BoxGeometry(11.5, 2, 4).translate(0, 1, 0);
    const cabin = new THREE.BoxGeometry(4.3, 1.8, 2.9).translate(1.4, 2.9, 0);
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
    for (let index = 0; index < 3; index += 1) {
      const seed = hashSeed(`cloud:${index}`);
      clouds.push({
        x: (seed - 0.5) * bounds * 2,
        z: (hashSeed(`cz:${index}`) - 0.5) * bounds * 2,
        y: 220 + seed * 44,
        speed: 0.65 + seed * 0.7,
        scale: 0.5 + seed * 0.4,
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
      const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true, sizeAttenuation: false });
      const sprite = new THREE.Sprite(material);
      const height = 0.018;
      sprite.scale.set(height * aspect, height, 1);
      sprite.renderOrder = 20;
      sprite.position.set(district.center.x, district.plaza.y + 45, district.center.z);
      this.group.add(sprite);
      this.labels.push(sprite);
      this.disposables.push(material, texture);
    }
  }

  private buildWater(): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(9000, 9000, 1, 1).rotateX(-Math.PI / 2);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSun: { value: new THREE.Vector3(0.55, 0.75, 0.36).normalize() },
        uDeep: { value: new THREE.Color(activeTheme().water.deep) },
        uShallow: { value: new THREE.Color(activeTheme().water.shallow) },
        uSky: { value: new THREE.Color(activeTheme().water.sky) },
        // 与 scene.background 同色：ShaderMaterial 不吃 scene.fog，水面远处要自己淡出到天空色，
        // 否则 2600 见方的水面直边会像「世界边缘」露在天空下。
        uFog: { value: new THREE.Color(activeTheme().skyHorizon) },
        uFogRange: { value: new THREE.Vector2(...activeTheme().waterFog) },
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
        uniform vec3 uFog;
        uniform vec2 uFogRange;
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
          // 近处格子比像素大会变成白色棋盘噪点，远处则混叠：只在中距离出现。
          float dist = distance(cameraPosition, vWorld);
          sparkle *= smoothstep(90.0, 200.0, dist) * (1.0 - smoothstep(300.0, 650.0, dist));
          color += vec3(1.0, 0.99, 0.92) * sparkle * 0.5;
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          // 雾混在色调映射之后：scene.background 不经色调映射，先混再映射会让远水发灰、与天空出现色带。
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uFog, smoothstep(uFogRange.x, uFogRange.y, dist));
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
        facade: -1,
        groundY: district.grounds.get(building.id) ?? 0,
        paletteWall: new THREE.Color(palette.wall).multiplyScalar(0.92 + building.seed * 0.16),
        display: building.builtFraction,
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
        craneX: 0,
        craneZ: 0,
        blinkPhase: hashSeed(`blink:${building.id}`) * Math.PI * 2,
      };

      runtime.facade = this.facadeFor(building);
      const mesh = this.shaftMeshes[runtime.facade];
      const instanceMap = this.shaftIdByInstance[runtime.facade];
      const wantsUpper = building.archetype === "tower" || building.archetype === "landmark";
      runtime.shaftPrimary = shaftCursor[runtime.facade];
      mesh.setColorAt(runtime.shaftPrimary, runtime.paletteWall);
      (mesh.geometry.getAttribute("aFloors") as THREE.InstancedBufferAttribute).setX(runtime.shaftPrimary, Math.max(2, Math.round(building.height / 3.1)));
      instanceMap.set(runtime.shaftPrimary, building.id);
      shaftCursor[runtime.facade] += 1;
      if (wantsUpper) {
        runtime.shaftUpper = shaftCursor[runtime.facade];
        mesh.setColorAt(runtime.shaftUpper, runtime.paletteWall.clone().multiplyScalar(0.94));
        (mesh.geometry.getAttribute("aFloors") as THREE.InstancedBufferAttribute).setX(runtime.shaftUpper, Math.max(2, Math.round((building.height * 0.28) / 3.1)));
        instanceMap.set(runtime.shaftUpper, building.id);
        shaftCursor[runtime.facade] += 1;
      }

      const needsPodium = building.archetype !== "tower" && building.archetype !== "landmark";
      if (needsPodium) {
        runtime.podium = podiumCount;
        this.podiumMesh.setColorAt(podiumCount, runtime.paletteWall.clone().multiplyScalar(0.88));
        podiumCount += 1;
      }
      runtime.roof = roofCount;
      this.roofMesh.setColorAt(roofCount, new THREE.Color(palette.roof).multiplyScalar(0.94 + building.seed * 0.12));
      // 乘 3.2 让亮度越过 bloom 阈值（MeshBasicMaterial 不吃光照，toneMapped=false 保留 HDR 值）。
      this.neonMesh.setColorAt(roofCount, new THREE.Color(palette.accent).multiplyScalar(3.2));
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
    this.neonMesh.count = activeTheme().neon ? roofCount : 0;
    if (this.neonMesh.instanceColor) this.neonMesh.instanceColor.needsUpdate = true;
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
    const streetWidth = runtime.slot.width * (runtime.slot.zone === "downtown" ? 0.8 : 0.88);
    if (building.archetype !== "tower" && building.archetype !== "landmark") widths[0] = Math.max(widths[0], streetWidth);
    widths[0] = Math.min(widths[0], runtime.slot.width - 0.8);
    widths[1] = Math.min(widths[1], runtime.slot.depth - 2);

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
    if (runtime.podium >= 0) this.podiumMesh.setMatrixAt(runtime.podium, this.matrix);
    if (runtime.roof >= 0) {
      this.roofMesh.setMatrixAt(runtime.roof, this.matrix);
      this.neonMesh.setMatrixAt(runtime.roof, this.matrix);
    }
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

  /** 航拍时隐藏「计划高度」脚手架壳：低机位下它是悬在天上的半透明大方块。 */
  setScaffoldVisible(visible: boolean): void {
    this.scaffoldMesh.visible = visible;
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

  /** 所有楼的锚点（航拍挑主角用）：只读快照，不暴露 runtime。 */
  anchors(): Map<string, { x: number; z: number; height: number; ground: number }> {
    const out = new Map<string, { x: number; z: number; height: number; ground: number }>();
    for (const [id, runtime] of this.runtimeById) out.set(id, { x: runtime.slot.x, z: runtime.slot.z, height: runtime.building.height, ground: runtime.groundY });
    return out;
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
      this.neonMesh.instanceMatrix.needsUpdate = true;
      this.scaffoldMesh.instanceMatrix.needsUpdate = true;
      this.antennaMesh.instanceMatrix.needsUpdate = true;
      this.craneMastMesh.instanceMatrix.needsUpdate = true;
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
      const sample = samplePolyline(car.path, car.distance);
      const y = car.path.terrain ? car.path.terrain.height(sample.x, sample.z) + car.path.y : car.path.y;
      this.compose(sample.x - sample.dz * 1.2, y + 0.04, sample.z + sample.dx * 1.2, Math.atan2(-sample.dz, sample.dx), 1, 1, 1);
      this.carMesh.setMatrixAt(index, this.matrix);
      carsMoved = true;
    });
    if (carsMoved) this.carMesh.instanceMatrix.needsUpdate = true;

    // 船只（沿海岸航道折线推进 + 起伏）。
    this.boats.forEach((boat, index) => {
      boat.distance += boat.speed * dt;
      const sample = samplePolyline(boat.path, boat.distance);
      const bob = Math.sin(elapsed * 0.9 + boat.phase) * 0.12;
      this.compose(sample.x, -0.3 + bob, sample.z, Math.atan2(-sample.dz, sample.dx), 1, 1, 1);
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
