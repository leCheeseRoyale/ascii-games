/** Simple cooldown and tween helpers. */

export class Cooldown {
  private remaining = 0
  constructor(public duration: number) {}

  /** Try to fire. Returns true if the cooldown was ready. */
  fire(): boolean {
    if (this.remaining <= 0) {
      this.remaining = this.duration
      return true
    }
    return false
  }

  /** Tick the cooldown. Call once per frame. */
  update(dt: number): void {
    if (this.remaining > 0) this.remaining -= dt
  }

  get ready(): boolean { return this.remaining <= 0 }
  reset(): void { this.remaining = 0 }
}

/** Linear tween from a to b over duration seconds. Returns current value. */
export function tween(elapsed: number, a: number, b: number, duration: number): number {
  const t = Math.min(elapsed / duration, 1)
  return a + (b - a) * t
}

/** Ease-out quadratic. */
export function easeOut(elapsed: number, a: number, b: number, duration: number): number {
  const t = Math.min(elapsed / duration, 1)
  return a + (b - a) * (1 - (1 - t) * (1 - t))
}
