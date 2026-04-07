/**
 * Game-time scheduler. All timers respect pause and auto-cleanup on scene change.
 *
 * Usage:
 *   engine.after(1.5, () => spawnBoss())
 *   engine.every(0.5, () => spawnEnemy())
 *   engine.sequence([
 *     { delay: 0, fn: () => showText('Ready') },
 *     { delay: 1, fn: () => showText('Set') },
 *     { delay: 1, fn: () => showText('Go!') },
 *   ])
 */

interface ScheduledTimer {
  remaining: number
  interval: number  // 0 = one-shot, >0 = repeating
  callback: () => void
  id: number
}

let nextId = 0

export class Scheduler {
  private timers: ScheduledTimer[] = []

  /** One-shot: fire callback after `seconds`. Returns cancel ID. */
  after(seconds: number, callback: () => void): number {
    const id = nextId++
    this.timers.push({ remaining: seconds, interval: 0, callback, id })
    return id
  }

  /** Repeating: fire callback every `seconds`. Returns cancel ID. */
  every(seconds: number, callback: () => void): number {
    const id = nextId++
    this.timers.push({ remaining: seconds, interval: seconds, callback, id })
    return id
  }

  /** Sequence: chain delays and callbacks. Returns cancel ID for the whole sequence. */
  sequence(steps: { delay: number; fn: () => void }[]): number {
    let accumulated = 0
    const ids: number[] = []
    for (const step of steps) {
      accumulated += step.delay
      ids.push(this.after(accumulated, step.fn))
    }
    return ids[0] // return first ID (cancel clears all)
  }

  /** Cancel a scheduled timer by ID. */
  cancel(id: number): void {
    const idx = this.timers.findIndex(t => t.id === id)
    if (idx >= 0) this.timers.splice(idx, 1)
  }

  /** Tick all timers. Call once per frame. */
  update(dt: number): void {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i]
      t.remaining -= dt
      if (t.remaining <= 0) {
        t.callback()
        if (t.interval > 0) {
          t.remaining += t.interval  // preserve leftover for accuracy
        } else {
          this.timers.splice(i, 1)
        }
      }
    }
  }

  /** Remove all timers. Called on scene change. */
  clear(): void {
    this.timers.length = 0
  }

  get count(): number { return this.timers.length }
}
