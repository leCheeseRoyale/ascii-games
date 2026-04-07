/**
 * 2D Camera — pan, zoom, follow, shake.
 */

import { lerp, clamp, rng } from '../utils/math'

export class Camera {
  x = 0
  y = 0
  zoom = 1
  shakeX = 0
  shakeY = 0

  private targetX = 0
  private targetY = 0
  private targetZoom = 1
  private smoothing = 0.1
  private shakeMagnitude = 0
  private shakeDecay = 0.9

  /** Instantly move camera to position. */
  moveTo(x: number, y: number): void {
    this.x = this.targetX = x
    this.y = this.targetY = y
  }

  /** Smoothly pan to a position. */
  panTo(x: number, y: number, smoothing = 0.1): void {
    this.targetX = x
    this.targetY = y
    this.smoothing = smoothing
  }

  /** Follow a target position (call every frame). */
  follow(x: number, y: number, smoothing = 0.1): void {
    this.targetX = x
    this.targetY = y
    this.smoothing = smoothing
  }

  /** Set zoom level (1 = normal). */
  setZoom(z: number): void {
    this.targetZoom = clamp(z, 0.1, 5)
  }

  /** Trigger screen shake. */
  shake(magnitude = 5): void {
    this.shakeMagnitude = magnitude
  }

  /** Call once per frame. */
  update(dt: number): void {
    // Smooth pan
    this.x = lerp(this.x, this.targetX, this.smoothing)
    this.y = lerp(this.y, this.targetY, this.smoothing)
    this.zoom = lerp(this.zoom, this.targetZoom, this.smoothing)

    // Shake
    if (this.shakeMagnitude > 0.1) {
      this.shakeX = rng(-this.shakeMagnitude, this.shakeMagnitude)
      this.shakeY = rng(-this.shakeMagnitude, this.shakeMagnitude)
      this.shakeMagnitude *= this.shakeDecay
    } else {
      this.shakeX = 0
      this.shakeY = 0
      this.shakeMagnitude = 0
    }
  }
}
