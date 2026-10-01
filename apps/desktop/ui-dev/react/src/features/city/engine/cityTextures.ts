/**
 * 程序化纹理与配色：城市所有视觉素材都在 canvas 里生成，不携带任何外部资源。
 *
 * 视觉基调：Modern Miniature City × Architectural Model——低饱和暖白楼身、
 * 自然地形（沙滩/草坡/岩石由高度场着色）、淡青水面，与工作台的浅色 UI 同语言；
 * host 决定各区建筑配色，地貌配色全城统一。
 */

import * as THREE from "three";
import type { CityLayout } from "./cityLayout";
import { hashSeed } from "../cityModel";
import { activeTheme } from "./cityTheme";

export type DistrictPalette = {
  /** 楼身 tint（乘在近白色立面纹理上）。 */
  wall: string;
  roof: string;
  accent: string;
  park: string;
};

export function paletteFor(hostId: string): DistrictPalette {
  const theme = activeTheme();
  return theme.hosts[hostId] ?? theme.fallback;
}

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
/** 海滨装饰艺术立面：近白灰泥底（乘宿主粉彩色）、水平「眉檐」饰带、横向带状窗、
 *  中轴竖向肋。一块平铺 = 2 层楼（材质 uRows=2）。灰泥颗粒感来自 stucco 法线贴图。 */
export function makeDecoFacadeTexture(): THREE.Texture {
  const size = 256;
  const { canvas, ctx } = canvas2d(size, size);
  ctx.fillStyle = "#fbf8f2";
  ctx.fillRect(0, 0, size, size);
  for (let floor = 0; floor < 2; floor += 1) {
    const top = floor * 128;
    // 带状窗：圆角长条，两端留墙；窗下一条深色投影线像窗台。
    ctx.fillStyle = "#5f8d96";
    ctx.beginPath();
    ctx.roundRect(22, top + 44, size - 44, 40, 14);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
    ctx.fillRect(30, top + 50, size - 60, 6);
    for (let mullion = 1; mullion < 6; mullion += 1) {
      ctx.fillStyle = "#e9e3d8";
      ctx.fillRect(22 + mullion * ((size - 44) / 6) - 2, top + 44, 4, 40);
    }
    // 眉檐饰带：浅色凸带 + 下方阴影，三道一组是装饰艺术的标志。
    for (let line = 0; line < 3; line += 1) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, top + 98 + line * 7, size, 3);
      ctx.fillStyle = "rgba(90, 80, 70, 0.22)";
      ctx.fillRect(0, top + 101 + line * 7, size, 2);
    }
  }
  // 中轴竖向肋：遮住带状窗中段，形成对称立面。
  ctx.fillStyle = "#f3eee6";
  ctx.fillRect(size / 2 - 12, 0, 24, size);
  ctx.fillStyle = "rgba(90, 80, 70, 0.18)";
  ctx.fillRect(size / 2 + 12, 0, 3, size);
  const texture = new THREE.Texture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

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

