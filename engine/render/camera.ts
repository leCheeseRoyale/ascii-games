/**
 * 2D Camera — pan, zoom, follow, shake, coordinate conversion.
 */

import { clamp, lerp, rng, type Vec2 } from "../utils/math";

export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  shakeX = 0;
  shakeY = 0;

  /** Viewport size — set by the renderer. */
  viewWidth = 0;
  viewHeight = 0;

  private targetX = 0;
  private targetY = 0;
  private targetZoom = 1;
  private smoothing = 0.1;
  private shakeMagnitude = 0;
  private shakeDecay = 0.9;

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

  /** Follow a target position (call every frame). */
  follow(x: number, y: number, smoothing = 0.1): void {
    this.targetX = x;
    this.targetY = y;
    this.smoothing = smoothing;
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
    // Frame-rate independent smoothing
    const t = 1 - Math.pow(1 - this.smoothing, dt * 60);

    // Smooth pan
    this.x = lerp(this.x, this.targetX, t);
    this.y = lerp(this.y, this.targetY, t);
    this.zoom = lerp(this.zoom, this.targetZoom, t);

    // Shake (frame-rate independent decay)
    if (this.shakeMagnitude > 0.1) {
      this.shakeX = rng(-this.shakeMagnitude, this.shakeMagnitude);
      this.shakeY = rng(-this.shakeMagnitude, this.shakeMagnitude);
      this.shakeMagnitude *= Math.pow(this.shakeDecay, dt * 60);
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
      this.shakeMagnitude = 0;
    }
  }
}
