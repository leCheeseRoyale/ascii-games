/**
 * Keyboard state tracker.
 * Call update() once per frame BEFORE systems run.
 */

export class Keyboard {
  readonly keys = new Set<string>();
  readonly justPressed = new Set<string>();
  readonly justReleased = new Set<string>();

  private pendingDown = new Set<string>();
  private pendingUp = new Set<string>();
  private onDown: (e: KeyboardEvent) => void;
  private onUp: (e: KeyboardEvent) => void;

  constructor() {
    this.onDown = (e: KeyboardEvent) => {
      if (!this.keys.has(e.code)) this.pendingDown.add(e.code);
      this.keys.add(e.code);
      // Prevent browser defaults for game keys
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Tab"].includes(e.code)) {
        e.preventDefault();
      }
    };
    this.onUp = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
      this.pendingUp.add(e.code);
    };
    window.addEventListener("keydown", this.onDown);
    window.addEventListener("keyup", this.onUp);
  }

  /** Flush pending → justPressed/justReleased. Call once per frame. */
  update(): void {
    this.justPressed.clear();
    this.justReleased.clear();
    for (const k of this.pendingDown) this.justPressed.add(k);
    for (const k of this.pendingUp) this.justReleased.add(k);
    this.pendingDown.clear();
    this.pendingUp.clear();
  }

  /** Is this key currently held? */
  held(code: string): boolean {
    return this.keys.has(code);
  }
  /** Was this key pressed this frame? */
  pressed(code: string): boolean {
    return this.justPressed.has(code);
  }
  /** Was this key released this frame? */
  released(code: string): boolean {
    return this.justReleased.has(code);
  }

  destroy(): void {
    window.removeEventListener("keydown", this.onDown);
    window.removeEventListener("keyup", this.onUp);
  }
}
