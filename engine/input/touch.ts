/**
 * Touch — unified pointer/touch/mouse input with gesture recognition.
 *
 * Wraps DOM `pointer*` / `touch*` / `mouse*` events and exposes a stable
 * per-frame API compatible with Keyboard/Mouse/Gamepad:
 *
 *   engine.touch.touches          // active touches
 *   engine.touch.primary          // first active touch or null
 *   engine.touch.gestures         // recognized gestures this frame
 *   engine.touch.onTap(fn)        // event subscription
 *   engine.touch.update()         // called once per frame — clears gestures
 *
 * Gesture recognition:
 *   - tap    — single touch begin/end within tapMaxDuration without moving >dragThreshold
 *   - swipe  — touch end with movement > dragThreshold and velocity > swipeMinVelocity
 *   - pinch  — two simultaneous touches moving apart/together (scale ratio)
 *
 * The class is designed to be test-friendly: it stores the listener functions
 * it installs so tests can drive them directly with plain event-shaped objects
 * (no need for a real DOM environment).
 */

// ── Types ────────────────────────────────────────────────────────

/** A currently-tracked touch point — immutable snapshot per frame. */
export interface TouchPoint {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly startX: number;
  readonly startY: number;
  readonly dx: number;
  readonly dy: number;
  readonly startTime: number;
  readonly phase: "begin" | "active" | "end" | "cancel";
}

/** A recognized gesture — stored in `gestures` until update() clears the queue. */
export interface TouchGesture {
  type: "tap" | "swipe" | "pinch";
  [key: string]: unknown;
}

export interface TapGesture extends TouchGesture {
  type: "tap";
  x: number;
  y: number;
  duration: number;
}

export interface SwipeGesture extends TouchGesture {
  type: "swipe";
  direction: "up" | "down" | "left" | "right";
  dx: number;
  dy: number;
  distance: number;
  duration: number;
}

export interface PinchGesture extends TouchGesture {
  type: "pinch";
  scale: number;
  centerX: number;
  centerY: number;
}

export interface TouchOptions {
  /** Whether to treat mouse events as synthetic touches. Default true. */
  unifyMouse?: boolean;
  /** Minimum movement distance in px for a drag/swipe (not a tap). Default 10. */
  dragThreshold?: number;
  /** Max duration in ms for a tap (vs hold). Default 300. */
  tapMaxDuration?: number;
  /** Min velocity for a swipe (px/ms). Default 0.5. */
  swipeMinVelocity?: number;
}

// ── Internal mutable touch state ─────────────────────────────────

interface InternalTouch {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  startTime: number;
  phase: "begin" | "active" | "end" | "cancel";
  moved: boolean;
}

// ── Minimal canvas interface (duck-typed) ────────────────────────
// We accept HTMLCanvasElement at the public boundary, but internally treat the
// canvas as a minimal structural type so tests can pass a plain mock.

interface CanvasLike {
  addEventListener: (type: string, handler: (e: unknown) => void, opts?: unknown) => void;
  removeEventListener: (type: string, handler: (e: unknown) => void, opts?: unknown) => void;
  getBoundingClientRect(): { left: number; top: number; width?: number; height?: number };
  /** Canvas pixel size — used to scale touches when the element is CSS-scaled. */
  width?: number;
  height?: number;
}

// Simplified event shapes. Tests just pass plain objects matching these.
interface PointerLikeEvent {
  pointerId?: number;
  pointerType?: string;
  clientX?: number;
  clientY?: number;
  preventDefault?: () => void;
  isPrimary?: boolean;
  button?: number;
}

interface TouchLikePoint {
  identifier?: number;
  clientX?: number;
  clientY?: number;
}

interface TouchLikeEvent {
  touches?: readonly TouchLikePoint[];
  targetTouches?: readonly TouchLikePoint[];
  changedTouches?: readonly TouchLikePoint[];
  preventDefault?: () => void;
}

// Synthetic mouse-id constant — mouse events all share the same id
// (mouse is always one "touch" with no multi-touch support).
const MOUSE_SYNTHETIC_ID = -1;

// ── Touch class ──────────────────────────────────────────────────

export class Touch {
  /** All currently active touches. */
  readonly touches: readonly TouchPoint[] = [];
  /** Recognized gestures this frame. Cleared on update(). */
  readonly gestures: readonly TouchGesture[] = [];

