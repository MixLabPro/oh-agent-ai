/**
 * 游戏模式文案（中/英）。zh 为源文案，en 走对照表；不进 i18n.tsx 的全局表，
 * 保持游戏模块自包含（gameCopy.ts / game.css / GameHud.tsx 同组）。
 */
export type GameLocale = "zh-Hans" | "en";

const ENGLISH: Record<string, string> = {
  "自由练习": "Free flight",
  "穿环挑战": "Ring race",
  "驾驶飞机": "Fly a plane",
  "游戏模式（开发预览）": "Game mode (dev preview)",
  "进入后用 W/S/A/D 与方向键飞行，Esc 暂停。": "Fly with W/S/A/D and arrow keys; Esc pauses.",
  "自由飞行，没有任务与计时。": "Free flight — no mission, no timer.",
  "正在准备飞行场地…": "Preparing the flight area…",
  "已暂停": "Paused",
  "继续": "Resume",
  "重新开始": "Restart",
  "操作说明": "Controls",
  "退出游戏": "Exit game",
  "W / S": "W / S",
  "按住加速 / 减速；松开回到巡航": "Hold to speed up / slow down; release returns to cruise",
  "A / D": "A / D",
  "左右转向": "Steer left / right",
  "↑ / ↓": "↑ / ↓",
  "爬升 / 下降": "Climb / descend",
  "Esc": "Esc",
  "暂停 / 继续": "Pause / resume",
  "收起": "Hide",
  "按键提示": "Controls hint",
  "已越过软边界，请返航": "Past the soft boundary — turn back",
  "高度": "Alt",
  "速度": "Speed",
  "出错了": "Something went wrong",
  "重试准备": "Retry",
  "回到数据视角": "Back to city view",
  "暂时无法起飞": "Cannot take off right now",
  "航拍进行中，请先结束航拍再进入游戏。": "Finish the aerial tour before entering the game.",
  "视频导出进行中，请在导出完成或取消后再进入游戏。": "Finish or cancel the video export before entering the game.",
  "当前有操作进行中，稍后再试。": "Another action is in progress — try again shortly.",
  "城市数据尚未就绪，暂时无法进入游戏。": "City data is not ready yet.",
  "本次成绩尚未保存": "This run was not saved",
};

export function gameText(text: string, locale: GameLocale): string {
  if (locale !== "en") return text;
  return ENGLISH[text] ?? text;
}
