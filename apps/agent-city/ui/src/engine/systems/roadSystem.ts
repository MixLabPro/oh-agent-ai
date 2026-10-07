/**
 * 道路系统：基础设施（桥面/路缘）、区界高架、红色桁架桥。
 * 纯搬移自 CityParts（CITY_ENGINE_SPLIT_SPEC §4-6）：函数体逐字不变，`this.` -> `host.`。
 */

import * as THREE from "three";
import type { CityLayout } from "../cityLayout";
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

/** Batched city furniture and waterfront infrastructure, not selectable data. */
export function buildInfrastructure(host: RoadHost): void {
  type Part = { x: number; y: number; z: number; sx: number; sy: number; sz: number; color: string; tilt?: number; yaw?: number };
  const parts: Part[] = [];
  const add = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, tilt = 0, yaw = 0) => parts.push({ x, y, z, sx, sy, sz, color, tilt, yaw });
  // Curbs and street lights are real geometry; asphalt and markings share the atlas.
  for (const edge of host.layout.roadEdges) {
    // Bridge spans need actual geometry; the terrain atlas is below the river surface.
    if (edge.bridge) {
      const [a, b] = edge.points;
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      const yaw = -Math.atan2(b.z - a.z, b.x - a.x);
      const x = (a.x + b.x) / 2; const z = (a.z + b.z) / 2;
      // Deck top meets the level plain; unlike atlas roads it remains above water.
      const deckTop = Math.max(host.layout.terrain.height(a.x, a.z), host.layout.terrain.height(b.x, b.z));
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
    if (segment < 14) continue;
    const length = segment - 11;
    const yaw = -Math.atan2(b.z - a.z, b.x - a.x);
    const nx = -(b.z - a.z) / segment; const nz = (b.x - a.x) / segment; // 路段法向
    const x = (a.x + b.x) / 2; const z = (a.z + b.z) / 2;
    const base = Math.max(0, host.layout.terrain.height(x, z));
    for (const side of [-1, 1]) {
      const offset = side * (edge.width / 2 + 0.25);
      add(x + nx * offset, base + 0.02, z + nz * offset, length, 0.18, 0.35, "#cbc6ba", 0, yaw);
    }
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
