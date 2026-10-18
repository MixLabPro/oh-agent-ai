import { useState } from "react";
import { gameText, type GameLocale } from "./gameCopy";
import { METERS_PER_UNIT } from "../engine/worldScale";
import { GameHudShell } from "./ui/GameHudShell";
import { GameControlsHelp, type GameControlRow } from "./ui/GameControlsHelp";
import { GameSessionPanel } from "./ui/GameSessionPanel";
import { GameSoundPanel } from "./ui/GameSoundPanel";
import { TelemetryChip } from "./ui/TelemetryChip";
import type { GameSoundCapabilities } from "./ui/GameSoundPanel";
import type { RuntimeDiagnosticSnapshot } from "./runtime/RuntimeDiagnostics";
import "./game.css";

export type DrivingHudModel = Readonly<{
  active: boolean;
  entryError: string | null;
  initialPaused: boolean;
  hud: Readonly<{
    phase: "idle" | "preparing" | "paused" | "running" | "error";
    reason: string | null; speed: number; blocked: boolean; coverage: string | null;
    gear: "D" | "R" | "B" | "N";
  }>;
  diagnostics: RuntimeDiagnosticSnapshot | null;
}>;
export type DrivingHudActions = Readonly<{
  clearEntryError(): void; exit(): void; pause(): void; resume(): void; openUiContext(): void;
}>;

const DRIVING_CONTROLS: readonly GameControlRow[] = [
  { keys: "W / ↑", description: "加速" }, { keys: "S / ↓", description: "刹车；停车后倒车" },
  { keys: "A / D / ← / →", description: "左右转向" }, { keys: "Esc / Space", description: "暂停 / 继续" },
  { keys: "拖动 / 滚轮", description: "环绕汽车 / 拉近拉远（双击复位）" },
];

