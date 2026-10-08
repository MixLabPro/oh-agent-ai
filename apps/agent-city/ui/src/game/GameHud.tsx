/**
 * GameHud（§3）：练习 HUD、暂停面板、错误面板。只消费 GameSession 快照与回调，
 * 不直接操纵相机/renderer；文案走 gameCopy（中/英），布局不盖宿主导航。
 */
import { useState } from "react";
import { gameText, type GameLocale } from "./gameCopy";
import type { GameSessionSnapshot } from "./GameSession";
import { cityView } from "../i18n";
import "./game.css";

export type GameHudActions = {
  onResume: () => void;
  onRestart: () => void;
  onExit: () => void;
  onRetryPrepare: () => void;
  onNewCourse: () => void;
};

/** 毫秒 → m:ss.s 展示。 */
const clock = (ms: number) => {
  const seconds = Math.max(0, ms) / 1000;
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}.${Math.floor((seconds * 10) % 10)}`;
};

export function GameHud({ snapshot, actions, locale, persist }: { snapshot: GameSessionSnapshot; actions: GameHudActions; locale: GameLocale; persist?: { tier: "native" | "local" | "memory" | null; saveFailed: boolean } }) {
  const [helpOpen, setHelpOpen] = useState(true);
  const t = (text: string) => gameText(text, locale);
  const { controller, telemetry, softOutside, mission, best } = snapshot;
  const phase = controller.phase;
  if (phase === "data" || phase === "exiting") return null;
  const paused = controller.paused;
  const error = controller.error;
  const racing = controller.selection?.mode === "race";
  const telemetryView = telemetry && phase !== "preparing" ? (
    <div className="city-game-chip city-game-telemetry" aria-hidden="true">
      <span>{t("速度")}</span>{Math.round(telemetry.speed)}
      <span>{t("高度")}</span>{Math.round(telemetry.altitude)}
    </div>
  ) : null;
  const countdown = phase === "countdown" && mission ? Math.ceil(mission.countdownRemainingMs / 1000) : null;

  return cityView(<div className="city-game-hud">
    {/* 常驻 HUD：左上任务标题/进度；右上计时或“自由练习”；右下按键提示（可收起）。 */}
    {phase !== "preparing" && <>
      <div className="city-game-topleft">
        <div className="city-game-chip"><strong>{t(racing ? "穿环挑战" : "自由练习")}</strong></div>
        {racing && mission && <div className="city-game-chip city-game-telemetry">{mission.progress} / {mission.total}</div>}
        {softOutside && !paused && !error && <div className="city-game-chip city-game-warn" role="status">{t("已越过软边界，请返航")}</div>}
      </div>
      <div className="city-game-topright">
        {racing && mission
          ? <div className="city-game-chip city-game-telemetry"><span>{t("剩时")}</span>{clock(mission.remainingMs)}{mission.penaltyMs > 0 && <> · +{(mission.penaltyMs / 1000).toFixed(0)}s</>}</div>
          : <div className="city-game-chip">{t("自由练习")}</div>}
        {telemetryView}
      </div>
      {!paused && !error && phase !== "result" && <details className="city-game-chip city-game-keys" open={helpOpen} onToggle={(event) => setHelpOpen((event.target as HTMLDetailsElement).open)}>
        <summary aria-label={t("按键提示")}>{t("按键提示")} · {t("收起")}</summary>
        <dl>
          <dt>{t("W / S")}</dt><dd>{t("按住加速 / 减速；松开回到巡航")}</dd>
          <dt>{t("A / D")}</dt><dd>{t("左右转向")}</dd>
          <dt>{t("↑ / ↓")}</dt><dd>{t("爬升 / 下降")}</dd>
          <dt>{t("Esc")}</dt><dd>{t("暂停 / 继续")}</dd>
        </dl>
      </details>}
    </>}

    {/* 倒计时：大数字居中（不依赖颜色/声音）。 */}
    {countdown !== null && countdown > 0 && <div className="city-game-countdown" role="status" aria-live="assertive">{countdown}</div>}

    {phase === "preparing" && <div className="city-game-panel" role="status"><div>
      <h2>{t("正在准备飞行场地…")}</h2>
      <p>{t(racing ? "穿过高亮圆环，顺序错误不计数。" : "自由飞行，没有任务与计时。")}</p>
      <div className="city-game-actions"><button className="city-game-danger" onClick={actions.onExit}>{t("退出游戏")}</button></div>
    </div></div>}

    {paused && !error && <div className="city-game-panel city-game-paused" role="dialog" aria-label={t("已暂停")}><div>
      <h2>{t("已暂停")}</h2>
      <dl>
        <dt>{t("W / S")}</dt><dd>{t("按住加速 / 减速；松开回到巡航")}</dd>
        <dt>{t("A / D")}</dt><dd>{t("左右转向")}</dd>
        <dt>{t("↑ / ↓")}</dt><dd>{t("爬升 / 下降")}</dd>
        <dt>{t("Esc")}</dt><dd>{t("暂停 / 继续")}</dd>
      </dl>
      <div className="city-game-actions">
        <button autoFocus onClick={actions.onResume}>{t("继续")}</button>
        <button onClick={actions.onRestart}>{t("重新开始")}</button>
        <button className="city-game-danger" onClick={actions.onExit}>{t("退出游戏")}</button>
      </div>
    </div></div>}

    {error && <div className="city-game-panel" role="alert"><div>
      <h2>{t("出错了")}</h2>
      <p>{error.message}</p>
      <div className="city-game-actions">
        <button autoFocus onClick={actions.onRetryPrepare}>{t("重试准备")}</button>
        <button className="city-game-danger" onClick={actions.onExit}>{t("回到数据视角")}</button>
      </div>
    </div></div>}

    {/* 结果面板：冻结输入，只提供显式动作（§3.5：结果面板不自动重开任务）。 */}
    {phase === "result" && mission?.result && <div className="city-game-panel" role="dialog" aria-label={mission.result.finished ? t("完成！") : t("超时")}><div>
      <h2>{mission.result.finished ? t("完成！") : t("超时")}</h2>
      <dl className="city-game-paused">
        <dt>{t("用时")}</dt><dd>{clock(mission.result.finalMs)}</dd>
        {mission.result.penaltyMs > 0 && <><dt>{t("罚时")}</dt><dd>+{(mission.result.penaltyMs / 1000).toFixed(0)}s</dd></>}
        <dt>{t("碰撞")}</dt><dd>{mission.result.collisions}</dd>
        {best && <><dt>{t("最佳")}</dt><dd>{clock(best.finalMs)}{mission.result.finished && mission.result.finalMs <= best.finalMs && mission.result.collisions <= best.collisions ? ` · ${t("新纪录")}` : ""}</dd></>}
      </dl>
      {(persist?.saveFailed || persist?.tier === "memory") && mission.result.finished && <p role="status">{t(persist?.tier === "memory" ? "成绩仅本次保留" : "本次成绩尚未保存")}</p>}
      <div className="city-game-actions">
        <button autoFocus onClick={actions.onRestart}>{t("重试")}</button>
        <button onClick={actions.onNewCourse}>{t("换一条路线")}</button>
        <button className="city-game-danger" onClick={actions.onExit}>{t("退出游戏")}</button>
      </div>
    </div></div>}
  </div>, locale === "en" ? "en" : "zh-Hans");
}