  // Mutable internals (we cast readonly away on self-assignment below).
  private _touches = new Map<number, InternalTouch>();
  private _endedThisFrame: InternalTouch[] = [];
  private _gestureQueue: TouchGesture[] = [];

  // Pinch state: distance between the two most recent touches when pinch began.
  private _pinchBaseDistance = 0;
  private _pinchActive = false;

  // Options
  private readonly unifyMouse: boolean;
  private readonly dragThreshold: number;
  private readonly tapMaxDuration: number;
  private readonly swipeMinVelocity: number;

  // DOM hooks
  private canvas: CanvasLike;
  private _listeners: Array<{
    target:
      | CanvasLike
      | {
          addEventListener: CanvasLike["addEventListener"];
          removeEventListener: CanvasLike["removeEventListener"];
        };
    type: string;
    handler: (e: unknown) => void;
    opts?: unknown;
  }> = [];

  // Event subscribers
  private _onTap: Array<(g: TapGesture) => void> = [];
  private _onSwipe: Array<(g: SwipeGesture) => void> = [];
  private _onPinch: Array<(g: PinchGesture) => void> = [];
  private _onBegin: Array<(t: TouchPoint) => void> = [];
  private _onEnd: Array<(t: TouchPoint) => void> = [];
  private _onMove: Array<(t: TouchPoint) => void> = [];

  // Mouse-tracking for unifyMouse mode.
  private _mouseDown = false;

  constructor(canvasArg?: HTMLCanvasElement | CanvasLike | null, opts: TouchOptions = {}) {
    const canvas = canvasArg as CanvasLike | null;
    this.canvas = canvas ?? ({} as CanvasLike);
    this.unifyMouse = opts.unifyMouse ?? true;
    this.dragThreshold = opts.dragThreshold ?? 10;
    this.tapMaxDuration = opts.tapMaxDuration ?? 300;
    this.swipeMinVelocity = opts.swipeMinVelocity ?? 0.5;

    if (!canvas) return;

    // Bind handlers — arrow functions so `this` is preserved.
    const onPointerDown = (e: unknown) => this._handlePointerDown(e as PointerLikeEvent);
    const onPointerMove = (e: unknown) => this._handlePointerMove(e as PointerLikeEvent);
    const onPointerUp = (e: unknown) => this._handlePointerUp(e as PointerLikeEvent, "end");
    const onPointerCancel = (e: unknown) => this._handlePointerUp(e as PointerLikeEvent, "cancel");

    const onTouchStart = (e: unknown) => this._handleTouchStart(e as TouchLikeEvent);
    const onTouchMove = (e: unknown) => this._handleTouchMove(e as TouchLikeEvent);
    const onTouchEnd = (e: unknown) => this._handleTouchEnd(e as TouchLikeEvent, "end");
    const onTouchCancel = (e: unknown) => this._handleTouchEnd(e as TouchLikeEvent, "cancel");

    const onMouseDown = (e: unknown) => this._handleMouseDown(e as PointerLikeEvent);
    const onMouseMove = (e: unknown) => this._handleMouseMove(e as PointerLikeEvent);
    const onMouseUp = (e: unknown) => this._handleMouseUp(e as PointerLikeEvent);

    const passive = { passive: false };

    // Pointer events (preferred — unified API on modern browsers).
    this._addListener(canvas, "pointerdown", onPointerDown, passive);
    this._addListener(canvas, "pointermove", onPointerMove, passive);
    this._addListener(canvas, "pointerup", onPointerUp, passive);
    this._addListener(canvas, "pointercancel", onPointerCancel, passive);

    // Touch events (fallback / older browsers).
    this._addListener(canvas, "touchstart", onTouchStart, passive);
    this._addListener(canvas, "touchmove", onTouchMove, passive);
    this._addListener(canvas, "touchend", onTouchEnd, passive);
    this._addListener(canvas, "touchcancel", onTouchCancel, passive);

    // Mouse events (only if unifyMouse — and only when pointer events aren't firing).
    if (this.unifyMouse) {
      this._addListener(canvas, "mousedown", onMouseDown, passive);
      this._addListener(canvas, "mousemove", onMouseMove, passive);
      // Listen on window so mouseup fires even if cursor leaves canvas.
      const win =
        typeof globalThis !== "undefined"
          ? (globalThis as unknown as { window?: CanvasLike }).window
          : undefined;
      const upTarget = win ?? canvas;
      this._addListener(upTarget, "mouseup", onMouseUp, passive);
    }
  }

