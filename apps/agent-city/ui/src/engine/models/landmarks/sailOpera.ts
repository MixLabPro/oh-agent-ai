import * as THREE from "three";
import type { LandmarkCtx } from "../landmarkContext";

/** 地标「sail-opera」的程序化造型（从 cityParts.buildLandmarks 的 if 链原样搬出，行为不变）。 */
export function drawSailOpera({ group, landmark, mesh, material, host }: LandmarkCtx): void {
  if (landmark.shore) {
    // 海上小岛：圆形填海平台 + 护岸石；岸点到岛缘的堤道是规划里的桥路段（路网渲染出桥面/护栏/桥墩），不再重复画；平台顶面 y=0.3 与岸滩齐平。
    const base = group.position.y;
    mesh(new THREE.CylinderGeometry(landmark.radius + 2, landmark.radius + 4, 3.6, 28).translate(0, -1.8, 0), material("#cfc9b8"), group, 0, 0.3 - base, 0);
    mesh(new THREE.CylinderGeometry(landmark.radius + 4.5, landmark.radius + 5, 1, 28).translate(0, -0.5, 0), material("#9c968a"), group, 0, -0.4 - base, 0);
  }
  mesh(new THREE.BoxGeometry(46, 3, 26).translate(0, 1.5, 0), material("#d9d3c2"), group, 0, 0, 0);
  // 帆：半个穹顶（半球再切一半）拉成薄而高的壳，开口朝前；双面材质（开口里也要看得见内壁）。
  const sail = new THREE.MeshLambertMaterial({ color: "#f6f4ee", side: THREE.DoubleSide });
  host.disposables.push(sail);
  const shells = 4;
  for (let i = 0; i < shells; i += 1) {
    const size = 13 - i * 2;
    const shell = new THREE.SphereGeometry(size, 20, 12, Math.PI / 2, Math.PI, 0, Math.PI / 2).scale(0.75, 1.6, 0.9);
    const m = mesh(shell, sail, group, -15 + i * 9.5, 3, 0, 0);
    m.rotation.z = -0.18;
  }
  // 细化：壳下的玻璃幕墙门厅（壳与平台之间的深色玻璃带 + 竖棂）、通往平台的大台阶、临水步道栏杆。
  const glass = material("#3f5f6e");
  mesh(new THREE.BoxGeometry(34, 5, 14).translate(0, 2.5, 0), glass, group, -1, 3, 0);
  for (let k = 0; k < 12; k += 1) mesh(new THREE.BoxGeometry(0.3, 5, 0.3).translate(0, 2.5, 0), material("#e8eef0"), group, -17.5 + k * 3, 3, 7.05);
  for (let k = 0; k < 5; k += 1) mesh(new THREE.BoxGeometry(18, 0.6, 1.6).translate(0, 0.3, 0), material("#e2dccd"), group, 0, k * 0.6, 13 + k * 1.6 - 8 * 0.6);
  mesh(new THREE.BoxGeometry(46, 0.9, 0.25).translate(0, 0.45, 0), material("#f2efe6"), group, 0, 3, -13);
}
