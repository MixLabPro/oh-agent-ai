/**
 * 地标系统：自 cityParts.ts 原样搬出（纯搬迁，见 docs/CITY_ENGINE_SPLIT_SPEC.md）。造型仍在 models/landmarks/*。
 * 函数体与原方法逐字一致，仅 `this.` → `host.`（buildLandmarks 内部已有同名局部 host，故该函数的形参叫 city）。
 */
import * as THREE from "three";
import { hashSeed, type CityModel } from "../../cityModel";
import type { CityLayout } from "../cityLayout";
import { activeTheme } from "../cityTheme";
import { paletteFor } from "../cityTextures";
import { createRenderCanvas } from "../renderCanvas";
import { LANDMARK_BUILDERS } from "../render/landmarkBuilders";
import type { LandmarkHost } from "../models/landmarkContext";
import { createMaterialFactory } from "../render/landmarkMaterials";
import type { NightLights } from "../render/types";
import { DISTRICT_LANDMARK_RENDER_GEOMETRY } from "../models/layoutPlacementGeometry";

export interface LandmarkSystemHost {
  model: CityModel;
  layout: CityLayout;
  group: THREE.Group;
  disposables: Array<{ dispose: () => void }>;
  nightLights: NightLights | null;
  landmarkSpinners: Array<{ object: THREE.Object3D; axis: "x" | "y" | "z"; speed: number }>;
  landmarkWindows: Array<{ material: THREE.MeshLambertMaterial; day: THREE.Texture; lit: THREE.Texture; dayEmissive: THREE.Color }>;
  districtLandmarkGroups: THREE.Object3D[] | null;
  districtLandmarkHeight(districtId: string, sessions?: number): number;
  matrix: THREE.Matrix4;
  quaternion: THREE.Quaternion;
  scaleVector: THREE.Vector3;
  positionVector: THREE.Vector3;
  color: THREE.Color;
  spillWhite: THREE.Color;
  compose(x: number, y: number, z: number, rotationY: number, sx: number, sy: number, sz: number): void;
}

