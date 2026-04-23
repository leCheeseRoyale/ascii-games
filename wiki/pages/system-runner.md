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
  /** Optional: only run during this turn phase. Ignored when turn management is inactive. */
  phase?: string
  /** Execution order — lower runs first. Default 0. Built-in systems use
   *  5–80 (measure=5, parent=10, spring=15, physics=20, tween=30, animation=40,
   *  emitter=50, stateMachine=60, lifetime=70, screenBounds=80), so custom systems
   *  with the default priority run before all built-ins. Ties preserve registration order. */
  priority?: number
}
```

### Hooks

- **`update(engine, dt)`** — Called every fixed timestep. This is where the work happens: query entities, apply physics, check collisions, etc.
- **`init(engine)`** — Called once when the system is added via `engine.addSystem()`. Use for one-time setup like caching queries.
- **`cleanup(engine)`** — Called when the system is removed or when the scene clears all systems. Use for teardown.

### Ordering and Phase

- **`priority`** — Lower runs first. Default `0`. Built-in systems use 5–80, so custom systems run before all built-ins by default. Set e.g. `SystemPriority.physics + 1` to run between physics (20) and tweens (30). Ties preserve registration order.
- **`phase`** — For turn-based games. When set, the system only runs during that turn phase. Ignored when turn management is inactive.

## Defining a System

Use `defineSystem` for type safety:

```ts
import { defineSystem } from '@engine/ecs/systems'

export const movementSystem = defineSystem({
  name: 'movement',

  update(engine, dt) {
    for (const e of engine.world.with('position', 'velocity')) {
      e.position.x += e.velocity.vx * dt
      e.position.y += e.velocity.vy * dt
    }
  },
})
```

## SystemRunner

The `SystemRunner` maintains a priority-sorted array and provides add/remove/clear operations:

```ts
// engine/ecs/systems.ts (simplified)
export class SystemRunner {
  private systems: System[] = []

  add(system: System, engine: Engine): void {
    // Insert at the end of the block sharing this priority (stable by registration order)
    const p = system.priority ?? 0
    let idx = this.systems.length
    for (let i = 0; i < this.systems.length; i++) {
      if ((this.systems[i].priority ?? 0) > p) { idx = i; break }
    }
    this.systems.splice(idx, 0, system)
    system.init?.(engine)
  }

  remove(name: string, engine: Engine): void { /* ... cleanup + splice ... */ }
  update(engine: Engine, dt: number): void { /* iterate and call update */ }
  clear(engine: Engine): void { /* cleanup all, empty list */ }
}
```

## Execution Order

Systems run in **priority order** — lower `priority` values run first. Ties preserve registration order. Custom systems default to `priority: 0`, so they run before all built-in systems (which use 5–80). Use `SystemPriority` constants to interleave:

```ts
import { SystemPriority } from '@engine/ecs/systems'

// Runs after physics (20) but before tweens (30)
defineSystem({ name: 'post-physics', priority: SystemPriority.physics + 1, update(engine, dt) { ... } })
```

If two custom systems both have the default priority (0), they run in the order they were added in your scene's `setup()`.

## Built-in Systems

The engine auto-registers 11 built-in systems on every scene load. They use priorities 5–80, so custom systems (priority 0 by default) run **before** them:

| System | Priority | Description |
|--------|----------|-------------|
| `_measure` | 5 | Auto-sizes `collider: "auto"` from Pretext text measurement |
| `_parent` | 10 | Syncs child positions to parent + offset |
| `_spring` | 15 | Applies spring force toward `spring.targetX/Y` |
| `_physics` | 20 | Gravity, friction, drag, bounce, velocity integration |
| `_tween` | 30 | Declarative property animation |
| `_animation` | 40 | Frame-by-frame sprite/ascii cycling |
| `_emitter` | 50 | Spawns particles from `ParticleEmitter` components |
| `_stateMachine` | 60 | Ticks entity state machines |
| `_lifetime` | 70 | Decrements `lifetime.remaining`, destroys at zero |
| `_screenBounds` | 80 | Handles `screenWrap`, `screenClamp`, `offScreenDestroy` |
| `_trail` | after animation | Spawns fading afterimage entities from the `trail` component |

One additional system is **lazy-registered** (zero cost unless used):

| `_collisionEvents` | First `engine.onCollide()` call | Tracks tag-pair overlaps and fires callbacks |

These use underscore-prefixed names to avoid collision with user system names.

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
