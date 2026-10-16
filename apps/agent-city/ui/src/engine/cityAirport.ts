/**
 * L-4 机场岛 + L-5 多跨堤道桥（CITY_LANDMARK_BACKLOG）：主岛外浅水区一座填海平台（跑道、壳形航站楼、塔台、
 * 登机桥指廊），由一条低矮的多跨堤道（薄板桥面 + 等距排架墩 + 护栏）与主岛相连。纯程序化原创几何，
 * 不参照任何具体机场；装饰，不进路网、不代表会话。选址：避开海滨景观段与港口方位的那段海岸，向外 140。
 */
import * as THREE from "three";
import type { Vec2 } from "./cityLayout";

export type AirportPlan = { shore: Vec2; centre: Vec2; yaw: number; outward: Vec2 };

/** 在海岸上挑一个点：离核心最远方向里、离港口与海滨景观段都远的岸点。 */
/** 把非桥路段按 ~20 采样成点集，供选址判断「岸点离路多远」。 */
export function roadSamples(edges: Array<{ points: Vec2[]; bridge?: boolean }>): Vec2[] {
  const out: Vec2[] = [];
  for (const e of edges) {
    if (e.bridge) continue;
    const a = e.points[0]; const b = e.points[e.points.length - 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 20));
    for (let k = 0; k <= n; k += 1) out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  }
  return out;
}

export function planAirport(coast: Vec2[], core: Vec2, avoid: Vec2[], roads: Vec2[] = [], isWater?: (x: number, z: number) => boolean): AirportPlan | null {
  if (coast.length < 8) return null;
  // 堤道陆地端必须落在路网上（用户截图：堤道接到没有路的山岬上）：岸点 30 内有路的优先，其次才是纯按远近。
  // 整个平台（240×110 + 护岸，沿海岸平行铺开）必须全在水里（用户截图：机场压在陆地上——海岸弯曲时长边的一头会伸到岸上）：
  // 按得分从高到低试岸点，每个岸点试 140/170/200/240 四个离岸距离，平台范围按 20 间距采样全部入水才通过。
  const ranked: Array<{ p: Vec2; score: number }> = [];
  for (const p of coast) {
    const far = Math.hypot(p.x - core.x, p.z - core.z);
    const clear = Math.min(...avoid.map((a) => Math.hypot(a.x - p.x, a.z - p.z)), 999);
    if (clear < 160) continue;
    let road = Infinity; for (const r of roads) road = Math.min(road, Math.hypot(r.x - p.x, r.z - p.z));
    ranked.push({ p, score: far + clear * 0.5 + (roads.length ? (road <= 30 ? 1000 : -road) : 0) });
  }
  ranked.sort((a, b) => b.score - a.score);
  const L = 240 + 12; const W = 110 + 12;
  const footprintWet = (centre: Vec2, yaw: number): boolean => {
    if (!isWater) return true;
    const c = Math.cos(yaw); const sn = Math.sin(yaw);
    for (let lx = -L / 2; lx <= L / 2 + 0.1; lx += 20) for (let lz = -W / 2; lz <= W / 2 + 0.1; lz += 20) {
      // three 的 rotation.y = θ：本地 (lx, lz) → 世界 (lx·cosθ + lz·sinθ, −lx·sinθ + lz·cosθ)
      if (!isWater(centre.x + lx * c + lz * sn, centre.z - lx * sn + lz * c)) return false;
    }
    return true;
  };
  for (const cand of ranked) {
    const len = Math.hypot(cand.p.x - core.x, cand.p.z - core.z) || 1;
    const outward = { x: (cand.p.x - core.x) / len, z: (cand.p.z - core.z) / len };
    let shore = cand.p;
    if (roads.length) { // 起点吸附到最近路点（≤40），堤道从路上起步
      let nearest = roads[0]; let nd = Infinity;
      for (const r of roads) { const d = Math.hypot(r.x - cand.p.x, r.z - cand.p.z); if (d < nd) { nd = d; nearest = r; } }
      if (nd <= 40) shore = { x: nearest.x, z: nearest.z };
    }
    for (const dist of [140, 170, 200, 240]) {
      const centre = { x: cand.p.x + outward.x * dist, z: cand.p.z + outward.z * dist };
      const yaw = Math.atan2(outward.x, outward.z);
      if (footprintWet(centre, yaw)) return { shore, centre, outward, yaw };
    }
  }
  return null;
}