export function buildLandmarks(city: LandmarkSystemHost): void {
  const landmarks = city.layout.landmarks ?? [];
  if (!landmarks.length) return;
  const tallest = Math.max(30, ...city.model.buildings.map((building) => building.height));
  const cap = Math.max(70, tallest * 0.9);
  const neon = activeTheme().neon;
  // 批 0a：按 (color, emissive, side) 缓存；需要事后改动的材质传 { private: true }（见 render/landmarkMaterials.ts）。
  const material = createMaterialFactory((m) => city.disposables.push(m));
  const mesh = (geometry: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number, ry = 0) => {
    const m = new THREE.Mesh(geometry, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    city.disposables.push(geometry);
    return m;
  };
  const white = material("#f3f1ea");
  const steel = material("#c9cfd3");
  const red = material("#c8473a");
  for (const landmark of landmarks) {
    const group = new THREE.Group();
    const ground = Math.max(0.3, city.layout.terrain.height(landmark.x, landmark.z));
    group.position.set(landmark.x, ground, landmark.z);
    group.rotation.y = landmark.yaw;
    const host: LandmarkHost = {
      disposables: city.disposables, landmarkSpinners: city.landmarkSpinners, landmarkWindows: city.landmarkWindows,
      layout: city.layout, group: city.group, nightLights: city.nightLights, compose: (...args) => city.compose(...args),
      matrix: city.matrix, color: city.color, spillWhite: city.spillWhite, positionVector: city.positionVector,
      quaternion: city.quaternion, scaleVector: city.scaleVector,
    };
    // 造型在 models/landmarks/*.ts，按 kind 查注册表（悬索桥需要 landmark.to，缺了就和原先一样什么都不画）。
    const build = LANDMARK_BUILDERS[landmark.kind];
    if (build && !(landmark.kind === "suspension-bridge" && !landmark.to)) build({ group, landmark, mesh, material, white, steel, red, cap, neon, host });
    group.name = `city-landmark-${landmark.kind}`;
    city.group.add(group);
  }
}

export function applyDistrictLandmarkGrowth(host: LandmarkSystemHost, cursor: number, live: boolean): void {
  if (!host.districtLandmarkGroups) {
    host.districtLandmarkGroups = [];
    host.group.traverse((o) => { if (o.name.startsWith("city-landmark-district:")) host.districtLandmarkGroups!.push(o); });
  }
  for (const group of host.districtLandmarkGroups) {
    const id = group.name.slice("city-landmark-district:".length);
    const started = live ? undefined : host.model.buildings.filter((b) => b.districtId === id && b.startedAt <= cursor).length;
    const full = host.districtLandmarkHeight(id);
    group.scale.y = started === undefined ? 1 : Math.max(0.05, host.districtLandmarkHeight(id, started) / full);
  }
}

export function buildDistrictLandmarks(host: LandmarkSystemHost): void {
  const neon = activeTheme().neon;
  for (const spot of host.layout.districtLandmarks ?? []) {
    const palette = paletteFor(spot.districtId);
    const h = host.districtLandmarkHeight(spot.districtId);
    const day = createRenderCanvas(); day.width = 64; day.height = 64;
    const dctx = day.getContext("2d");
    if (dctx) {
      dctx.fillStyle = "#ffffff"; dctx.fillRect(0, 0, 64, 64);
      dctx.fillStyle = "#9fd6e0"; dctx.fillRect(6, 16, 52, 34);
      dctx.fillStyle = "#c8ecf2"; dctx.fillRect(6, 16, 52, 6);
      dctx.fillStyle = "#eeeeee"; for (let x = 6; x < 64; x += 13) dctx.fillRect(x, 16, 2, 34);
    }
    const lit = createRenderCanvas(); lit.width = 64; lit.height = 256;
    const lctx = lit.getContext("2d");
    if (lctx) {
      lctx.fillStyle = "#000000"; lctx.fillRect(0, 0, 64, 256);
      for (let floor = 0; floor < 4; floor += 1) for (let cell = 0; cell < 4; cell += 1) {
        const on = hashSeed(`district-window:${spot.districtId}:${floor}:${cell}`);
        if (on < 0.3) continue;
        lctx.fillStyle = on > 0.85 ? "#bfe9ff" : "#ffd89a";
        lctx.fillRect(6 + cell * 13 + 1, floor * 64 + 16, 11, 34);
      }
    }
    const floors = Math.max(8, Math.round(h / 4));
    const dayTexture = new THREE.CanvasTexture(day as HTMLCanvasElement);
    const litTexture = new THREE.CanvasTexture(lit as HTMLCanvasElement);
    for (const texture of [dayTexture, litTexture]) { texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; }
    dayTexture.repeat.set(3, floors); litTexture.repeat.set(3, floors / 4);
    const pastel = new THREE.Color(palette.accent).lerp(new THREE.Color("#ffffff"), 0.55);
    const wall = new THREE.MeshLambertMaterial({ map: dayTexture, color: pastel, emissive: new THREE.Color("#3a3936"), emissiveMap: dayTexture });
    host.landmarkWindows.push({ material: wall, day: dayTexture, lit: litTexture, dayEmissive: new THREE.Color("#3a3936") });
    const trim = new THREE.MeshLambertMaterial({ color: "#ffffff", emissive: new THREE.Color("#ffffff").multiplyScalar(0.2) });
    const glow = new THREE.MeshLambertMaterial({ color: palette.accent, emissive: new THREE.Color(palette.accent).multiplyScalar(neon ? 1.4 : 0.45) });
    const group = new THREE.Group();
    group.name = `city-landmark-district:${spot.districtId}`;
    group.position.set(spot.x, Math.max(0.3, spot.y), spot.z);
    group.rotation.y = spot.yaw;
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, y: number) => {
      const mesh = new THREE.Mesh(geometry, material); mesh.position.y = y; mesh.castShadow = true; mesh.receiveShadow = true;
      group.add(mesh); host.disposables.push(geometry);
    };
    add(new THREE.BoxGeometry(DISTRICT_LANDMARK_RENDER_GEOMETRY.skirtWidth, 4, DISTRICT_LANDMARK_RENDER_GEOMETRY.skirtDepth).translate(0, 2, 0), trim, 0); // 裙楼
    let y = 4;
    for (const [w, share] of [[12, 0.55], [9.5, 0.27], [7, 0.18]] as Array<[number, number]>) {
      const height = (h - 4) * share;
      add(new THREE.BoxGeometry(w, height, w).translate(0, height / 2, 0), wall, y);
      add(new THREE.BoxGeometry(w + 0.6, 0.45, w + 0.6), glow, y + height);                      // 每级霓虹勾边
      y += height;
    }
    add(new THREE.CylinderGeometry(0.2, 0.5, 9, 6).translate(0, 4.5, 0), trim, y);              // 塔尖
    host.group.add(group);
    host.disposables.push(dayTexture, litTexture, wall, trim, glow);
  }
}
