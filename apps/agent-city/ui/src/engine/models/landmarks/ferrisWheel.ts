import * as THREE from "three";
import type { LandmarkCtx } from "../landmarkContext";

/** 地标「ferris-wheel」的程序化造型（从 cityParts.buildLandmarks 的 if 链原样搬出，行为不变）。 */
export function drawFerrisWheel({ group, mesh, material, steel, cap, neon, host }: LandmarkCtx): void {
  // 远景里曾显得很小（多视角评估）：半径 20 → 26。
  const radius = Math.min(cap * 0.5, 26);
  for (const side of [-1, 1]) {
    mesh(new THREE.BoxGeometry(1, radius + 4, 1).translate(0, (radius + 4) / 2, 0), steel, group, -4, 0, side * 3).rotation.z = side * 0.18;
    mesh(new THREE.BoxGeometry(1, radius + 4, 1).translate(0, (radius + 4) / 2, 0), steel, group, 4, 0, side * 3).rotation.z = -side * 0.18;
  }
  const wheel = new THREE.Group();
  wheel.position.set(0, radius + 4, 0);
  // 细化：双轮缘（前后两圈 + 横撑）、中心轮毂与轴、圆筒形吊舱（带窗带）、底部登乘平台与售票亭。
  for (const z of [-1.2, 1.2]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.4, 6, 48), material("#e8eef0", neon ? 0.6 : 0));
    ring.position.z = z; host.disposables.push(ring.geometry); wheel.add(ring);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 3.4, 16).rotateX(Math.PI / 2), steel);
  host.disposables.push(hub.geometry); wheel.add(hub);
  mesh(new THREE.CylinderGeometry(0.5, 0.5, 8, 10).rotateX(Math.PI / 2), steel, group, 0, radius + 4, 0);
  mesh(new THREE.BoxGeometry(14, 1, 8).translate(0, 0.5, 0), material("#d9d3c2"), group, 0, 0, 0);
  mesh(new THREE.BoxGeometry(4, 3, 3).translate(0, 1.5, 0), material("#ff6f61"), group, 8.5, 0, 2);
  mesh(new THREE.BoxGeometry(4.6, 0.3, 3.6).translate(0, 0.15, 0), material("#f2efe6"), group, 8.5, 3, 2);
  const cabins = 16;
  for (let i = 0; i < cabins; i += 1) {
    const t = (i / cabins) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.25, radius, 0.25).translate(0, radius / 2, 0), steel);
    spoke.rotation.z = t;
    host.disposables.push(spoke.geometry);
    wheel.add(spoke);
    for (const z of [-1.2, 1.2]) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(0.18, radius, 0.18).translate(0, radius / 2, 0), steel);
      rim.rotation.z = t; rim.position.z = z; host.disposables.push(rim.geometry); wheel.add(rim);
    }
    const cabin = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 2.4, 10).rotateX(Math.PI / 2), material(["#ff6f61", "#ffd166", "#06d6a0", "#118ab2"][i % 4], neon ? 0.5 : 0));
    cabin.position.set(Math.cos(t) * radius, Math.sin(t) * radius - 1.3, 0);
    host.disposables.push(cabin.geometry);
    wheel.add(cabin);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.7, 10).rotateX(Math.PI / 2), material("#2f4552"));
    band.position.set(Math.cos(t) * radius, Math.sin(t) * radius - 1.1, 0);
    host.disposables.push(band.geometry); wheel.add(band);
  }
  group.add(wheel);
  host.landmarkSpinners.push({ object: wheel, axis: "z", speed: 0.08 });
}
