---
title: Scene Lifecycle
created: 2026-04-07
updated: 2026-04-07
type: architecture
tags:
  - engine
  - scenes
  - lifecycle
  - core
sources:
  - engine/core/scene.ts
  - engine/core/engine.ts
---

# Scene Lifecycle

A **scene** is a discrete game state — title screen, gameplay, game over, etc. Each scene has full ownership of the game state for its duration: it spawns entities, registers systems, and cleans up after itself. The `SceneManager` handles transitions between scenes.

## Scene Interface

```ts
// engine/core/scene.ts
export interface Scene {
  name: string
  /** Called once when the scene starts. Spawn entities, add systems. */
  setup: (engine: Engine) => void | Promise<void>
  /** Optional per-frame update (runs after systems). */
  update?: (engine: Engine, dt: number) => void
  /** Called when leaving this scene. Clean up. */
  cleanup?: (engine: Engine) => void
}
```

### The Three Hooks

- **`setup(engine)`** — Called once when the scene loads. This is where you spawn entities, add systems, set up camera position, initialize state. Can be async (e.g., for loading assets).
- **`update(engine, dt)`** — Called every fixed timestep, after all systems have run. Use this for scene-level logic like win/lose conditions, scene transitions, or UI updates.
- **`cleanup(engine)`** — Called when leaving the scene. Use for any custom teardown (the manager already clears systems and entities).

## Defining a Scene

Use the `defineScene` helper for type safety:

```ts
// engine/core/scene.ts
export function defineScene(scene: Scene): Scene {
  return scene
}
```

Example usage:

```ts
import { defineScene } from '@engine/core/scene'

export const titleScene = defineScene({
  name: 'title',

  setup(engine) {
    engine.spawn({
      position: { x: engine.width / 2, y: 200 },
      ascii: { char: 'ASTEROID FIELD', font: '48px monospace', color: '#ffffff' },
    })
    engine.addSystem(titleInputSystem)
  },

  update(engine, dt) {
    if (engine.keyboard.justPressed('Enter')) {
      engine.loadScene('gameplay')
    }
  },

  cleanup(engine) {
    // Custom cleanup if needed — systems and entities are cleared automatically
  },
})
```

## SceneManager

The `SceneManager` is a registry of scenes with transition logic:

```ts
// engine/core/scene.ts
export class SceneManager {
  current: Scene | null = null
  private scenes = new Map<string, Scene>()

  register(scene: Scene): void {
    this.scenes.set(scene.name, scene)
  }

  async load(name: string, engine: Engine): Promise<void> {
    // Cleanup current
    if (this.current) {
      this.current.cleanup?.(engine)
      engine.systems.clear(engine)
      engine.world.clear()
    }

    const scene = this.scenes.get(name)
    if (!scene) throw new Error(`Scene "${name}" not found.`)

    this.current = scene
    await scene.setup(engine)
  }

  update(engine: Engine, dt: number): void {
    this.current?.update?.(engine, dt)
  }
}
```

## Transition Support

`engine.loadScene` accepts an optional second argument for visual transitions between scenes:

```ts
await engine.loadScene('gameplay', { transition: 'fade', duration: 0.5 })
```

Supported transition types are defined by `TransitionType`. When a transition is specified, the engine overlays the transition effect during the scene switch.

## Auto-Registered Built-in Systems

When `loadScene` is called, after clearing and loading the new scene, the engine automatically registers four built-in systems:

```ts
// engine/core/engine.ts — loadScene
this.systems.add(parentSystem, this)
this.systems.add(physicsSystem, this)
this.systems.add(tweenSystem, this)
this.systems.add(animationSystem, this)
```

These systems are always present in every scene — you do NOT need to add them manually in your scene's `setup`. They run in this order before any user-added systems:

1. **parentSystem** — Syncs child entity positions to parents (see [[entity-parenting]])
2. **physicsSystem** — Applies velocity, acceleration, bounce, friction (see [[physics-system]])
3. **tweenSystem** — Drives declarative property tweens
4. **animationSystem** — Advances frame-by-frame animations (see [[animation-system]])

The engine also clears the scheduler and particle pool on scene transition, ensuring a clean slate.

## Full Transition Sequence

When `engine.loadScene('gameplay')` is called, here is the exact sequence:

```
1. current.cleanup(engine)      — scene's custom cleanup hook
2. engine.systems.clear(engine) — cleanup + remove all systems
3. engine.world.clear()         — destroy all entities
4. engine.scheduler.clear()     — cancel all timers
5. engine.particles.clear()     — remove all particles
6. scene = scenes.get('gameplay')
7. scene.setup(engine)          — new scene initializes (may be async)
8. Auto-register: parentSystem, physicsSystem, tweenSystem, animationSystem
9. events.emit('scene:loaded', 'gameplay')
```

This guarantees a **clean slate** for each scene. No entities or systems leak between scenes. The new scene's `setup` is responsible for creating everything it needs.

## Scenes Own Their State

A key design principle: **scenes own the game state for their duration**. A scene decides:

- Which systems are active (via `engine.addSystem`)
- Which entities exist (via `engine.spawn`)
- When to transition (via `engine.loadScene`)

Systems and entities do not persist across scene transitions unless the new scene explicitly re-creates them.

## Scene Registration and Startup

Scenes are registered before the engine starts, then a starting scene is specified:

```ts
const engine = new Engine(canvas)
engine.registerScene(titleScene)
engine.registerScene(gameplayScene)
engine.registerScene(gameOverScene)
await engine.start('title')  // loads 'title' scene + starts RAF loop
```

## Related Pages

- [[engine-overview]] — How scenes fit into the frame lifecycle
- [[system-runner]] — Systems are added/removed by scenes during setup/cleanup
- [[physics-system]] — Built-in physics system auto-registered on scene load
- [[animation-system]] — Built-in animation system auto-registered on scene load
- [[entity-parenting]] — Built-in parent system auto-registered on scene load
- [[asteroid-field-game]] — Example game scene implementation
- [[game-loop]] — Scenes update within the fixed timestep
