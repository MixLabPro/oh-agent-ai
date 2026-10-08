/**
 * FlightInput（§3.1）：DOM 键盘输入适配。按 KeyboardEvent.code 映射位置键；
 * 输入框/contenteditable/输入法组合期间不处理；窗口失焦/文档隐藏清空按键并回调暂停。
 * 飞行键（WASD/方向键）只在游戏画布持有焦点时进入飞行状态——HUD 按钮、宿主控件
 * 聚焦时按键不影响飞机；方向键的默认行为（滚动等）也只在画布聚焦且模拟运行时消费。
 * attach/detach 成对注册（所有监听可释放，不复制上游未移除 blur 监听的实现）。
 */
import { EMPTY_INPUT, type FlightInputState, type GamePauseReason } from "./types";

const KEY_MAP: Record<string, keyof FlightInputState> = {
  KeyW: "throttleUp",
  KeyS: "throttleDown",
  KeyA: "turnLeft",
  KeyD: "turnRight",
  ArrowUp: "pitchUp",
  ArrowDown: "pitchDown",
};

export type FlightInputOptions = {
  /** 游戏画布当前是否持有焦点（飞行键进入状态的唯一门槛）。 */
  isGameFocused: () => boolean;
  /** 方向键是否应消费默认行为（画布聚焦且模拟运行时才为 true）。 */
  shouldConsumeArrows: () => boolean;
  /** 焦点丢失/宿主隐藏：清空按键后回调（会话层据此 pause）。 */
  onInterrupt: (reason: Extract<GamePauseReason, "focus-lost" | "host-hidden">) => void;
};

export class FlightInput {
  private state: FlightInputState = { ...EMPTY_INPUT };
  private attached = false;

  constructor(private readonly options: FlightInputOptions) {}

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onWindowBlur);
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("__AV_PLUGIN_SUSPENDED__", this.onSuspended);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    this.clear();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onWindowBlur);
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("__AV_PLUGIN_SUSPENDED__", this.onSuspended);
  }

  snapshot(): FlightInputState {
    return { ...this.state };
  }

  /** 清空按键（暂停/失焦/菜单出现时调用；恢复时也先清旧键值）。 */
  clear(): void {
    this.state = { ...EMPTY_INPUT };
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    const mapped = KEY_MAP[event.code];
    if (!mapped) return;
    if (this.isTypingTarget(event.target) || event.isComposing || event.repeat) return;
    const focused = this.options.isGameFocused();
    if ((event.code === "ArrowUp" || event.code === "ArrowDown") && focused && this.options.shouldConsumeArrows()) {
      event.preventDefault();
    }
    // 画布未聚焦：按键不进入飞行状态（也不吞默认行为，让宿主/其他控件正常工作）。
    if (!focused) return;
    this.state[mapped] = true;
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    const mapped = KEY_MAP[event.code];
    if (!mapped) return;
    this.state[mapped] = false; // 无条件清除，避免任何路径留下粘键
  };

  private readonly onWindowBlur = () => {
    this.clear();
    this.options.onInterrupt("focus-lost");
  };

  private readonly onVisibility = () => {
    if (document.visibilityState !== "hidden") return;
    this.clear();
    this.options.onInterrupt("host-hidden");
  };

  private readonly onSuspended = () => {
    this.clear();
    this.options.onInterrupt("host-hidden");
  };

  private isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
  }
}
