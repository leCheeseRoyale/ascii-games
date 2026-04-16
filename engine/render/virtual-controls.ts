/**
 * On-screen virtual controls for touch/mobile play.
 *
 *   VirtualJoystick  — analog stick (returns -1..1 x,y with deadzone)
 *   VirtualDpad      — 4-button cross (up/down/left/right booleans)
 *
 * Both draw on the game canvas via a provided CanvasRenderingContext2D and
 * read input from a Touch instance. They resolve their on-screen position
 * each frame using a common Anchor enum so `{ anchor: "bottomLeft" }` just
 * works regardless of canvas resize.
 *
 * Typical use:
 *
 *   const stick = new VirtualJoystick({ anchor: "bottomLeft", touch: engine.touch });
 *   engine.addSystem({
 *     name: "virtual-stick",
 *     run: (e) => { stick.update(); stick.render(e.renderer.ctx, e.width, e.height); },
 *   });
 *   const vx = stick.x; // -1..1
 */

import type { TouchPoint } from "../input/touch";
import type { Anchor } from "./canvas-ui";

// ── Touch interface (minimal — decouples us from Touch impl) ──

interface TouchLike {
  readonly touches: readonly TouchPoint[];
}

// ── Anchor resolution (position only — not rectangle-based) ───

/** Resolve a single anchor point relative to canvas dimensions. */
function resolveAnchorPoint(
  anchor: Anchor | { x: number; y: number },
  canvasW: number,
  canvasH: number,
  padding = 80,
): { x: number; y: number } {
  if (typeof anchor === "object") return anchor;
  switch (anchor) {
    case "topLeft":
      return { x: padding, y: padding };
    case "topCenter":
      return { x: canvasW / 2, y: padding };
    case "topRight":
      return { x: canvasW - padding, y: padding };
    case "center":
      return { x: canvasW / 2, y: canvasH / 2 };
    case "bottomLeft":
      return { x: padding, y: canvasH - padding };
    case "bottomCenter":
      return { x: canvasW / 2, y: canvasH - padding };
    case "bottomRight":
      return { x: canvasW - padding, y: canvasH - padding };
  }
}

// ── VirtualJoystick ────────────────────────────────────────────

export interface VirtualJoystickOptions {
  anchor: Anchor | { x: number; y: number };
  /** Outer radius in px. Default 60. */
  size?: number;
  /** Inner deadzone 0..1. Default 0.15. */
  deadzone?: number;
  /** Resting color. Default "#ffffff55". */
  color?: string;
  /** Active (touched) color. Default "#ffffff99". */
  activeColor?: string;
  /** Thumb fill color. Default "#ffffffcc". */
  thumbColor?: string;
  /** Touch instance driving this joystick. */
  touch: TouchLike;
  /** Hide when not being touched. Default true. */
  visibleOnlyOnTouch?: boolean;
  /** Padding from the canvas edge used for named anchors. Default 80. */
  anchorPadding?: number;
}

export class VirtualJoystick {
  /** -1..1 horizontal, automatically updated each frame. 0 when inactive. */
  x = 0;
  /** -1..1 vertical, automatically updated each frame. 0 when inactive. */
  y = 0;
  /** Magnitude 0..1 (clamped). */
  magnitude = 0;
  /** Direction in radians. 0 = right, pi/2 = down. */
  direction = 0;
  /** True while a touch is controlling the stick. */
  active = false;

  private _centerX = 0;
  private _centerY = 0;
  private _thumbX = 0;
  private _thumbY = 0;
  private _trackedTouchId: number | null = null;
  private _lastCanvasW = 0;
  private _lastCanvasH = 0;

  private readonly anchor: Anchor | { x: number; y: number };
  private readonly size: number;
  private readonly deadzone: number;
  private readonly color: string;
  private readonly activeColor: string;
  private readonly thumbColor: string;
  private readonly touch: TouchLike;
  private readonly visibleOnlyOnTouch: boolean;
  private readonly anchorPadding: number;

  constructor(opts: VirtualJoystickOptions) {
    this.anchor = opts.anchor;
    this.size = opts.size ?? 60;
    this.deadzone = opts.deadzone ?? 0.15;
    this.color = opts.color ?? "#ffffff55";
    this.activeColor = opts.activeColor ?? "#ffffff99";
    this.thumbColor = opts.thumbColor ?? "#ffffffcc";
    this.touch = opts.touch;
    this.visibleOnlyOnTouch = opts.visibleOnlyOnTouch ?? true;
    this.anchorPadding = opts.anchorPadding ?? 80;
  }

