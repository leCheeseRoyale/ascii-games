/**
 * 2D Camera — pan, zoom, follow, shake, coordinate conversion, bounds, deadzone, lookahead.
 */

import { clamp, lerp, rng, type Vec2 } from "../utils/math";

export interface CameraFollowOpts {
  /** Lerp speed (0-1). 0 = no movement, 1 = instant snap. Default 0.1. */
  smoothing?: number;
  /** Deadzone: a rectangle around the target where the camera stops moving.
   *  If target is within deadzone of camera center, no movement. Default null (no deadzone). */
  deadzone?: { width: number; height: number };
  /** Lookahead: offsets target toward its velocity. e.g., 0.5 = 50% of velocity added to target. */
  lookahead?: number;
  /** Offset from target (useful for below-target, above-target, etc.). */
  offset?: { x: number; y: number };
}

export interface CameraBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Target shape the camera can follow — anything with a position, and optionally a velocity. */
export interface CameraFollowTarget {
  position: { x: number; y: number };
  velocity?: { vx: number; vy: number };
}

export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  shakeX = 0;
  shakeY = 0;

  /** Viewport size — set by the renderer. Alias: viewportWidth/viewportHeight. */
  viewWidth = 0;
  viewHeight = 0;

  /** Follow target. Null = not following. */
  followTarget: CameraFollowTarget | null = null;
  followOpts: CameraFollowOpts = {};

  /** World bounds — camera viewport will be clamped inside these if set. */
  bounds: CameraBounds | null = null;

  private targetX = 0;
  private targetY = 0;
  private targetZoom = 1;
  private smoothing = 0.1;
  private shakeMagnitude = 0;
  private shakeDecay = 0.9;

  // ── viewportWidth / viewportHeight aliases ──────────────────────
  /** Viewport width (alias for viewWidth). */
  get viewportWidth(): number {
    return this.viewWidth;
  }
  set viewportWidth(w: number) {
    this.viewWidth = w;
  }
  /** Viewport height (alias for viewHeight). */
  get viewportHeight(): number {
    return this.viewHeight;
  }
  set viewportHeight(h: number) {
    this.viewHeight = h;
  }

  /** Instantly move camera to position. */
  moveTo(x: number, y: number): void {
    this.x = this.targetX = x;
    this.y = this.targetY = y;
  }

  /** Smoothly pan to a position. */
  panTo(x: number, y: number, smoothing = 0.1): void {
    this.targetX = x;
    this.targetY = y;
    this.smoothing = smoothing;
  }

  /**
   * Follow a target.
   *
   * Two call signatures:
   *   follow(target, opts?)  — new: follow an entity (or null to stop)
   *   follow(x, y, smoothing?) — legacy: follow a point (sets pan target)
   */
  follow(
    targetOrX: CameraFollowTarget | null | number,
    optsOrY?: CameraFollowOpts | number,
    legacySmoothing?: number,
  ): void {
    // Legacy signature: follow(x, y, smoothing?)
    if (typeof targetOrX === "number") {
      this.followTarget = null;
      this.targetX = targetOrX;
      this.targetY = (optsOrY as number) ?? 0;
      if (typeof legacySmoothing === "number") this.smoothing = legacySmoothing;
      return;
    }

    // New signature: follow(target, opts?)
    if (targetOrX === null) {
      this.followTarget = null;
      this.followOpts = {};
      return;
    }
    this.followTarget = targetOrX;
    this.followOpts = (optsOrY as CameraFollowOpts) ?? {};
  }

  /** Set world bounds — camera won't show areas outside these. Pass null to clear. */
  setBounds(bounds: CameraBounds | null): void {
    this.bounds = bounds;
  }

  /** Update viewport dimensions (call when window resizes). */
  setViewport(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
  }

  /** Set zoom level (1 = normal). */
  setZoom(z: number): void {
    this.targetZoom = clamp(z, 0.1, 5);
  }

  /** Trigger screen shake. */
  shake(magnitude = 5): void {
    this.shakeMagnitude = magnitude;
  }

  /** Convert screen (mouse) coordinates to world coordinates. */
  screenToWorld(sx: number, sy: number): Vec2 {
    const cx = this.viewWidth / 2;
    const cy = this.viewHeight / 2;
    return {
      x: (sx - cx - this.shakeX) / this.zoom + this.x,
      y: (sy - cy - this.shakeY) / this.zoom + this.y,
    };
  }

  /** Convert world coordinates to screen coordinates. */
  worldToScreen(wx: number, wy: number): Vec2 {
    const cx = this.viewWidth / 2;
    const cy = this.viewHeight / 2;
    return {
      x: (wx - this.x) * this.zoom + cx + this.shakeX,
      y: (wy - this.y) * this.zoom + cy + this.shakeY,
    };
  }

  /** Call once per frame. */
  update(dt: number): void {
    // If a follow target is set, compute its effective position (with offset + lookahead)
    // and update the pan target accordingly. Deadzone suppresses pan-target updates.
    if (this.followTarget) {
      const opts = this.followOpts;
      let tx = this.followTarget.position.x;
      let ty = this.followTarget.position.y;

      if (opts.offset) {
        tx += opts.offset.x;
        ty += opts.offset.y;
      }

      if (opts.lookahead && opts.lookahead > 0 && this.followTarget.velocity) {
        tx += this.followTarget.velocity.vx * opts.lookahead;
        ty += this.followTarget.velocity.vy * opts.lookahead;
      }

      // Deadzone: only update the pan target when the tracked point is outside the
      // deadzone rectangle around the current camera position. The camera keeps
      // lerping toward its current pan target regardless — the deadzone just
      // prevents tiny movements when the target is close to center.
      if (opts.deadzone) {
        const halfW = opts.deadzone.width / 2;
        const halfH = opts.deadzone.height / 2;
        const dx = tx - this.x;
        const dy = ty - this.y;
        // Push pan target by the minimum amount needed so the follow point sits on
        // the deadzone edge. This yields "box follow" behavior.
        if (dx > halfW) this.targetX = tx - halfW;
        else if (dx < -halfW) this.targetX = tx + halfW;
        if (dy > halfH) this.targetY = ty - halfH;
        else if (dy < -halfH) this.targetY = ty + halfH;
      } else {
        this.targetX = tx;
        this.targetY = ty;
      }

      if (opts.smoothing !== undefined) {
        this.smoothing = opts.smoothing;
      }
    }

    // Frame-rate independent smoothing
    const s = clamp(this.smoothing, 0, 1);
    const t = s >= 1 ? 1 : 1 - (1 - s) ** (dt * 60);

    // Smooth pan
    this.x = lerp(this.x, this.targetX, t);
    this.y = lerp(this.y, this.targetY, t);
    this.zoom = lerp(this.zoom, this.targetZoom, t);

    // Clamp camera to bounds so the viewport stays within [minX..maxX, minY..maxY].
    if (this.bounds && this.viewWidth > 0 && this.viewHeight > 0) {
      const halfW = this.viewWidth / (2 * this.zoom);
      const halfH = this.viewHeight / (2 * this.zoom);
      const b = this.bounds;
      // If bounds are smaller than viewport on an axis, center on the bounds.
      if (b.maxX - b.minX <= halfW * 2) {
        this.x = (b.minX + b.maxX) / 2;
      } else {
        this.x = clamp(this.x, b.minX + halfW, b.maxX - halfW);
      }
      if (b.maxY - b.minY <= halfH * 2) {
        this.y = (b.minY + b.maxY) / 2;
      } else {
        this.y = clamp(this.y, b.minY + halfH, b.maxY - halfH);
      }
      // Keep pan target consistent so the camera doesn't fight the bounds.
      this.targetX = clamp(this.targetX, b.minX + halfW, b.maxX - halfW);
      this.targetY = clamp(this.targetY, b.minY + halfH, b.maxY - halfH);
    }

    // Shake (frame-rate independent decay)
    if (this.shakeMagnitude > 0.1) {
      this.shakeX = rng(-this.shakeMagnitude, this.shakeMagnitude);
      this.shakeY = rng(-this.shakeMagnitude, this.shakeMagnitude);
      this.shakeMagnitude *= this.shakeDecay ** (dt * 60);
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
      this.shakeMagnitude = 0;
    }
  }
}
