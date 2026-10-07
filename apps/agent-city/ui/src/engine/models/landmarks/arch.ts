import * as THREE from "three";
import type { LandmarkCtx } from "../landmarkContext";

/** 地标「arch」的程序化造型（从 cityParts.buildLandmarks 的 if 链原样搬出，行为不变）。 */
export function drawArch({ group, mesh, material, cap }: LandmarkCtx): void {
  // 凯旋门（细化）：基座 → 两侧墩身（每面一对附柱）→ 半圆拱券开口 → 檐口 → 顶楼（attic）→ 顶部雕像组。
  // 曾是两根方柱 + 横梁（用户：「请细化这些建筑模型」）。全部为通用古典语汇，不参照具体建筑。
  const h = Math.min(cap, 26);
  const stone = material("#ece5d6"); const trim = material("#d6ccb7"); const bronze = material("#8a7a52");
  const W = 31; const D = 9; const pierW = 7.5; const openW = W - pierW * 2; const springY = h * 0.55; // 开口 16：骑在 12 宽主干道上 const openW = W - pierW * 2; const springY = h * 0.55;
  // 基座只在两墩下：开口里是路面，不能被基座盖住（骑路后截图发现）。
  for (const side of [-1, 1]) mesh(new THREE.BoxGeometry(pierW + 1.5, 1.6, D + 3).translate(0, 0.8, 0), trim, group, side * (openW / 2 + pierW / 2 + 0.75), 0, 0);
  for (const side of [-1, 1]) {
    const cx = side * (openW / 2 + pierW / 2);
    mesh(new THREE.BoxGeometry(pierW, h, D).translate(0, h / 2, 0), stone, group, cx, 1.6, 0);          // 墩身
    for (const face of [-1, 1]) for (const k of [-1, 1]) {                                              // 每面一对附柱
      mesh(new THREE.CylinderGeometry(0.55, 0.6, h - 2.4, 10).translate(0, (h - 2.4) / 2, 0), trim, group, cx + k * 2.4, 2.8, face * (D / 2 + 0.35));
      mesh(new THREE.BoxGeometry(1.6, 0.8, 1.2).translate(0, 0.4, 0), trim, group, cx + k * 2.4, 1.6, face * (D / 2 + 0.35));
    }
    mesh(new THREE.BoxGeometry(3.4, 4.2, 0.4), bronze, group, cx, springY + 3, D / 2 + 0.25);          // 浮雕板
  }
  // 拱券：开口上方实体，减去半圆——用半圆柱面（内侧）+ 两侧拱肩块近似。
  mesh(new THREE.BoxGeometry(openW, h - springY - openW / 2, D).translate(0, (h - springY - openW / 2) / 2, 0), stone, group, 0, 1.6 + springY + openW / 2, 0);
  const vault = new THREE.CylinderGeometry(openW / 2, openW / 2, D, 24, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2);
  const vaultMesh = mesh(vault, material("#e2dac8"), group, 0, 1.6 + springY, 0);
  (vaultMesh.material as THREE.MeshLambertMaterial).side = THREE.DoubleSide;
  mesh(new THREE.TorusGeometry(openW / 2 + 0.3, 0.35, 6, 24, Math.PI), trim, group, 0, 1.6 + springY, D / 2 + 0.05);        // 拱圈线脚
  mesh(new THREE.BoxGeometry(W + 1.6, 1.1, D + 1.6).translate(0, 0.55, 0), trim, group, 0, h + 1.6, 0); // 檐口
  mesh(new THREE.BoxGeometry(W - 2, 5, D - 1).translate(0, 2.5, 0), stone, group, 0, h + 2.7, 0);       // 顶楼
  mesh(new THREE.BoxGeometry(W - 6, 2.2, 0.3), bronze, group, 0, h + 5.2, (D - 1) / 2 + 0.2);           // 题铭板（无文字）
  mesh(new THREE.BoxGeometry(W - 1, 0.7, D).translate(0, 0.35, 0), trim, group, 0, h + 7.7, 0);
  mesh(new THREE.BoxGeometry(5, 2.2, 3).translate(0, 1.1, 0), bronze, group, 0, h + 8.4, 0);            // 顶部雕像组（抽象体块）
  mesh(new THREE.ConeGeometry(1.1, 3.4, 6).translate(0, 1.7, 0), bronze, group, 0, h + 10.6, 0);
}
