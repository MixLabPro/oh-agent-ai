/**
 * 道路系统：基础设施（桥面/路缘）、区界高架、红色桁架桥。
 * 纯搬移自 CityParts（CITY_ENGINE_SPLIT_SPEC §4-6）：函数体逐字不变，`this.` -> `host.`。
 */

import * as THREE from "three";
import type { CityLayout, RoadEdge, Vec2 } from "../cityLayout";
import { cornerArc, curbClearance, junctionIndex, pavementIndex, renderRoadEdges, roadJunctionPlan, STRAIGHT_GAP, taperOutline } from "../cityRoadJunctions";
import { channelizedTPlan, type ChannelizedArm } from "../cityRoadPaint";
import { BOX, EXPRESSWAY_DECK_THICKNESS, EXPRESSWAY_DECK_WIDTH, expresswayDeckHeights } from "../render/shared";

/** 本系统读写的 CityParts 成员（精确清单；CityParts 以 `this as unknown as RoadHost` 传入）。 */
export interface RoadHost {
  readonly layout: CityLayout;
  readonly group: THREE.Group;
  readonly disposables: Array<{ dispose: () => void }>;
  readonly matrix: THREE.Matrix4;
  readonly quaternion: THREE.Quaternion;
  readonly euler: THREE.Euler;
  readonly scaleVector: THREE.Vector3;
  readonly positionVector: THREE.Vector3;
  readonly color: THREE.Color;
  makeInstanced(geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number): THREE.InstancedMesh;
}

/** 桥头 / 滨水 / 尽端的路缘退让：沿用路口改造前的固定 5.5（旧「segment − 11」的一半）。 */
const LEGACY_CURB_TRIM = 5.5;

