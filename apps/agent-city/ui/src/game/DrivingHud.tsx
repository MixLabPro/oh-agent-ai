import type { useCityDrivingUat } from "./useCityDrivingUat";

export function DrivingHud({ driving }: { driving: ReturnType<typeof useCityDrivingUat> }) {
  const { hud } = driving;
  if (!driving.active) return driving.entryError ? <aside className="city-driving-hud" aria-label="试驾入场失败">
    <p role="alert">{driving.entryError}</p><button onClick={driving.clearEntryError}>关闭</button>
  </aside> : null;
  const phase = { idle: "未入场", preparing: "准备道路与碰撞数据…", paused: "已暂停", running: "试驾中", error: "世界已失效，请退出后重试" }[hud.phase];
  return <aside className="city-driving-hud" aria-label="汽车试驾">
    <p className="city-driving-badge">汽车试驾 · UAT</p>
    <h2>{phase}</h2>
    <p>出生点候选未确认 · 本次仅用于驾驶诊断</p>
    <output aria-label="当前速度">{hud.speed.toFixed(1)} <small>世界单位 / 秒</small></output>
    <p aria-label="档位" className="city-driving-gear">{hud.gear === "R" ? "倒车 R" : hud.gear === "B" ? "制动" : hud.gear === "D" ? "前进 D" : "静止"}</p>
    <p role="status">{hud.blocked ? `受阻：${hud.reason ?? "道路或障碍物"}` : hud.reason === "long-frame" ? "帧间隔过长，已自动暂停" : "W 加速 · S 刹车/倒车 · A/D 转向 · 空格暂停 · Esc 退出"}</p>
    {hud.coverage && <details><summary>碰撞覆盖</summary><p>{hud.coverage}</p></details>}
    <div className="city-driving-actions">
      {(hud.phase === "paused" || hud.phase === "running") && <button onClick={hud.phase === "running" ? driving.pause : driving.resume}>{hud.phase === "running" ? "暂停" : "开始 / 继续"}</button>}
      <button onClick={driving.exit}>{hud.phase === "preparing" ? "取消准备" : "退出试驾"}</button>
    </div>
  </aside>;
}
