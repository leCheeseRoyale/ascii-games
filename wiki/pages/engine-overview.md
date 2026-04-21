---
title: Engine Overview
created: 2026-04-07
updated: 2026-04-21
type: architecture
tags:
  - engine
  - architecture
  - core
sources:
  - engine/core/engine.ts
  - shared/types.ts
---

# Engine Overview

The ASCII Game Engine is a lightweight, Canvas 2D game engine that renders everything as text characters. It is designed to run ASCII-art games inside a React application while maintaining a strict separation between the game loop and the React render cycle.

## Four-Layer Architecture

The codebase is organized into four top-level layers, each with a clear responsibility:

```
engine/   — Framework layer. Core loop, ECS, renderer, camera, input.
game/     — User code. Scenes, systems, entity factories, game data.
ui/       — React UI. Components, hooks, zustand store (the ONLY bridge).
shared/   — Types, constants, events. Importable by all other layers.
```

**Data flow is strictly downward:** `engine/` never imports from `game/` or `ui/`. `game/` never imports from `ui/`. The zustand store in `ui/` is the sole bridge — game code writes to it via `useStore.getState().setScore(n)`, and React reads via `useStore(s => s.score)`.

## The Engine Class

The `Engine` class is the central orchestrator. It owns every subsystem and exposes a clean API for scenes and systems:

```ts
// engine/core/engine.ts
export class Engine {
  readonly config: EngineConfig
  readonly world: GameWorld        // miniplex ECS world
  readonly systems: SystemRunner   // ordered system list
  readonly scenes: SceneManager    // scene registry + transitions
  readonly renderer: AsciiRenderer // Canvas 2D text renderer
  readonly camera: Camera          // pan, zoom, shake
  readonly keyboard: Keyboard      // keyboard input
  readonly mouse: Mouse            // mouse input
  readonly particles: ParticlePool // object-pooled particle system
  readonly scheduler: Scheduler    // timer scheduling (after, every, sequence)
  readonly transition: Transition  // scene transition effects

  private loop: GameLoop            // RAF fixed-timestep loop
}
```

Construction: `new Engine(canvas, config?)` merges your partial config with `DEFAULT_CONFIG`, creates all subsystems, and wires the game loop callbacks.

## The Hard Boundary: Game Loop vs React

The engine runs on `requestAnimationFrame` — a tight, 60 FPS loop that is completely decoupled from React's render cycle. React never drives game state; it only reads from the zustand store. This prevents React re-renders from stalling gameplay and prevents the game loop from triggering unnecessary DOM updates.

```
RAF Loop (60fps)                    React (render cycle)
┌──────────────────┐                ┌──────────────────┐
│ input.update()   │                │ useStore(s=>s.x)  │
│ systems.update() │  ──zustand──▶  │ <HUD score={x} /> │
│ scene.update()   │    store       │ re-render on      │
│ camera.update()  │                │ state change only  │
│ renderer.render()│                └──────────────────┘
└──────────────────┘
```

## Frame Lifecycle

Every frame follows this exact sequence inside `Engine.update(dt)` and `Engine.render()`:

```
1. keyboard.update()
2. mouse.update()
3. systems.update()    — parent → physics → tween → animation → user systems
4. scene.update()
5. scheduler.update()  — timers (after, every, sequence)
6. particles.update()
7. transition.update()
8. camera.update()
9. renderer.render()   — layers → images → ascii → sprites → text → particles
10. transition.render() — overlay if active
```

The corresponding code:

```ts
// engine/core/engine.ts
private update(dt: number): void {
  this.keyboard.update()
  this.mouse.update()
  this.systems.update(this, dt)
  this.scenes.update(this, dt)
  this.scheduler.update(dt)
  this.particles.update(dt)
  this.transition.update(dt)
  this.camera.update(dt)
}

private render(): void {
  this.renderer.render(this.world, this.config, this.camera, this.particles)
  if (this.transition.active) {
    this.transition.render(this.renderer.ctx, this.width, this.height)
  }
}
```

## Engine Lifecycle

```
1. new Engine(canvas, config)       — construct all subsystems
2. engine.registerScene(scene)      — register scenes (does not load)
3. engine.start('title')            — load scene + start RAF loop
4. [per frame: update → render]     — continuous loop
5. engine.stop()                    — cleanup everything
```

The engine also supports `pause()` / `resume()`. When paused, the game loop continues to call `render()` (so the screen stays drawn) but skips `update()`.

## Public API Summary

