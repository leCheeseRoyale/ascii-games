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

  private pendingDown = false;
  private pendingUp = false;
  private pendingWheel = 0;
  private _headless = false;
  private canvas: HTMLCanvasElement | null;
  private onMove: (e: MouseEvent) => void;
  private onDown: (e: MouseEvent) => void;
  private onUp: () => void;
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
      this.pendingDown = true;
      this.onMove(e);
    };
    this.onUp = () => {
      this.down = false;
      this.pendingUp = true;
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
  }

  destroy(): void {
    if (this._headless) return;
    this.canvas!.removeEventListener("mousemove", this.onMove);
    this.canvas!.removeEventListener("mousedown", this.onDown);
    window.removeEventListener("mouseup", this.onUp);
    this.canvas!.removeEventListener("wheel", this.onWheel);
  }
}
