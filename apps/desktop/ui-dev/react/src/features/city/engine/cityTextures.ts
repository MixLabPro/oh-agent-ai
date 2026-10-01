/**
 * 程序化纹理与配色：城市所有视觉素材都在 canvas 里生成，不携带任何外部资源。
 *
 * 视觉基调：Modern Miniature City × Architectural Model——低饱和暖白楼身、
 * 自然地形（沙滩/草坡/岩石由高度场着色）、淡青水面，与工作台的浅色 UI 同语言；
 * host 决定各区建筑配色，地貌配色全城统一。
 */

import * as THREE from "three";
import type { DistrictLayout } from "./cityLayout";
import { hashSeed } from "../cityModel";

export type DistrictPalette = {
  /** 楼身 tint（乘在近白色立面纹理上）。 */
  wall: string;
  roof: string;
  accent: string;
  park: string;
};

const PALETTES: Record<string, DistrictPalette> = {
  "claude-code": { wall: "#e6d9c6", roof: "#cfa583", accent: "#c96f4a", park: "#a8bf97" },
  codex: { wall: "#d3dce2", roof: "#93a7b4", accent: "#4a7fa0", park: "#9db8a8" },
  dsh: { wall: "#d9e2d8", roof: "#98ac9a", accent: "#3f8f7a", park: "#a3c2a7" },
  "plugin:zcode": { wall: "#e0dae8", roof: "#ab9ec2", accent: "#7c6fb0", park: "#a9bba4" },
  "minimax-code": { wall: "#e4dee2", roof: "#b5a2ad", accent: "#a05a76", park: "#aabcaa" },
  default: { wall: "#dededa", roof: "#a9a9a3", accent: "#7d8a8f", park: "#a6bb9f" },
};

export function paletteFor(hostId: string): DistrictPalette {
  return PALETTES[hostId] ?? PALETTES.default;
}

/** 地形色带（按高度 h 与坡度 shade 调色）。 */
const TERRAIN = {
  seaFloor: "#7ba9b0",
  beach: "#e7dcb4",
  grass: "#bccfa2",
  grassDeep: "#a7c095",
  rock: "#b8b2a4",
  rockHigh: "#d2ccbf",
};

function canvas2d(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  return { canvas, ctx };
}

/** 立面纹理：近中性底 + 窗格图案，host 楼色作为实例 tint 相乘。
 *  纹理一格 = 4 层楼，实例属性 aFloors 在着色器里拉伸 v 轴，高层不糊。 */