| Method | Description |
|--------|-------------|
| `spawn(components)` | Add an entity to the ECS world |
| `destroy(entity)` | Remove an entity |
| `addSystem(system)` | Register + init a system |
| `removeSystem(name)` | Cleanup + remove a system |
| `registerScene(scene)` | Register a scene definition |
| `loadScene(name)` | Transition to a scene (async) |
| `start(sceneName)` | Load scene + start loop |
| `stop()` | Full shutdown |
| `pause()` / `resume()` | Toggle update processing |
| `tweenEntity(entity, prop, from, to, dur, ease)` | Declarative property animation |
| `playAnimation(entity, frames, dur, loop)` | Start frame animation |
| `stopAnimation(entity)` | Pause frame animation |
| `attachChild(parent, child, ox, oy)` | Parent-child hierarchy |
| `detachChild(child)` | Remove from parent |
| `destroyWithChildren(entity)` | Recursive entity removal |
| `after(sec, fn)` / `every(sec, fn)` | Timer scheduling |
| `sequence(steps)` | Run a sequence of timed callbacks |
| `cancelTimer(id)` | Cancel a scheduled timer |
| `loadImage(src)` / `preloadImages(srcs)` | Image loading |
| `get time` | Elapsed time since engine start |
| `get width` / `get height` | Canvas dimensions |
| `get isPaused` | Whether engine is paused |

## Interactive Text

The engine can decompose text and sprite art into per-character entities, each with its own position, velocity, collider, and spring-to-home physics. This enables physics-driven typography — characters that scatter on collision, ripple away from the cursor, and drift back to their home positions.

| Method | Description |
|--------|-------------|
| `spawnText(opts)` | Decompose a string into per-character entities with spring physics |
| `spawnSprite(opts)` | Same as spawnText but from a `string[]` (multi-line ASCII art) |
| `spawnArt(asset, opts)` | Spawn an `ArtAsset` as a static sprite entity |
| `spawnInteractiveArt(asset, opts)` | Spawn an `ArtAsset` as individual character entities with spring physics |

Spring presets (`SpringPresets.stiff`, `.snappy`, `.bouncy`, `.smooth`, `.floaty`, `.gentle`) provide named configs for common feel profiles. One-line helper systems like `createCursorRepelSystem(opts?)` and `createAmbientDriftSystem(opts?)` add interactivity without custom code.

See [[interactive-text]] for full API details.

## Juice Helpers

v0.3 adds built-in methods for common game-feel effects, so game code does not need to implement them manually:

| Method | Description |
|--------|-------------|
| `flash(color?, duration?)` | Full-screen color flash overlay (damage, powerup pickup) |
| `blink(entity, duration?, interval?)` | Oscillate entity opacity (i-frames, warnings) |
| `knockback(entity, fromX, fromY, force)` | Impulse away from a point |
| `timeScale` | Global time multiplier. `0.3` = slow-mo, `1` = normal, `2` = fast-forward |

See [[juice-helpers]] for usage patterns.

## Declarative Collisions

`engine.onCollide(tagA, tagB, callback)` registers a callback that fires on the first overlap frame between two tagged entity groups. Returns an unsubscribe function. The underlying `_collisionEvents` system is lazy-registered on the first call — zero cost if unused.

```ts
const unsub = engine.onCollide('bullet', 'enemy', (bullet, enemy) => {
  engine.destroy(bullet)
  enemy.health!.current -= 1
})
```

This replaces manual overlap checking in custom systems for the common case. See [[collision-events]] for details.

## Declarative Game API

`defineGame` provides a boardgame.io-style declarative API for turn-based and board games. A single 30-80 line module defines setup, moves, turn order, phases, and win conditions. The engine handles turn rotation, phase transitions, and game-over detection. Wire with `engine.runGame(def)`.

See [[define-game]] for the full API and examples.

## Related Pages

- [[game-loop]] — Fixed timestep implementation and RAF details
- [[ecs-architecture]] — Entity Component System with miniplex
- [[renderer]] — Canvas 2D ASCII rendering pipeline
- [[scene-lifecycle]] — Scene interface and SceneManager transitions
- [[react-bridge]] — Zustand store as the engine↔UI boundary
- [[camera]] — Pan, zoom, follow, shake
- [[physics-system]] — Built-in physics system
- [[animation-system]] — Frame-by-frame animation system
- [[entity-parenting]] — Parent-child entity hierarchy
- [[system-runner]] — System execution order including built-ins
