/**
 * 规划修复的场景叠加层：候选空地块的绿色贴地方块。
 * 挂在场景根（CityEngine.addOverlay），不属于 CityParts——补丁一改引擎就整体重建 parts，叠加层不能跟着销毁。
 * 地块朝向沿用 Parcel.yaw（局部 z 轴 = (sin yaw, cos yaw)，即 three 的 rotation.y = yaw）。
 */
import * as THREE from "three";

export type OverlayParcel = { x: number; y: number; z: number; yaw: number; width: number; depth: number };

export class ParcelOverlay {
  readonly group = new THREE.Group();
  private readonly geometry = new THREE.PlaneGeometry(1, 1);
  private readonly material = new THREE.MeshBasicMaterial({
    color: 0x35d07f, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });

  constructor() {
    this.group.name = "city-plan-repair-overlay";
    this.group.renderOrder = 20;
  }

  setParcels(parcels: readonly OverlayParcel[]): void {
    this.group.clear();
    for (const parcel of parcels) {
      const mesh = new THREE.Mesh(this.geometry, this.material);
      mesh.rotation.order = "YXZ";
      mesh.rotation.set(-Math.PI / 2, parcel.yaw, 0);
      mesh.position.set(parcel.x, parcel.y + 0.45, parcel.z);
      mesh.scale.set(parcel.width, parcel.depth, 1);
      mesh.renderOrder = 20;
      mesh.raycast = () => {}; // 叠加层不参与拾取：点候选地块要落到下面的地面/地块上
      this.group.add(mesh);
    }
  }

  dispose(): void {
    this.group.clear();
    this.geometry.dispose();
    this.material.dispose();
  }
}
