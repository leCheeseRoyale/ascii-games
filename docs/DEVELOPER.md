# ASCII Game Engine — Developer Guide

Complete reference for building games with the ASCII Game Engine.
Read this first. Everything you need is here.

---

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [Architecture Overview](#2-architecture-overview)
3. [Directory Structure](#3-directory-structure)
4. [Core Concepts](#4-core-concepts)
5. [Rendering](#5-rendering)
6. [Input Handling](#6-input-handling)
7. [Collision](#7-collision)
8. [Audio](#8-audio)
9. [React UI Layer](#9-react-ui-layer)
10. [Pretext Integration](#10-pretext-integration)
11. [Creating a New Game](#11-creating-a-new-game)
12. [Patterns & Recipes](#12-patterns--recipes)
13. [Extending the Engine](#13-extending-the-engine)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Quick Start

### Prerequisites

- [Bun](https://bun.sh/) (runtime + package manager)
- A modern browser (Chrome/Firefox/Safari)

### Commands

```bash
# Clone and install
git clone <repo-url> ascii-game-engine
cd ascii-game-engine
bun install

# Development (hot reload)
bun dev

# Type checking
bun run check

# Production build
bun run build

# Preview production build
bun run preview

# Linting & formatting
bun run lint                 # Biome check
bun run lint:fix             # Auto-fix lint issues

# Code quality
bun run knip                 # Find unused deps/exports/files
bun run gen:api              # Regenerate docs/API-generated.md from code

# Scaffolding (generate new files)
bun run new:scene <name>     # e.g., bun run new:scene shop
bun run new:system <name>    # e.g., bun run new:system gravity
bun run new:entity <name>    # e.g., bun run new:entity enemy
```

Open `http://localhost:5173` in your browser after `bun dev`.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser Window                           │
│                                                                 │
│   ┌──────────────────────────────┐  ┌────────────────────────┐  │
│   │         Canvas (RAF)         │  │       React DOM         │  │
│   │                              │  │                         │  │
│   │  ┌────────┐  ┌───────────┐  │  │  ┌──────┐  ┌────────┐  │  │
│   │  │ engine/│  │   game/   │  │  │  │ ui/  │  │screens/│  │  │
│   │  │        │  │           │  │  │  │      │  │hud/    │  │  │
│   │  │ Loop   │→│  Scenes   │  │  │  │ App  │  │shared/ │  │  │
│   │  │ ECS    │  │  Systems  │  │  │  │      │  │        │  │  │
│   │  │Renderer│  │  Entities │  │  │  └──┬───┘  └────┬───┘  │  │
│   │  │ Input  │  │           │  │  │     │           │       │  │
│   │  │ Camera │  │           │  │  │     └─────┬─────┘       │  │
│   │  │ Audio  │  │           │  │  │           │             │  │
│   │  └────────┘  └───────────┘  │  └───────────┼─────────────┘  │
│   └──────────────┬──────────────┘              │                │
│                  │                              │                │
│                  │    ┌──────────────────┐      │                │
│                  └────┤   shared/        ├──────┘                │
│                       │                  │                       │
│                       │  zustand store   │  ← THE BRIDGE        │
│                       │  event bus       │                       │
│                       │  types/constants │                       │
│                       └──────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
```

### The Hard Boundary

There are **two independent runtime loops** in this architecture:

1. **Game Loop (requestAnimationFrame)** — runs at 60fps via `engine/core/game-loop.ts`. Owns: ECS world, input, physics, rendering to canvas. Lives in `engine/` and `game/`.

2. **React Render Cycle** — standard React 19 with virtual DOM. Owns: HTML overlays, HUD, menus. Lives in `ui/`.

**They NEVER directly communicate.** The only bridge between them:

- **Zustand store** (`shared/` via `ui/store.ts`) — Game loop writes state with `useStore.getState().setScore(10)`. React reads reactively with `useStore(s => s.score)`.
- **Event bus** (`shared/events.ts`) — UI emits commands like `events.emit('game:start')`. Game loop listens with `events.on('game:start', handler)`.

This separation means React re-renders never block the game loop, and game logic never triggers React renders except through the store.

---

## 3. Directory Structure

```
ascii-game-engine/
├── engine/                          ← FRAMEWORK (don't edit for game logic)
│   ├── core/
│   │   ├── engine.ts                  Main orchestrator — owns world, renderer, input, loop
│   │   ├── game-loop.ts               Fixed timestep RAF loop (60fps default)
│   │   └── scene.ts                   Scene interface + SceneManager
│   ├── ecs/
│   │   ├── world.ts                   miniplex World<Entity> factory
│   │   ├── systems.ts                 System interface + SystemRunner
│   │   ├── animation-system.ts        Built-in _animation system
│   │   ├── parent-system.ts           Built-in _parent system
│   │   └── tween-system.ts            Built-in _tween system
│   ├── render/
│   │   ├── ascii-renderer.ts          Canvas 2D text renderer (auto-renders entities)
│   │   ├── text-layout.ts             Pretext integration with caching
│   │   ├── camera.ts                  2D camera: pan, zoom, follow, shake
│   │   ├── particles.ts              Pooled ASCII particle system
│   │   ├── transitions.ts            Scene transition effects (fade, wipe)
│   │   └── image-loader.ts           Image loading with caching
│   ├── input/
│   │   ├── keyboard.ts               Keyboard state: held/pressed/released
│   │   └── mouse.ts                  Mouse state: position, clicks
│   ├── physics/
│   │   ├── collision.ts              Circle/rect overlap detection
│   │   └── physics-system.ts         Built-in _physics system (velocity, gravity, friction)
│   ├── audio/
│   │   └── audio.ts                  ZzFX procedural audio + sfx presets
│   ├── utils/
│   │   ├── math.ts                   Vec2, lerp, clamp, rng, pick, chance
│   │   ├── timer.ts                  Cooldown, tween, easeOut
│   │   ├── color.ts                  hsl, rainbow, lerpColor
│   │   ├── grid.ts                   GridMap, grid↔world conversion
│   │   └── scheduler.ts             Game-time scheduler (after, every, sequence)
│   └── index.ts                     Public API barrel export
│
├── game/                            ← YOUR GAME CODE (edit this!)
│   ├── index.ts                       setupGame(): registers scenes, returns first scene
│   ├── config.ts                      Game constants (speeds, colors, scoring)
│   ├── scenes/                        Scene definitions (title, play, game-over)
│   │   ├── title.ts
│   │   ├── play.ts
│   │   └── game-over.ts
│   ├── systems/                       Per-frame logic (movement, input, spawning)
│   │   ├── player-input.ts
│   │   ├── movement.ts
│   │   ├── asteroid-spawner.ts
│   │   ├── collision.ts
│   │   └── lifetime.ts
│   └── entities/                      Entity factory functions
│       ├── player.ts
│       ├── asteroid.ts
│       └── bullet.ts
│
├── ui/                              ← REACT UI (React lives ONLY here)
│   ├── App.tsx                        Root: canvas + screen overlays
│   ├── GameCanvas.tsx                 Canvas ref, Engine lifecycle, useEngine() hook
│   ├── store.ts                       zustand store (game ↔ React bridge)
│   ├── screens/
│   │   ├── MainMenu.tsx               Title screen overlay
│   │   ├── PauseMenu.tsx              Pause overlay
│   │   └── GameOverScreen.tsx         Results overlay
│   ├── hud/
│   │   ├── HUD.tsx                    In-game HUD container
│   │   ├── Score.tsx                  Score display
│   │   ├── HealthBar.tsx              ASCII health bar (█░)
│   │   └── Debug.tsx                  FPS + entity count
│   └── shared/
│       └── AsciiText.tsx              Reusable styled text component
│
├── shared/                          ← SHARED between all layers
│   ├── types.ts                       All component types + Entity + EngineConfig
│   ├── events.ts                      Typed event bus
│   └── constants.ts                   COLORS + FONTS
│
├── scripts/                         ← Scaffolding generators
│   ├── new-scene.ts
│   ├── new-system.ts
│   ├── new-entity.ts
│   ├── init-game.ts
│   └── gen-api.ts                   Auto-generate API docs from TypeScript
│
├── docs/
│   ├── API.md                       Hand-written API reference
│   ├── API-generated.md             Auto-generated from .d.ts (bun run gen:api)
│   └── DEVELOPER.md                 This file
│
├── src/
│   └── main.tsx                     React entry point (renders <App />)
│
├── package.json
├── tsconfig.json
├── vite.config.ts                   Path aliases: @engine, @game, @ui, @shared
├── biome.json                       Biome linter/formatter config
└── knip.json                        Unused dependency/export detection
```

### Import Aliases

Configured in both `vite.config.ts` and `tsconfig.json`:

| Alias | Path | Usage |
|-------|------|-------|
| `@engine` | `./engine` | `import { defineScene, overlaps } from '@engine'` |
| `@game` | `./game` | `import { setupGame } from '@game/index'` |
| `@ui` | `./ui` | `import { useStore } from '@ui/store'` |
| `@shared` | `./shared` | `import type { Entity } from '@shared/types'` |

---

## 4. Core Concepts

### 4a. The Game Loop

The game loop uses a **fixed timestep** pattern. Every frame:

1. `requestAnimationFrame` fires
2. Real elapsed time is accumulated
3. Fixed-step updates run (1/60th second each) until accumulator is drained
4. One render call happens

```
Each RAF frame:
  ┌─────────────────────────────────────────────┐
  │ accumulator += realDelta                     │
  │                                              │
  │ while (accumulator >= fixedDt):              │
  │   1. keyboard.update()    ← flush input      │
  │   2. mouse.update()       ← flush mouse      │
  │   3. systems.update()     ← all systems run  │
  │   4. scene.update()       ← scene-level logic│
  │   5. camera.update()      ← smooth/shake     │
  │   accumulator -= fixedDt                     │
  │                                              │
  │ renderer.render()         ← draw to canvas   │
  └─────────────────────────────────────────────┘
```

The fixed `dt` (default: 1/60 = 0.01667s) is passed to all systems. This means physics behave identically regardless of actual frame rate.

**Spiral of death prevention**: Raw delta is clamped to 0.1s max, preventing runaway when the tab is backgrounded.

**Pause behavior**: When paused, updates stop but rendering continues (so the screen isn't frozen).

Key properties available via `engine.time`:
```typescript
engine.time.dt       // Fixed delta (1/60)
engine.time.elapsed  // Total seconds since start
engine.time.frame    // Total frame count
engine.time.fps      // Measured FPS (updated every second)
```

### 4b. ECS (Entity Component System)

The engine uses [miniplex](https://github.com/hmans/miniplex) — a lightweight ECS where entities are plain JavaScript objects.

#### Entities

An entity is just an object with optional component properties. The full `Entity` type (from `shared/types.ts`) defines every possible component:

```typescript
interface Entity {
  position: { x: number; y: number }
  velocity: { vx: number; vy: number }
  acceleration: { ax: number; ay: number }
  ascii: { char: string; font: string; color: string; glow?: string; opacity?: number; scale?: number }
  textBlock: { text: string; font: string; maxWidth: number; lineHeight: number; color: string }
  collider: { type: 'circle' | 'rect'; width: number; height: number; sensor?: boolean }
  health: { current: number; max: number }
  lifetime: { remaining: number }
  player: { index: number }
  obstacle: { radius: number }
  emitter: ParticleEmitter
  tags: { values: Set<string> }
}
```

Entities only have the components you give them. A bullet might only have `position`, `velocity`, `ascii`, `collider`, `lifetime`, and `tags`.

#### Components

Components are plain data — no methods, no classes. Just objects with typed fields.

#### Queries (world.with)

Miniplex queries return **live views** of entities matching a component signature:

```typescript
// All entities with position AND velocity
for (const e of engine.world.with('position', 'velocity')) {
  e.position.x += e.velocity.vx * dt
}

// All entities with position, collider, AND tags
const tagged = [...engine.world.with('position', 'collider', 'tags')]
  .filter(e => e.tags.values.has('bullet'))

// First entity matching (or undefined)
const player = engine.world.with('player', 'position').first
```

Queries are cached internally — calling `world.with('position', 'velocity')` twice returns the same archetype object. No performance cost.

#### Spawning and Destroying

```typescript
// Spawn — returns the entity (with all components typed)
const entity = engine.spawn({
  position: { x: 100, y: 200 },
  ascii: { char: '@', font: FONTS.large, color: '#00ff88' },
})

// Destroy
engine.destroy(entity)

// Direct world access (same thing)
const entity = engine.world.add({ position: { x: 0, y: 0 } } as Entity)
engine.world.remove(entity)
```

**Important**: Don't remove entities while iterating. Collect first, then remove:

```typescript
const toRemove: Entity[] = []
for (const e of engine.world.with('lifetime')) {
  if (e.lifetime.remaining <= 0) toRemove.push(e)
}
for (const e of toRemove) engine.destroy(e)
```

### 4c. Scenes

A scene is a discrete game state: title screen, gameplay, game over. Each scene has three lifecycle hooks:

```typescript
import { defineScene } from '@engine'

export const myScene = defineScene({
  name: 'my-scene',

  // Called ONCE when the scene loads.
  // Spawn entities, add systems, set UI state.
  setup(engine) {
    engine.spawn(createPlayer(engine.width / 2, engine.height / 2))
    engine.addSystem(movementSystem)
    useStore.getState().setScreen('playing')
  },

  // Called EVERY FRAME after systems run.
  // Scene-level logic: input checks, transitions, manual rendering.
  update(engine, dt) {
    if (engine.keyboard.pressed('Escape')) {
      engine.loadScene('menu')
    }
    particles.render(engine.renderer.ctx)
  },

  // Called when LEAVING this scene (before the next scene loads).
  // Clean up scene-specific state.
  cleanup(engine) {
    particles.clear()
  },
})
```

#### Scene Transitions

When you call `engine.loadScene('next-scene')`:

1. Current scene's `cleanup()` runs
2. All systems are cleared (`systems.clear()`)
3. All entities are removed (`world.clear()`)
4. New scene's `setup()` runs

This means every scene starts fresh. You don't need to manually clean up entities or systems.

#### Registering Scenes

In `game/index.ts`:

```typescript
export function setupGame(engine: Engine): string {
  engine.registerScene(titleScene)
  engine.registerScene(playScene)
  engine.registerScene(gameOverScene)
  return 'title'  // starting scene name
}
```

### 4d. Systems

Systems are named functions that run every frame. They're the core logic units.

```typescript
import { defineSystem } from '@engine'

export const enemyAISystem = defineSystem({
  name: 'enemyAI',

  // Optional: runs once when system is added. Reset module-level state here.
  init(engine) {
    // Set up system-specific state
  },

  // Runs every frame (required)
  update(engine, dt) {
    for (const e of engine.world.with('position', 'velocity', 'tags')) {
      if (e.tags.values.has('enemy')) {
        // Chase player, etc.
      }
    }
  },

  // Optional: runs when system is removed or scene changes
  cleanup(engine) {
    // Clean up system-specific state
  },
})
```

#### System Ordering

Systems run in the order you add them. This matters!

```typescript
// In scene setup (built-in _physics handles velocity→position automatically):
engine.addSystem(playerInputSystem)       // 1. Read input, set velocities
engine.addSystem(asteroidSpawnerSystem)   // 2. Spawn new asteroids
engine.addSystem(collisionSystem)         // 3. Check collisions, destroy entities
engine.addSystem(lifetimeSystem)          // 4. Expire timed entities
```

Input → Spawning → Collision → Cleanup is a good default order. Velocity integration is handled by the built-in `_physics` system — do NOT write a custom system for that.

#### Accessing Engine

Every system receives the full `engine` object, giving access to:
- `engine.world` — ECS world (queries, spawn, destroy)
- `engine.keyboard` / `engine.mouse` — input state
- `engine.camera` — camera control
- `engine.renderer` — canvas context
- `engine.time` — frame timing
- `engine.width` / `engine.height` — canvas dimensions
- `engine.spawn()` / `engine.destroy()` — entity helpers
- `engine.loadScene()` — scene transitions

### 4e. Entity Factories

Entity factories are functions that return `Partial<Entity>` — just the components needed:

```typescript
// game/entities/player.ts
import type { Entity } from '@shared/types'
import { FONTS } from '@shared/constants'
import { GAME } from '../config'

export function createPlayer(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    ascii: {
      char: '@',
      font: FONTS.large,
      color: GAME.player.color,
      glow: GAME.player.glow,
    },
    player: { index: 0 },
    collider: { type: 'circle', width: 20, height: 20 },
    health: { current: GAME.player.maxHealth, max: GAME.player.maxHealth },
  }
}
```

**Why `Partial<Entity>`?** Because entities don't need every component. A bullet has no `health`. An asteroid has no `player`. `Partial<Entity>` means "any subset of components."

**Component composition**: You build entities by combining components. Want something that moves? Add `position` + `velocity`. Want it visible? Add `ascii`. Want it collidable? Add `collider`. That's it.

Usage:
```typescript
engine.spawn(createPlayer(400, 300))
engine.spawn(createBullet(x, y, vx, vy))
engine.spawn(createAsteroid(x, y, vx, vy))
```

---

## 5. Rendering

### 5a. Auto-Rendered Entities (position + ascii)

Any entity with both `position` and `ascii` components is **automatically drawn** by the renderer every frame. You don't call any render function.

```typescript
// This entity will appear on screen immediately
engine.spawn({
  position: { x: 400, y: 300 },
  ascii: {
    char: '@',                    // The character(s) to draw
    font: FONTS.large,            // CSS font string
    color: '#00ff88',             // Fill color
    glow: '#00ff8866',            // Optional: shadowColor for glow effect
    opacity: 0.8,                 // Optional: globalAlpha (0-1)
    scale: 1.5,                   // Optional: multiplied with font size
  },
})
```

The `char` field can be a single character or a string (like `'GAME OVER'`). It's drawn with `textAlign: 'center'` and `textBaseline: 'middle'`, so position is the center point.

Render order for ASCII entities: iteration order of `world.with('position', 'ascii')`. Entities spawned later draw on top.

### 5b. Text Blocks (position + textBlock)

For multi-line wrapped text, use the `textBlock` component instead of `ascii`:

```typescript
engine.spawn({
  position: { x: 50, y: 100 },
  textBlock: {
    text: 'A long paragraph that will be word-wrapped to fit within the specified width...',
    font: FONTS.normal,
    maxWidth: 400,
    lineHeight: 22,
    color: '#e0e0e0',
  },
})
```

Text blocks are rendered with `textBaseline: 'top'` — position is the top-left corner. They're auto-wrapped using Pretext's text layout engine.

Text blocks render BEFORE ascii entities (so ascii entities draw on top).

### 5c. Text Flowing Around Obstacles

If any entity has the `obstacle` component, text blocks will flow around it:

```typescript
// Create an obstacle that text flows around
engine.spawn({
  position: { x: 300, y: 200 },
  obstacle: { radius: 60 },       // Circular exclusion zone
  ascii: { char: '◉', font: FONTS.huge, color: '#ff4444' },
})

// This text will wrap around the obstacle
engine.spawn({
  position: { x: 50, y: 100 },
  textBlock: {
    text: 'This text will flow around the circular obstacle...',
    font: FONTS.normal,
    maxWidth: 600,
    lineHeight: 22,
    color: '#e0e0e0',
  },
})
```

Each line's available width is computed by subtracting the obstacle's circular intrusion at that Y position. Text naturally wraps around the shape.

### 5d. Particles (Manual Rendering)

Particles are **NOT** auto-rendered. They're lightweight objects (not ECS entities) managed by a `ParticlePool`.

```typescript
import { ParticlePool } from '@engine'

const particles = new ParticlePool()

// Spawn a burst
particles.burst({
  x: 200, y: 150,
  count: 20,
  chars: ['.', '*', '·', '+', '×'],
  color: '#ff4444',
  speed: 120,           // px/sec
  spread: Math.PI * 2,  // full circle (default)
  lifetime: 0.8,        // seconds
  font: '16px "Fira Code", monospace',
})

// In your scene update:
update(engine, dt) {
  particles.update(dt)                    // Advance physics
  particles.render(engine.renderer.ctx)   // Draw to canvas
}

// On scene cleanup:
cleanup() {
  particles.clear()
}
```

**Critical**: If you forget `particles.render(ctx)`, your particles won't appear! The engine doesn't know about your particle pools.

Particles have built-in gravity (`+50 * dt` on vy) and fade out (alpha = remaining/maxLife).

### 5e. Camera Transforms

The camera applies transforms before rendering. All entities are drawn in world space; the camera converts to screen space.

```typescript
// Instant move
engine.camera.moveTo(500, 300)

// Smooth pan (default smoothing = 0.1)
engine.camera.panTo(500, 300, 0.05)

// Follow a target every frame (in a system)
const player = engine.world.with('player', 'position').first
if (player) engine.camera.follow(player.position.x, player.position.y, 0.1)

// Zoom (1 = normal, 2 = zoomed in, 0.5 = zoomed out)
engine.camera.setZoom(1.5)

// Screen shake (decays automatically)
engine.camera.shake(8)    // magnitude in pixels
```

Camera properties:
- `camera.x`, `camera.y` — current position
- `camera.zoom` — current zoom level
- `camera.shakeX`, `camera.shakeY` — current shake offset

### 5f. Render Layers / Ordering

The renderer draws in this fixed order:

1. **Clear** — fill with `config.bgColor`
2. **Camera transform** — apply pan, zoom, shake
3. **Text blocks** — entities with `position` + `textBlock`
4. **ASCII entities** — entities with `position` + `ascii`
5. **Restore** — undo camera transform

Particles are manual and drawn whenever you call `particles.render(ctx)`. To draw particles on top of entities, call it in your scene's `update()` (which runs after the main render).

Within each layer, entities are drawn in iteration order (spawn order).

---

## 6. Input Handling

### Keyboard

```typescript
const kb = engine.keyboard

// Held — true every frame the key is down
if (kb.held('KeyW')) { /* moving up */ }
if (kb.held('ArrowLeft')) { /* moving left */ }

// Pressed — true only on the FIRST frame the key goes down
if (kb.pressed('Space')) { /* just pressed space */ }
if (kb.pressed('Enter')) { /* just pressed enter */ }

// Released — true only on the frame the key goes up
if (kb.released('Escape')) { /* just released escape */ }
```

**Key codes** use `KeyboardEvent.code` (not `.key`). Common codes:

| Key | Code |
|-----|------|
| W/A/S/D | `KeyW`, `KeyA`, `KeyS`, `KeyD` |
| Arrow keys | `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight` |
| Space | `Space` |
| Enter | `Enter` |
| Escape | `Escape` |
| Shift | `ShiftLeft`, `ShiftRight` |
| Tab | `Tab` |
| 1-9 | `Digit1` through `Digit9` |

The engine prevents default browser behavior for game keys (arrows, Space, Tab).

### Mouse

```typescript
const m = engine.mouse

m.x          // Canvas-relative X position
m.y          // Canvas-relative Y position
m.down       // Is mouse button held?
m.justDown   // Was mouse button pressed this frame?
m.justUp     // Was mouse button released this frame?
```

---

## 7. Collision

The collision module provides simple overlap detection. No physics response — just "are these two things touching?"

### The Collidable Interface

To be checked for collisions, an entity needs `position` and `collider`:

```typescript
interface Collidable {
  position: { x: number; y: number }
  collider: { type: 'circle' | 'rect'; width: number; height: number }
}
```

For circles, `width` is the diameter. For rects, `width` and `height` are the full dimensions. Position is the center.

### overlaps()

Check if two entities overlap:

```typescript
import { overlaps } from '@engine'

if (overlaps(bullet, asteroid)) {
  engine.destroy(bullet)
  engine.destroy(asteroid)
}
```

Supported combinations:
- Circle vs Circle — true distance check
- Rect vs Rect — AABB check
- Circle vs Rect (or vice versa) — treats circle as rect

### overlapAll()

Check one entity against many:

```typescript
import { overlapAll } from '@engine'

const asteroids = [...engine.world.with('position', 'collider', 'tags')]
  .filter(e => e.tags.values.has('asteroid'))

const hits = overlapAll(player, asteroids)
for (const hit of hits) {
  // handle collision with each hit
}
```

`overlapAll` skips the entity itself (safe to pass the same entity in both args).

### Real Example (from game/systems/collision.ts)

```typescript
const bullets = [...engine.world.with('position', 'collider', 'tags')]
  .filter(e => e.tags.values.has('bullet'))
const asteroids = [...engine.world.with('position', 'collider', 'tags')]
  .filter(e => e.tags.values.has('asteroid'))

for (const bullet of bullets) {
  for (const asteroid of asteroids) {
    if (overlaps(bullet, asteroid)) {
      engine.destroy(bullet)
      engine.destroy(asteroid)
      sfx.hit()
      engine.camera.shake(3)
      break
    }
  }
}
```

---

## 8. Audio

Procedural game audio powered by ZzFX — no audio files needed. Tiny synthesized sound effects that match the ASCII aesthetic.

### beep()

```typescript
import { beep } from '@engine'

beep()                                         // Default: 440Hz, 0.1s
beep({ freq: 880, duration: 0.05 })           // High short beep
beep({ freq: 110, duration: 0.3, volume: 0.2 })  // Low rumble
```

Options:
| Property | Default | Description |
|----------|---------|-------------|
| `freq` | 440 | Frequency in Hz |
| `duration` | 0.1 | Duration in seconds |
| `volume` | 0.15 | Volume (0-1) |

### sfx Presets

```typescript
import { sfx } from '@engine'

sfx.shoot()    // laser sound
sfx.hit()      // impact
sfx.pickup()   // item collected
sfx.explode()  // explosion
sfx.menu()     // menu blip
sfx.death()    // death sound
```

### Audio Context

ZzFX creates its AudioContext automatically. Browsers require a user gesture before playing audio — the first click/keypress will unlock it.

---

## 9. React UI Layer

### 9a. The Boundary Rule

**Hard rules:**
- `game/` NEVER imports from `ui/` (except `ui/store.ts`)
- `ui/` NEVER writes to the ECS world
- `engine/` NEVER imports from `ui/` or `game/`

The only exception: game code imports `useStore` from `@ui/store` to write state.

### 9b. Zustand Store

The store is the one-way data bridge:

```typescript
// ui/store.ts
export type GameScreen = 'menu' | 'playing' | 'paused' | 'gameOver'

export interface GameStore {
  screen: GameScreen
  score: number
  highScore: number
  health: number
  maxHealth: number
  fps: number
  entityCount: number
  // ... actions
  setScreen: (screen: GameScreen) => void
  setScore: (score: number) => void
  setHealth: (current: number, max: number) => void
  setDebugInfo: (fps: number, entityCount: number) => void
  reset: () => void
}
```

**Game side** (in systems/scenes) — direct state access, no hooks:

```typescript
import { useStore } from '@ui/store'

// Write state
useStore.getState().setScore(1500)
useStore.getState().setScreen('gameOver')
useStore.getState().setHealth(3, 5)

// Read state (rarely needed from game side)
const currentScore = useStore.getState().score
```

**React side** (in components) — reactive hooks:

```typescript
import { useStore } from '@ui/store'

function ScoreDisplay() {
  const score = useStore(s => s.score)        // Re-renders when score changes
  const health = useStore(s => s.health)      // Re-renders when health changes
  return <div>{score}</div>
}
```

### 9c. Event Bus

For commands from UI to game (not data — that goes through the store):

```typescript
import { events } from '@shared/events'

// UI side — emit commands
events.emit('game:start')
events.emit('game:resume')
events.emit('game:restart')
events.emit('game:pause')

// Game side — listen (in GameCanvas.tsx setup)
events.on('game:start', () => engine.loadScene('play'))
events.on('game:resume', () => engine.resume())
events.on('game:restart', () => engine.loadScene('play'))
events.on('game:pause', () => engine.pause())
```

The event bus uses mitt. Unsubscribe by passing the same handler reference:
```typescript
const handler = () => { ... }
events.on('game:start', handler)
// Later:
events.off('game:start', handler)  // Stop listening
```

### 9d. Screen Management

The `screen` field in the store controls which React overlay is shown:

```typescript
// In ui/App.tsx
const screen = useStore(s => s.screen)

return (
  <div>
    <GameCanvas />
    {screen === 'menu' && <MainMenu />}
    {screen === 'playing' && <HUD debug />}
    {screen === 'paused' && <><HUD /><PauseMenu /></>}
    {screen === 'gameOver' && <GameOverScreen />}
  </div>
)
```

Game code sets the screen:
```typescript
useStore.getState().setScreen('playing')  // in scene setup
useStore.getState().setScreen('paused')   // on pause
useStore.getState().setScreen('gameOver') // on death
```

### 9e. HUD Components

The HUD is a container that displays score and health:

```typescript
// ui/hud/HUD.tsx
export function HUD({ debug = false }: { debug?: boolean }) {
  return (
    <>
      <div style={{ /* top bar */ }}>
        <Score />
        <HealthBar />
      </div>
      {debug && <Debug />}
    </>
  )
}
```

Each HUD component reads from the store:
- `Score` reads `useStore(s => s.score)`
- `HealthBar` reads `useStore(s => s.health)` and `useStore(s => s.maxHealth)`
- `Debug` reads `useStore(s => s.fps)` and `useStore(s => s.entityCount)`

### 9f. Adding New UI Screens

1. Create a component in `ui/screens/`:

```typescript
// ui/screens/ShopScreen.tsx
import { useStore } from '@ui/store'
import { events } from '@shared/events'
import { AsciiText } from '@ui/shared/AsciiText'

export function ShopScreen() {
  return (
    <div style={{ position: 'absolute', inset: 0, /* centering styles */ }}>
      <AsciiText size="xl" color="#ffaa00">SHOP</AsciiText>
      <button onClick={() => events.emit('game:resume')}>Back</button>
    </div>
  )
}
```

2. Add the screen type to the store:

```typescript
// ui/store.ts
export type GameScreen = 'menu' | 'playing' | 'paused' | 'gameOver' | 'shop'
```

3. Add it to App.tsx:

```typescript
{screen === 'shop' && <ShopScreen />}
```

4. Trigger it from game code:

```typescript
useStore.getState().setScreen('shop')
```

---

## 10. Pretext Integration

### 10a. What Pretext Does

[Pretext](https://github.com/chenglou/pretext) is a text measurement and layout library. It handles:
- Word wrapping at a given width
- Line-by-line layout with cursor tracking
- Variable-width line layout (for flowing around obstacles)

The engine wraps Pretext in `engine/render/text-layout.ts` with caching.

### 10b. Caching Strategy

All `prepare()` and `prepareWithSegments()` calls are cached by `text + font` key. The first call for a given text+font pair measures the text; subsequent calls return instantly.

```
Cache key = font + '\x00' + text
```

Two caches:
- `fastCache` — for simple `prepare()` (used by `measureHeight`)
- `segCache` — for `prepareWithSegments()` (used by everything else)

Call `clearTextCache()` if you change fonts dynamically (rare).

### 10c. Available Functions

```typescript
import {
  layoutTextBlock,
  layoutTextAroundObstacles,
  measureHeight,
  getLineCount,
  shrinkwrap,
  clearTextCache,
} from '@engine'
```

| Function | Purpose |
|----------|---------|
| `layoutTextBlock(text, font, maxWidth, lineHeight)` | Returns `{text, width}[]` — word-wrapped lines |
| `layoutTextAroundObstacles(text, font, x, y, maxWidth, lineHeight, obstacles)` | Returns `{text, x, y, width}[]` — lines that flow around obstacles |
| `measureHeight(text, font, maxWidth, lineHeight)` | Quick height measurement (no line data) |
| `getLineCount(text, font, maxWidth)` | How many lines at this width |
| `shrinkwrap(text, font, maxWidth)` | Tightest width that fits (no wasted space) |
| `clearTextCache()` | Clear all Pretext caches |

**Note**: You typically don't call these directly. The renderer handles text layout automatically for entities with `textBlock`. These are for advanced use cases.

### 10d. Text-Around-Obstacles Pattern

```typescript
// The obstacle entity
engine.spawn({
  position: { x: 300, y: 200 },
  obstacle: { radius: 80 },
  ascii: { char: '⬤', font: FONTS.huge, color: '#444' },
})

// The text entity — text will automatically flow around the obstacle
engine.spawn({
  position: { x: 50, y: 100 },
  textBlock: {
    text: loremIpsum,
    font: FONTS.normal,
    maxWidth: 600,
    lineHeight: 22,
    color: '#ccc',
  },
})
```

The renderer detects obstacles and uses `layoutTextAroundObstacles()` automatically.

### 10e. Shrinkwrap Pattern

Find the minimum width that fits text without changing line count:

```typescript
const tightWidth = shrinkwrap('Hello World', FONTS.normal, 500)
// Returns the widest line's width — use this as the container width
```

Useful for centering text blocks or sizing UI panels.

---

## 11. Creating a New Game

### 11a. Scaffolding Scripts

```bash
# Create a new scene file
bun run new:scene boss-fight
# → game/scenes/boss-fight.ts

# Create a new system file
bun run new:system gravity
# → game/systems/gravity.ts

# Create a new entity factory
bun run new:entity enemy
# → game/entities/enemy.ts
```

Each generates a template with the correct imports and patterns.

### 11b. Step-by-Step: Your First Scene, System, Entity

Let's build a simple "catch the coins" game.

**Step 1: Create the entity factory**

```bash
bun run new:entity coin
```

Edit `game/entities/coin.ts`:

```typescript
import type { Entity } from '@shared/types'
import { FONTS } from '@shared/constants'
import { rng } from '@engine'

export function createCoin(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    ascii: {
      char: '●',
      font: FONTS.large,
      color: '#ffcc00',
      glow: '#ffcc0066',
    },
    collider: { type: 'circle', width: 20, height: 20 },
    tags: { values: new Set(['coin']) },
  }
}
```

**Step 2: Create a system**

```bash
bun run new:system coin-collector
```

Edit `game/systems/coin-collector.ts`:

```typescript
import { defineSystem, overlaps, sfx } from '@engine'
import { useStore } from '@ui/store'

export const coinCollectorSystem = defineSystem({
  name: 'coinCollector',
  update(engine, dt) {
    const players = [...engine.world.with('position', 'collider', 'player')]
    const coins = [...engine.world.with('position', 'collider', 'tags')]
      .filter(e => e.tags.values.has('coin'))

    for (const player of players) {
      for (const coin of coins) {
        if (overlaps(player, coin)) {
          engine.destroy(coin)
          const score = useStore.getState().score + 50
          useStore.getState().setScore(score)
          sfx.pickup()
        }
      }
    }
  },
})
```

**Step 3: Create a scene**

```bash
bun run new:scene coins
```

Edit `game/scenes/coins.ts`:

```typescript
import { defineScene, rng } from '@engine'
import { useStore } from '@ui/store'
import { createPlayer } from '../entities/player'
import { createCoin } from '../entities/coin'
import { playerInputSystem } from '../systems/player-input'
import { coinCollectorSystem } from '../systems/coin-collector'

export const coinsScene = defineScene({
  name: 'coins',

  setup(engine) {
    useStore.getState().setScreen('playing')
    useStore.getState().setScore(0)

    engine.spawn(createPlayer(engine.width / 2, engine.height / 2))

    // Scatter 20 coins
    for (let i = 0; i < 20; i++) {
      engine.spawn(createCoin(
        rng(50, engine.width - 50),
        rng(50, engine.height - 50),
      ))
    }

    // Note: velocity→position is handled by built-in _physics system
    engine.addSystem(playerInputSystem)
    engine.addSystem(coinCollectorSystem)
  },

  update(engine, dt) {
    const coinCount = [...engine.world.with('tags')]
      .filter(e => e.tags.values.has('coin')).length
    if (coinCount === 0) {
      engine.loadScene('game-over')
    }
  },
})
```

### 11c. Wiring It Together

Edit `game/index.ts`:

```typescript
import type { Engine } from '@engine'
import { titleScene } from './scenes/title'
import { coinsScene } from './scenes/coins'
import { gameOverScene } from './scenes/game-over'

export function setupGame(engine: Engine): string {
  engine.registerScene(titleScene)
  engine.registerScene(coinsScene)
  engine.registerScene(gameOverScene)
  return 'title'
}
```

Update the title scene to load 'coins' instead of 'play' on Space press.

### 11d. Common Patterns with Code Examples

**Spawning with a timer:**
```typescript
import { Cooldown } from '@engine'
const spawnTimer = new Cooldown(2.0)  // every 2 seconds

update(engine, dt) {
  spawnTimer.update(dt)
  if (spawnTimer.fire()) {
    engine.spawn(createEnemy(rng(0, engine.width), 0))
  }
}
```

**Checking tags:**
```typescript
const enemies = [...engine.world.with('position', 'tags')]
  .filter(e => e.tags.values.has('enemy'))
```

**Reading game config:**
```typescript
// game/config.ts
export const GAME = {
  player: { speed: 200, color: '#00ff88' },
  enemy: { speed: 100, color: '#ff4444', spawnRate: 1.5 },
} as const
```

---

## 12. Patterns & Recipes

### 12a. Screen Wrapping

Entities teleport to the opposite edge when they leave the screen.

```typescript
// In a system update:
const margin = 20
const w = engine.width
const h = engine.height

for (const e of engine.world.with('position', 'velocity', 'player')) {
  if (e.position.x < -margin) e.position.x = w + margin
  if (e.position.x > w + margin) e.position.x = -margin
  if (e.position.y < -margin) e.position.y = h + margin
  if (e.position.y > h + margin) e.position.y = -margin
}
```

See: `game/systems/player-input.ts`

### 12b. Difficulty Ramping

Increase difficulty over time using elapsed time.

```typescript
let elapsed = 0

update(engine, dt) {
  elapsed += dt

  // Spawn interval decreases over time
  const interval = Math.max(0.2, 1.2 - elapsed * 0.02)

  // Enemy speed increases over time
  const speed = 100 + elapsed * 0.5
}
```

See: `game/systems/asteroid-spawner.ts`

### 12c. Invincibility Frames

Prevent damage for a period after being hit.

```typescript
let invincibleTimer = 0

update(engine, dt) {
  invincibleTimer = Math.max(0, invincibleTimer - dt)

  // On hit:
  if (overlaps(player, enemy) && invincibleTimer <= 0) {
    player.health.current -= 1
    invincibleTimer = 1.0  // 1 second of invincibility

    // Optional: make player blink
    if (player.ascii) {
      player.ascii.opacity = 0.5
    }
  }

  // Reset opacity when invincibility ends
  if (invincibleTimer <= 0 && player.ascii) {
    player.ascii.opacity = 1.0
  }
}
```

See: `game/systems/collision.ts`

### 12d. Score Tracking

```typescript
// Game side (system):
import { useStore } from '@ui/store'

let score = 0
score += 100
useStore.getState().setScore(score)

// React side (component):
const score = useStore(s => s.score)
```

See: `game/systems/collision.ts`, `ui/hud/Score.tsx`

### 12e. Particle Explosions

```typescript
import { ParticlePool } from '@engine'

const particles = new ParticlePool()

// On entity death:
particles.burst({
  x: entity.position.x,
  y: entity.position.y,
  count: 20,
  chars: ['.', '*', '·', '+', '×'],
  color: '#ff4444',
  speed: 120,
  lifetime: 0.8,
})

// Multiple bursts for layered effects:
particles.burst({ x, y, count: 30, chars: ['@','#','*'], color: '#00ff88', speed: 200, lifetime: 1.5 })
particles.burst({ x, y, count: 15, chars: ['·','.'], color: '#ff4444', speed: 150, lifetime: 1.0 })

// MUST update and render every frame:
update(engine, dt) {
  particles.update(dt)
  particles.render(engine.renderer.ctx)
}
```

See: `game/systems/collision.ts`, `game/scenes/game-over.ts`

### 12f. Screen Shake

```typescript
// Small hit shake
engine.camera.shake(3)

// Big explosion shake
engine.camera.shake(8)

// The shake decays automatically (0.9 per frame)
// No cleanup needed
```

See: `game/systems/collision.ts`

### 12g. Camera Follow

```typescript
// In a system:
update(engine, dt) {
  const player = engine.world.with('player', 'position').first
  if (player) {
    engine.camera.follow(player.position.x, player.position.y, 0.08)
  }
}
```

Smoothing (0.08) controls how fast the camera catches up. Lower = smoother/slower.

### 12h. Blinking/Pulsing Text

```typescript
// In a scene update:
update(engine, dt) {
  // Sine-wave opacity pulse
  const alpha = Math.sin(engine.time.elapsed * 3) * 0.3 + 0.7  // range: 0.4 to 1.0

  // Apply to a specific entity (if you have a reference)
  promptEntity.ascii.opacity = alpha
}
```

For React-side blinking, `AsciiText` supports a `blink` prop:
```tsx
<AsciiText size="md" color={COLORS.dim} blink>
  [ Press SPACE to start ]
</AsciiText>
```

### 12i. Tags for Entity Groups

Tags let you categorize entities without creating new component types:

```typescript
// Creating tagged entities:
engine.spawn({
  ...createBullet(x, y, vx, vy),
  tags: { values: new Set(['bullet', 'projectile']) },
})

engine.spawn({
  ...createAsteroid(x, y, vx, vy),
  tags: { values: new Set(['asteroid', 'enemy']) },
})

// Querying by tag:
const enemies = [...engine.world.with('position', 'tags')]
  .filter(e => e.tags.values.has('enemy'))

const projectiles = [...engine.world.with('position', 'tags')]
  .filter(e => e.tags.values.has('projectile'))
```

Tags are a `Set<string>`, so checking membership is O(1).

---

## 13. Extending the Engine

### 13a. Adding New Component Types

1. Add the type to `shared/types.ts`:

```typescript
export interface Magnet {
  strength: number
  range: number
}
```

2. Add it to the `Entity` interface:

```typescript
export interface Entity {
  // ... existing components
  magnet: Magnet
}
```

3. Use it in entity factories:

```typescript
export function createMagnet(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    magnet: { strength: 5, range: 100 },
    ascii: { char: '⊕', font: FONTS.large, color: '#aa44ff' },
  }
}
```

4. Query it in systems:

```typescript
for (const e of engine.world.with('position', 'magnet')) {
  // Pull nearby entities toward this magnet
}
```

### 13b. Adding New Render Layers

The renderer in `engine/render/ascii-renderer.ts` has a fixed render order. To add a new layer:

1. Edit the `render()` method in `ascii-renderer.ts`
2. Add your layer between existing layers

```typescript
// Example: render a grid layer before entities
// In render() method, after camera transform:
ctx.strokeStyle = '#111111'
ctx.lineWidth = 0.5
for (let x = 0; x < w; x += 50) {
  ctx.beginPath()
  ctx.moveTo(x, 0)
  ctx.lineTo(x, h)
  ctx.stroke()
}
```

### 13c. Adding a Physics Plugin

For rigid-body physics beyond overlap detection:

```typescript
// engine/physics/rapier-plugin.ts (hypothetical)
import RAPIER from '@dimforge/rapier2d-compat'

export class PhysicsWorld {
  private world: RAPIER.World

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: 9.81 })
  }

  step(dt: number) { this.world.step() }

  addBody(entity: Entity) {
    // Create a rigid body from entity's position + collider
  }

  sync(engine: Engine) {
    // Copy physics positions back to ECS entities
  }
}
```

Add it to the engine as a new property and call `step()` + `sync()` in the update loop.

### 13d. Custom Post-Processing Effects

Access the canvas context directly for post-processing:

```typescript
// In a scene's update(), after particles.render():
const ctx = engine.renderer.ctx
const w = engine.width
const h = engine.height

// Scanline effect
ctx.fillStyle = 'rgba(0, 0, 0, 0.03)'
for (let y = 0; y < h; y += 2) {
  ctx.fillRect(0, y, w, 1)
}

// Vignette
const gradient = ctx.createRadialGradient(w/2, h/2, w*0.3, w/2, h/2, w*0.8)
gradient.addColorStop(0, 'transparent')
gradient.addColorStop(1, 'rgba(0, 0, 0, 0.4)')
ctx.fillStyle = gradient
ctx.fillRect(0, 0, w, h)

// CRT curvature (via CSS on the canvas element)
// canvas.style.borderRadius = '10px'
// canvas.style.boxShadow = 'inset 0 0 60px rgba(0,0,0,0.5)'
```

---

## 14. Troubleshooting

### Entity Not Appearing

**Symptom**: You spawned an entity but nothing shows on screen.

**Causes:**
1. **Missing `position` component** — auto-rendering requires `position`.
2. **Missing `ascii` (or `textBlock`) component** — the renderer only draws entities with visual components.
3. **Position off-screen** — check x/y values vs `engine.width`/`engine.height`.
4. **Opacity is 0** — check `ascii.opacity`.
5. **Color matches background** — text color same as `#0a0a0a`.
6. **Camera is somewhere else** — if using camera pan/follow, the entity might be outside the viewport.

**Fix:**
```typescript
// Minimum visible entity:
engine.spawn({
  position: { x: engine.width / 2, y: engine.height / 2 },
  ascii: { char: '@', font: '24px "Fira Code", monospace', color: '#00ff88' },
})
```

### System Not Running

**Symptom**: Your system's `update()` never executes.

**Causes:**
1. **Not added in scene setup** — you defined the system but never called `engine.addSystem()`.
2. **Added in the wrong scene** — systems are cleared on scene change.
3. **Scene didn't load** — check that the scene is registered and loaded.

**Fix:**
```typescript
// In your scene's setup():
setup(engine) {
  engine.addSystem(mySystem)  // Don't forget this!
}
```

### React Not Updating

**Symptom**: Game state changes but the UI doesn't reflect it.

**Causes:**
1. **Using `getState()` wrong** — You must call the setter: `useStore.getState().setScore(10)`, not just read.
2. **Not using reactive hook in React** — Use `useStore(s => s.score)`, not `useStore.getState().score`.
3. **Store property not updated** — Check that the setter actually exists and is called.

**Fix:**
```typescript
// Game side — this is correct:
useStore.getState().setScore(newScore)

// React side — this is correct:
const score = useStore(s => s.score)  // reactive!

// React side — this is WRONG (not reactive):
const score = useStore.getState().score  // reads once, never updates
```

### Particles Not Visible

**Symptom**: You called `particles.burst()` but nothing appears.

**Causes:**
1. **Forgot to call `particles.render(ctx)`** — Particles are NOT auto-rendered!
2. **Forgot to call `particles.update(dt)`** — Particles don't move or fade without updating.
3. **Rendering before camera restore** — If you render particles inside a camera transform, they move with the camera.

**Fix:**
```typescript
// In your scene's update():
update(engine, dt) {
  particles.update(dt)
  particles.render(engine.renderer.ctx)  // Both calls required!
}
```

### Pretext Cache Issues

**Symptom**: Text layout looks wrong after changing text or font.

**Causes:**
1. **Stale cache** — If you change a font definition, the cached measurement is wrong.
2. **Font not loaded** — Web fonts load asynchronously. First render might use fallback metrics.

**Fix:**
```typescript
import { clearTextCache } from '@engine'
clearTextCache()  // Force re-measurement
```

### Audio Not Playing

**Symptom**: `beep()` or `sfx.shoot()` produces no sound.

**Causes:**
1. **AudioContext suspended** — Browser requires user gesture first.
2. **Volume too low** — Check the `volume` parameter.
3. **Browser tab muted** — Check browser tab audio settings.

**Fix:** Audio auto-unlocks on first user interaction. If testing, click anywhere on the page first. The engine auto-resumes suspended AudioContext on each `beep()` call.

### World Mutation During Iteration

**Symptom**: Entities disappear randomly, errors during iteration, or missed entities.

**Cause**: Removing entities from the world while iterating over a query.

**Fix**: Collect entities to remove first, then remove after iteration:
```typescript
// WRONG:
for (const e of engine.world.with('lifetime')) {
  if (e.lifetime.remaining <= 0) engine.destroy(e)  // Mutates during iteration!
}

// CORRECT:
const toRemove: any[] = []
for (const e of engine.world.with('lifetime')) {
  if (e.lifetime.remaining <= 0) toRemove.push(e)
}
for (const e of toRemove) engine.destroy(e)
```

### Using setTimeout/setInterval

**Symptom**: Timers fire at wrong times, don't respect pause, cause memory leaks.

**Fix**: Use `Cooldown` + `dt` instead:
```typescript
import { Cooldown } from '@engine'

// WRONG:
setInterval(() => spawnEnemy(), 2000)

// CORRECT:
const timer = new Cooldown(2.0)
update(engine, dt) {
  timer.update(dt)
  if (timer.fire()) spawnEnemy()
}
```

---

## Appendix: Full Engine API Reference

### Engine Class

| Property/Method | Description |
|----------------|-------------|
| `engine.world` | ECS World (miniplex) |
| `engine.keyboard` | Keyboard state |
| `engine.mouse` | Mouse state |
| `engine.camera` | Camera (pan/zoom/shake) |
| `engine.renderer` | AsciiRenderer (canvas) |
| `engine.renderer.ctx` | Raw CanvasRenderingContext2D |
| `engine.config` | EngineConfig |
| `engine.time` | `{ dt, elapsed, frame, fps }` |
| `engine.width` | Canvas width (pixels) |
| `engine.height` | Canvas height (pixels) |
| `engine.spawn(components)` | Add entity to world |
| `engine.destroy(entity)` | Remove entity from world |
| `engine.addSystem(system)` | Add system to update loop |
| `engine.removeSystem(name)` | Remove system by name |
| `engine.registerScene(scene)` | Register a scene |
| `engine.loadScene(name)` | Load scene (cleans up current) |
| `engine.start(sceneName)` | Start engine with scene |
| `engine.stop()` | Stop engine, clean up |
| `engine.pause()` | Pause updates (render continues) |
| `engine.resume()` | Resume from pause |
| `engine.isPaused` | Is engine paused? |

### Utility Functions

```typescript
// Math
vec2(x?, y?)             → { x, y }
add(a, b)                → Vec2
sub(a, b)                → Vec2
scale(v, s)              → Vec2
len(v)                   → number
normalize(v)             → Vec2
dist(a, b)               → number
dot(a, b)                → number
lerp(a, b, t)            → number
clamp(v, min, max)       → number
rng(min, max)            → number (float)
rngInt(min, max)         → number (integer, inclusive)
pick(arr)                → random element
chance(p)                → boolean (true if Math.random() < p)

// Timer
new Cooldown(duration)   → Cooldown (.update(dt), .fire(), .ready, .reset())
tween(elapsed, a, b, duration)    → number (linear)
easeOut(elapsed, a, b, duration)  → number (quadratic ease-out)

// Color
hsl(h, s, l)             → CSS string
hsla(h, s, l, a)         → CSS string
rainbow(elapsed, speed?, s?, l?)  → CSS string (cycling hue)
lerpColor(hexA, hexB, t) → hex string
```

### Constants

```typescript
COLORS.bg       // '#0a0a0a'
COLORS.fg       // '#e0e0e0'
COLORS.dim      // '#666666'
COLORS.accent   // '#00ff88'
COLORS.warning  // '#ffaa00'
COLORS.danger   // '#ff4444'
COLORS.info     // '#44aaff'
COLORS.purple   // '#aa44ff'
COLORS.pink     // '#ff44aa'

FONTS.normal    // '16px "Fira Code", monospace'
FONTS.large     // '24px "Fira Code", monospace'
FONTS.huge      // '48px "Fira Code", monospace'
FONTS.small     // '12px "Fira Code", monospace'
FONTS.bold      // '700 16px "Fira Code", monospace'
FONTS.boldLarge // '700 24px "Fira Code", monospace'
```
