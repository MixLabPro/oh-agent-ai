import * as THREE from "three";
import type { LandmarkCtx } from "../landmarkContext";
import { LIGHT_BUDGET } from "../../cityLightBudget";

/** 地标「suspension-bridge」的程序化造型（从 cityParts.buildLandmarks 的 if 链原样搬出，行为不变）。 */
export function drawSuspensionBridge({ group, landmark, mesh, material, steel, neon, host }: LandmarkCtx): void {
  if (!landmark.to) return;
  // 悬索桥：沿既有过河桥加两座门式塔与主缆、吊索（路网不变，只是换造型）。
  // 桥面高度与 buildInfrastructure 的桥面一致（两端地形高度的较大者）；塔、吊索都以它为底。
  // 曾把主缆写成整段抛物线并且塔底/吊索底硬编码在 y=0/8.2：塔外侧 |local|>1 时抛物线反向上翘，
  // 两侧缆索飞到塔顶之上（用户截图「两边桥上天了」）——主缆现在只在两塔之间是悬链，塔外是落到桥面的斜拉后锚。
  group.position.set(landmark.x, 0, landmark.z);
  group.rotation.y = -Math.atan2(landmark.to.z - landmark.z, landmark.to.x - landmark.x);
  const span = Math.hypot(landmark.to.x - landmark.x, landmark.to.z - landmark.z);
  const deckY = Math.max(0.3, host.layout.terrain.height(landmark.x, landmark.z), host.layout.terrain.height(landmark.to.x, landmark.to.z));
  const towerH = 34;
  const topY = deckY + towerH - 1;
  const t0 = span * 0.18;
  const t1 = span * 0.82;
  const mid = (t0 + t1) / 2;
  const lowY = deckY + 9;
  const towerMaterial = material("#c8473a");
  for (const x of [t0, t1]) {
    for (const side of [-1, 1]) mesh(new THREE.BoxGeometry(1.6, towerH, 1.6).translate(0, towerH / 2, 0), towerMaterial, group, x, deckY, side * 5.5);
    mesh(new THREE.BoxGeometry(1.6, 1.6, 12.6).translate(0, 0.8, 0), towerMaterial, group, x, deckY + towerH - 4, 0);
  }
  const lights = host.nightLights;
  const bulbs: Array<[number, number, number, number]> = []; // x,y,z,kind(0 = 暖灯, 1 = 霓虹)
  const cableY = (x: number) => {
    if (x < t0) return deckY + 1 + (x / Math.max(1, t0)) * (topY - deckY - 1);
    if (x > t1) return deckY + 1 + ((span - x) / Math.max(1, span - t1)) * (topY - deckY - 1);
    const c = (x - mid) / ((t1 - t0) / 2);
    return lowY + (topY - lowY) * c * c;
  };
  for (const side of [-1, 1]) {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i += 1) {
      const x = (i / 40) * span;
      points.push(new THREE.Vector3(x, cableY(x), side * 5.5));
    }
    const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 64, 0.3, 5), steel);
    host.disposables.push(cable.geometry);
    group.add(cable);
    // 吊索：只在两塔之间，从桥面立起到主缆。
    for (let x = t0 + 3; x < t1 - 2; x += 4) {
      const y = cableY(x);
      const hanger = new THREE.Mesh(new THREE.BoxGeometry(0.12, y - deckY - 0.9, 0.12).translate(0, (y - deckY - 0.9) / 2, 0), steel);
      hanger.position.set(x, deckY + 0.9, side * 5.5);
      host.disposables.push(hanger.geometry);
      group.add(hanger);
      bulbs.push([x, y - 0.5, side * 5.5, 0]);
    }
    // 桥面护栏灯串与塔身霓虹。
    for (let x = 4; x < span - 3; x += 7) bulbs.push([x, deckY + 1.1, side * 5.2, 0]);
    for (const tx of [t0, t1]) {
      bulbs.push([tx, deckY + towerH + 0.4, side * 5.5, 1]);
      for (let k = 1; k <= 4; k += 1) bulbs.push([tx, deckY + (towerH * k) / 5, side * 5.5 + side * 0.9, 1]);
    }
  }
  if (lights && bulbs.length) {
    const place = (list: typeof bulbs, material: THREE.Material, size: number, neonTint: boolean) => {
      if (!list.length) return;
      const instanced = new THREE.InstancedMesh(new THREE.BoxGeometry(size, size, size), material, list.length);
      list.forEach((b, i) => {
        host.matrix.compose(host.positionVector.set(b[0], b[1], b[2]), host.quaternion.identity(), host.scaleVector.set(1, 1, 1));
        instanced.setMatrixAt(i, host.matrix);
        if (neonTint) instanced.setColorAt(i, host.color.set(i % 2 === 0 ? "#38e8ff" : "#ff4fd8").lerp(host.spillWhite.set("#fff1dc"), 1 - LIGHT_BUDGET.neon.bridgeSaturation)); // N4：桥塔霓虹降饱和
      });
      instanced.instanceMatrix.needsUpdate = true;
      if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
      instanced.frustumCulled = false;
      host.disposables.push(instanced.geometry);
      group.add(instanced);
    };
    place(bulbs.filter((b) => b[3] === 0), lights.heads, 0.5, false);
    place(bulbs.filter((b) => b[3] === 1), lights.neon, 0.9, true);
  }
}