/** Batched city furniture and waterfront infrastructure, not selectable data. */
export function buildInfrastructure(host: RoadHost): void {
  type Part = { x: number; y: number; z: number; sx: number; sy: number; sz: number; color: string; tilt?: number; yaw?: number };
  const parts: Part[] = [];
  const add = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, tilt = 0, yaw = 0) => parts.push({ x, y, z, sx, sy, sz, color, tilt, yaw });
  // Curbs and street lights are real geometry; asphalt and markings share the atlas.
  // 画路一律用渲染路网（窄短桩按接续宽路画，与贴图 / 路面网格同一份）。
  const roadEdges = renderRoadEdges(host.layout.roadEdges);
  const junctions = roadJunctionPlan(roadEdges);
  const { byNode, armOf } = junctionIndex(junctions);
  /** 路缘在某端的退让距离。sideAtNode 是相对「从节点出发」方向的侧：+1 = 逆时针侧（+n）。 */
  const ownTrim = (edge: RoadEdge, node: string, sideAtNode: number): number => {
    const arm = armOf(edge, node);
    const junction = byNode.get(node);
    if (!arm || !junction || junction.touchesDeck || arm.legacy) return LEGACY_CURB_TRIM;
    const trim = sideAtNode > 0 ? arm.ccwTrim : arm.cwTrim;
    if (trim !== null) return trim;
    if (junction.taper && junction.taper.narrow === arm) return junction.taper.length;
    // 这一侧没有圆角：邻臂是桥面/滨水、或夹角 < 177° 却没能做出圆角（边太短 / 不等宽近直行），沿用旧的 5.5；
    // 直行侧（≥ 177°）邻臂不比自己宽就接到节点、与邻臂路缘连成一条。两种情况都再用 curbClearance 兜底：
    // 路缘必须走出路口里其它臂的路面带，不能落在别人的路面上。
    const neighbor = sideAtNode > 0 ? arm.ccwNeighbor : arm.cwNeighbor;
    const gap = sideAtNode > 0 ? arm.ccwGap : arm.cwGap;
    const base = !neighbor || neighbor.legacy || gap < STRAIGHT_GAP ? LEGACY_CURB_TRIM : 0;
    return Math.max(base, curbClearance(junction, arm, sideAtNode));
  };
  // 圆角切点 / 渐变段长度可能长过第一条短边：沿臂的直路链顺延，后续边在近端同侧接着退让。
  const spill = new Map<string, number>();
  const spillKey = (edge: RoadEdge, node: string, sideAtNode: number) => `${edge.id}|${node}|${sideAtNode}`;
  for (const junction of junctions) for (const arm of junction.arms) {
    const taper = junction.taper && junction.taper.narrow === arm ? junction.taper.length : null;
    for (const [sideAtNode, trim] of [[1, arm.ccwTrim ?? taper], [-1, arm.cwTrim ?? taper]] as const) {
      if (trim === null) continue;
      for (const link of arm.chain.slice(1)) {
        if (trim <= link.start) break;
        const key = spillKey(link.edge, link.near, sideAtNode);
        spill.set(key, Math.max(spill.get(key) ?? 0, trim - link.start));
      }
    }
  }
  const suspension = (host.layout.landmarks ?? []).find((l) => l.kind === "suspension-bridge");
  const nearSuspension = (a: Vec2, b: Vec2) => !!suspension?.to && [a, b].some((p) => Math.hypot(p.x - suspension.x, p.z - suspension.z) < 2 || Math.hypot(p.x - suspension.to!.x, p.z - suspension.to!.z) < 2);
  const pavement = pavementIndex(roadEdges);
  /** 一段路缘：减去它穿过的别的路面带后逐段落盒（< 0.5 的碎段丢弃），高度按每段中点取地形。 */
  const curb = (p: Vec2, q: Vec2, own: RoadEdge | undefined, overlap: number) => {
    const length = Math.hypot(q.x - p.x, q.z - p.z);
    if (length < 1e-3) return;
    const yaw = -Math.atan2(q.z - p.z, q.x - p.x);
    for (const [t0, t1] of pavement.outside(p, q, own)) {
      const piece = (t1 - t0) * length;
      if (piece < 0.5 && !(t0 === 0 && t1 === 1)) continue;
      const tm = (t0 + t1) / 2;
      const x = p.x + (q.x - p.x) * tm; const z = p.z + (q.z - p.z) * tm;
      add(x, Math.max(0, host.layout.terrain.height(x, z)) + 0.02, z, piece + (t0 === 0 && t1 === 1 ? overlap : 0), 0.18, 0.35, "#cbc6ba", 0, yaw);
    }
  };
  const curbTrim = (edge: RoadEdge, node: string, sideAtNode: number) =>
    Math.max(ownTrim(edge, node, sideAtNode), spill.get(spillKey(edge, node, sideAtNode)) ?? 0);
  for (const edge of roadEdges) {
    // Bridge spans need actual geometry; the terrain atlas is below the river surface.
    if (edge.bridge) {
      const [a, b] = edge.points;
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      const yaw = -Math.atan2(b.z - a.z, b.x - a.x);
      const x = (a.x + b.x) / 2; const z = (a.z + b.z) / 2;
      // Deck top meets the level plain; unlike atlas roads it remains above water.
      const deckTop = Math.max(host.layout.terrain.height(a.x, a.z), host.layout.terrain.height(b.x, b.z));
      // 长跨（> 160，桁架桥只认 40–160、悬索桥另画）：平铺在两端地面高度的桥面离水只有 ~1，墩子全没在水里，
      // 远看就是一条铺在水面上的路（开湾后的跨湾堤道，用户截图）。改成混凝土高架：两端按 6% 坡爬升、中段抬到
      // ≤ 8，桥面下压梁侧、每 22 一对墩柱带盖梁。分 4 长的短段按高度曲线摆放（盒子不能倾斜，6% 坡下每段台阶 0.24）。
      if (length > 160 && !nearSuspension(a, b)) {
        drawViaduct(add, host.layout.terrain, a, b, deckTop, edge.width);
        continue;
      }
      add(x, deckTop - 0.4, z, length + 0.5, 0.4, edge.width, "#6a7071", 0, yaw);
      for (const side of [-1, 1]) {
        const offset = side * (edge.width / 2 - 0.15);
        add(x + Math.sin(yaw) * offset, deckTop, z + Math.cos(yaw) * offset, length, 0.65, 0.3, "#b9bcb2", 0, yaw);
        const lineOffset = side * (edge.width / 2 - 0.65);
        add(x + Math.sin(yaw) * lineOffset, deckTop + 0.015, z + Math.cos(yaw) * lineOffset, length, 0.025, 0.12, "#e4dfc9", 0, yaw);
      }
      for (let distance = 2; distance < length - 1; distance += 6) {
        const t = (distance + 1) / length;
        add(a.x + (b.x - a.x) * t, deckTop + 0.015, a.z + (b.z - a.z) * t, Math.min(2, length - distance), 0.025, 0.14, "#dfd1a5", 0, yaw);
      }
      for (let distance = 16; distance < length - 12; distance += 32) {
        const t = distance / length;
        const px = a.x + (b.x - a.x) * t; const pz = a.z + (b.z - a.z) * t;
        const bed = host.layout.terrain.height(px, pz);
        add(px, bed, pz, 1.6, Math.max(0.1, deckTop - 0.35 - bed), edge.width - 0.6, "#a9aaa0", 0, yaw);
      }
      continue;
    }
    // 沿路段的实际方向摆放（G2 起各片区街网朝向不同；曾只认水平/竖直两种方向）。
    const [a, b] = edge.points;
    const segment = Math.hypot(b.x - a.x, b.z - a.z);
    if (segment < 1) continue;
    const ux = (b.x - a.x) / segment; const uz = (b.z - a.z) / segment;
    const nx = -uz; const nz = ux; // 路段法向（side = +1 即 +n 侧）
    for (const side of [-1, 1]) {
      // 每端按路口几何退让：有圆角的一侧退到切点（圆弧由下面的转角段接上），直行一侧接到节点
      // （与对面那臂的路缘连成一条），桥头 / 滨水 / 尽端沿用旧的固定 5.5。
      // 旧做法两端一律退 5.5、且整段 < 14 就不画：路缘要么直插进路口（宽路口 5.5 不够），
      // 要么在直行一侧断出 11 的口子；与贴图上的圆角路面对不上。
      const start = curbTrim(edge, edge.from, side);
      const end = curbTrim(edge, edge.to, -side);
      if (segment - start - end < 0.5) continue;
      const offset = side * (edge.width / 2 + 0.25);
      curb({ x: a.x + ux * start + nx * offset, z: a.z + uz * start + nz * offset },
        { x: a.x + ux * (segment - end) + nx * offset, z: a.z + uz * (segment - end) + nz * offset }, edge, 0);
    }
  }
  // 转角路缘：沿路面圆弧内收 0.25（路缘中心线与直段一致：路面边线外 0.25）的一串短盒，与贴图圆角同一份几何。
  for (const junction of junctions) for (const corner of junction.corners) {
    const arc = cornerArc(corner, 0.25);
    for (let k = 1; k < arc.length; k += 1) {
      const p = arc[k - 1]; const q = arc[k];
      const chord = Math.hypot(q.x - p.x, q.z - p.z);
      if (chord < 1e-3) continue;
      // 盒长多 0.12 让相邻弦段在折角外侧咬合，不露缝。
      curb(p, q, undefined, 0.12);
    }
  }
  // 渐变段两侧的斜路缘：从宽路路缘（节点处）斜接到窄路路缘（渐变段末端）。
  for (const junction of junctions) if (junction.taper) {
    const [wideLeft, narrowLeft, narrowRight, wideRight] = taperOutline(junction, 0.25);
    curb(wideLeft, narrowLeft, undefined, 0.12);
    curb(wideRight, narrowRight, undefined, 0.12);
  }
  // 城北高架与城南港口曾按常量坐标（urbanBounds.north − 12 / right − 80、south + 58）摆放、与地理无关：
  // G2 起高架是规划层的环线（buildDistrictExpressways 渲染），港口是 harbor 公共用地（buildPublicSites）。
  const mesh = host.makeInstanced(BOX, new THREE.MeshLambertMaterial({ color: "#ffffff" }), parts.length);
  parts.forEach((part, index) => {
    host.positionVector.set(part.x, part.y, part.z);
    host.euler.set(part.tilt ?? 0, part.yaw ?? 0, 0);
    host.quaternion.setFromEuler(host.euler);
    host.scaleVector.set(part.sx, part.sy, part.sz);
    host.matrix.compose(host.positionVector, host.quaternion, host.scaleVector);
    mesh.setMatrixAt(index, host.matrix); mesh.setColorAt(index, host.color.set(part.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.count = parts.length;
  mesh.name = "city-infrastructure-decorative";
}

/** 渠化 T 路口（渲染级，规划拓扑零改动）：acuteJunctions 守卫同一算法选出的 30–50°
 *  边缘带三岔（含 < 30° 普查残留违例；只挑宽 < 12 的窄路口，主干不渠化），把两个
 *  锐角侧的口部画成喇叭渐变（路面色贴地多边形，随地形取样），支路口中央摆一座
 *  低多边形水滴形分流岛（顶面植被色、侧壁路缘色）——视觉与车流语义都读成
 *  「渠化汇入」而不是「锐角硬接」。全部口合并成两个批（喇叭一盘、岛一盘），
 *  不是一口一 Mesh；喇叭抬 0.035（路漆 0.02–0.05 的既有 z-fighting 规避惯例，
 *  路缘盒基面 0.02 / 沙滩带 0.05 之间）。 */
export function buildChannelizedJunctions(host: RoadHost): void {
  const mouths = channelizedTPlan(renderRoadEdges(host.layout.roadEdges));
  if (!mouths.length) return;
  const terrain = host.layout.terrain;
  // 与地面贴图（cityTextures 路漆盘）同色的沥青：喇叭就是「路口变宽」本身，不另配色。
  const asphaltOf = (edge: { kind: string }) => (edge.kind === "arterial" ? "#505b60" : "#646c6b");
  const flareTop = new THREE.Color();
  const islandTop = new THREE.Color("#87a86f");
  const islandSide = new THREE.Color("#cbc6ba");
  const FLARE_LIFT = 0.035;
  const flarePositions: number[] = [];
  const flareColors: number[] = [];
  const islandPositions: number[] = [];
  const islandColors: number[] = [];
  /** 喇叭渐变：从口部（d0，半宽 w/2+extra）线性收到正常路幅（d0+length，半宽 w/2），
   *  沿边按 ~4.5 单位切片贴地取样（同沙滩带的细分惯例）。 */
  const flare = (arm: ChannelizedArm, x: number, z: number) => {
    const width = arm.edge.width;
    const extra = Math.min(2.3, 0.45 * width);
    const d0 = 2.2;
    const length = 9 + width * 0.55;
    const slices = Math.max(1, Math.ceil(length / 4.5));
    const nx = -arm.dir.z; const nz = arm.dir.x;
    const color = flareTop.set(asphaltOf(arm.edge));
    const at = (d: number, half: number, sign: number) => {
      const px = x + arm.dir.x * d + nx * half * sign;
      const pz = z + arm.dir.z * d + nz * half * sign;
      return [px, terrain.height(px, pz) + FLARE_LIFT, pz];
    };
    const left: number[] = [];
    const right: number[] = [];
    for (let s = 0; s <= slices; s += 1) {
      const t = s / slices;
      const half = width / 2 + extra * (1 - t);
      left.push(...at(d0 + length * t, half, 1));
      right.push(...at(d0 + length * t, half, -1));
    }
    for (let s = 0; s < slices; s += 1) {
      const a = left.slice(s * 3, s * 3 + 3); const b = left.slice((s + 1) * 3, (s + 1) * 3 + 3);
      const c = right.slice((s + 1) * 3, (s + 1) * 3 + 3); const e = right.slice(s * 3, s * 3 + 3);
      for (const vertex of [a, b, c, a, c, e]) { flarePositions.push(...vertex); flareColors.push(color.r, color.g, color.b); }
    }
  };
  /** 水滴形分流岛（低多边形棱台）：口部一侧圆头、向内收尖，顶面抬 0.22，侧壁插入地下 0.18。 */
  const ISLAND_PROFILE = [
    { d: 0.0, w: 1.0 }, { d: 0.16, w: 1.14 }, { d: 0.58, w: 0.55 }, { d: 1.0, w: 0.0 },
    { d: 0.58, w: -0.55 }, { d: 0.16, w: -1.14 }, { d: 0.0, w: -1.0 },
  ];
  const island = (arm: ChannelizedArm, x: number, z: number) => {
    const extra = Math.min(2.3, 0.45 * arm.edge.width);
    const start = 2.2 + 2.2;
    const length = 4.4 + arm.edge.width * 0.3;
    const half = Math.min(0.8, extra * 0.4);
    const nx = -arm.dir.z; const nz = arm.dir.x;
    const ring = ISLAND_PROFILE.map((point) => ({
      x: x + arm.dir.x * (start + length * point.d) + nx * half * point.w,
      z: z + arm.dir.z * (start + length * point.d) + nz * half * point.w,
    }));
    const top = ring.map((point) => [point.x, terrain.height(point.x, point.z) + 0.22, point.z]);
    const bottom = ring.map((point) => [point.x, terrain.height(point.x, point.z) - 0.18, point.z]);
    const centroid = [
      top.reduce((sum, vertex) => sum + vertex[0], 0) / top.length,
      top.reduce((sum, vertex) => sum + vertex[1], 0) / top.length,
      top.reduce((sum, vertex) => sum + vertex[2], 0) / top.length,
    ];
    for (let k = 0; k < ring.length; k += 1) {
      const next = (k + 1) % ring.length;
      for (const vertex of [top[k], top[next], centroid]) { islandPositions.push(...vertex); islandColors.push(islandTop.r, islandTop.g, islandTop.b); }
      for (const vertex of [top[k], top[next], bottom[next], top[k], bottom[next], bottom[k]]) { islandPositions.push(...vertex); islandColors.push(islandSide.r, islandSide.g, islandSide.b); }
    }
  };
  for (const mouth of mouths) {
    flare(mouth.stem, mouth.x, mouth.z);
    flare(mouth.host, mouth.x, mouth.z);
    island(mouth.stem, mouth.x, mouth.z);
  }
  const build = (positions: number[], colors: number[], name: string, castShadow: boolean) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));
    geometry.computeVertexNormals();
    // 双面渲染：绕序不挑（同沙滩带惯例），地形起伏下侧面朝向逐面有别。
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    host.group.add(mesh);
    host.disposables.push(geometry, material);
  };
  build(flarePositions, flareColors, "city-channel-flares", false);
  build(islandPositions, islandColors, "city-channel-islands", true);
}

