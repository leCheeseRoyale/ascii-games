/**
 * Keyboard state tracker.
 * Call update() once per frame BEFORE systems run.
 */

export class Keyboard {
  readonly keys = new Set<string>();
  readonly justPressed = new Set<string>();
  readonly justReleased = new Set<string>();

  /** Characters typed this frame (printable keys only). Cleared each update(). */
  readonly typedChars: string[] = [];

  private pendingDown = new Set<string>();
  private pendingUp = new Set<string>();
  private pendingTyped: string[] = [];
  private onDown: (e: KeyboardEvent) => void;
  private onUp: (e: KeyboardEvent) => void;

  constructor() {
    this.onDown = (e: KeyboardEvent) => {
      if (!this.keys.has(e.code)) this.pendingDown.add(e.code);
      this.keys.add(e.code);

      // Capture printable characters for text input
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        this.pendingTyped.push(e.key);
      } else if (e.key === "Backspace") {
        this.pendingTyped.push("\b");
      } else if (e.key === "Enter") {
        this.pendingTyped.push("\r");
      } else if (e.key === "Escape") {
        this.pendingTyped.push("\u001B");
      }

      // Prevent browser defaults for game keys (keep Tab unblocked for accessibility)
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
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

  /** Flush pending → justPressed/justReleased/typedChars. Call once per frame. */
  update(): void {
    this.justPressed.clear();
    this.justReleased.clear();
    this.typedChars.length = 0;
    for (const k of this.pendingDown) this.justPressed.add(k);
    for (const k of this.pendingUp) this.justReleased.add(k);
    for (const ch of this.pendingTyped) this.typedChars.push(ch);
    this.pendingDown.clear();
    this.pendingUp.clear();
    this.pendingTyped.length = 0;
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