  // ── Public event subscriptions ─────────────────────────────────

  onTap(handler: (g: TapGesture) => void): () => void {
    this._onTap.push(handler);
    return () => {
      const i = this._onTap.indexOf(handler);
      if (i >= 0) this._onTap.splice(i, 1);
    };
  }

  onSwipe(handler: (g: SwipeGesture) => void): () => void {
    this._onSwipe.push(handler);
    return () => {
      const i = this._onSwipe.indexOf(handler);
      if (i >= 0) this._onSwipe.splice(i, 1);
    };
  }

  onPinch(handler: (g: PinchGesture) => void): () => void {
    this._onPinch.push(handler);
    return () => {
      const i = this._onPinch.indexOf(handler);
      if (i >= 0) this._onPinch.splice(i, 1);
    };
  }

  onBegin(handler: (t: TouchPoint) => void): () => void {
    this._onBegin.push(handler);
    return () => {
      const i = this._onBegin.indexOf(handler);
      if (i >= 0) this._onBegin.splice(i, 1);
    };
  }

  onEnd(handler: (t: TouchPoint) => void): () => void {
    this._onEnd.push(handler);
    return () => {
      const i = this._onEnd.indexOf(handler);
      if (i >= 0) this._onEnd.splice(i, 1);
    };
  }

  onMove(handler: (t: TouchPoint) => void): () => void {
    this._onMove.push(handler);
    return () => {
      const i = this._onMove.indexOf(handler);
      if (i >= 0) this._onMove.splice(i, 1);
    };
  }

  // ── Primary / Query ────────────────────────────────────────────

  /** First active touch, or null. */
  get primary(): TouchPoint | null {
    for (const t of this._touches.values()) {
      if (t.phase !== "end" && t.phase !== "cancel") {
        return this._snapshot(t);
      }
    }
    return null;
  }

  /** Find a touch point by its identifier. Returns null if not active. */
  find(id: number): TouchPoint | null {
    const t = this._touches.get(id);
    return t ? this._snapshot(t) : null;
  }

  // ── Frame update ───────────────────────────────────────────────

  /**
   * Called once per frame. Clears gesture queue, removes ended touches,
   * and rebuilds the public `touches` list.
   */
  update(): void {
    // Remove ended/cancelled touches.
    for (const t of this._endedThisFrame) {
      this._touches.delete(t.id);
    }
    this._endedThisFrame = [];

    // Promote any "begin" touches to "active" for next frame.
    for (const t of this._touches.values()) {
      if (t.phase === "begin") t.phase = "active";
    }

    // Rebuild public snapshot arrays.
    (this as { touches: readonly TouchPoint[] }).touches = Array.from(this._touches.values(), (t) =>
      this._snapshot(t),
    );
    (this as { gestures: readonly TouchGesture[] }).gestures = [];
    this._gestureQueue = [];
  }

  /** Remove all event listeners. Idempotent. */
  destroy(): void {
    for (const { target, type, handler, opts } of this._listeners) {
      target.removeEventListener(type, handler, opts);
    }
    this._listeners = [];
    this._touches.clear();
    this._endedThisFrame = [];
    this._gestureQueue = [];
    (this as { touches: readonly TouchPoint[] }).touches = [];
    (this as { gestures: readonly TouchGesture[] }).gestures = [];
  }

  // ── Internal: listener registration ────────────────────────────

  private _addListener(
    target:
      | CanvasLike
      | {
          addEventListener: CanvasLike["addEventListener"];
          removeEventListener: CanvasLike["removeEventListener"];
        },
    type: string,
    handler: (e: unknown) => void,
    opts?: unknown,
  ): void {
    target.addEventListener(type, handler, opts);
    this._listeners.push({ target, type, handler, opts });
  }

  // ── Internal: snapshot / client coord conversion ──────────────

  private _snapshot(t: InternalTouch): TouchPoint {
    return {
      id: t.id,
      x: t.x,
      y: t.y,
      startX: t.startX,
      startY: t.startY,
      dx: t.x - t.startX,
      dy: t.y - t.startY,
      startTime: t.startTime,
      phase: t.phase,
    };
  }

