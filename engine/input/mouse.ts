/**
 * Mouse state tracker.
 * Coordinates are relative to the canvas.
 */

export class Mouse {
  x = 0;
  y = 0;
  down = false;
  justDown = false;
  justUp = false;
  wheelDelta = 0;
  button = 0;

  /** Per-button state: 0 = left, 1 = middle, 2 = right. */
  buttonsDown = new Set<number>();
  buttonsJustDown = new Set<number>();
  buttonsJustUp = new Set<number>();

  private pendingDown = false;
  private pendingUp = false;
  private pendingButtonDown: number | null = null;
  private pendingButtonUp: number | null = null;
  private pendingWheel = 0;
  private _headless = false;
  private canvas: HTMLCanvasElement | null;
  private onMove: (e: MouseEvent) => void;
  private onDown: (e: MouseEvent) => void;
  private onUp: (e: MouseEvent) => void;
  private onWheel: (e: WheelEvent) => void;

  constructor(canvas?: HTMLCanvasElement | null) {
    this.canvas = canvas ?? null;
    if (!canvas) {
      this._headless = true;
      this.onMove = () => {};
      this.onDown = () => {};
      this.onUp = () => {};
      this.onWheel = () => {};
      return;
    }
    this.onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      this.x = e.clientX - r.left;
      this.y = e.clientY - r.top;
    };
    this.onDown = (e: MouseEvent) => {
      this.down = true;
      this.button = e.button;
      this.buttonsDown.add(e.button);
      this.pendingDown = true;
      this.pendingButtonDown = e.button;
      this.onMove(e);
    };
    this.onUp = (e: MouseEvent) => {
      this.down = false;
      this.buttonsDown.delete(e.button);
      this.pendingUp = true;
      this.pendingButtonUp = e.button;
    };
    this.onWheel = (e: WheelEvent) => {
      this.pendingWheel += e.deltaY;
      e.preventDefault();
    };
    canvas.addEventListener("mousemove", this.onMove);
    canvas.addEventListener("mousedown", this.onDown);
    window.addEventListener("mouseup", this.onUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  update(): void {
    this.justDown = this.pendingDown;
    this.justUp = this.pendingUp;
    this.pendingDown = false;
    this.pendingUp = false;
    this.wheelDelta = this.pendingWheel;
    this.pendingWheel = 0;

    this.buttonsJustDown.clear();
    this.buttonsJustUp.clear();
    if (this.pendingButtonDown !== null) {
      this.buttonsJustDown.add(this.pendingButtonDown);
      this.pendingButtonDown = null;
    }
    if (this.pendingButtonUp !== null) {
      this.buttonsJustUp.add(this.pendingButtonUp);
      this.pendingButtonUp = null;
    }
  }

  /** Check if a specific mouse button is currently held. */
  held(button: number): boolean {
    return this.buttonsDown.has(button);
  }

  /** Check if a specific mouse button was pressed this frame. */
  pressed(button: number): boolean {
    return this.buttonsJustDown.has(button);
  }

  /** Check if a specific mouse button was released this frame. */
  released(button: number): boolean {
    return this.buttonsJustUp.has(button);
  }

  destroy(): void {
    if (this._headless) return;
    const c = this.canvas;
    if (!c) return;
    c.removeEventListener("mousemove", this.onMove);
    c.removeEventListener("mousedown", this.onDown);
    window.removeEventListener("mouseup", this.onUp);
    c.removeEventListener("wheel", this.onWheel);
  }
}