/** 区界高架：与北环高架同视觉语言（桥面/车道线/护栏/桥墩），
 *  沿规划折线分段铺装 —— harness 城区之间可辨认的硬边界。 */
export function buildDistrictExpressways(host: RoadHost): void {
  type Piece = { x: number; y: number; z: number; sx: number; sy: number; sz: number; yaw: number; pitch?: number; color: string };
  const pieces: Piece[] = [];
  for (const points of host.layout.highways ?? []) {
    const heights = expresswayDeckHeights(points, (x, z) => host.layout.terrain.height(x, z));
    // Piers every ~34 units by mileage, anchored into the terrain or riverbed
    // (over water the pier reaches below the surface — a real bridge span).
    let accumulated = 0;
    let nextPier = 0;
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      if (index > 0) accumulated += Math.hypot(point.x - points[index - 1].x, point.z - points[index - 1].z);
      if (accumulated >= nextPier) {
        nextPier = accumulated + 34;
        const groundY = Math.max(-3, host.layout.terrain.height(point.x, point.z));
        // 墩顶止于桥面底面（咬合 0.05）：桥面板在任何视角下都完整包住墩顶，
        // 不会出现"桥墩穿透路面"的视觉交叠。
        // BOX 以底面为原点：y 是墩底而不是中心。曾按「中心」写成 (地面+墩顶)/2，
        // 桥墩悬在半空且戳出桥面（截图里河中那个方块）。
        const pierTop = heights[index] + 0.05;
        if (pierTop - groundY < 1.5) continue; // 匝道落地段不需要桥墩
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
      const ya = heights[index - 1];
      const yb = heights[index];
      const my = (ya + yb) / 2;
      const pitch = Math.atan2(yb - ya, length);
      const slant = Math.hypot(length, yb - ya);
      const top = my + EXPRESSWAY_DECK_THICKNESS;
      pieces.push({ x: mx, y: my, z: mz, sx: slant + 0.5, sy: EXPRESSWAY_DECK_THICKNESS, sz: EXPRESSWAY_DECK_WIDTH, yaw, pitch, color: "#6a7071" });
      // 车道线/护栏沿桥面横向偏移（offset 之前被忽略，全叠在中线上），且要在桥面顶面（deckY+0.9）之上。
      const sideX = Math.sin(yaw);
      const sideZ = Math.cos(yaw);
      for (const offset of [-3.6, 0, 3.6]) pieces.push({ x: mx + sideX * offset, y: top, z: mz + sideZ * offset, sx: slant, sy: 0.05, sz: 0.3, yaw, pitch, color: "#c6c6bb" });
      for (const offset of [-5.1, 5.1]) pieces.push({ x: mx + sideX * offset, y: top, z: mz + sideZ * offset, sx: slant, sy: 0.55, sz: 0.3, yaw, pitch, color: "#b9bcb2" });
    }
  }
  if (!pieces.length) return;
  const geometry = BOX.clone();
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ color: "#ffffff" }), pieces.length);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  pieces.forEach((piece, index) => {
    host.positionVector.set(piece.x, piece.y, piece.z);
    // 先绕局部 z 俯仰（匝道坡度），再绕 y 转向：'YZX' 顺序。
    host.euler.set(0, piece.yaw, piece.pitch ?? 0, "YZX");
    host.quaternion.setFromEuler(host.euler);
    host.euler.set(0, 0, 0, "XYZ");
    host.scaleVector.set(piece.sx, piece.sy, piece.sz);
    host.matrix.compose(host.positionVector, host.quaternion, host.scaleVector);
    mesh.setMatrixAt(index, host.matrix);
    mesh.setColorAt(index, host.color.set(piece.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.name = "city-district-expressways";
  host.group.add(mesh);
  host.disposables.push(geometry, mesh.material);
}

/** 尽端回车圈半径（形态批 §5-3）：所在路段半宽 + 2.5，夹在 6–9——与路宽协调
 *  （支路 5 宽 → 6，主干/大道 12 宽 → 8.5）。守夜灯（nightLighting）同用此口径。 */
export function culDeSacBulbRadius(roadWidth: number): number {
  return Math.max(6, Math.min(9, roadWidth / 2 + 2.5));
}

/** 尽端回车圈（backlog 形态批 §5-3，docs/CITY_PLANNER_V2_FINDINGS.md §5）：合法尽端
 *  （layout.culDeSacEnds，EndpointRole cul-de-sac）几何上是路戛然而止——在路尽头铺一块
 *  平贴地面的回车圆盘 + 路缘色描边。纯渲染装饰，不改路网拓扑；一个 InstancedMesh 装全部
 *  圆盘、一个装全部描边（同 buildTrussBridges 的合并批模式，不逐端点建 Mesh）。
 *  高度按地形中心取样、法向贴合坡度（中心差分梯度），颜色用桥面/路缘同款涂装。 */
export function buildCulDeSacBulbs(host: RoadHost): void {
  const ends = host.layout.culDeSacEnds ?? [];
  if (!ends.length) return;
  // 所在点最宽的 incident 路段决定回车圈半径（找到的多为唯一悬挂边）。
  const widthAt = new Map<string, number>();
  for (const edge of renderRoadEdges(host.layout.roadEdges)) {
    if (edge.bridge) continue;
    for (const id of [edge.from, edge.to]) widthAt.set(id, Math.max(widthAt.get(id) ?? 0, edge.width));
  }
  const discs = host.makeInstanced(new THREE.CylinderGeometry(1, 1, 1, 20).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: "#6a7071" }), ends.length);
  const rims = host.makeInstanced(new THREE.RingGeometry(0.86, 1, 28).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: "#cbc6ba" }), ends.length);
  discs.name = "city-culdesac-bulb-disc";
  rims.name = "city-culdesac-bulb-rim";
  discs.receiveShadow = true;
  const up = new THREE.Vector3(0, 1, 0);
  const normal = new THREE.Vector3();
  const height = host.layout.terrain.height;
  ends.forEach((end: Vec2, index: number) => {
    const radius = culDeSacBulbRadius(widthAt.get(`${end.x}:${end.z}`) ?? 9);
    const base = Math.max(0, height(end.x, end.z));
    // 圆盘贴合地形坡度：沿半径的两轴中心差分求梯度，法向 = (-gx, 1, -gz)。
    const gx = (height(end.x + radius, end.z) - height(end.x - radius, end.z)) / (2 * radius);
    const gz = (height(end.x, end.z + radius) - height(end.x, end.z - radius)) / (2 * radius);
    normal.set(-gx, 1, -gz).normalize();
    host.quaternion.setFromUnitVectors(up, normal);
    host.positionVector.set(end.x, base + 0.02, end.z);
    host.scaleVector.set(radius, 0.12, radius);
    host.matrix.compose(host.positionVector, host.quaternion, host.scaleVector);
    discs.setMatrixAt(index, host.matrix);
    // 描边圆环贴在圆盘顶面上（盘厚 0.12 + 0.01，防 z-fighting）。
    host.positionVector.set(end.x, base + 0.15, end.z);
    host.scaleVector.set(radius, 1, radius);
    host.matrix.compose(host.positionVector, host.quaternion, host.scaleVector);
    rims.setMatrixAt(index, host.matrix);
  });
  for (const mesh of [discs, rims]) { mesh.count = ends.length; mesh.instanceMatrix.needsUpdate = true; mesh.frustumCulled = false; }
}

