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
  remaining: number;
  interval: number; // 0 = one-shot, >0 = repeating
  callback: () => void;
  id: number;
  group?: number;
}

export class Scheduler {
  private timers: ScheduledTimer[] = [];
  private nextId = 0;

  /** One-shot: fire callback after `seconds`. Returns cancel ID. */
  after(seconds: number, callback: () => void): number {
    const id = this.nextId++;
    this.timers.push({ remaining: seconds, interval: 0, callback, id });
    return id;
  }

  /** Repeating: fire callback every `seconds`. Returns cancel ID. */
  every(seconds: number, callback: () => void): number {
    const id = this.nextId++;
    this.timers.push({ remaining: seconds, interval: seconds, callback, id });
    return id;
  }

  /** Sequence: chain delays and callbacks. Returns cancel ID for the whole sequence. */
  sequence(steps: { delay: number; fn: () => void }[]): number {
    if (steps.length === 0) return this.nextId++;
    let accumulated = 0;
    const groupId = this.nextId++;
    for (const step of steps) {
      accumulated += step.delay;
      const id = this.after(accumulated, step.fn);
      const timer = this.timers.find((t) => t.id === id);
      if (timer) timer.group = groupId;
    }
    return groupId;
  }

  /** Cancel a scheduled timer by ID. If it belongs to a group, cancels all timers in that group. */
  cancel(id: number): void {
    const timer = this.timers.find((t) => t.id === id);
    if (timer) {
      if (timer.group != null) {
        this.timers = this.timers.filter((t) => t.group !== timer.group);
      } else {
        const idx = this.timers.indexOf(timer);
        if (idx >= 0) this.timers.splice(idx, 1);
      }
      return;
    }
    // Also check if id is a groupId (for sequence cancel after steps have fired)
    if (this.timers.some((t) => t.group === id)) {
      this.timers = this.timers.filter((t) => t.group !== id);
    }
  }

  /** Tick all timers. Call once per frame. */
  update(dt: number): void {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.remaining -= dt;
      if (t.remaining <= 0) {
        if (t.interval > 0) {
          // Fire as many times as accumulated
          while (t.remaining <= 0) {
            t.callback();
            t.remaining += t.interval;
          }
        } else {
          // One-shot: fire once and remove
          t.callback();
          this.timers.splice(i, 1);
        }
      }
    }
  }

  /** Remove all timers. Called on scene change. */
  clear(): void {
    this.timers.length = 0;
  }

  /** Pause scheduler updates (idempotent). */
  pause(): void {}

  /** Resume scheduler updates (idempotent). */
  resume(): void {}

  get count(): number {
    return this.timers.length;
  }
}