/** 生成机场岛 + 堤道网格组（单一 Group，名字以 city-landmark-airport 开头供拾取）。 */
export function buildAirport(plan: AirportPlan, disposables: Array<{ dispose: () => void }>, nightHead: THREE.Material | null,
  roadTopAt?: (x: number, z: number) => number | null): THREE.Group {
  const group = new THREE.Group();
  group.name = "city-landmark-airport";
  const mat = (color: string) => { const m = new THREE.MeshLambertMaterial({ color }); disposables.push(m); return m; };
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, ry = 0, parent: THREE.Object3D = island) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.rotation.y = ry;
    mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); disposables.push(geometry); return mesh;
  };
  // 机场岛：局部坐标，z 轴 = 离岸方向，跑道沿 x（与海岸平行）。
  const island = new THREE.Group();
  island.position.set(plan.centre.x, 0, plan.centre.z);
  island.rotation.y = plan.yaw;
  group.add(island);
  const L = 240; const W = 110;
  add(new THREE.BoxGeometry(L, 2.4, W).translate(0, 0.2, 0), mat("#cfc9b8"), 0, -1, 0);                   // 填海平台
  add(new THREE.BoxGeometry(L + 6, 0.8, W + 6).translate(0, 0.4, 0), mat("#9c968a"), 0, -1.4, 0);        // 护岸石
  add(new THREE.BoxGeometry(L - 20, 0.1, 22).translate(0, 0.05, 0), mat("#3e4448"), 0, 1.4, -18);        // 跑道
  for (let x = -L / 2 + 22; x < L / 2 - 22; x += 12) add(new THREE.BoxGeometry(6, 0.02, 0.6), mat("#f2f0e6"), x, 1.52, -18);  // 中线
  for (const side of [-1, 1]) for (let k = 0; k < 6; k += 1) add(new THREE.BoxGeometry(0.6, 0.02, 14), mat("#f2f0e6"), side * (L / 2 - 16 - k * 1.6), 1.52, -18); // 端头斑马线
  add(new THREE.BoxGeometry(L - 40, 0.08, 10).translate(0, 0.04, 0), mat("#565c60"), 0, 1.4, 4);         // 滑行道
  // 壳形航站楼：沿弧排列的褶皱壳片。
  const shell = mat("#f4f6f2");
  for (let k = 0; k < 7; k += 1) {
    const piece = add(new THREE.CylinderGeometry(9, 9, 10, 16, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), shell, -36 + k * 12, 6, 30);
    (piece.material as THREE.MeshLambertMaterial).side = THREE.DoubleSide;
  }
  add(new THREE.BoxGeometry(86, 6, 18).translate(0, 3, 0), mat("#4f6b78"), 0, 1.4, 30);                 // 玻璃立面
  for (const x of [-30, 0, 30]) {                                                                         // 登机桥指廊
    const bridge = add(new THREE.BoxGeometry(3, 3, 16).translate(0, 1.5, -8), mat("#dfe3e0"), x, 3, 21);
    bridge.rotation.x = 0.05;
  }
  // 塔台：细身 + 悬挑玻璃顶舱 + 红灯。
  add(new THREE.CylinderGeometry(1.6, 2.2, 30, 10).translate(0, 15, 0), mat("#e2ddd2"), 80, 1.4, 34);
  add(new THREE.CylinderGeometry(5, 4, 4.5, 10).translate(0, 2.25, 0), mat("#3f5f6e"), 80, 31.4, 34);
  add(new THREE.CylinderGeometry(5.4, 5.4, 0.6, 10), mat("#e2ddd2"), 80, 36.2, 34);
  add(new THREE.SphereGeometry(0.7, 8, 6), nightHead ?? mat("#ff3b3b"), 80, 37.2, 34);
  // 跑道边灯（夜间与路灯同批次材质，白天不亮）。
  if (nightHead) for (let x = -L / 2 + 14; x <= L / 2 - 14; x += 14) for (const z of [-30, -6]) add(new THREE.BoxGeometry(0.6, 0.4, 0.6), nightHead, x, 1.6, z);
  buildCauseway(group, plan.shore, { x: plan.centre.x - plan.outward.x * (W / 2), z: plan.centre.z - plan.outward.z * (W / 2) }, mat, add, roadTopAt);
  return group;
}

