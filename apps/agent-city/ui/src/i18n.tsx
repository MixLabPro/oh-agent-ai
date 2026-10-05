import { Children, cloneElement, isValidElement, useEffect, useState, type ReactElement, type ReactNode } from "react";
import { observeLocale, pluginLocale } from "./host";

// Plugin-owned presentation catalog. Business DTOs and user excerpts are not translated.
const english: Record<string, string> = {
  "收起回放": "Collapse replay",
  "当前环境没有可用的视频编码器（H.264 / VP9 / VP8），可使用拍照。": "No video encoder is available here (H.264 / VP9 / VP8). Photos remain available.",
  "已载入": "Loaded",
  "时间范围": "Time range", "画质": "Quality", "自动": "Auto", "高画质": "High", "节能": "Eco",
  "隐藏标签": "Hide labels", "显示标签": "Show labels", "重置视角": "Reset view", "航拍": "Aerial tour", "停止航拍": "Stop tour",
  "正在拍照": "Taking photo", "拍照": "Photo", "导出视频": "Export video", "取消导出": "Cancel export", "取消导出 · ": "Cancel export · ",
  "城市设置": "City settings", "这不是会话楼：没有 token、时间或会话详情可钻取。": "This is not a session building: there are no tokens, times or session details to drill into.", "海滨酒店": "Seaside hotel", "城市风貌 · 装饰": "Cityscape · Decoration", "迈阿密海滨主题的酒店排，沿海岸线固定分布。不代表任何会话，不随数据变化。": "Miami-style hotel row along the shoreline. Represents no session and does not change with your data.", "地标": "Landmark", "致敬地标 · 装饰": "Tribute landmark · Decoration", "由岛屿种子挑选的城市地标。不代表任何会话，不随数据变化。": "A landmark chosen by the island seed. Represents no session and does not change with your data.", "电视塔": "TV tower", "帆形歌剧院": "Sail opera house", "凯旋拱门": "Triumphal arch", "宝塔": "Pagoda", "灯塔": "Lighthouse", "摩天轮": "Ferris wheel", "悬索桥": "Suspension bridge", "双子塔": "Twin towers", "扭转塔": "Twist tower", "扭转装饰艺术塔": "Twisting Art Deco tower", "学校": "School", "商场": "Mall", "医院": "Hospital", "城市配套": "City facility", "城市配套 · 随规模增长": "City facility · Grows with scale", "会话越多，城市配套越多（约每 45 个会话一座）。它反映城市规模，不代表单个会话。": "More sessions bring more facilities (about one per 45 sessions). It reflects city size, not a single session.", "市政设施": "Public facility", "公共用地 · 装饰": "Public land · Decoration", "市政广场、车站、体育场、观景塔或港口。随岛屿规划生成，不代表任何会话。": "Civic square, station, stadium, observation tower or harbor. Generated with the island plan; represents no session.", "背景楼": "Backdrop tower", "城市氛围 · 不计入会话": "City atmosphere · Not a session", "填充城市天际线的灰调背景楼，数量随会话数缩放。不可钻取，可在「城市设置」里关闭。": "Muted towers that fill out the skyline; their number scales with your sessions. Not drillable; can be turned off in City settings.", "聚合楼群": "Aggregated block", "超出容量的会话": "Sessions beyond capacity", "会话数超过城市容量（4000 栋）时，多出来的会话合并成低细节楼群显示。": "When sessions exceed the city's capacity (4,000 buildings), the extra sessions are merged into low-detail blocks.", "海滨设施": "Seaside feature", "救生塔、游艇、霓虹招牌等海滨装饰。不代表任何会话。": "Lifeguard towers, yachts, neon signs and other seaside decoration. Represents no session.", "火山": "Volcano", "远景 · 装饰": "Distant scenery · Decoration", "海平线上的远景火山。不代表任何会话。": "A distant volcano on the horizon. Represents no session.", "城市背景楼": "City backdrop", "自动（随会话数，不挤占城区）": "Auto (scales with sessions, keeps districts clear)", "关闭（纯数据城市）": "Off (data-only city)", "繁华（铺满城区周边）": "Busy (fill around districts)", "背景楼只是城市氛围，不是会话，不可点击，不计入统计。": "Backdrop towers are scenery, not sessions: not clickable and not counted.", "关闭城市设置": "Close City settings", "城市摘要": "City summary",
  "会话": "Sessions", "活跃": "Active", "聚合": "Aggregated", "执行环境城区": "Harness districts",
  " 会话 · ": " sessions · ", " 活跃": " active", " 条异常（部分投影）": " findings (partial)",
  "时间回放": "Timeline", "暂停回放": "Pause replay", "播放回放": "Play replay", "时间游标": "Timeline cursor",
  "实时": "Live", "回放速度": "Replay speed", "每秒 10 分钟": "10 min/sec", "每秒 1 小时": "1 hour/sec", "每秒 4 小时": "4 hours/sec", "回到实时": "Return to live",
  "灰调背景楼为城市氛围 · 不计入会话": "Muted towers are city backdrop · excluded from sessions",
  "会话楼高表示 token 规模；施工状态和生长进度是可视化估算，不代表任务完成度。": "Session-building height represents token volume. Construction and growth are visual estimates, not task completion.",
  "建筑详情": "Building details", "关闭建筑详情": "Close building details", "建筑 · ": "Building · ", "聚合会话": "Aggregated sessions",
  "状态": "Status", "活跃 · 施工中": "Active · Building", "非活跃 · 已封顶": "Inactive · Complete", "进度估算": "Estimated progress",
  "起始时间": "Started", "事件数": "Events", "未投影": "Not projected", "费用": "Cost", "尚未接入": "Not available", "聚焦建筑": "Focus building",
  "查看会话详情": "View session details", "建筑和施工仅为数据隐喻。": "Buildings and construction are data metaphors only.",
  "此建筑代表 ": "This building represents ", " 个会话，不支持单独钻取。": " sessions; individual drill-down is unavailable.",
  "会话详情": "Session details", "关闭会话详情": "Close session details", "输入 token（含缓存）": "Input tokens (including cache)", "输出 token": "Output tokens", "统计截止": "Last event",
  "用户输入摘录": "User input excerpts", "首次输入": "First input", "后续输入": "Later input", "已截断": "Truncated", "已清理": "Scrubbed", "有限摘录": "Bounded excerpt",
  "当前数据没有可用摘录。": "No excerpts available.", "在宿主打开完整会话详情": "Open full session details in host",
  "摘录并非完整提示词。原始日志、调用详情、模型、费用及异常尚未开放为此插件的详情投影。": "Excerpts are not complete prompts. Raw logs, invocation details, models, costs and errors are not included in this plugin projection.",
  "岛屿种子": "Island seed", "应用种子": "Apply seed", "确认重新生成（4 秒内）": "Confirm regeneration (within 4 sec)", "重新生成岛屿": "Regenerate island",
  "只改变地形与布局，不删除会话数据。种子保存于插件私有本地状态。": "Changes terrain and layout only; session data is retained. The seed is stored in private local plugin state.",
  "航拍与视频长度": "Tour and video length", "短片": "Short", "完整航线": "Full route", "选择会话（键盘入口）": "Select session (keyboard)", "请选择": "Select a session",
  "拍照保存 PNG；视频后台逐帧生成 30 FPS MP4（H.264；环境不支持时改为 WebM），并显示实际生成画面的低帧率预览。硬件渲染为 1080p，软件渲染降至 360p。导出中暂停拍照，避免并发导出和保存；离开 City 会取消任务。不上传数据。": "Photos save as PNG. Video renders frame by frame in the background to 30 FPS MP4 (H.264; WebM where H.264 is unavailable) with previews of actual output frames. Hardware: 1080p; software: 360p. Photos are disabled during video export. Leaving City cancels export. No data is uploaded.",
  "当前环境不支持后台视频导出；可使用拍照。": "Background video export is unavailable; photos are supported.",
  "航拍导出预览": "Aerial export preview", "后台实际生成的航拍画面": "Actual background-rendered aerial frame", "航拍导出 ": "Aerial export ", "% · 关闭设置不取消导出": "% · Closing settings does not cancel export",
  " · 软件渲染": " · Software rendering", "实际生成帧 · 预览最多 2 FPS，成片 30 FPS": "Actual output frames · Preview up to 2 FPS; video 30 FPS", "关闭提示": "Dismiss",
  "Agent City 三维城市": "Agent City 3D scene", "当前环境无法显示三维城市，仍可查看会话摘要。": "3D rendering is unavailable; session summaries remain accessible.",
  "正在载入 City 插槽数据…": "Loading City data…", "正在更新 City 插槽数据…": "Updating City data…", "City 数据暂不可用": "City data temporarily unavailable",
  "当前时间范围没有会话": "No sessions in this time range", "数据可能已过期": "Data may be stale", "City 数据不可用": "City data unavailable",
  "合成 fixture · 尚未接入真实数据源": "Synthetic fixture · No real data source", "Agent Vitals City 模块 · ": "Agent Vitals City · ",
  "本机只读投影 · 不上传数据": "Local read-only projection · No data uploads", "本地演示数据 · 尚未接入真实数据源": "Local demo data · No real data source",
  "岛屿种子无法保存，本次使用临时种子。": "Could not save the island seed; using a temporary seed.",
  "种子须为 1–4294967295 的整数。": "Seed must be an integer from 1 to 4294967295.",
  "无法保存岛屿种子，原岛屿保持不变。": "Could not save the seed; the island is unchanged.",
  "拍照失败，当前环境可能不支持画布导出。": "Photo failed; canvas export may be unsupported.",
  "视频超过导出内存上限，请改用短片。": "Video exceeds the export memory limit; use the short route.",
  "后台导出无响应，任务已终止；City 可以继续使用。": "Background export stopped responding and was terminated. City remains available.",
  "当前环境不支持后台视频导出，可使用拍照；不会在界面线程执行导出。": "Background video export is unsupported. Use photos; export will not run on the UI thread.",
  "后台视频导出失败，City 可以继续使用。": "Background video export failed. City remains available.",
  "合成会话没有宿主日志详情，请使用原生真实数据模式。": "Synthetic sessions have no host log details. Use native local data mode.",
  "无法打开宿主会话详情，数据可能已删除或当前实例已失效。": "Could not open host session details; data may have been deleted or the instance expired.",
};
export function useCityLanguage() {
  const [locale, setLocale] = useState(pluginLocale);
  useEffect(() => observeLocale(() => setLocale(pluginLocale())), []);
  return locale;
}
export function cityText(text: string, locale: string): string {
  if (locale !== "en") return text;
  if (english[text]) return english[text];
  if (/^\d+ 天$/.test(text)) return text.replace(" 天", " days");
  if (/^取消导出 · \d+%$/.test(text)) return text.replace("取消导出", "Cancel export");
  if (/^\d+ 个会话，一座城市$/.test(text)) return text.replace(" 个会话，一座城市", " sessions, one city");
  if (/^\d+ 个会话$/.test(text)) return text.replace(" 个会话", " sessions");
  if (/^\d+ 个城区 · 已载入的 token · 非费用账单$/.test(text)) return text.replace(" 个城区 · 已载入的 token · 非费用账单", " districts · Loaded tokens · Not a bill");
  if (text.startsWith("本机真实数据 · ")) return text.replace("本机真实数据", "Real local data")
    .replace("窗口内会话", "Sessions in range").replace(/载入 (\d+)\/(\d+) 会话/, "Loaded $1/$2 sessions")
    .replace("异常为部分已入库投影", "Findings: partial ingested projection").replace("异常统计未接入", "Findings unavailable");
  return text;
}
// Translate only this plugin's declared UI strings/labels. Never traverse user text.
export function cityView(node: ReactNode, locale: string): ReactNode {
  if (typeof node === "string") return cityText(node, locale);
  if (Array.isArray(node)) return Children.map(node, (child) => cityView(child, locale));
  if (!isValidElement(node) || node.type === "blockquote" || typeof node.type === "function") return node;
  const element = node as ReactElement<Record<string, unknown>>;
  const props: Record<string, unknown> = {};
  for (const key of ["aria-label", "title"]) if (typeof element.props[key] === "string") props[key] = cityText(element.props[key] as string, locale);
  if (element.props.children !== undefined) props.children = cityView(element.props.children as ReactNode, locale);
  return cloneElement(element, props);
}
