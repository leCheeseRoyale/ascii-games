/**
 * Gamepad state tracker.
 * Call update() once per frame BEFORE systems run.
 * Wraps the browser Gamepad API with held/pressed/released semantics.
 */

/** Standard gamepad button indices (W3C "standard" mapping). */
export const GAMEPAD_BUTTONS = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  BACK: 8,
  START: 9,
  L_STICK: 10,
  R_STICK: 11,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
} as const;

export class Gamepad {
  private prevButtons: boolean[] = [];
  private currButtons: boolean[] = [];
  private axes: number[] = [0, 0, 0, 0];
  private _connected = false;
  private gamepadIndex = -1;

  private onConnect: (e: GamepadEvent) => void;
  private onDisconnect: (e: GamepadEvent) => void;

  constructor() {
    this.onConnect = (e: GamepadEvent) => {
      this._connected = true;
      this.gamepadIndex = e.gamepad.index;
    };
    this.onDisconnect = () => {
      this._connected = false;
      this.gamepadIndex = -1;
    };
    window.addEventListener("gamepadconnected", this.onConnect);
    window.addEventListener("gamepaddisconnected", this.onDisconnect);
  }

  /** Whether a gamepad is currently connected. */
  get connected(): boolean {
    return this._connected;
  }

  /** Flush pending state. Call once per frame. */
  update(): void {
    if (!this._connected) return;
    const gamepads = navigator.getGamepads();
    const gp = gamepads[this.gamepadIndex];
    if (!gp) return;

    this.prevButtons = [...this.currButtons];
    this.currButtons = gp.buttons.map((b) => b.pressed);
    this.axes = [...gp.axes];
  }

  /** True while button is held. Use GAMEPAD_BUTTONS constants for indices. */
  held(button: number): boolean {
    return this.currButtons[button] ?? false;
  }

  /** True only on the frame button was pressed. */
  pressed(button: number): boolean {
    return (this.currButtons[button] ?? false) && !(this.prevButtons[button] ?? false);
  }

  /** True only on the frame button was released. */
  released(button: number): boolean {
    return !(this.currButtons[button] ?? false) && (this.prevButtons[button] ?? false);
  }

  /** Get stick axes. 'left' = axes 0,1. 'right' = axes 2,3. Returns {x, y} in -1..1 range. */
  stick(which: "left" | "right", deadzone = 0.15): { x: number; y: number } {
    const i = which === "left" ? 0 : 2;
    let x = this.axes[i] ?? 0;
    let y = this.axes[i + 1] ?? 0;
    if (Math.abs(x) < deadzone) x = 0;
    if (Math.abs(y) < deadzone) y = 0;
    return { x, y };
  }

  /** Analog trigger value (0-1). 'left' = LT (button 6), 'right' = RT (button 7). */
  trigger(which: "left" | "right"): number {
    if (!this._connected) return 0;
    const gamepads = navigator.getGamepads();
    const gp = gamepads[this.gamepadIndex];
    if (!gp) return 0;
    const btn = which === "left" ? 6 : 7;
    return gp.buttons[btn]?.value ?? 0;
  }

  destroy(): void {
    window.removeEventListener("gamepadconnected", this.onConnect);
    window.removeEventListener("gamepaddisconnected", this.onDisconnect);
  }
}