/** One city-wide ground atlas: continuous land, hardscape blocks and connected streets. */
export function makeCityTexture(layout: CityLayout): THREE.Texture {
  // 2048 铺 1600 单位仅 ~1.3px/单位，10 宽的街道只有十来个像素，近景糊成一片。
  const size = 4096;
  const { canvas, ctx } = canvas2d(size, size);
  const scale = size / layout.extent;
  const toPixel = (x: number, z: number): [number, number] => [(x + layout.extent / 2) * scale, (z + layout.extent / 2) * scale];
  const ground = canvas2d(384, 384);
  const pixels = ground.ctx.createImageData(384, 384);
  for (let iz = 0; iz < 384; iz += 1) for (let ix = 0; ix < 384; ix += 1) {
    const x = (ix / 383 - 0.5) * layout.extent;
    const z = (iz / 383 - 0.5) * layout.extent;
    const h = layout.terrain.height(x, z);
    const noise = hashSeed(`ground:${ix}:${iz}`) * 7;
    const g = activeTheme().ground;
    const color = h < 0 ? g.sea : h < 2.5 ? g.sand : h < 9 ? g.lawn : h < 35 ? g.grass : g.rock;
    const index = (iz * 384 + ix) * 4;
    pixels.data[index] = color[0] + noise; pixels.data[index+1] = color[1] + noise; pixels.data[index+2] = color[2] + noise; pixels.data[index+3] = 255;
  }
  ground.ctx.putImageData(pixels, 0, 0);
  ctx.drawImage(ground.canvas, 0, 0, size, size);
  const polygon = (points: Array<{x:number;z:number}>, color:string) => {
    ctx.beginPath(); points.forEach((p,i)=> { const [x,y]=toPixel(p.x,p.z); if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y); });
    ctx.closePath(); ctx.fillStyle=color; ctx.fill();
  };
  const orientedRect = (x:number,z:number,width:number,depth:number,yaw:number,color:string) => {
    const [px,py]=toPixel(x,z); ctx.save(); ctx.translate(px,py); ctx.rotate(-yaw);
    ctx.fillStyle=color;ctx.fillRect(-width*scale/2,-depth*scale/2,width*scale,depth*scale);ctx.restore();
  };
  for (const block of layout.blocks) {
    polygon(block.polygon.map((p)=>({x:block.x+(p.x-block.x)*0.88,z:block.z+(p.z-block.z)*0.88})),block.parcels.length?"#c5c0b3":"#91a57f");
    for (const parcel of block.parcels) orientedRect(parcel.x,parcel.z,parcel.width-0.3,parcel.depth-0.3,parcel.yaw,"#bcb8ac");
  }
  for (const edge of layout.roadEdges) {
    if(edge.bridge)continue; // Real bridge deck spans the actual water, no painted water-road.
    ctx.lineCap="round";
    ctx.strokeStyle="#d4cfc2";ctx.lineWidth=(edge.width+2.4)*scale;strokePolyline(ctx,edge.points,toPixel,false);
    ctx.strokeStyle=edge.kind==="arterial"?"#505b60":"#646c6b";ctx.lineWidth=edge.width*scale;strokePolyline(ctx,edge.points,toPixel,false);
  }
  for (const edge of layout.roadEdges) {
    if(edge.bridge)continue;
    const [a,b]=edge.points;const length=Math.hypot(b.x-a.x,b.z-a.z);const dx=(b.x-a.x)/length;const dz=(b.z-a.z)/length;
    const points=[{x:a.x+dx*6,z:a.z+dz*6},{x:b.x-dx*6,z:b.z-dz*6}];
    ctx.strokeStyle=edge.kind==="arterial"?"#d6c998":"#b6bdba";ctx.lineWidth=0.22*scale;ctx.setLineDash([3*scale,3*scale]);
    strokePolyline(ctx,points,toPixel,false);ctx.setLineDash([]);
    for(const end of [a,b])for(let stripe=-2;stripe<=2;stripe+=1){
      const sign=end===a?1:-1;
      orientedRect(end.x+dx*6.5*sign-dz*stripe*0.8,end.z+dz*6.5*sign+dx*stripe*0.8,1.4,0.4,-Math.atan2(dz,dx),"#dbd8cb");
    }
  }
  for(const site of layout.publicSites){
    const [x,y]=toPixel(site.x,site.z);
    if(site.kind==="park"){
      ctx.fillStyle="#799b71";ctx.beginPath();ctx.ellipse(x,y,site.radius*scale,site.radius*0.75*scale,-0.2,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle="#d2c4a0";ctx.lineWidth=2.2*scale;ctx.beginPath();ctx.ellipse(x,y,site.radius*0.75*scale,site.radius*0.55*scale,-0.2,0,Math.PI*2);ctx.stroke();
    }else{
      orientedRect(site.x,site.z,site.radius*1.6,site.radius*1.3,site.yaw,site.kind==="harbor"?"#999f98":"#d0c7b3");
      if(site.kind==="civic"){
        ctx.fillStyle="#609ca3";ctx.beginPath();ctx.arc(x,y+18*scale,6*scale,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle="#efdfbd";ctx.lineWidth=2*scale;ctx.stroke();
      }
      if(site.kind==="station")for(let track=0;track<4;track+=1)orientedRect(site.x-18+track*8,site.z,1.2,site.radius*1.15,site.yaw,"#737c76");
      if(site.kind==="stadium"){
        ctx.fillStyle="#647f62";ctx.beginPath();ctx.ellipse(x,y,28*scale,19*scale,-site.yaw,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle="#dad9c0";ctx.lineWidth=0.7*scale;ctx.strokeRect(x-18*scale,y-10*scale,36*scale,20*scale);
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
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
