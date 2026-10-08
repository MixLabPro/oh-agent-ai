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
};

export function GameHud({ snapshot, actions, locale }: { snapshot: GameSessionSnapshot; actions: GameHudActions; locale: GameLocale }) {
  const [helpOpen, setHelpOpen] = useState(true);
  const t = (text: string) => gameText(text, locale);
  const { controller, telemetry, softOutside } = snapshot;
  const phase = controller.phase;
  if (phase === "data" || phase === "exiting") return null;
  const paused = controller.paused;
  const error = controller.error;
  const telemetryView = telemetry && phase !== "preparing" ? (
    <div className="city-game-chip city-game-telemetry" aria-hidden="true">
      <span>{t("速度")}</span>{Math.round(telemetry.speed)}
      <span>{t("高度")}</span>{Math.round(telemetry.altitude)}
    </div>
  ) : null;

  return cityView(<div className="city-game-hud">
    {/* 常驻 HUD：左上任务标题；右上练习/读数；右下按键提示（可收起）。 */}
    {phase !== "preparing" && <>
      <div className="city-game-topleft">
        <div className="city-game-chip"><strong>{t(controller.selection?.mode === "race" ? "穿环挑战" : "自由练习")}</strong></div>
        {softOutside && !paused && !error && <div className="city-game-chip city-game-warn" role="status">{t("已越过软边界，请返航")}</div>}
      </div>
      <div className="city-game-topright">
        <div className="city-game-chip">{t(controller.selection?.mode === "race" ? "穿环挑战" : "自由练习")}</div>
        {telemetryView}
      </div>
      {!paused && !error && <details className="city-game-chip city-game-keys" open={helpOpen} onToggle={(event) => setHelpOpen((event.target as HTMLDetailsElement).open)}>
        <summary aria-label={t("按键提示")}>{t("按键提示")} · {t("收起")}</summary>
        <dl>
          <dt>{t("W / S")}</dt><dd>{t("按住加速 / 减速；松开回到巡航")}</dd>
          <dt>{t("A / D")}</dt><dd>{t("左右转向")}</dd>
          <dt>{t("↑ / ↓")}</dt><dd>{t("爬升 / 下降")}</dd>
          <dt>{t("Esc")}</dt><dd>{t("暂停 / 继续")}</dd>
        </dl>
      </details>}
    </>}

    {phase === "preparing" && <div className="city-game-panel" role="status"><div>
      <h2>{t("正在准备飞行场地…")}</h2>
      <p>{t("自由飞行，没有任务与计时。")}</p>
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
  </div>, locale === "en" ? "en" : "zh-Hans");
}
