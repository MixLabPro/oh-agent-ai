import type { LandmarkCtx } from "./landmarkContext";
import { drawTvTower } from "./landmarks/tvTower";
import { drawTwinTowers } from "./landmarks/twinTowers";
import { drawTwistTower } from "./landmarks/twistTower";
import { drawArch } from "./landmarks/arch";
import { drawSailOpera } from "./landmarks/sailOpera";
import { drawLighthouse } from "./landmarks/lighthouse";
import { drawFerrisWheel } from "./landmarks/ferrisWheel";
import { drawPagoda } from "./landmarks/pagoda";
import { drawVillaComplex } from "./landmarks/villaComplex";
import { drawSuspensionBridge } from "./landmarks/suspensionBridge";

/**
 * 建筑模型注册表：每个地标造型一个独立文件（models/landmarks/*.ts），这里是 kind → 造型函数 + 中文名的唯一入口。
 * cityParts 只按 kind 查表调用，cityDecor 的名称表也由这里派生——新增地标 = 加一个文件 + 这里一行。
 */
export const LANDMARK_BUILDERS: Record<string, (ctx: LandmarkCtx) => void> = {
  "tv-tower": drawTvTower,
  "twin-towers": drawTwinTowers,
  "twist-tower": drawTwistTower,
  "arch": drawArch,
  "sail-opera": drawSailOpera,
  "lighthouse": drawLighthouse,
  "ferris-wheel": drawFerrisWheel,
  "pagoda": drawPagoda,
  "villa-complex": drawVillaComplex,
  "suspension-bridge": drawSuspensionBridge,
};

/** 地标/配套的中文名（点击说明与建筑说明共用；有造型文件的 kind 与「由其它模块建造」的 kind 在同一张表里）。 */
export const LANDMARK_LABELS: Record<string, string> = {
  "tv-tower": "电视塔", "sail-opera": "帆形歌剧院", arch: "凯旋拱门", pagoda: "宝塔", lighthouse: "灯塔",
  "ferris-wheel": "摩天轮", "suspension-bridge": "悬索桥", "truss-bridge": "桁架桥", "twin-towers": "双子塔", "twist-tower": "扭转塔",
  "twisting-deco-tower": "扭转装饰艺术塔",
  airport: "机场岛", // cityAirport.ts 建造
  "villa-complex": "地中海庄园", // cityLandmarkVilla.ts 建造
};
export const CIVIC_LABELS: Record<string, string> = { school: "学校", mall: "商场", hospital: "医院" };