  /** Recalculate center and read input. Safe to call multiple times per frame. */
  update(canvasW?: number, canvasH?: number): void {
    const w = canvasW ?? this._lastCanvasW;
    const h = canvasH ?? this._lastCanvasH;
    this._lastCanvasW = w;
    this._lastCanvasH = h;
    const anchor = resolveAnchorPoint(this.anchor, w, h, this.anchorPadding);
    this._centerX = anchor.x;
    this._centerY = anchor.y;

    // Acquire or release tracked touch.
    const tracked = this._findTrackedTouch();
    if (!tracked) {
      // Look for a new touch inside the ring (if not already tracking).
      if (this._trackedTouchId === null) {
        for (const t of this.touch.touches) {
          if (t.phase === "end" || t.phase === "cancel") continue;
          const dx = t.x - this._centerX;
          const dy = t.y - this._centerY;
          if (Math.hypot(dx, dy) <= this.size) {
            this._trackedTouchId = t.id;
            this._updateFromTouch(t);
            return;
          }
        }
      }
      // No touch → reset.
      this.active = false;
      this.x = 0;
      this.y = 0;
      this.magnitude = 0;
      this._thumbX = this._centerX;
      this._thumbY = this._centerY;
      this._trackedTouchId = null;
      return;
    }

    // Still tracking — update from touch.
    this._updateFromTouch(tracked);
  }

  private _findTrackedTouch(): TouchPoint | null {
    if (this._trackedTouchId === null) return null;
    for (const t of this.touch.touches) {
      if (t.id !== this._trackedTouchId) continue;
      if (t.phase === "end" || t.phase === "cancel") return null;
      return t;
    }
    return null;
  }

  private _updateFromTouch(t: TouchPoint): void {
    this.active = true;
    const dx = t.x - this._centerX;
    const dy = t.y - this._centerY;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, this.size);

    // Thumb position (follows touch, clamped to ring).
    if (dist > 0) {
      this._thumbX = this._centerX + (dx / dist) * clampedDist;
      this._thumbY = this._centerY + (dy / dist) * clampedDist;
    } else {
      this._thumbX = this._centerX;
      this._thumbY = this._centerY;
    }

    // Raw normalised stick value, clamped to the unit circle.
    const nxRaw = dx / this.size;
    const nyRaw = dy / this.size;
    const rawLen = Math.hypot(nxRaw, nyRaw);
    const magClamped = Math.min(1, rawLen);

    if (magClamped < this.deadzone) {
      this.x = 0;
      this.y = 0;
      this.magnitude = 0;
    } else {
      // Rescale so deadzone → 0, edge → 1.
      const scale = (magClamped - this.deadzone) / (1 - this.deadzone);
      const invLen = rawLen > 0 ? 1 / rawLen : 0;
      // Unit-direction * scale → keeps x,y within [-1, 1] even if touch is past edge.
      this.x = nxRaw * invLen * scale;
      this.y = nyRaw * invLen * scale;
      this.magnitude = scale;
    }
    this.direction = Math.atan2(nyRaw, nxRaw);
  }

  /** Draw the joystick. Call during render phase. */
  render(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number): void {
    this._lastCanvasW = canvasW;
    this._lastCanvasH = canvasH;
    const anchor = resolveAnchorPoint(this.anchor, canvasW, canvasH, this.anchorPadding);
    const cx = anchor.x;
    const cy = anchor.y;

    if (this.visibleOnlyOnTouch && !this.active) return;

    ctx.save();

    // Outer ring.
    ctx.strokeStyle = this.active ? this.activeColor : this.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, this.size, 0, Math.PI * 2);
    ctx.stroke();

    // Thumb.
    const tx = this.active ? this._thumbX : cx;
    const ty = this.active ? this._thumbY : cy;
    ctx.fillStyle = this.thumbColor;
    ctx.beginPath();
    ctx.arc(tx, ty, this.size * 0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  destroy(): void {
    this._trackedTouchId = null;
    this.active = false;
  }
}

// ── VirtualDpad ────────────────────────────────────────────────

export interface VirtualDpadOptions {
  anchor: Anchor | { x: number; y: number };
  /** Overall square size of the cross layout. Default 120. */
  size?: number;
  /** Size of each button square. Default 40. */
  buttonSize?: number;
  /** Touch instance driving this dpad. */
  touch: TouchLike;
  /** Hide when not being touched. Default true. */
  visibleOnlyOnTouch?: boolean;
  /** Resting button color. Default "#ffffff33". */
  color?: string;
  /** Pressed button color. Default "#ffffffaa". */
  activeColor?: string;
  /** Border color. Default "#ffffff88". */
  borderColor?: string;
  /** Optional per-direction button labels. */
  labels?: { up?: string; down?: string; left?: string; right?: string };
  /** Padding from the canvas edge used for named anchors. Default 80. */
  anchorPadding?: number;
}

type DpadDir = "up" | "down" | "left" | "right";

export class VirtualDpad {
  up = false;
  down = false;
  left = false;
  right = false;

  private _centerX = 0;
  private _centerY = 0;
  private _lastCanvasW = 0;
  private _lastCanvasH = 0;

