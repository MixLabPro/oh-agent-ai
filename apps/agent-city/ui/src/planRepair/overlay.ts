/**
 * 规划修复的场景叠加层：候选空地块（绿色贴地方块）、道路预览色带、起点/吸附标记。
 * 挂在场景根（CityEngine.addOverlay），不属于 CityParts——补丁一改引擎就整体重建 parts，叠加层不能跟着销毁。
 * 地块朝向沿用 Parcel.yaw（局部 z 轴 = (sin yaw, cos yaw)，即 three 的 rotation.y = yaw）。
 * 所有叠加物 `raycast = noop`：不参与拾取，点下去要落到下面的地面/地块上。
 */
import * as THREE from "three";

export type OverlayParcel = { x: number; y: number; z: number; yaw: number; width: number; depth: number };
export type OverlayRibbon = { points: ReadonlyArray<{ x: number; z: number }>; width: number; tone: "erase" | "erase-blocked" | "draw" | "draw-blocked" };
export type OverlayMarker = { x: number; z: number; tone: "start" | "snap" | "snap-blocked" };

const COLORS = {
  parcel: 0x35d07f,
  erase: 0xff4d3d,            // 将被擦掉：红
  "erase-blocked": 0x9aa3ad,  // 不能擦：灰
  draw: 0x35d07f,             // 可画：绿
  "draw-blocked": 0xff8a3d,   // 不能画：橙红
  start: 0xffd84d,
  snap: 0x4dd2ff,
  "snap-blocked": 0xff8a3d,
} as const;

const noRaycast = () => {};

export class ParcelOverlay {
  readonly group = new THREE.Group();
  private readonly parcels = new THREE.Group();
  private readonly preview = new THREE.Group();
  private readonly plane = new THREE.PlaneGeometry(1, 1);
  private readonly ring = new THREE.RingGeometry(0.55, 1, 28);
  private readonly materials = new Map<number, THREE.MeshBasicMaterial>();

  constructor() {
    this.group.name = "city-plan-repair-overlay";
    this.group.renderOrder = 20;
    this.group.add(this.parcels, this.preview);
  }

  private material(color: number, opacity: number): THREE.MeshBasicMaterial {
    const key = color * 10 + Math.round(opacity * 9);
    let material = this.materials.get(key);
    if (!material) {
      material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      this.materials.set(key, material);
    }
    return material;
  }

  /** 平躺在地面上、沿 +X 为长边的矩形：yaw 绕 Y 轴（three: rotation.y = -θ 把本地 +X 转到方向 θ）。 */
  private flat(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, rotationY: number, sx: number, sy: number): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.order = "YXZ";
    mesh.rotation.set(-Math.PI / 2, rotationY, 0);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, 1);
    mesh.renderOrder = 20;
    mesh.raycast = noRaycast;
    return mesh;
  }

  setParcels(parcels: readonly OverlayParcel[]): void {
    this.parcels.clear();
    const material = this.material(COLORS.parcel, 0.5);
    for (const parcel of parcels) this.parcels.add(this.flat(this.plane, material, parcel.x, parcel.y + 0.45, parcel.z, parcel.yaw, parcel.width, parcel.depth));
  }

  /** 预览：色带沿折线逐段铺（路宽 + 1 的余量让它盖过路面）；标记是环。heightAt 取地形高度。 */
  setPreview(ribbons: readonly OverlayRibbon[], markers: readonly OverlayMarker[], heightAt: (x: number, z: number) => number): void {
    this.preview.clear();
    for (const ribbon of ribbons) {
      const material = this.material(COLORS[ribbon.tone], 0.62);
      for (let i = 1; i < ribbon.points.length; i += 1) {
        const a = ribbon.points[i - 1]; const b = ribbon.points[i];
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        if (length < 0.01) continue;
        const mx = (a.x + b.x) / 2; const mz = (a.z + b.z) / 2;
        const y = Math.max(0, heightAt(mx, mz)) + 0.7;
        this.preview.add(this.flat(this.plane, material, mx, y, mz, -Math.atan2(b.z - a.z, b.x - a.x), length, ribbon.width + 1));
      }
    }
    for (const marker of markers) {
      const material = this.material(COLORS[marker.tone], 0.9);
      this.preview.add(this.flat(this.ring, material, marker.x, Math.max(0, heightAt(marker.x, marker.z)) + 0.8, marker.z, 0, 3.2, 3.2));
    }
  }

  dispose(): void {
    this.parcels.clear(); this.preview.clear(); this.group.clear();
    this.plane.dispose(); this.ring.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
  }
}