  private _toCanvasXY(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const rectW = rect.width ?? 0;
    const rectH = rect.height ?? 0;
    // When the canvas is CSS-scaled (common on mobile viewports), rect.width
    // and canvas.width diverge. Map clientX/Y through the ratio so the
    // returned coordinates are in canvas pixel space — matching how sprites
    // are drawn and how other input (mouse) reports positions.
    const scaleX = rectW > 0 ? (this.canvas.width ?? rectW) / rectW : 1;
    const scaleY = rectH > 0 ? (this.canvas.height ?? rectH) / rectH : 1;
    return {
      x: (clientX - (rect.left ?? 0)) * scaleX,
      y: (clientY - (rect.top ?? 0)) * scaleY,
    };
  }

  private _now(): number {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }
    return Date.now();
  }

  // ── Internal: pointer event handlers ───────────────────────────

  private _handlePointerDown(e: PointerLikeEvent): void {
    // Ignore mouse pointer events if unifyMouse=false.
    if (!this.unifyMouse && e.pointerType === "mouse") return;
    e.preventDefault?.();
    const id = e.pointerId ?? MOUSE_SYNTHETIC_ID;
    const { x, y } = this._toCanvasXY(e.clientX ?? 0, e.clientY ?? 0);
    this._beginTouch(id, x, y);
  }

  private _handlePointerMove(e: PointerLikeEvent): void {
    if (!this.unifyMouse && e.pointerType === "mouse") return;
    const id = e.pointerId ?? MOUSE_SYNTHETIC_ID;
    if (!this._touches.has(id)) return;
    const { x, y } = this._toCanvasXY(e.clientX ?? 0, e.clientY ?? 0);
    this._moveTouch(id, x, y);
  }

  private _handlePointerUp(e: PointerLikeEvent, phase: "end" | "cancel"): void {
    if (!this.unifyMouse && e.pointerType === "mouse") return;
    e.preventDefault?.();
    const id = e.pointerId ?? MOUSE_SYNTHETIC_ID;
    if (!this._touches.has(id)) return;
    const { x, y } = this._toCanvasXY(e.clientX ?? 0, e.clientY ?? 0);
    this._endTouch(id, x, y, phase);
  }

  // ── Internal: touch event handlers ─────────────────────────────

  private _handleTouchStart(e: TouchLikeEvent): void {
    e.preventDefault?.();
    const changed = e.changedTouches ?? [];
    for (const t of changed) {
      const id = t.identifier ?? 0;
      if (this._touches.has(id)) continue;
      const { x, y } = this._toCanvasXY(t.clientX ?? 0, t.clientY ?? 0);
      this._beginTouch(id, x, y);
    }
  }

  private _handleTouchMove(e: TouchLikeEvent): void {
    e.preventDefault?.();
    const changed = e.changedTouches ?? [];
    for (const t of changed) {
      const id = t.identifier ?? 0;
      if (!this._touches.has(id)) continue;
      const { x, y } = this._toCanvasXY(t.clientX ?? 0, t.clientY ?? 0);
      this._moveTouch(id, x, y);
    }
  }

  private _handleTouchEnd(e: TouchLikeEvent, phase: "end" | "cancel"): void {
    e.preventDefault?.();
    const changed = e.changedTouches ?? [];
    for (const t of changed) {
      const id = t.identifier ?? 0;
      if (!this._touches.has(id)) continue;
      const { x, y } = this._toCanvasXY(t.clientX ?? 0, t.clientY ?? 0);
      this._endTouch(id, x, y, phase);
    }
  }

  // ── Internal: mouse-only fallback handlers ─────────────────────

  private _handleMouseDown(e: PointerLikeEvent): void {
    e.preventDefault?.();
    // If pointer events already fired, _touches has the synthetic mouse id.
    if (this._touches.has(MOUSE_SYNTHETIC_ID)) return;
    this._mouseDown = true;
    const { x, y } = this._toCanvasXY(e.clientX ?? 0, e.clientY ?? 0);
    this._beginTouch(MOUSE_SYNTHETIC_ID, x, y);
  }

  private _handleMouseMove(e: PointerLikeEvent): void {
    if (!this._mouseDown) return;
    if (!this._touches.has(MOUSE_SYNTHETIC_ID)) return;
    const { x, y } = this._toCanvasXY(e.clientX ?? 0, e.clientY ?? 0);
    this._moveTouch(MOUSE_SYNTHETIC_ID, x, y);
  }

  private _handleMouseUp(e: PointerLikeEvent): void {
    if (!this._mouseDown) return;
    this._mouseDown = false;
    if (!this._touches.has(MOUSE_SYNTHETIC_ID)) return;
    const { x, y } = this._toCanvasXY(e.clientX ?? 0, e.clientY ?? 0);
    this._endTouch(MOUSE_SYNTHETIC_ID, x, y, "end");
  }

  // ── Core state transitions ────────────────────────────────────

  private _beginTouch(id: number, x: number, y: number): void {
    const now = this._now();
    const t: InternalTouch = {
      id,
      x,
      y,
      startX: x,
      startY: y,
      startTime: now,
      phase: "begin",
      moved: false,
    };
    this._touches.set(id, t);

    const snap = this._snapshot(t);
    for (const h of this._onBegin) h(snap);

    // Pinch: two simultaneous touches → record base distance.
    if (this._touches.size === 2 && !this._pinchActive) {
      const pts = Array.from(this._touches.values());
      this._pinchBaseDistance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      this._pinchActive = true;
    }
  }

  private _moveTouch(id: number, x: number, y: number): void {
    const t = this._touches.get(id);
    if (!t) return;
    t.x = x;
    t.y = y;
    if (!t.moved) {
      const d = Math.hypot(t.x - t.startX, t.y - t.startY);
      if (d > this.dragThreshold) t.moved = true;
    }
    const snap = this._snapshot(t);
    for (const h of this._onMove) h(snap);

    // Pinch update.
    if (this._pinchActive && this._touches.size === 2) {
      const pts = Array.from(this._touches.values());
      const currDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (this._pinchBaseDistance > 0) {
        const scale = currDist / this._pinchBaseDistance;
        const centerX = (pts[0].x + pts[1].x) / 2;
        const centerY = (pts[0].y + pts[1].y) / 2;
        const g: PinchGesture = { type: "pinch", scale, centerX, centerY };
        this._enqueueGesture(g);
        for (const h of this._onPinch) h(g);
      }
    }
  }

  private _endTouch(id: number, x: number, y: number, phase: "end" | "cancel"): void {
    const t = this._touches.get(id);
    if (!t) return;
    t.x = x;
    t.y = y;
    t.phase = phase;

    const snap = this._snapshot(t);
    for (const h of this._onEnd) h(snap);

    // Gesture recognition (only on a proper "end", not cancel).
    if (phase === "end") this._recognizeGesture(t);

    // Reset pinch when we drop below 2 touches.
    if (this._pinchActive && this._touches.size - 1 < 2) {
      this._pinchActive = false;
      this._pinchBaseDistance = 0;
    }

    // Mark for removal during next update().
    this._endedThisFrame.push(t);
  }

  // ── Gesture recognition ───────────────────────────────────────

  private _recognizeGesture(t: InternalTouch): void {
    const duration = this._now() - t.startTime;
    const dx = t.x - t.startX;
    const dy = t.y - t.startY;
    const distance = Math.hypot(dx, dy);

    // Tap — short duration, didn't move.
    if (duration <= this.tapMaxDuration && distance <= this.dragThreshold) {
      const g: TapGesture = { type: "tap", x: t.x, y: t.y, duration };
      this._enqueueGesture(g);
      for (const h of this._onTap) h(g);
      return;
    }

    // Swipe — moved enough AND fast enough.
    if (distance > this.dragThreshold) {
      const velocity = duration > 0 ? distance / duration : 0;
      if (velocity >= this.swipeMinVelocity) {
        const direction: SwipeGesture["direction"] =
          Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
        const g: SwipeGesture = { type: "swipe", direction, dx, dy, distance, duration };
        this._enqueueGesture(g);
        for (const h of this._onSwipe) h(g);
      }
    }
  }

  private _enqueueGesture(g: TouchGesture): void {
    this._gestureQueue.push(g);
    (this as { gestures: readonly TouchGesture[] }).gestures = this._gestureQueue.slice();
  }
}
