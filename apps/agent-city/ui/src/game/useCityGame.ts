/**
 * useCityGame：GameSession 的 React 桥（G1.4 接入）。惰性创建会话（引擎实例在
 * 后续 effect 中才就绪），unmount 清理先于引擎销毁退出游戏（归还相机）；
 * Esc 走捕获阶段优先于既有面板链；WebGL 上下文丢失直接退出到数据模式（§8）。
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { CityEngine } from "../engine/CityEngine";
import { GameSession, type GameSessionSnapshot } from "./GameSession";
import type { GameLocale } from "./gameCopy";

export type GameHostBridge = {
  cinemaActive: () => boolean;
  filmActive: () => boolean;
  busy: () => boolean;
  /** 进入时的 UI 状态（§8 ReturnState 的 React 部分；退出恢复）。 */
  labelsVisible: () => boolean;
  /** 游戏退出后触发一次最新投影刷新。 */
  requestRefresh: () => void;
  locale: () => GameLocale;
};

export function useCityGame(engine: RefObject<CityEngine | null>, host: GameHostBridge) {
  const [snapshot, setSnapshot] = useState<GameSessionSnapshot | null>(null);
  const [entryError, setEntryError] = useState<string | null>(null);
  const sessionRef = useRef<GameSession | null>(null);
  const hostRef = useRef(host);
  hostRef.current = host;

  // 卸载清理：本 hook 在引擎创建 effect 之前声明，因此先于 engine.dispose() 运行，
  // 游戏退出（归还相机/恢复视角）发生在引擎还活着的时候。
  useEffect(() => () => sessionRef.current?.dispose(), []);

  const getSession = useCallback((): GameSession | null => {
    if (!sessionRef.current && engine.current) {
      const engineInstance = engine.current;
      sessionRef.current = new GameSession(engineInstance, {
        onState: (next) => setSnapshot(next),
        onExited: () => {
          engineInstance.setLabelsVisible(hostRef.current.labelsVisible());
          hostRef.current.requestRefresh();
        },
      });
    }
    return sessionRef.current;
  }, [engine]);

  const enterPractice = useCallback(() => {
    const session = getSession();
    const engineInstance = engine.current;
    if (!session || !engineInstance) return;
    setEntryError(null);
    const hostState = session.hostState(hostRef.current.cinemaActive(), hostRef.current.filmActive(), hostRef.current.busy());
    const result = session.enter({ mode: "practice" }, hostState);
    if (!result.ok) {
      const locale = hostRef.current.locale();
      const reasons: Record<string, string> = {
        "cinema-active": locale === "en" ? "Finish the aerial tour before entering the game." : "航拍进行中，请先结束航拍再进入游戏。",
        "film-active": locale === "en" ? "Finish or cancel the video export before entering the game." : "视频导出进行中，请在导出完成或取消后再进入游戏。",
        busy: locale === "en" ? "Another action is in progress — try again shortly." : "当前有操作进行中，稍后再试。",
        "not-ready": locale === "en" ? "City data is not ready yet." : "城市数据尚未就绪，暂时无法进入游戏。",
        "no-safe-spawn": locale === "en" ? "No safe spawn point is available right now." : "没有可用的安全出生点，暂不能进入飞行。",
        "camera-busy": locale === "en" ? "The camera is busy." : "相机被占用，暂时无法起飞。",
        "already-in-game": "",
      };
      const text = reasons[result.reason] ?? (locale === "en" ? "Cannot take off right now." : "暂时无法起飞。");
      if (text) setEntryError(text);
    } else {
      engineInstance.setLabelsVisible(false);
    }
  }, [engine, getSession]);

  const active = !!snapshot && snapshot.controller.phase !== "data";

  // Esc：捕获阶段优先于面板链（§3.1：运行中暂停；暂停面板打开时继续；结果面板不自动重开）。
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const current = sessionRef.current;
      if (!current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const { paused, error, phase } = current.controller.snapshot;
      if (error) return;
      if (paused) current.resume();
      else if (phase === "practice" || phase === "countdown" || phase === "racing") current.pause("user");
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true } as EventListenerOptions);
  }, [active]);

  // WebGL 上下文丢失：冻结并退出到数据模式，不恢复半局（§8）。
  useEffect(() => {
    if (!active || !engine.current) return;
    const canvas = engine.current.domCanvas;
    const onLost = () => sessionRef.current?.exit();
    canvas.addEventListener("webglcontextlost", onLost);
    return () => canvas.removeEventListener("webglcontextlost", onLost);
  }, [active, engine]);

  const call = useCallback((method: "pause" | "resume" | "restart" | "retryPrepare" | "exit", reason?: Parameters<GameSession["pause"]>[0]) => {
    const session = getSession();
    if (!session) return;
    if (method === "pause" && reason) session.pause(reason);
    else (session[method] as () => void)();
  }, [getSession]);

  return {
    active,
    snapshot,
    entryError,
    clearEntryError: () => setEntryError(null),
    enterPractice,
    pause: (reason: Parameters<GameSession["pause"]>[0]) => call("pause", reason),
    resume: () => call("resume"),
    restart: () => call("restart"),
    retryPrepare: () => call("retryPrepare"),
    exit: () => call("exit"),
  };
}
