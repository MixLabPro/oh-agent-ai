/**
 * 世界比例尺（唯一来源）：1 世界单位 = 2 米。
 *
 * 为什么是 2 米：规划层的尺寸本来就是按这个比例长出来的——会话地块 7.2 × 8（= 14.4 × 16 m，中层楼占地）、
 * 支路/次干道/主干道 5 / 8 / 12（= 10 / 16 / 24 m）、高架 10.5（= 21 m）、街区 ~50 × 50（= 100 × 100 m）、
 * 岛直径 1600–2100（= 3.2–4.2 km）、海湾 300–450（= 600–900 m）。按 1 米读时它们全偏小一半（楼细如签、路窄、
 * 城像沙盘）；把定义改成 2 米，规划层一个数都不用动、基线不变，只有「按真实米建模」的小物件要换算。
 * 审计与对照表见 docs/CITY_SCALE_AUDIT.md。
 *
 * 用法：凡是有真实世界尺寸的东西（人、车、层高、树、路灯、船、沙滩小品、房子），一律写成 `m(真实米数)`，
 * 或直接用下面 REAL 表里的参考值——不要再手写世界单位的魔数。纯常量模块：不依赖 three，规划层与渲染层都可引用。
 */

/** 1 世界单位对应的米数。 */
export const METERS_PER_UNIT = 2;

/** 米 → 世界单位。 */
export const m = (meters: number): number => meters / METERS_PER_UNIT;

/** 世界单位 → 米（标注、调试、测量报告用）。 */
export const toMeters = (units: number): number => units * METERS_PER_UNIT;

/** 按 1 单位 = 1 米建模的几何（老模型、外部素材）整体乘这个系数即可换算到当前比例尺。 */
export const METER_MODEL_SCALE = 1 / METERS_PER_UNIT;

/**
 * 真实世界参考尺寸（米）。新物体先在这里找参考值；没有的就按同样的口径补一行，带上依据。
 * 这张表是「看起来对不对」的唯一参照：截图里一个东西显大/显小，先对这张表。
 */
export const REAL = {
  person: { height: 1.75 },
  car: { length: 4.5, width: 1.8, height: 1.5 },
  /** 市区车速 30–50 km/h。 */
  carSpeed: { min: 8.5, max: 14 },
  /** 层高：住宅 3.0、商业/酒店 3.2–3.5；立面窗格与层数都按它算。 */
  floorHeight: 3.2,
  /** 首层/屋顶附加（门厅、女儿墙）。 */
  groundFloorExtra: 1.2,
  lamp: { height: 8, headReach: 0.9 },
  palm: { min: 8, max: 14 },
  broadleafTree: { min: 7, max: 14 },
  conifer: { min: 10, max: 18 },
  bush: { height: 1.5 },
  umbrella: { height: 2.4, diameter: 2.4 },
  lounger: { width: 0.7, length: 2.0, height: 0.35 },
  lifeguardTower: { legHeight: 2.0, hutWidth: 3.2, hutHeight: 2.4, hutDepth: 2.6 },
  /** 沙滩排球场 16 × 8，网高 2.43。 */
  volleyballCourt: { length: 16, width: 8, netHeight: 2.43 },
  boat: { length: 12, beam: 3.6 },
  /** 飞桥游艇（Vice 式比斯坎湾游艇）。 */
  yacht: { length: 28, beam: 6.5 },
  marinaBoat: { min: 7, max: 12, beam: 2.8 },
  pier: { width: 3 },
  /** 海湾豪宅：主楼约 22 × 12 m、两层；整块住宅台地约 34 × 26 m。 */
  mansion: { plotWidth: 34, plotDepth: 26 },
  /** 小区内部环路 8 m、支路 6 m。 */
  estateLoopRoad: 8,
  estateSpurRoad: 6,
} as const;
