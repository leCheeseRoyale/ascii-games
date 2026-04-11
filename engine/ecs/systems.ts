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

  add(system: System, engine: Engine): void {
    const existing = this.systems.findIndex((s) => s.name === system.name);
    if (existing >= 0) return;
    this.systems.push(system);
    system.init?.(engine);
  }

  remove(name: string, engine: Engine): void {
    const idx = this.systems.findIndex((s) => s.name === name);
    if (idx >= 0) {
      this.systems[idx].cleanup?.(engine);
      this.systems.splice(idx, 1);
    }
  }

  update(engine: Engine, dt: number): void {
    const turnActive = engine.turns.active;
    const currentPhase = turnActive ? engine.turns.currentPhase : null;

    for (const sys of this.systems) {
      // Phase gating: skip systems whose phase doesn't match
      if (turnActive && sys.phase && sys.phase !== currentPhase) {
        continue;
      }
      sys.update(engine, dt);
    }
  }

  clear(engine: Engine): void {
    for (const sys of this.systems) sys.cleanup?.(engine);
    this.systems = [];
  }

  list(): string[] {
    return this.systems.map((s) => s.name);
  }
}
