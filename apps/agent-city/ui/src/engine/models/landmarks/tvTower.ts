import * as THREE from "three";
import type { LandmarkCtx } from "../landmarkContext";

/** 地标「tv-tower」的程序化造型（从 cityParts.buildLandmarks 的 if 链原样搬出，行为不变）。 */
export function drawTvTower({ group, mesh, material, white, steel, red, cap, neon }: LandmarkCtx): void {
  const h = Math.min(cap, 70);
  mesh(new THREE.CylinderGeometry(1.6, 3.2, h * 0.78, 12).translate(0, h * 0.39, 0), steel, group, 0, 0, 0);
  mesh(new THREE.SphereGeometry(5.5, 18, 12).scale(1, 0.55, 1), white, group, 0, h * 0.72, 0);
  mesh(new THREE.TorusGeometry(6.2, 0.5, 6, 32).rotateX(Math.PI / 2), material("#7fb4c2", neon ? 0.8 : 0.2), group, 0, h * 0.72, 0);
  mesh(new THREE.CylinderGeometry(0.25, 0.45, h * 0.24, 6).translate(0, h * 0.12, 0), red, group, 0, h * 0.78, 0);
  // 细化：裙房入口、塔基三脚支撑、塔身两道环形检修平台、球舱下方深色玻璃观景层、天线上的航空灯球。
  mesh(new THREE.CylinderGeometry(8, 8.5, 4, 16).translate(0, 2, 0), white, group, 0, 0, 0);
  for (let k = 0; k < 3; k += 1) { const t = (k / 3) * Math.PI * 2; const leg = mesh(new THREE.BoxGeometry(1.4, 14, 1.4).translate(0, 7, 0), steel, group, Math.cos(t) * 4.5, 3, Math.sin(t) * 4.5); leg.rotation.z = Math.cos(t) * 0.18; leg.rotation.x = -Math.sin(t) * 0.18; }
  for (const f of [0.3, 0.5]) mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.5, 14), white, group, 0, h * f, 0);
  mesh(new THREE.CylinderGeometry(5.2, 4.6, 1.8, 18).translate(0, 0.9, 0), material("#2f4552"), group, 0, h * 0.72 - 3.8, 0);
  mesh(new THREE.SphereGeometry(0.6, 8, 6), material("#ff3b3b", 1.5), group, 0, h * 0.78 + h * 0.24, 0);
}
