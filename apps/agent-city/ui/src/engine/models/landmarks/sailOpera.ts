import type { BuildingModel, Part } from "../model";

/**
 * 地标「sail-opera」：声明式 BuildingModel（批 1）。几何与旧 drawSailOpera 逐位一致（golden/city-landmark-baseline.json 钉住）。
 * 帆 = 半球再切一半、拉成薄而高的壳：旧写法是 SphereGeometry(size).scale(0.75,1.6,0.9)，用 sphere.stretch 逐位复刻
 * （仅用 size 三轴半径推缩放比，浮点在 3 位小数边界上会让其中一片的顶点哈希漂移——实测）。
 * 海上岛平台（landmark.shore）：平台顶面 y=0.3 与岸滩齐平，所以位置 = 0.3 - 组基准高（sizing.baseY = group.position.y），几何整体下移半高（shift）。
 */
export const sailOperaModel: BuildingModel = {
  id: "sail-opera",
  group: "地标",
  semantics: "decor",
  title: "帆形歌剧院",
  body: "白色壳体的文化建筑，立在海岸上。由岛屿种子挑选，不代表会话。",
  sitingKey: "landmark:sail-opera",
  geometry: ({ radius = 30, sizing, siting }) => {
    const parts: Part[] = [];
    if (siting?.shore) {
      // 海上小岛：圆形填海平台 + 护岸石；岸点到岛缘的堤道是规划里的桥路段（路网渲染出桥面/护栏/桥墩），不再重复画。
      const base = sizing?.baseY ?? 0;
      parts.push({ kind: "cylinder", id: "island", at: [0, 0.3 - base, 0], size: [(radius + 4) * 2, 3.6, (radius + 4) * 2], radiusTop: radius + 2, segments: 28, shift: [0, -1.8, 0], anchor: "center", role: "wall", color: "#cfc9b8" });
      parts.push({ kind: "cylinder", at: [0, -0.4 - base, 0], size: [(radius + 5) * 2, 1, (radius + 5) * 2], radiusTop: radius + 4.5, segments: 28, shift: [0, -0.5, 0], anchor: "center", role: "wall", color: "#9c968a" });
    }
    parts.push({ kind: "box", at: [0, 0, 0], size: [46, 3, 26], role: "trim", color: "#d9d3c2" });
    // 帆：半个穹顶（半球再切一半）拉成薄而高的壳，开口朝前；双面材质（开口里也要看得见内壁）。
    for (let i = 0; i < 4; i += 1) {
      const s = 13 - i * 2;
      parts.push({ kind: "sphere", id: `sail${i}`, at: [-15 + i * 9.5, 3, 0], size: [s, s, s], stretch: [0.75, 1.6, 0.9], segments: [20, 12], phi: [Math.PI / 2, Math.PI], theta: [0, Math.PI / 2], rot: [0, 0, -0.18], side: "double", role: "roof", color: "#f6f4ee" });
    }
    // 细化：壳下的玻璃幕墙门厅（壳与平台之间的深色玻璃带 + 竖棂）、通往平台的大台阶、临水步道栏杆。
    parts.push({ kind: "box", at: [-1, 3, 0], size: [34, 5, 14], role: "glass", color: "#3f5f6e" });
    for (let k = 0; k < 12; k += 1) parts.push({ kind: "box", at: [-17.5 + k * 3, 3, 7.05], size: [0.3, 5, 0.3], role: "trim", color: "#e8eef0" });
    for (let k = 0; k < 5; k += 1) parts.push({ kind: "box", at: [0, k * 0.6, 13 + k * 1.6 - 8 * 0.6], size: [18, 0.6, 1.6], role: "trim", color: "#e2dccd" });
    parts.push({ kind: "box", at: [0, 3, -13], size: [46, 0.9, 0.25], role: "trim", color: "#f2efe6" });
    return parts;
  },
  lifecycle: {},
  picking: { decorId: "decor:landmark:sail-opera", category: "致敬地标 · 装饰", describe: "由岛屿种子挑选的城市地标。不代表任何会话，不随数据变化。" },
};