export function DrivingHud({ model, actions, locale, sound }: {
  model: DrivingHudModel; actions: DrivingHudActions; locale: GameLocale; sound?: GameSoundCapabilities;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [soundOpen, setSoundOpen] = useState(false);
  const { hud } = model;
  const t = (text: string) => gameText(text, locale);
  const openUi = () => actions.openUiContext();
  const closeError = !model.active && model.entryError;
  if (!model.active && !closeError) return null;
  const entryDescription = model.entryError?.startsWith("暂不能开始驾驶：") && locale === "en"
    ? `${t("暂不能开始驾驶")} · ${model.entryError.slice("暂不能开始驾驶：".length)}`
    : t(model.entryError ?? "入口错误");
  const speedKmh = (Math.abs(hud.speed) * METERS_PER_UNIT * 3.6).toFixed(1);
  const gearLabel = hud.gear === "R" ? t("倒车") : hud.gear === "B" ? t("制动") : hud.gear === "D" ? t("前进") : t("静止");
  const runtimeDiagnostics = model.diagnostics;
  const sceneError = hud.reason && ["stale-game-world", "stale-car-world", "world-invalidated", "world-revision-mismatch"].includes(hud.reason)
    ? "场景已更新，请重新进入" : hud.reason ?? "场景已更新，请重新进入";
  let panel = null;
  if (closeError) panel = <GameSessionPanel locale={locale} title="暂不能开始驾驶" description={entryDescription} role="alertdialog"
    actions={[{ label: "关闭", onAction: actions.clearEntryError }]} />;
  else if (hud.phase === "preparing") panel = <GameSessionPanel locale={locale} title="正在准备驾驶场景…"
    description={t("出生点未确认 · 本次仅用于驾驶诊断")}
    actions={[{ label: "取消准备", tone: "danger", onAction: actions.exit }]} />;
  else if (hud.phase === "error") panel = <GameSessionPanel locale={locale} title="场景已失效" description={t(sceneError)} role="alertdialog"
    actions={[{ label: "退出试驾", tone: "danger", onAction: actions.exit}]} />;
  else if (hud.phase === "paused") panel = <GameSessionPanel locale={locale}
    title={hud.reason === "camera-safety" ? "相机安全检查已暂停驾驶" : hud.reason === "long-frame" ? "帧间隔过长，已暂停" : model.initialPaused ? "准备就绪" : "已暂停"}
    description={hud.reason === "camera-safety" ? t("相机安全检查无法确认，驾驶已暂停。") : model.initialPaused ? t("出生点候选未确认 · 本次仅用于驾驶诊断") : hud.reason === "long-frame" ? t("帧间隔恢复后，可显式继续驾驶") : undefined}
    children={<><GameControlsHelp locale={locale} rows={DRIVING_CONTROLS} className="city-game-panel-help" />
      {sound && <GameSoundPanel locale={locale} sound={sound} />}</>}
    actions={[{ label: model.initialPaused ? "开始驾驶" : "继续", onAction: actions.resume }, { label: "退出试驾", tone: "danger", onAction: actions.exit}]} />;

  const title = <>
    <div className="city-game-chip"><strong>{t("自由驾驶")}</strong></div>
    <div className="city-game-chip city-game-uat-mark" aria-label={t("UAT 诊断模式")}>{t("UAT 诊断")}</div>
    {hud.phase === "running" && <button className="city-game-compact-action" type="button" onClick={() => { openUi(); actions.pause(); }}>{t("暂停")}</button>}
  </>;
  const blocked = hud.blocked ? t("前方有障碍") : hud.reason === "long-frame" ? t("帧间隔过长，已自动暂停") : undefined;
  // Keep an opened disclosure mounted when opening it pauses the car. Otherwise
  // the native <details> vanishes with the running HUD while the modal is hidden.
  const help = hud.phase === "running" || helpOpen ? <GameControlsHelp locale={locale} rows={DRIVING_CONTROLS}
    onOpenChange={(open) => { setHelpOpen(open); if (open) openUi(); }} /> : undefined;
  const soundDisclosure = (hud.phase === "running" || soundOpen) && sound?.sfx ? <GameSoundPanel locale={locale} sound={sound}
    onOpenChange={(open) => { setSoundOpen(open); if (open) openUi(); }} /> : undefined;
  return <GameHudShell title={title}
    status={blocked ? <div className="city-game-chip city-game-status" data-tone="warn">{blocked}</div> : undefined}
    telemetry={<TelemetryChip label={t("当前速度")} value={`${speedKmh} km/h, ${gearLabel}`} className="city-game-car-telemetry">
      <><span>{t("速度")}</span><strong>{speedKmh}</strong><small>km/h</small><span aria-hidden="true">·</span><strong>{gearLabel}</strong></>
    </TelemetryChip>}
    sound={soundDisclosure}
    help={help} panel={hud.phase === "paused" && (helpOpen || soundOpen) ? null : panel}
    diagnostic={<details className="city-game-chip city-game-diagnostics">
      <summary>{t("驾驶诊断")}</summary>
      {hud.coverage && <p><strong>{t("碰撞覆盖")}</strong> · {hud.coverage}</p>}
      {hud.reason && <p><strong>{t("内部原因")}</strong> · {hud.reason}</p>}
      {runtimeDiagnostics && <dl><dt>{t("样本")}</dt><dd>{runtimeDiagnostics.samples}</dd>
        <dt>{t("帧时 P95")}</dt><dd>{runtimeDiagnostics.frameMs.p95.toFixed(1)} ms</dd>
        <dt>{t("Tick CPU P95")}</dt><dd>{runtimeDiagnostics.tickCpuMs.p95.toFixed(1)} ms</dd>
        <dt>{t("Present CPU P95")}</dt><dd>{runtimeDiagnostics.presentCpuMs.p95.toFixed(1)} ms</dd>
        <dt>{t("最大补步")}</dt><dd>{runtimeDiagnostics.maxSteps}</dd>
        <dt>{t("长帧超限")}</dt><dd>{runtimeDiagnostics.limits["frame-gap"] + runtimeDiagnostics.limits["catch-up-budget"]}</dd>
        <dt>{t("相机贴身保持")}</dt><dd>{runtimeDiagnostics.camera.holds} · {t("相机收缩")} {runtimeDiagnostics.camera.shrinks}</dd>
      </dl>}
      {runtimeDiagnostics?.preparationMs && <dl aria-label={t("准备阶段耗时")}>
        {Object.entries(runtimeDiagnostics.preparationMs).map(([stage, duration]) => <div key={stage}><dt>{stage}</dt><dd>{duration?.toFixed(1)} ms</dd></div>)}
      </dl>}
    </details>}
  />;
}
