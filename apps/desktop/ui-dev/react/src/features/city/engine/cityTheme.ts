/**
 * 城市视觉主题：写实日光（day）与 80 年代迈阿密日落（vice）。
 * 主题只改「观感」——天空/光色/水色/地面色/植被/宿主配色；楼位、高度、数据含义一律不变。
 * 宿主配色在两个主题里都必须互相可分辨（色相不同），因为楼的颜色承载「哪个宿主」。
 */

export type CityThemeName = "day" | "vice";

export type HostPaletteEntry = { wall: string; roof: string; accent: string; park: string };

export type CityTheme = {
  name: CityThemeName;
  /** 天空穹顶：天顶 / 中段 / 地平线三色渐变，地平线色同时是水面远处淡出色与 scene.background。 */
  skyTop: string;
  skyMid: string;
  skyHorizon: string;
  fog: string;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  sunColor: string;
  sunIntensity: number;
  /** 太阳相对城市中心的偏移比例（相对 bounds）：越低影子越长。 */
  sunElevation: number;
  exposure: number;
  water: { deep: string; shallow: string; sky: string };
  /** 水面距离淡出区间（相机距离）：日落主题拉远，免得整片海都被橙雾吃掉。 */
  waterFog: [number, number];
  /** 天空球素材（HDR 转出的全景图）；加载前/失败时用 skyTop/skyMid/skyHorizon 渐变。 */
  skyImage: "day" | "dusk";
  /** 天空调色：天顶色、地平线色、强度（0 = 原图）。日落主题靠它把黄昏图染成粉紫。 */
  skyGrade: { top: string; horizon: string; amount: number };
  /** 地面着色（RGB 0-255）：水下 / 沙滩 / 低草 / 高草 / 岩石。 */
  ground: { sea: [number, number, number]; sand: [number, number, number]; lawn: [number, number, number]; grass: [number, number, number]; rock: [number, number, number] };
  /** 霓虹屋顶描边 + bloom 后处理（仅日落主题；低画质档自动关闭 bloom）。 */
  neon: boolean;
  vegetation: "round" | "palm";
  trunk: string;
  foliage: string;
  /** 沿街行道树间距（0 = 不种）。 */
  streetTreeSpacing: number;
  hosts: Record<string, HostPaletteEntry>;
  fallback: HostPaletteEntry;
};

const DAY: CityTheme = {
  name: "day",
  skyTop: "#a3cee6",
  skyMid: "#c9e3ea",
  skyHorizon: "#eef6ee",
  fog: "#dfeef2",
  hemiSky: "#eaf6fa",
  hemiGround: "#cbbfa6",
  hemiIntensity: 0.6,
  sunColor: "#fff3de",
  sunIntensity: 1.55,
  sunElevation: 1,
  exposure: 1.06,
  water: { deep: "#57a3b4", shallow: "#a5d6da", sky: "#dff0f2" },
  waterFog: [900, 2300],
  skyImage: "day",
  skyGrade: { top: "#ffffff", horizon: "#ffffff", amount: 0 },
  ground: { sea: [75, 119, 127], sand: [199, 189, 158], lawn: [143, 159, 125], grass: [113, 134, 103], rock: [155, 150, 132] },
  neon: false,
  vegetation: "round",
  trunk: "#8a6a4c",
  foliage: "#6f9d63",
  streetTreeSpacing: 0,
  hosts: {
    "claude-code": { wall: "#e6d9c6", roof: "#cfa583", accent: "#c96f4a", park: "#a8bf97" },
    codex: { wall: "#d3dce2", roof: "#93a7b4", accent: "#4a7fa0", park: "#9db8a8" },
    dsh: { wall: "#d9e2d8", roof: "#98ac9a", accent: "#3f8f7a", park: "#a3c2a7" },
    "plugin:zcode": { wall: "#e0dae8", roof: "#ab9ec2", accent: "#7c6fb0", park: "#a9bba4" },
    "minimax-code": { wall: "#e4dee2", roof: "#b5a2ad", accent: "#a05a76", park: "#aabcaa" },
  },
  fallback: { wall: "#dededa", roof: "#a9a9a3", accent: "#7d8a8f", park: "#a6bb9f" },
};

const VICE: CityTheme = {
  name: "vice",
  skyTop: "#2b1f6b",
  skyMid: "#e0529c",
  skyHorizon: "#ffb072",
  fog: "#ffa98a",
  hemiSky: "#ffc9e6",
  hemiGround: "#9a80d6",
  hemiIntensity: 1.0,
  sunColor: "#ffd9bd",
  sunIntensity: 1.55,
  sunElevation: 0.42,
  exposure: 1.18,
  water: { deep: "#1a86c4", shallow: "#52dbe0", sky: "#ff9ccf" },
  waterFog: [1500, 4200],
  skyImage: "dusk",
  skyGrade: { top: "#6b3fb0", horizon: "#ff9a6b", amount: 0.62 },
  ground: { sea: [28, 110, 150], sand: [250, 232, 200], lawn: [118, 208, 156], grass: [84, 180, 132], rock: [190, 150, 170] },
  neon: true,
  vegetation: "palm",
  trunk: "#a98462",
  foliage: "#2fbf77",
  streetTreeSpacing: 17,
  // 四个宿主各占一个色相（珊瑚/青/薄荷/紫），粉彩楼身 + 饱和屋顶，保证一眼可分。
  hosts: {
    "claude-code": { wall: "#ffd2c4", roof: "#ff6f9f", accent: "#ff6f6f", park: "#7fd6a4" },
    codex: { wall: "#c4f4f6", roof: "#3cc3d2", accent: "#27c4d6", park: "#7fd6a4" },
    dsh: { wall: "#c8f7e0", roof: "#45d0a2", accent: "#34d29c", park: "#7fd6a4" },
    "plugin:zcode": { wall: "#e3d2ff", roof: "#9a6cf5", accent: "#9a6bff", park: "#7fd6a4" },
    "minimax-code": { wall: "#ffc9ea", roof: "#ea58ac", accent: "#ff5cb8", park: "#7fd6a4" },
  },
  fallback: { wall: "#f6e6cf", roof: "#d9a98c", accent: "#e8a07a", park: "#86d6a6" },
};

export const THEMES: Record<CityThemeName, CityTheme> = { day: DAY, vice: VICE };

let active: CityTheme = DAY;

/** 当前主题：纹理/配色/植被在构建期读取；换主题 = 引擎重建 parts。 */
export function activeTheme(): CityTheme {
  return active;
}

export function setActiveTheme(name: CityThemeName): CityTheme {
  active = THEMES[name] ?? DAY;
  return active;
}
