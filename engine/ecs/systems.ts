/**
 * System definition and runner.
 *
 * A system is a named function that runs every frame.
 * Systems receive the full engine context and delta time.
 *
 * Systems can optionally declare a `phase` — when turn management is active,
 * phase-gated systems only run during their declared phase. Systems without
 * a phase always run (real-time behavior preserved for animations, tweens, etc.).
 */

import type { Engine } from "../core/engine";

export interface System {
  name: string;
  update: (engine: Engine, dt: number) => void;
  /** Optional: called once when system is added */
  init?: (engine: Engine) => void;
  /** Optional: called when system is removed */
  cleanup?: (engine: Engine) => void;
  /** Optional: only run this system during this turn phase. Ignored when turn management is inactive. */
  phase?: string;
  /**
   * Execution order — lower runs first. Default `0`. Built-in systems use
   * `SystemPriority.*` slots (measure=5, parent=10, spring=15, physics=20,
   * tween=30, animation=40, emitter=50, stateMachine=60, lifetime=70,
   * screenBounds=80), so custom systems with the default priority run before
   * all built-ins. Set a priority between two built-in slots to interleave —
   * e.g. `25` to run after physics but before tweens. Ties preserve registration order.
   */
  priority?: number;
}

/**
 * Priority slots used by the engine's built-in systems. Custom systems can
 * reference these to run just before or after a specific stage:
 *
 * ```ts
 * defineSystem({ name: 'collision', priority: SystemPriority.physics + 1, update })
 * ```
 *
 * Order: measure(5) → parent(10) → spring(15) → physics(20) → tween(30) →
 * animation(40) → emitter(50) → stateMachine(60) → lifetime(70) → screenBounds(80)
 */
export const SystemPriority = {
  measure: 5,
  parent: 10,
  spring: 15,
  physics: 20,
  tween: 30,
  animation: 40,
  emitter: 50,
  stateMachine: 60,
  lifetime: 70,
  screenBounds: 80,
} as const;

/** Per-system timing sample. Times are in milliseconds. */
export interface SystemTiming {
  /** Duration of the most recent update() call, in ms. */
  last: number;
  /** Exponential moving average of durations, in ms. */
  avg: number;
  /** Max duration observed since tracking was enabled (monotonically increases). */
  max: number;
}

export function defineSystem(system: System): System {
  return system;
}

/**
 * Manages an ordered list of systems.
 *
 * When turn management is active (engine.turns.active), systems with a `phase`
 * are skipped unless their phase matches the current turn phase.
 */
export class SystemRunner {
  private systems: System[] = [];
  private errorCounts = new Map<string, number>();

  // Per-system timing tracking (opt-in via setTimingEnabled).
  private timings = new Map<string, SystemTiming>();
  private timingEnabled = false;

  /**
   * Enable/disable per-system timing tracking. Disabled by default to avoid any
   * overhead when the debug overlay is not visible. Disabling clears any
   * previously collected samples so the next enable starts fresh.
   */
  setTimingEnabled(enabled: boolean): void {
    this.timingEnabled = enabled;
    if (!enabled) this.timings.clear();
  }

  /** Whether timing collection is currently active. */
  get isTimingEnabled(): boolean {
    return this.timingEnabled;
  }

  /** Read-only view of the per-system timing samples keyed by system name. */
  getTimings(): ReadonlyMap<string, SystemTiming> {
    return this.timings;
  }

  add(system: System, engine: Engine): void {
    const existing = this.systems.findIndex((s) => s.name === system.name);
    if (existing >= 0) return;
    const p = system.priority ?? 0;
    // Insert at the end of the block sharing this priority (stable by registration order).
    let idx = this.systems.length;
    for (let i = 0; i < this.systems.length; i++) {
      if ((this.systems[i].priority ?? 0) > p) {
        idx = i;
        break;
      }
    }
    this.systems.splice(idx, 0, system);
    system.init?.(engine);
  }

  remove(name: string, engine: Engine): void {
    const idx = this.systems.findIndex((s) => s.name === name);
    if (idx >= 0) {
      this.systems[idx].cleanup?.(engine);
      this.systems.splice(idx, 1);
    }
    // Drop any timing sample for this system — avoids stale data on re-add.
    this.timings.delete(name);
  }

  update(engine: Engine, dt: number): void {
    const turnActive = engine.turns.active;
    const currentPhase = turnActive ? engine.turns.currentPhase : null;
    const timingEnabled = this.timingEnabled;

    for (const sys of this.systems) {
      // Phase gating: skip systems whose phase doesn't match
      if (turnActive && sys.phase && sys.phase !== currentPhase) {
        continue;
      }
      try {
        const start = timingEnabled ? performance.now() : 0;
        sys.update(engine, dt);
        if (timingEnabled) {
          const elapsed = performance.now() - start;
          const t = this.timings.get(sys.name);
          if (t) {
            t.last = elapsed;
            // Exponential moving average — fast to compute, smooths frame-to-frame jitter.
            t.avg = t.avg * 0.95 + elapsed * 0.05;
            if (elapsed > t.max) t.max = elapsed;
          } else {
            // Seed avg with the first sample so it doesn't ramp up from 0.
            this.timings.set(sys.name, { last: elapsed, avg: elapsed, max: elapsed });
          }
        }
      } catch (err: any) {
        const count = (this.errorCounts.get(sys.name) ?? 0) + 1;
        this.errorCounts.set(sys.name, count);
        const msg = `System "${sys.name}" threw: ${err?.message ?? String(err)}`;
        console.error(`[SystemRunner] ${msg}`, err);
        if (count <= 3) engine.debug.showError(msg);
      }
    }
  }

  clear(engine: Engine): void {
    for (const sys of this.systems) sys.cleanup?.(engine);
    this.systems = [];
    this.errorCounts.clear();
    this.timings.clear();
  }

  list(): string[] {
    return this.systems.map((s) => s.name);
  }
}
