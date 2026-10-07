import type { LandmarkCtx } from "./landmarkContext";
import { hashSeed } from "../../cityModel";
import { compiledBuilder } from "../render/buildingCompiler";
import type { BuildingModel } from "./model";
import { tvTowerModel } from "./landmarks/tvTower";
import { drawTwinTowers } from "./landmarks/twinTowers";
import { drawTwistTower } from "./landmarks/twistTower";
import { archModel } from "./landmarks/arch";
import { sailOperaModel } from "./landmarks/sailOpera";
import { lighthouseModel } from "./landmarks/lighthouse";
import { drawFerrisWheel } from "./landmarks/ferrisWheel";
import { pagodaModel } from "./landmarks/pagoda";
import { drawVillaComplex } from "./landmarks/villaComplex";
import { drawSuspensionBridge } from "./landmarks/suspensionBridge";

/** 已声明化（BuildingModel）的建筑；其余 kind 仍走下面的手写 drawX（批 1 逐个迁）。守卫 verify-city-models 按这张表驱动。 */
export const BUILDING_MODELS: BuildingModel[] = [tvTowerModel, pagodaModel, archModel, sailOperaModel, lighthouseModel];
const modelBuilder = (model: BuildingModel) => compiledBuilder(model, hashSeed);

/**
 * 建筑模型注册表：每个地标造型一个独立文件（models/landmarks/*.ts），这里是 kind → 造型函数 + 中文名的唯一入口。
 * cityParts 只按 kind 查表调用，cityDecor 的名称表也由这里派生——新增地标 = 加一个文件 + 这里一行。
 */
export const LANDMARK_BUILDERS: Record<string, (ctx: LandmarkCtx) => void> = {
  "tv-tower": modelBuilder(tvTowerModel),
  "twin-towers": drawTwinTowers,
  "twist-tower": drawTwistTower,
  "arch": modelBuilder(archModel),
  "sail-opera": modelBuilder(sailOperaModel),
  "lighthouse": modelBuilder(lighthouseModel),
  "ferris-wheel": drawFerrisWheel,
  "pagoda": modelBuilder(pagodaModel),
  "villa-complex": drawVillaComplex,
  "suspension-bridge": drawSuspensionBridge,
};

/** 地标/配套的中文名（点击说明与建筑说明共用；有造型文件的 kind 与「由其它模块建造」的 kind 在同一张表里）。 */
export const LANDMARK_LABELS: Record<string, string> = {
  "sail-opera": "帆形歌剧院", arch: "凯旋拱门", lighthouse: "灯塔",
  "ferris-wheel": "摩天轮", "suspension-bridge": "悬索桥", "truss-bridge": "桁架桥", "twin-towers": "双子塔", "twist-tower": "扭转塔",
  "twisting-deco-tower": "扭转装饰艺术塔",
  airport: "机场岛", // cityAirport.ts 建造
  "villa-complex": "地中海庄园", // cityLandmarkVilla.ts 建造
  ...Object.fromEntries(BUILDING_MODELS.map((m) => [m.id, m.title])), // 已声明化的建筑：名称由 model.title 派生
};
export const CIVIC_LABELS: Record<string, string> = { school: "学校", mall: "商场", hospital: "医院" };