type AddPart = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, tilt?: number, yaw?: number) => void;

/** 长跨混凝土高架（见调用处注释）：deckTop 是两端地面高度，桥面在两端与它齐平，中段抬升 rise。 */
function drawViaduct(add: AddPart, terrain: { height: (x: number, z: number) => number }, a: Vec2, b: Vec2, deckTop: number, width: number): void {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const ux = (b.x - a.x) / length; const uz = (b.z - a.z) / length;
  const yaw = -Math.atan2(b.z - a.z, b.x - a.x);
  const rise = Math.min(8, length * 0.03);
  const ramp = Math.min(length / 2, rise / 0.06);
  const lift = (d: number) => { const t = Math.min(1, d / ramp, (length - d) / ramp); return deckTop + rise * t * t * (3 - 2 * t); };
  const at = (d: number) => ({ x: a.x + ux * d, z: a.z + uz * d });
  const step = 4;
  for (let d = 0; d < length; d += step) {
    const piece = Math.min(step, length - d); const mid = d + piece / 2; const p = at(mid); const y = lift(mid);
    add(p.x, y - 0.4, p.z, piece + 0.3, 0.4, width, "#6a7071", 0, yaw);           // 桥面
    add(p.x, y - 1.15, p.z, piece + 0.3, 1.1, width - 1.4, "#8e928c", 0, yaw);    // 箱梁梁侧
    for (const side of [-1, 1]) {
      const rail = side * (width / 2 - 0.15); const line = side * (width / 2 - 0.65);
      add(p.x + Math.sin(yaw) * rail, y, p.z + Math.cos(yaw) * rail, piece + 0.3, 0.65, 0.3, "#b9bcb2", 0, yaw);
      add(p.x + Math.sin(yaw) * line, y + 0.015, p.z + Math.cos(yaw) * line, piece + 0.3, 0.025, 0.12, "#e4dfc9", 0, yaw);
    }
  }
  for (let d = 2; d < length - 1; d += 6) { const p = at(d + 1); add(p.x, lift(d + 1) + 0.015, p.z, 2, 0.025, 0.14, "#dfd1a5", 0, yaw); }
  // 墩：每 22 一对圆柱感的方墩 + 盖梁；桥头 ramp 段太矮的不立（墩高 < 1 时只是一块压在地上的板）
  for (let d = 11; d < length - 8; d += 22) {
    const p = at(d); const y = lift(d); const top = y - 1.7;
    const bed = terrain.height(p.x, p.z);
    if (top - bed < 1) continue;
    add(p.x, top, p.z, 1.8, 0.55, width - 0.4, "#9c9f97", 0, yaw);               // 盖梁（顶面贴箱梁底 y-1.15）
    for (const side of [-1, 1]) {
      const o = side * (width / 2 - 2);
      add(p.x + Math.sin(yaw) * o, bed, p.z + Math.cos(yaw) * o, 1.5, top - bed, 1.5, "#a9aaa0", 0, yaw);
    }
  }
}

