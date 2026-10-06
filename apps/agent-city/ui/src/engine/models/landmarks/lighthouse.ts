import * as THREE from "three";
import type { LandmarkCtx } from "../landmarkContext";

/** 地标「lighthouse」的程序化造型（从 cityParts.buildLandmarks 的 if 链原样搬出，行为不变）。 */
export function drawLighthouse({ group, mesh, material, white, red, cap, neon, host }: LandmarkCtx): void {
  const h = Math.min(cap, 32);
  const bands = 6;
  for (let i = 0; i < bands; i += 1) {
    const r0 = 3.4 - (i / bands) * 1.4; const r1 = 3.4 - ((i + 1) / bands) * 1.4;
    mesh(new THREE.CylinderGeometry(r1, r0, h / bands, 14).translate(0, h / bands / 2, 0), i % 2 ? red : white, group, 0, (i * h) / bands, 0);
  }
  // 细化：石砌基座 + 守塔人小屋、塔顶环形观景廊（廊板 + 栏杆立柱）、玻璃灯室（竖棂）与穹顶通风帽。
  mesh(new THREE.CylinderGeometry(4.6, 5, 1.6, 16).translate(0, 0.8, 0), material("#b9b2a2"), group, 0, -0.2, 0);
  mesh(new THREE.BoxGeometry(7, 3.6, 5).translate(0, 1.8, 0), white, group, 6.2, 0, 0);
  mesh(new THREE.BoxGeometry(7.6, 0.5, 5.6).translate(0, 0.25, 0), red, group, 6.2, 3.6, 0);
  mesh(new THREE.CylinderGeometry(3.1, 3.1, 0.35, 18).translate(0, 0.17, 0), material("#3c4650"), group, 0, h, 0);   // 观景廊板
  for (let k = 0; k < 16; k += 1) {
    const t = (k / 16) * Math.PI * 2;
    mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12).translate(0, 0.55, 0), material("#3c4650"), group, Math.cos(t) * 2.95, h + 0.35, Math.sin(t) * 2.95);
  }
  mesh(new THREE.TorusGeometry(2.95, 0.07, 4, 32).rotateX(Math.PI / 2), material("#3c4650"), group, 0, h + 1.45, 0);
  mesh(new THREE.CylinderGeometry(2, 2, 3, 12).translate(0, 1.5, 0), material("#fff2c0", 1.5), group, 0, h + 0.35, 0);
  for (let k = 0; k < 8; k += 1) {
    const t = (k / 8) * Math.PI * 2;
    mesh(new THREE.BoxGeometry(0.14, 3, 0.14).translate(0, 1.5, 0), material("#2d343b"), group, Math.cos(t) * 2.02, h + 0.35, Math.sin(t) * 2.02);
  }
  mesh(new THREE.SphereGeometry(2.4, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), red, group, 0, h + 3.35, 0);
  mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.4, 8).translate(0, 0.7, 0), material("#2d343b"), group, 0, h + 5.6, 0);
  if (neon) {
    // 旋转光束：两束对向的加色锥，绕竖轴转（进 bloom）。
    const beamMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff2c0").multiplyScalar(1.6), transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    host.disposables.push(beamMaterial);
    const beam = new THREE.Group();
    beam.position.set(0, h + 1.5, 0);
    for (const side of [-1, 1]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(7, 160, 16, 1, true).translate(0, -90, 0).rotateZ((side * Math.PI) / 2), beamMaterial);
      host.disposables.push(cone.geometry);
      beam.add(cone);
    }
    group.add(beam);
    host.landmarkSpinners.push({ object: beam, axis: "y", speed: 0.9 });
  }
}