export function makeFacadeTexture(variant: number, seed: number): THREE.Texture {
  const { canvas, ctx } = canvas2d(128, 128);
  ctx.fillStyle = "#f4f1ea";
  ctx.fillRect(0, 0, 128, 128);

  if (variant === 0) {
    for (let floor = 0; floor < 4; floor += 1) {
      for (let column = 0; column < 6; column += 1) {
        const lit = hashSeed(`w${seed}:${floor}:${column}`) > 0.86;
        ctx.fillStyle = lit ? "#f7e3ae" : "#5d6b78";
        ctx.globalAlpha = lit ? 0.95 : 0.85;
        ctx.fillRect(8 + column * 20, 10 + floor * 32, 12, 16);
      }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(120, 108, 92, 0.10)";
    ctx.fillRect(0, 0, 128, 3);
    ctx.fillRect(0, 125, 128, 3);
  } else if (variant === 1) {
    for (let floor = 0; floor < 4; floor += 1) {
      ctx.fillStyle = floor % 2 === 0 ? "#eceada" : "#f6f3ea";
      ctx.fillRect(0, floor * 32, 128, 32);
      ctx.fillStyle = "rgba(96, 84, 70, 0.16)";
      ctx.fillRect(0, floor * 32 + 28, 128, 3);
      for (let column = 0; column < 4; column += 1) {
        ctx.fillStyle = hashSeed(`b${seed}:${floor}:${column}`) > 0.88 ? "#f3dfa6" : "#64707c";
        ctx.globalAlpha = 0.8;
        ctx.fillRect(12 + column * 30, floor * 32 + 7, 18, 15);
        ctx.globalAlpha = 1;
      }
    }
  } else {
    ctx.fillStyle = "#dfe4e4";
    ctx.fillRect(0, 0, 128, 128);
    for (let floor = 0; floor < 4; floor += 1) {
      for (let column = 0; column < 5; column += 1) {
        const glass = hashSeed(`g${seed}:${floor}:${column}`);
        ctx.fillStyle = glass > 0.9 ? "#f2dfae" : glass > 0.5 ? "#8ea4b2" : "#7d94a4";
        ctx.fillRect(4 + column * 25, floor * 32 + 3, 22, 26);
      }
    }
    ctx.fillStyle = "rgba(250, 250, 248, 0.5)";
    for (let floor = 0; floor <= 4; floor += 1) ctx.fillRect(0, floor * 32 - 1, 128, 2);
  }

  const texture = new THREE.Texture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function strokePolyline(ctx: CanvasRenderingContext2D, points: Array<{ x: number; z: number }>, toPixel: (x: number, z: number) => [number, number], close: boolean): void {
  if (!points.length) return;
  ctx.beginPath();
  points.forEach((point, index) => {
    const [px, py] = toPixel(point.x, point.z);
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  if (close) ctx.closePath();
  ctx.stroke();
}

/**
 * 区岛面纹理：高度场着色（沙滩/草坡/岩石）+ 坡度暗化 + 河流 + 有机道路 +
 * 广场 + 楼基垫与接触阴影。像素高度从预烘焙 heightGrid 双线性采样（一致性 +
 * 速度：不逐像素跑完整噪声）。
 */
export function makeDistrictTexture(district: DistrictLayout, palette: DistrictPalette): THREE.Texture {
  const size = 768;
  const worldExtent = district.radius * 2.72;
  const scale = size / worldExtent;
  const toPixel = (x: number, z: number): [number, number] => [
    (x - district.center.x + worldExtent / 2) * scale,
    (z - district.center.z + worldExtent / 2) * scale,
  ];

  // 1) 烘焙高度网格（128²，与地形 mesh 同源函数）。
  const grid = 128;
  const heights = new Float32Array(grid * grid);
  const gridStep = worldExtent / (grid - 1);
  for (let iz = 0; iz < grid; iz += 1) {
    for (let ix = 0; ix < grid; ix += 1) {
      const x = district.center.x - worldExtent / 2 + ix * gridStep;
      const z = district.center.z - worldExtent / 2 + iz * gridStep;
      heights[iz * grid + ix] = district.terrain.height(x, z);
    }
  }
  const sampleHeight = (u: number, v: number): number => {
    const fx = Math.min(grid - 1.001, Math.max(0, u * (grid - 1)));
    const fz = Math.min(grid - 1.001, Math.max(0, v * (grid - 1)));
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const h00 = heights[iz * grid + ix];
    const h10 = heights[iz * grid + ix + 1];
    const h01 = heights[(iz + 1) * grid + ix];
    const h11 = heights[(iz + 1) * grid + ix + 1];
    return h00 + (h10 - h00) * tx + (h01 - h00) * tz + (h00 - h10 - h01 + h11) * tx * tz;
  };

  // 2) 逐像素地形着色。
  const { canvas, ctx } = canvas2d(size, size);
  const image = ctx.createImageData(size, size);
  const bandBeach = new THREE.Color(TERRAIN.beach);
  const bandGrass = new THREE.Color(TERRAIN.grass);
  const bandGrassDeep = new THREE.Color(TERRAIN.grassDeep);
  const bandRock = new THREE.Color(TERRAIN.rock);
  const bandRockHigh = new THREE.Color(TERRAIN.rockHigh);
  const bandSea = new THREE.Color(TERRAIN.seaFloor);
  const mix = (a: THREE.Color, b: THREE.Color, t: number): [number, number, number] => [
    a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t,
  ];
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const u = px / size;
      const v = py / size;
      const h = sampleHeight(u, v);
      // 坡度暗化（网格差分）。
      const hx = sampleHeight(u + 1 / size, v) - h;
      const hz = sampleHeight(u, v + 1 / size) - h;
      const slope = Math.min(0.42, Math.hypot(hx, hz) * (size / worldExtent) * 0.09);
      let rgb: [number, number, number];
      if (h < -0.12) rgb = [bandSea.r, bandSea.g, bandSea.b];
      else if (h < 0.5) rgb = mix(bandSea, bandBeach, Math.min(1, (h + 0.12) / 0.62));
      else if (h < 2.2) rgb = mix(bandBeach, bandGrass, (h - 0.5) / 1.7);
      else if (h < 5.5) rgb = mix(bandGrass, bandGrassDeep, (h - 2.2) / 3.3);
      else if (h < 11) rgb = mix(bandGrassDeep, bandRock, (h - 5.5) / 5.5);
      else rgb = mix(bandRock, bandRockHigh, Math.min(1, (h - 11) / 9));
      const shade = 1 - slope * 0.55;
      const index = (py * size + px) * 4;
      image.data[index] = Math.min(255, rgb[0] * 255 * shade);
      image.data[index + 1] = Math.min(255, rgb[1] * 255 * shade);
      image.data[index + 2] = Math.min(255, rgb[2] * 255 * shade);
      image.data[index + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  // 3) 河流：岸边浅滩 + 水面 + 中心高光。
  if (district.river) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(231, 220, 180, 0.85)";
    ctx.lineWidth = district.riverHalfWidth * 2.7 * scale;
    strokePolyline(ctx, district.river, toPixel, false);
    ctx.strokeStyle = "#8ec4cf";
    ctx.lineWidth = district.riverHalfWidth * 2.1 * scale;
    strokePolyline(ctx, district.river, toPixel, false);
    ctx.strokeStyle = "rgba(226, 243, 246, 0.8)";
    ctx.lineWidth = Math.max(1, district.riverHalfWidth * 0.4 * scale);
    strokePolyline(ctx, district.river, toPixel, false);
  }

  // 4) 有机道路：土路基 + 浅色路面。
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const road of district.roads) {
    const close = road.length > 60; // 环线闭合，放射不闭合。
    ctx.strokeStyle = "rgba(146, 134, 112, 0.30)";
    ctx.lineWidth = 3.6 * scale;
    strokePolyline(ctx, road, toPixel, close);
    ctx.strokeStyle = "#f0e9d9";
    ctx.lineWidth = 2.7 * scale;
    strokePolyline(ctx, road, toPixel, close);
  }

  // 5) 中心广场。
  const [plazaX, plazaY] = toPixel(district.plaza.x, district.plaza.z);
  ctx.fillStyle = "#dcd4c2";
  ctx.beginPath();
  ctx.arc(plazaX, plazaY, 6.2 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(120, 110, 92, 0.3)";
  ctx.lineWidth = Math.max(1, 0.24 * scale);
  for (const ring of [2.0, 3.5, 5.1]) {
    ctx.beginPath();
    ctx.arc(plazaX, plazaY, ring * scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 6) 楼基垫 + 接触阴影（每栋楼：浅色小台 + 软椭圆）。
  for (const [id, slot] of district.slots) {
    const [sx, sy] = toPixel(slot.x, slot.z);
    ctx.fillStyle = "rgba(236, 228, 208, 0.5)";
    ctx.beginPath();
    ctx.arc(sx, sy, 2.9 * scale, 0, Math.PI * 2);
    ctx.fill();
    const gradient = ctx.createRadialGradient(sx, sy, 0, sx, sy, 3.3 * scale);
    gradient.addColorStop(0, "rgba(66, 58, 44, 0.30)");
    gradient.addColorStop(0.65, "rgba(66, 58, 44, 0.12)");
    gradient.addColorStop(1, "rgba(66, 58, 44, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(sx - 3.3 * scale, sy - 3.3 * scale, 6.6 * scale, 6.6 * scale);
  }

  // 7) 树木绿斑（与 3D 树同位，加强河谷绿廊与山脚林线）。
  ctx.fillStyle = palette.park;
  ctx.globalAlpha = 0.5;
  for (const tree of district.trees) {
    const [tx, ty] = toPixel(tree.x, tree.z);
    ctx.beginPath();
    ctx.arc(tx, ty, 1.5 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.Texture(canvas);
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/** 桥面纹理：路面 + 中线 + 边缘人行道。 */
export function makeBridgeTexture(): THREE.Texture {
  const { canvas, ctx } = canvas2d(128, 128);
  ctx.fillStyle = "#a4a49f";
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "#b9b9b2";
  ctx.fillRect(0, 0, 128, 14);
  ctx.fillRect(0, 114, 128, 14);
  ctx.strokeStyle = "rgba(246, 242, 228, 0.9)";
  ctx.lineWidth = 4;
  ctx.setLineDash([22, 16]);
  ctx.beginPath();
  ctx.moveTo(0, 64);
  ctx.lineTo(128, 64);
  ctx.stroke();
  ctx.setLineDash([]);
  const texture = new THREE.Texture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

/** 区名标签 sprite。 */
export function makeLabelSprite(label: string, detail: string, color: string): { texture: THREE.Texture; aspect: number } {
  const padding = 18;
  const fontSize = 46;
  const probe = canvas2d(4, 4);
  probe.ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
  const labelWidth = probe.ctx.measureText(label).width;
  probe.ctx.font = `400 ${fontSize * 0.62}px system-ui, -apple-system, sans-serif`;
  const detailWidth = probe.ctx.measureText(detail).width;
  const width = Math.ceil(Math.max(labelWidth, detailWidth)) + padding * 2;
  const height = Math.ceil(fontSize * 2.1);
  const { canvas, ctx } = canvas2d(width, height);
  const radius = 18;
  ctx.beginPath();
  ctx.roundRect(1, 1, width - 2, height - 2, radius);
  ctx.fillStyle = "rgba(250, 250, 248, 0.92)";
  ctx.fill();
  ctx.strokeStyle = "rgba(90, 84, 74, 0.28)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#292d34";
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(label, padding, fontSize + 8);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(padding + 7, fontSize * 1.62, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#63748a";
  ctx.font = `400 ${fontSize * 0.62}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(detail, padding + 22, fontSize * 1.62 + fontSize * 0.24);
  const texture = new THREE.Texture(canvas);
  texture.needsUpdate = true;
  return { texture, aspect: width / height };
}
