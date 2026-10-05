/**
 * 非会话建筑的说明（点击/悬停时显示）。
 *
 * 城市里除了会话楼，还有致敬地标、学校/商场/医院、市政设施、背景楼等装饰性建筑。
 * 它们曾经点击毫无反应——用户分不清哪些楼是自己的数据（真机截图反馈）。
 * 拾取得到的 id 形如 `decor:<kind>[:<detail>]`，这里把它翻译成标题 + 一句话说明 + 是否随数据变化。
 * 文案是中文原文，英文走 i18n.tsx 的目录（cityView 渲染时替换）。
 */

export type DecorInfo = { title: string; category: string; body: string };

const LANDMARK_NAMES: Record<string, string> = {
  "tv-tower": "电视塔", "sail-opera": "帆形歌剧院", arch: "凯旋拱门", pagoda: "宝塔", lighthouse: "灯塔",
  "ferris-wheel": "摩天轮", "suspension-bridge": "悬索桥", "twin-towers": "双子塔", "twist-tower": "扭转塔",
  "twisting-deco-tower": "扭转装饰艺术塔",
};
const CIVIC_NAMES: Record<string, string> = { school: "学校", mall: "商场", hospital: "医院" };

export function isDecorId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith("decor:");
}

export function describeDecor(id: string): DecorInfo | null {
  const [, kind, detail] = id.split(":");
  switch (kind) {
    case "landmark":
      return { title: LANDMARK_NAMES[detail] ?? "地标", category: "致敬地标 · 装饰", body: "由岛屿种子挑选的城市地标。不代表任何会话，不随数据变化。" };
    case "civic":
      return { title: CIVIC_NAMES[detail] ?? "城市配套", category: "城市配套 · 随规模增长", body: "会话越多，城市配套越多（约每 45 个会话一座）。它反映城市规模，不代表单个会话。" };
    case "site":
      return { title: "市政设施", category: "公共用地 · 装饰", body: "市政广场、车站、体育场、观景塔或港口。随岛屿规划生成，不代表任何会话。" };
    case "backdrop":
      return { title: "背景楼", category: "城市氛围 · 不计入会话", body: "填充城市天际线的灰调背景楼，数量随会话数缩放。不可钻取，可在「城市设置」里关闭。" };
    case "massing":
      return { title: "聚合楼群", category: "超出容量的会话", body: "会话数超过城市容量（4000 栋）时，多出来的会话合并成低细节楼群显示。" };
    case "seaside":
      return { title: "海滨设施", category: "城市风貌 · 装饰", body: "沙滩、遮阳伞、躺椅、救生塔与游艇等海滨装饰。不代表任何会话。" };
    case "volcano":
      return { title: "火山", category: "远景 · 装饰", body: "海平线上的远景火山。不代表任何会话。" };
    default:
      return null;
  }
}

/** 网格名 → 装饰类别（拾取时沿父级链匹配；静态城缓存复用时名字随网格一起保留）。 */
export function decorKindForName(name: string): string | null {
  // 海滨酒店不在这里：它们现在是会话楼（酒店地块），点击走会话详情。
  if (name.startsWith("city-landmark-")) return `landmark:${name.slice("city-landmark-".length)}`;
  if (name.startsWith("city-civic-")) return "civic";
  if (name.startsWith("city-public-sites-")) return "site";
  if (name === "city-vice-context-facades" || name === "city-vice-context-rooftops") return "backdrop";
  if (name === "city-massing") return "massing";
  if (name === "city-lifeguard-towers" || name === "city-yachts" || name === "city-beach-furniture") return "seaside";
  if (name === "city-sea-volcano") return "volcano";
  return null;
}
