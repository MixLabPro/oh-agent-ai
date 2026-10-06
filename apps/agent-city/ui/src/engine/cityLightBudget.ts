/**
 * 夜景灯光预算（CITY_NIGHT_LIGHTING_SPEC N4）：所有「光源」的强度、色温、亮灯率都从这里取，
 * 画面里的灯具强度才一致；墙面/屋顶轮廓不是光源，不在预算内。纯函数、无 three 依赖，可单测。
 */

export const LIGHT_BUDGET = {
  /** 窗光：亮度 0.3..2.0（平方分布，多数暗少数亮）；色温 2400K 暖黄 → 5000K 冷白。 */
  window: { min: 0.3, max: 2.0, warmK: 2400, coolK: 5000 },
  /** 路灯：灯头亮度 / 地面光斑 / 高架灯带；光斑与灯头按道路等级分档（见 lampTier）。 */
  street: { head: 3.2, pool: 0.9, strip: 2.4 },
  /** 霓虹：招牌、楼顶描边（仅高楼/酒店冠）、桥塔点缀（降饱和后）。 */
  neon: { sign: 2.6, roof: 3.2, bridge: 0.9, bridgeSaturation: 0.55 },
  /** 地标玻璃幕墙：夜里 base + night × gain。 */
  landmark: { base: 0.25, gain: 1.6 },
  /** 环境压暗：夜里曝光 −22%（约 0.35 EV）；天空/海/地面主题色乘 ground。 */
  ambient: { exposureCut: 0.22, groundDim: 0.62, seaDim: 0.7 },
  /** 夜间光照叠层（地面）：窗光外溢 + 路灯，只乘到地面/低层墙脚。 */
  overlay: { gain: 0.55, radius: 18 },
} as const;

/** 由 selfLit（昼夜预设）推出「夜」量 [0,1]：≤0.1 一律算白天。 */
export function nightFactor(selfLit: number): number {
  return Math.min(1, Math.max(0, (selfLit - 0.1) / 0.9));
}

export type WindowUse = "residential" | "office";

/** 道路 → 路灯档位：主干 1.0、次干/支路 0.6、步道 0.45（光斑半径与亮度同乘）。 */
export function lampTier(width: number): number {
  if (width >= 12) return 1;
  if (width >= 7) return 0.6;
  return 0.45;
}

/** Zone → 窗光用途：商业/市中心/滨水 = 办公（整层同亮同灭），住宅 = 零星亮。 */
export function useOfZone(zone: string | undefined): WindowUse {
  return zone === "downtown" || zone === "commercial" || zone === "waterfront" ? "office" : "residential";
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));

/** 本地小时 → 亮灯率 [0,1]。住宅 19–23 点 55%→35%、凌晨 ~8%；办公傍晚高、23 点后整层熄灭。 */
export function windowRate(hour: number, use: WindowUse): number {
  const h = ((hour % 24) + 24) % 24;
  if (use === "residential") {
    if (h >= 17 && h < 19) return lerp(0.25, 0.55, (h - 17) / 2);
    if (h >= 19 && h < 23) return lerp(0.55, 0.35, (h - 19) / 4);
    if (h >= 23) return lerp(0.35, 0.12, h - 23);
    if (h < 5) return lerp(0.12, 0.06, h / 5);
    if (h < 7.5) return lerp(0.06, 0.3, (h - 5) / 2.5);
    return 0.1; // 白天亮窗本来就看不见（uWindowGlow≈0），给个小值免得过渡突变
  }
  if (h >= 17 && h < 19) return lerp(0.35, 0.65, (h - 17) / 2);
  if (h >= 19 && h < 22) return lerp(0.65, 0.3, (h - 19) / 3);
  if (h >= 22 && h < 24) return lerp(0.3, 0.07, (h - 22) / 2);
  if (h < 6) return 0.05;
  if (h < 8) return lerp(0.05, 0.4, (h - 6) / 2);
  return 0.15;
}

/** 活跃会话（今天仍在施工）的楼夜里更亮：+25%，且深夜也留 ≥45%——数据与光发生关系。 */
export function activeBoost(rate: number): number {
  return Math.min(1, Math.max(0.45, rate + 0.25));
}

/** 灯具/光强数值自检（守卫用）：任何预算项必须落在合理范围。 */
export function budgetProblems(): string[] {
  const problems: string[] = [];
  if (LIGHT_BUDGET.window.max / LIGHT_BUDGET.window.min < 4) problems.push("window brightness range too flat");
  if (LIGHT_BUDGET.neon.bridgeSaturation > 0.7) problems.push("bridge neon too saturated");
  if (LIGHT_BUDGET.ambient.exposureCut < 0.1) problems.push("night exposure cut too small");
  for (const use of ["residential", "office"] as WindowUse[]) {
    let peak = 0; let low = 1;
    for (let h = 0; h < 24; h += 0.25) { const r = windowRate(h, use); peak = Math.max(peak, r); low = Math.min(low, r); if (r < 0 || r > 1) problems.push(`${use} rate out of range at ${h}`); }
    if (peak < 0.5 || low > 0.15) problems.push(`${use} rate curve has no evening peak / late-night trough`);
  }
  return problems;
}
