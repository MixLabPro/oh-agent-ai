/**
 * L-4 机场岛 + L-5 多跨堤道桥（CITY_LANDMARK_BACKLOG）：主岛外浅水区一座填海平台（跑道、壳形航站楼、塔台、
 * 登机桥指廊），由一条低矮的多跨堤道（薄板桥面 + 等距排架墩 + 护栏）与主岛相连。纯程序化原创几何，
 * 不参照任何具体机场；装饰，不进路网、不代表会话。选址：避开海滨景观段与港口方位的那段海岸，向外 140。
 */
import * as THREE from "three";
import type { Vec2 } from "./cityLayout";

export type AirportPlan = { shore: Vec2; centre: Vec2; yaw: number; outward: Vec2 };

/** 在海岸上挑一个点：离核心最远方向里、离港口与海滨景观段都远的岸点。 */
export function planAirport(coast: Vec2[], core: Vec2, avoid: Vec2[]): AirportPlan | null {
  if (coast.length < 8) return null;
  let best: { p: Vec2; score: number } | null = null;
  for (const p of coast) {
    const far = Math.hypot(p.x - core.x, p.z - core.z);
    const clear = Math.min(...avoid.map((a) => Math.hypot(a.x - p.x, a.z - p.z)), 999);
    if (clear < 160) continue;
    const score = far + clear * 0.5;
    if (!best || score > best.score) best = { p, score };
  }
  if (!best) return null;
  const len = Math.hypot(best.p.x - core.x, best.p.z - core.z) || 1;
  const outward = { x: (best.p.x - core.x) / len, z: (best.p.z - core.z) / len };
  const centre = { x: best.p.x + outward.x * 140, z: best.p.z + outward.z * 140 };
  return { shore: best.p, centre, outward, yaw: Math.atan2(outward.x, outward.z) };
}

/** 生成机场岛 + 堤道网格组（单一 Group，名字以 city-landmark-airport 开头供拾取）。 */
export function buildAirport(plan: AirportPlan, disposables: Array<{ dispose: () => void }>, nightHead: THREE.Material | null): THREE.Group {
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
  // L-5 多跨堤道：岸点 → 机场岛近岸边缘，薄板桥面 + 每 20 一排架墩 + 两侧护栏，桥面中部微拱。
  const start = plan.shore; const end = { x: plan.centre.x - plan.outward.x * (W / 2), z: plan.centre.z - plan.outward.z * (W / 2) };
  const span = Math.hypot(end.x - start.x, end.z - start.z);
  const yaw = -Math.atan2(end.z - start.z, end.x - start.x);
  const steps = Math.max(4, Math.round(span / 20));
  for (let i = 0; i < steps; i += 1) {
    const t0 = i / steps; const t1 = (i + 1) / steps; const tm = (t0 + t1) / 2;
    const deck = 2.2 + Math.sin(tm * Math.PI) * 1.6;
    const x = start.x + (end.x - start.x) * tm; const z = start.z + (end.z - start.z) * tm;
    add(new THREE.BoxGeometry(span / steps + 0.2, 0.7, 12), mat("#8e9496"), x, deck, z, yaw, group);
    for (const side of [-1, 1]) add(new THREE.BoxGeometry(span / steps, 0.8, 0.3).translate(0, 0.4, 0), mat("#d9dcd6"), x + Math.sin(yaw) * side * 5.8, deck + 0.35, z + Math.cos(yaw) * side * 5.8, yaw, group);
    const px = start.x + (end.x - start.x) * t1; const pz = start.z + (end.z - start.z) * t1;
    add(new THREE.BoxGeometry(1.6, deck + 2, 10).translate(0, -(deck + 2) / 2, 0), mat("#a9aaa0"), px, deck, pz, yaw, group);  // 排架墩
  }
  return group;
}