  private readonly anchor: Anchor | { x: number; y: number };
  private readonly size: number;
  private readonly buttonSize: number;
  private readonly touch: TouchLike;
  private readonly visibleOnlyOnTouch: boolean;
  private readonly color: string;
  private readonly activeColor: string;
  private readonly borderColor: string;
  private readonly labels: { up?: string; down?: string; left?: string; right?: string };
  private readonly anchorPadding: number;

  constructor(opts: VirtualDpadOptions) {
    this.anchor = opts.anchor;
    this.size = opts.size ?? 120;
    this.buttonSize = opts.buttonSize ?? 40;
    this.touch = opts.touch;
    this.visibleOnlyOnTouch = opts.visibleOnlyOnTouch ?? true;
    this.color = opts.color ?? "#ffffff33";
    this.activeColor = opts.activeColor ?? "#ffffffaa";
    this.borderColor = opts.borderColor ?? "#ffffff88";
    this.labels = opts.labels ?? {};
    this.anchorPadding = opts.anchorPadding ?? 80;
  }

  /** Return the rect for a direction button. */
  private _buttonRect(dir: DpadDir): { x: number; y: number; w: number; h: number } {
    const half = this.size / 2;
    const bhalf = this.buttonSize / 2;
    let cx = this._centerX;
    let cy = this._centerY;
    switch (dir) {
      case "up":
        cy = this._centerY - half + bhalf;
        break;
      case "down":
        cy = this._centerY + half - bhalf;
        break;
      case "left":
        cx = this._centerX - half + bhalf;
        break;
      case "right":
        cx = this._centerX + half - bhalf;
        break;
    }
    return {
      x: cx - bhalf,
      y: cy - bhalf,
      w: this.buttonSize,
      h: this.buttonSize,
    };
  }

  private _hitTest(dir: DpadDir, x: number, y: number): boolean {
    const r = this._buttonRect(dir);
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  /** Read touches and update pressed flags. */
  update(canvasW?: number, canvasH?: number): void {
    const w = canvasW ?? this._lastCanvasW;
    const h = canvasH ?? this._lastCanvasH;
    this._lastCanvasW = w;
    this._lastCanvasH = h;
    const anchor = resolveAnchorPoint(this.anchor, w, h, this.anchorPadding);
    this._centerX = anchor.x;
    this._centerY = anchor.y;

    let up = false,
      down = false,
      left = false,
      right = false;

    for (const t of this.touch.touches) {
      if (t.phase === "end" || t.phase === "cancel") continue;
      if (this._hitTest("up", t.x, t.y)) up = true;
      if (this._hitTest("down", t.x, t.y)) down = true;
      if (this._hitTest("left", t.x, t.y)) left = true;
      if (this._hitTest("right", t.x, t.y)) right = true;
    }

    this.up = up;
    this.down = down;
    this.left = left;
    this.right = right;
  }

  /** Whether any button is currently pressed — used by visibleOnlyOnTouch. */
  private get _anyActive(): boolean {
    return this.up || this.down || this.left || this.right;
  }

  render(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number): void {
    this._lastCanvasW = canvasW;
    this._lastCanvasH = canvasH;
    const anchor = resolveAnchorPoint(this.anchor, canvasW, canvasH, this.anchorPadding);
    this._centerX = anchor.x;
    this._centerY = anchor.y;

    if (this.visibleOnlyOnTouch && !this._anyActive && !this._anyTouchNearby()) return;

    ctx.save();
    const dirs: Array<{ dir: DpadDir; active: boolean; label?: string }> = [
      { dir: "up", active: this.up, label: this.labels.up ?? "▲" },
      { dir: "down", active: this.down, label: this.labels.down ?? "▼" },
      { dir: "left", active: this.left, label: this.labels.left ?? "◀" },
      { dir: "right", active: this.right, label: this.labels.right ?? "▶" },
    ];
    for (const { dir, active, label } of dirs) {
      const r = this._buttonRect(dir);
      ctx.fillStyle = active ? this.activeColor : this.color;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = this.borderColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x, r.y, r.w, r.h);

      if (label) {
        ctx.fillStyle = this.borderColor;
        ctx.font = `${Math.floor(this.buttonSize * 0.5)}px "Fira Code", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
      }
    }
    ctx.restore();
  }

  /** Check if any touch is inside the dpad bounding box — reveals the control while finger is near. */
  private _anyTouchNearby(): boolean {
    const half = this.size / 2;
    for (const t of this.touch.touches) {
      if (t.phase === "end" || t.phase === "cancel") continue;
      if (
        t.x >= this._centerX - half &&
        t.x <= this._centerX + half &&
        t.y >= this._centerY - half &&
        t.y <= this._centerY + half
      ) {
        return true;
      }
    }
    return false;
  }

  destroy(): void {
    this.up = this.down = this.left = this.right = false;
  }
}