/** 红色穿式桁架桥（backlog L-7）：悬索桥之外、跨距 40–160 的过河桥加一套格构桁架——上下弦 + 竖杆 + 交替斜腹杆，
 *  深红涂装。只换造型不改路网（同悬索桥做法）；桥面高度与 buildInfrastructure 一致。 */
export function buildTrussBridges(host: RoadHost): void {
  const suspension = (host.layout.landmarks ?? []).find((l) => l.kind === "suspension-bridge");
  const bridges = (host.layout.bridges ?? []).filter((b) => b.length >= 40 && b.length <= 160
    && !(suspension && Math.hypot(b.from.x - suspension.x, b.from.z - suspension.z) < 1));
  if (!bridges.length) return;
  const unit = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const red = new THREE.MeshLambertMaterial({ color: "#a8322a" });
  const bars: Array<[number, number, number, number, number, number, number, number]> = []; // x y z len thick rotY tilt
  for (const bridge of bridges) {
    const dx = bridge.to.x - bridge.from.x; const dz = bridge.to.z - bridge.from.z; const len = Math.hypot(dx, dz);
    const ux = dx / len; const uz = dz / len; const nx = -uz; const nz = ux;
    const yaw = -Math.atan2(dz, dx);
    const deckY = Math.max(host.layout.terrain.height(bridge.from.x, bridge.from.z), host.layout.terrain.height(bridge.to.x, bridge.to.z));
    const H = 7; const panels = Math.max(4, Math.round(len / 9)); const step = len / panels;
    for (const side of [-1, 1]) {
      const ox = nx * side * 6.6; const oz = nz * side * 6.6;
      const at = (t: number) => ({ x: bridge.from.x + ux * t + ox, z: bridge.from.z + uz * t + oz });
      const mid = at(len / 2);
      bars.push([mid.x, deckY + H, mid.z, len, 0.6, yaw, 0, 0]);          // 上弦
      bars.push([mid.x, deckY + 0.2, mid.z, len, 0.6, yaw, 0, 0]);        // 下弦
      for (let i = 0; i <= panels; i += 1) {
        const p = at(i * step);
        bars.push([p.x, deckY, p.z, 0.45, H, yaw, 0, 1]);                 // 竖杆
        if (i < panels) {
          const q = at((i + 0.5) * step);
          bars.push([q.x, deckY, q.z, 0.4, Math.hypot(step, H), yaw, (i % 2 ? 1 : -1) * Math.atan2(step, H), 1]); // 斜腹杆
        }
      }
    }
    // 顶部横撑（每两格一根），让桁架从远处读成「穿式」而不是两片护栏。
    for (let i = 0; i <= panels; i += 2) {
      const t = i * step; const x = bridge.from.x + ux * t; const z = bridge.from.z + uz * t;
      bars.push([x, deckY + H, z, 13.2, 0.5, yaw + Math.PI / 2, 0, 0]);
    }
  }
  const mesh = new THREE.InstancedMesh(unit, red, bars.length);
  bars.forEach(([x, y, z, a, b, rotY, tilt, vertical], i) => {
    host.positionVector.set(x, y, z);
    host.euler.set(0, rotY, vertical ? tilt : 0, "YXZ");
    // 横向件：长度沿局部 x；竖向件：高度沿局部 y、绕局部 z 倾斜成斜腹杆。
    if (vertical) host.scaleVector.set(a, b, a); else host.scaleVector.set(a, b, b);
    if (!vertical) host.positionVector.y -= b / 2;
    host.quaternion.setFromEuler(host.euler);
    host.matrix.compose(host.positionVector, host.quaternion, host.scaleVector);
    mesh.setMatrixAt(i, host.matrix);
  });
  mesh.castShadow = true;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = "city-landmark-truss-bridge";
  host.group.add(mesh);
  host.disposables.push(unit, red);
}
