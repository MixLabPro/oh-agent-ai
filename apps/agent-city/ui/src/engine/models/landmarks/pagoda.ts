import * as THREE from "three";
import type { LandmarkCtx } from "../landmarkContext";

/** 地标「pagoda」的程序化造型（从 cityParts.buildLandmarks 的 if 链原样搬出，行为不变）。 */
export function drawPagoda({ group, mesh, material }: LandmarkCtx): void {
  const tiers = 7;
  let y = 0;
  mesh(new THREE.BoxGeometry(16, 2, 16).translate(0, 1, 0), material("#d9d3c2"), group, 0, 0, 0);
  y = 2;
  const roof = material("#3d5a4f");
  const wall = material("#b5463a");
  for (let i = 0; i < tiers; i += 1) {
    const w = 10 - i * 1.1;
    mesh(new THREE.BoxGeometry(w, 3.6, w).translate(0, 1.8, 0), wall, group, 0, y, 0);
    // 檐：四棱锥扁台，比墙宽一圈，角略上翘的感觉靠「宽而薄」。
    mesh(new THREE.ConeGeometry(w * 0.95, 1.6, 4).rotateY(Math.PI / 4).translate(0, 0.8, 0), roof, group, 0, y + 3.6, 0);
    // 细化：四角起翘（檐角小斜块）、每层平座栏杆、正面门洞。
    for (const [cx, cz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const tip = mesh(new THREE.BoxGeometry(0.5, 0.4, 1.6), roof, group, cx * w * 0.66, y + 3.7, cz * w * 0.66);
      tip.rotation.y = Math.atan2(cx, cz); tip.rotation.x = -0.5;
    }
    for (const side of [-1, 1]) {
      mesh(new THREE.BoxGeometry(w + 0.4, 0.5, 0.15).translate(0, 0.25, 0), material("#e8d9b0"), group, 0, y + 0.1, side * (w / 2 + 0.2));
      mesh(new THREE.BoxGeometry(0.15, 0.5, w + 0.4).translate(0, 0.25, 0), material("#e8d9b0"), group, side * (w / 2 + 0.2), y + 0.1, 0);
    }
    mesh(new THREE.BoxGeometry(w * 0.3, 2.2, 0.15).translate(0, 1.1, 0), material("#3a2a22"), group, 0, y + 0.6, w / 2 + 0.05);
    y += 4.4;
  }
  mesh(new THREE.CylinderGeometry(0.2, 0.35, 6, 6).translate(0, 3, 0), material("#c9a24a"), group, 0, y, 0);
}
