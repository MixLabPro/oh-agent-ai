import type { BuildingModel, Part } from "../model";

const STEEL = "#c9cfd3";

/**
 * 地标「ferris-wheel」：声明式 BuildingModel（批 1）。几何与旧 drawFerrisWheel 逐位一致（golden/city-landmark-baseline.json 钉住）。
 * 转盘 = group "wheel"（轮缘、轮毂、辐条、吊舱都挂它下面），lifecycle.spin 绕 z 转它。
 * 霓虹开（sizing.neon）时轮缘 / 吊舱带自发光倍率（0.6 / 0.5），用迁移期的 `emissive` 逐位保留（批 5 换预算类别）；旧造型无夜灯批次，这里也没有。
 */
export const ferrisWheelModel: BuildingModel = {
  id: "ferris-wheel",
  group: "地标",
  semantics: "decor",
  title: "摩天轮",
  body: "海滨固定地标，轮盘缓慢旋转。不代表会话。",
  sitingKey: "landmark:ferris-wheel",
  geometry: ({ sizing }) => {
    // 远景里曾显得很小（多视角评估）：半径 20 → 26。
    const radius = Math.min((sizing?.cap ?? 70) * 0.5, 26);
    const neon = (sizing?.neon ?? 0) > 0;
    const parts: Part[] = [];
    for (const side of [-1, 1]) {
      parts.push({ kind: "box", at: [-4, 0, side * 3], size: [1, radius + 4, 1], rot: [0, 0, side * 0.18], role: "structure", color: STEEL });
      parts.push({ kind: "box", at: [4, 0, side * 3], size: [1, radius + 4, 1], rot: [0, 0, -side * 0.18], role: "structure", color: STEEL });
    }
    parts.push({ kind: "group", id: "wheel", at: [0, radius + 4, 0] });
    // 细化：双轮缘（前后两圈 + 横撑）、中心轮毂与轴、圆筒形吊舱（带窗带）、底部登乘平台与售票亭。
    for (const z of [-1.2, 1.2]) parts.push({ kind: "torus", parent: "wheel", at: [0, 0, z], radius, tube: 0.4, segments: [6, 48], role: "lit", light: "landmark", color: "#e8eef0", emissive: neon ? 0.6 : 0 });
    parts.push({ kind: "cylinder", parent: "wheel", at: [0, 0, 0], size: [3.2, 3.4, 3.2], segments: 16, bake: { x: Math.PI / 2 }, anchor: "center", role: "structure", color: STEEL });
    parts.push({ kind: "cylinder", at: [0, radius + 4, 0], size: [1, 8, 1], segments: 10, bake: { x: Math.PI / 2 }, anchor: "center", role: "structure", color: STEEL });
    parts.push({ kind: "box", at: [0, 0, 0], size: [14, 1, 8], role: "trim", color: "#d9d3c2" });
    parts.push({ kind: "box", at: [8.5, 0, 2], size: [4, 3, 3], role: "wall", color: "#ff6f61" });
    parts.push({ kind: "box", at: [8.5, 3, 2], size: [4.6, 0.3, 3.6], role: "roof", color: "#f2efe6" });
    const cabins = 16;
    for (let i = 0; i < cabins; i += 1) {
      const t = (i / cabins) * Math.PI * 2;
      parts.push({ kind: "box", parent: "wheel", at: [0, 0, 0], size: [0.25, radius, 0.25], rot: [0, 0, t], role: "structure", color: STEEL });
      for (const z of [-1.2, 1.2]) parts.push({ kind: "box", parent: "wheel", at: [0, 0, z], size: [0.18, radius, 0.18], rot: [0, 0, t], role: "structure", color: STEEL });
      parts.push({ kind: "cylinder", parent: "wheel", at: [Math.cos(t) * radius, Math.sin(t) * radius - 1.3, 0], size: [2.4, 2.4, 2.4], segments: 10, bake: { x: Math.PI / 2 }, anchor: "center", role: "lit", light: "landmark", color: ["#ff6f61", "#ffd166", "#06d6a0", "#118ab2"][i % 4], emissive: neon ? 0.5 : 0 });
      parts.push({ kind: "cylinder", parent: "wheel", at: [Math.cos(t) * radius, Math.sin(t) * radius - 1.1, 0], size: [2.5, 0.7, 2.5], segments: 10, bake: { x: Math.PI / 2 }, anchor: "center", role: "glass", color: "#2f4552" });
    }
    return parts;
  },
  lifecycle: { spin: [{ parts: ["wheel"], axis: "z", speed: 0.08 }] },
  picking: { decorId: "decor:landmark:ferris-wheel", category: "致敬地标 · 装饰", describe: "由岛屿种子挑选的城市地标。不代表任何会话，不随数据变化。" },
};
