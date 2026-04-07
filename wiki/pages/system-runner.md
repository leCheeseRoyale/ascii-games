---
title: System Runner
created: 2026-04-07
updated: 2026-04-07
type: architecture
tags:
  - engine
  - ecs
  - systems
  - core
sources:
  - engine/ecs/systems.ts
  - engine/core/engine.ts
---

# System Runner

Systems are the **behavior layer** of the ECS. Each system is a named function that runs every frame, querying the ECS world for entities and operating on them. The `SystemRunner` manages an ordered list of systems and executes them in registration order.

## System Interface

```ts
// engine/ecs/systems.ts
export interface System {
  name: string
  update: (engine: Engine, dt: number) => void
  /** Optional: called once when system is added */
  init?: (engine: Engine) => void
  /** Optional: called when system is removed */
  cleanup?: (engine: Engine) => void
}
```

### The Three Hooks

- **`update(engine, dt)`** — Called every fixed timestep. This is where the work happens: query entities, apply physics, check collisions, etc.
- **`init(engine)`** — Called once when the system is added via `engine.addSystem()`. Use for one-time setup like caching queries.
- **`cleanup(engine)`** — Called when the system is removed or when the scene clears all systems. Use for teardown.

## Defining a System

Use `defineSystem` for type safety:

```ts
import { defineSystem } from '@engine/ecs/systems'

export const movementSystem = defineSystem({
  name: 'movement',

  update(engine, dt) {
    for (const e of engine.world.with('position', 'velocity')) {
      e.position.x += e.velocity.x * dt
      e.position.y += e.velocity.y * dt
    }
  },
})
```

## SystemRunner

The `SystemRunner` maintains an ordered array and provides add/remove/clear operations:

```ts
// engine/ecs/systems.ts
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
```

## Execution Order

Systems run in **registration order** — the order they were added via `engine.addSystem()`. This is critical because systems may depend on each other's results within a frame. A typical ordering:

```
1. input-system       — read input, set velocity/actions
2. movement-system    — apply velocity to position
3. collision-system   — detect and resolve overlaps
4. lifetime-system    — tick down timers, destroy expired
5. spawn-system       — create new entities based on game logic
```

If system A must run before system B, add A first in your scene's `setup()`.

## Built-in Systems

The engine auto-registers 4 built-in systems on every scene load, before any user systems. They always run first, in this order:

```
1. _parent     — sync child positions to parents
2. _physics    — gravity, friction, drag, bounce, velocity integration
3. _tween      — declarative property animation
4. _animation  — frame-by-frame sprite/ascii cycling
```

These use underscore-prefixed names to avoid collision with user system names.

User systems added in scene `setup()` run **after** these built-in systems. So by the time your system runs, physics has already been applied, tweens have been updated, and child positions have been synced.

## Adding and Removing Systems

Systems are typically added in a scene's `setup` and cleared automatically on scene transition:

```ts
// In a scene's setup:
engine.addSystem(movementSystem)    // init() called immediately
engine.addSystem(collisionSystem)
engine.addSystem(lifetimeSystem)

// Manual removal (rare):
engine.removeSystem('movement')     // cleanup() called, then removed
```

When a scene transitions, `SceneManager.load()` calls `engine.systems.clear(engine)`, which calls `cleanup()` on every system and empties the list.

## System Receives Full Engine Context

Every system gets the full `engine` reference and the fixed `dt`. This means systems can:

- Query the world: `engine.world.with('position', 'velocity')`
- Spawn entities: `engine.spawn({ ... })`
- Destroy entities: `engine.destroy(entity)`
- Read input: `engine.keyboard.justPressed('Space')`
- Access camera: `engine.camera.shake(5)`
- Transition scenes: `engine.loadScene('gameOver')`

## Related Pages

- [[ecs-architecture]] — The ECS world that systems operate on
- [[scene-lifecycle]] — Scenes add/remove systems during their lifecycle
- [[movement-system]] — Example system implementation
- [[engine-overview]] — Where systems fit in the frame lifecycle
- [[physics-system]] — Built-in physics system details
- [[animation-system]] — Built-in animation system details
- [[entity-parenting]] — Parent system and child position syncing