/** L-5 多跨堤道：薄板桥面 + 每 20 一排架墩 + 两侧护栏，桥面中部微拱；机场岛与歌剧院岛共用。 */
export function buildCauseway(
  group: THREE.Group, start: Vec2, end: Vec2,
  mat: (color: string) => THREE.Material,
  add: (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, ry?: number, parent?: THREE.Object3D) => THREE.Mesh,
  roadTopAt?: (x: number, z: number) => number | null,
): void {
  const span = Math.hypot(end.x - start.x, end.z - start.z);
  const yaw = -Math.atan2(end.z - start.z, end.x - start.x);
  const steps = Math.max(4, Math.round(span / 20));
  // The causeway is scenery, not a released driving surface. Where it crosses a real
  // ground road, its actual underside must leave headroom (formerly only 1.1 units).
  // Probe the complete slab footprint, including a margin outside both side edges.
  const clearances: number[] = [];
  let shoreLift = 0;
  for (let i = 0; i < steps; i++) {
    let required = -Infinity;
    if (roadTopAt) for (let s = i * span / steps - 1; s <= (i + 1) * span / steps + 1; s += 0.5) for (let side = -7; side <= 7; side += 0.5) {
      const x = start.x + Math.cos(yaw) * s + Math.sin(yaw) * side;
      const z = start.z - Math.sin(yaw) * s + Math.cos(yaw) * side;
      const y = roadTopAt(x,z);
      if (y !== null && Number.isFinite(y)) required = Math.max(required, y + 2 + 0.35);
    }
    clearances.push(required);
    const tm = (i + 0.5) / steps, base = 2.2 + Math.sin(tm * Math.PI) * 1.6;
    shoreLift = Math.max(shoreLift, (required - base) / (1 - tm));
  }
  for (let i = 0; i < steps; i += 1) {
    const t0 = i / steps; const t1 = (i + 1) / steps; const tm = (t0 + t1) / 2;
    const deck = Math.max(clearances[i], 2.2 + Math.sin(tm * Math.PI) * 1.6 + shoreLift * (1-tm));
    const x = start.x + (end.x - start.x) * tm; const z = start.z + (end.z - start.z) * tm;
    add(new THREE.BoxGeometry(span / steps + 0.2, 0.7, 12), mat("#8e9496"), x, deck, z, yaw, group);
    for (const side of [-1, 1]) add(new THREE.BoxGeometry(span / steps, 0.8, 0.3).translate(0, 0.4, 0), mat("#d9dcd6"), x + Math.sin(yaw) * side * 5.8, deck + 0.35, z + Math.cos(yaw) * side * 5.8, yaw, group);
    const px = start.x + (end.x - start.x) * t1; const pz = start.z + (end.z - start.z) * t1;
    add(new THREE.BoxGeometry(1.6, deck + 2, 10).translate(0, -(deck + 2) / 2, 0), mat("#a9aaa0"), px, deck, pz, yaw, group);  // 排架墩
  }
}
