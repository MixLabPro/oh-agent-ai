/** Shared keyboard button source. Mapping and interruption policy belong to the
 * vehicle/session; focus, IME, modifiers, held keys and listener lifetime do not. */
export type InputInterrupt = "focus-lost" | "host-hidden" | "host-suspended";
export type KeyboardInputOptions<Input extends object> = Readonly<{
  keys: Readonly<Record<string, keyof Input>>;
  emptyInput(): Input;
  isFocused(): boolean;
  onInterrupt(reason: InputInterrupt): void;
  onInput?(input: Readonly<Input>): void;
  onCommand?(event: KeyboardEvent): boolean;
  /** DOM element that owns game focus while this input source is attached. */
  focusTarget?(): HTMLElement | null;
  capture?: boolean;
}>;
export class KeyboardInput<Input extends object> {
  private state: Input;
  private readonly held = new Set<string>();
  private attached = false;
  constructor(private readonly options: KeyboardInputOptions<Input>) { this.state = options.emptyInput(); }
  snapshot(): Input { return { ...this.state }; }
  clear(): void { this.held.clear(); this.state = this.options.emptyInput(); this.options.onInput?.(this.snapshot()); }
  attach(): void {
    if (this.attached) return; this.attached = true;
    window.addEventListener("keydown", this.down, this.options.capture ?? false);
    window.addEventListener("keydown", this.blockInputSourceSwitch, true);
    window.addEventListener("keyup", this.up, this.options.capture ?? false);
    window.addEventListener("blur", this.blur);
    window.addEventListener("__AV_PLUGIN_SUSPENDED__", this.suspend);
    document.addEventListener("visibilitychange", this.visibility);
    document.addEventListener("focusin", this.focusIn, true);
    document.addEventListener("compositionstart", this.composition, true);
    document.addEventListener("compositionupdate", this.composition, true);
    document.addEventListener("compositionend", this.composition, true);
    document.addEventListener("beforeinput", this.beforeInput, true);
    this.focusTarget()?.focus({ preventScroll: true });
  }
  detach(): void {
    if (!this.attached) return; this.attached = false; this.clear();
    window.removeEventListener("keydown", this.down, this.options.capture ?? false);
    window.removeEventListener("keydown", this.blockInputSourceSwitch, true);
    window.removeEventListener("keyup", this.up, this.options.capture ?? false);
    window.removeEventListener("blur", this.blur);
    window.removeEventListener("__AV_PLUGIN_SUSPENDED__", this.suspend);
    document.removeEventListener("visibilitychange", this.visibility);
    document.removeEventListener("focusin", this.focusIn, true);
    document.removeEventListener("compositionstart", this.composition, true);
    document.removeEventListener("compositionupdate", this.composition, true);
    document.removeEventListener("compositionend", this.composition, true);
    document.removeEventListener("beforeinput", this.beforeInput, true);
  }
  private focusTarget(): HTMLElement | null { return this.options.focusTarget?.() ?? null; }
  private readonly focusIn = () => {
    // HUD controls can take focus without blurring the window. Drop held game
    // keys on that transition, while leaving the control and text input alone.
    if (!this.options.isFocused()) this.clear();
  };
  private readonly composition = (event: CompositionEvent) => {
    // The source stays attached while a game is paused. Only handle events
    // while the game canvas owns focus so ordinary text fields remain usable.
    if (!this.options.isFocused()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  private readonly beforeInput = (event: InputEvent) => {
    if (!this.options.isFocused() || !event.inputType.startsWith("insert")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  /** macOS commonly uses Control+Space to switch input sources. Consume it
   * before it can open a text composition path while the game owns focus. */
  private readonly blockInputSourceSwitch = (event: KeyboardEvent) => {
    if (!this.options.isFocused() || event.code !== "Space" || !event.ctrlKey) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.clear();
  };
  private isTextEntryTarget(target: HTMLElement): boolean {
    if (target.isContentEditable || target.tagName === "TEXTAREA") return true;
    if (target.tagName !== "INPUT") return false;
    const type = (target as HTMLInputElement).type?.toLowerCase() ?? "text";
    return !["range", "checkbox", "radio", "button", "submit", "reset", "color", "file"].includes(type);
  }
  private readonly down = (event: KeyboardEvent) => {
    const target = event.target;
    if (target instanceof HTMLElement && this.isTextEntryTarget(target)) return;
    if (event.isComposing || event.keyCode === 229) {
      if (!this.options.isFocused()) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const key = this.options.keys[event.code];
      // During IME composition, character-level key values are unreliable, but
      // a mapped physical code (for example KeyW) still gives games a usable
      // control. Unknown/IME-only keys are never allowed to leave a held input.
      if (key === undefined || event.metaKey || event.ctrlKey || event.altKey) { this.clear(); return; }
      if (event.repeat) return;
      this.held.add(event.code);
      this.state[key] = true as Input[keyof Input];
      this.options.onInput?.(this.snapshot());
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (this.options.onCommand?.(event)) return;
    const key = this.options.keys[event.code];
    if (key === undefined || event.repeat) return;
    // HUD/dialog chrome can keep document focus after Start. Steal the canvas
    // on the first mapped key rather than dropping it until the player hits Esc.
    if (!this.options.isFocused()) {
      this.focusTarget()?.focus({ preventScroll: true });
      if (!this.options.isFocused()) return;
    }
    event.preventDefault();
    this.held.add(event.code);
    this.state[key] = true as Input[keyof Input];
    this.options.onInput?.(this.snapshot());
  };
  private readonly up = (event: KeyboardEvent) => {
    const key = this.options.keys[event.code];
    if (key === undefined) return;
    this.held.delete(event.code);
    this.state[key] = [...this.held].some((code) => this.options.keys[code] === key) as Input[keyof Input];
    this.options.onInput?.(this.snapshot());
  };
  private readonly blur = () => { this.clear(); this.options.onInterrupt("focus-lost"); };
  private readonly suspend = () => { this.clear(); this.options.onInterrupt("host-suspended"); };
  private readonly visibility = () => { if (document.visibilityState === "hidden") { this.clear(); this.options.onInterrupt("host-hidden"); } };
}
