/**
 * System definition and runner.
 *
 * A system is a named function that runs every frame.
 * Systems receive the full engine context and delta time.
 */

import type { Engine } from '../core/engine'

export interface System {
  name: string
  update: (engine: Engine, dt: number) => void
  /** Optional: called once when system is added */
  init?: (engine: Engine) => void
  /** Optional: called when system is removed */
  cleanup?: (engine: Engine) => void
}

export function defineSystem(system: System): System {
  return system
}

/**
 * Manages an ordered list of systems.
 */
export class SystemRunner {
  private systems: System[] = []

  add(system: System, engine: Engine): void {
    this.systems.push(system)
    system.init?.(engine)
  }

  remove(name: string, engine: Engine): void {
    const idx = this.systems.findIndex(s => s.name === name)
    if (idx >= 0) {
      this.systems[idx].cleanup?.(engine)
      this.systems.splice(idx, 1)
    }
  }

  update(engine: Engine, dt: number): void {
    for (const sys of this.systems) {
      sys.update(engine, dt)
    }
  }

  clear(engine: Engine): void {
    for (const sys of this.systems) sys.cleanup?.(engine)
    this.systems = []
  }

  list(): string[] {
    return this.systems.map(s => s.name)
  }
}
