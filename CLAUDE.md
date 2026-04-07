# CLAUDE.md — Instructions for Claude Code

## Commands

```
bun dev          # Start dev server (Vite + HMR)
bun run check    # TypeScript type-check (no emit)
bun run build    # Production build
bun run new:scene <name>   # Scaffold a scene
bun run new:system <name>  # Scaffold a system
bun run new:entity <name>  # Scaffold an entity factory
bun run init:game <blank|asteroid-field>  # Initialize game from template
```

## Architecture

```
engine/   — Framework code. Do not put game logic here.
game/     — User game code (scenes, systems, entities, data).
ui/       — React UI only. Mounted independently of the canvas.
shared/   — Types, constants, events shared across all layers.
scripts/  — Bun scaffolding scripts.
```

**Path aliases:** `@engine`, `@game`, `@ui`, `@shared` — use these for imports.

## ECS (Entity Component System)

- **World**: miniplex `World<Entity>`. Access via `engine.world`.
- **Entity**: plain object with optional components (`position`, `velocity`, `ascii`, `collider`, `health`, `lifetime`, `tags`, `textBlock`, etc).
- **Components**: plain TypeScript objects — no classes, no decorators.
- **Systems**: functions that receive `(engine: Engine, dt: number)` and iterate over entities.

### Querying entities

```ts
// All entities with position + velocity
for (const e of engine.world.with('position', 'velocity')) {
  e.position.x += e.velocity.vx * dt
}

// First entity matching
const player = engine.world.with('position', 'tags').where(e => e.tags?.player).first

// Without a component
for (const e of engine.world.with('position').without('velocity')) { ... }
```

### Spawning entities

```ts
engine.world.add({
  position: { x: 100, y: 200 },
  velocity: { vx: 50, vy: 0 },
  ascii: { char: '*', font: '16px "Fira Code", monospace', color: '#ff0' },
  collider: { type: 'circle', width: 16, height: 16 },
})
```

### Removing entities

```ts
engine.world.remove(entity)
```

## Scenes

Scenes control game flow (title screen, gameplay, game over).

```ts
import { defineScene, type Engine } from '@engine'

export default defineScene({
  name: 'my-scene',
  setup(engine: Engine) { /* spawn entities, add systems */ },
  update(engine: Engine, dt: number) { /* per-frame logic */ },
  cleanup(engine: Engine) { /* teardown */ },
})
```

Register in `game/index.ts`:
```ts
engine.registerScene(myScene)
return 'my-scene' // starting scene
```

Switch scenes: `engine.switchScene('other-scene')`

## Systems

```ts
import { defineSystem, type Engine } from '@engine'

export default defineSystem({
  name: 'movement',
  update(engine: Engine, dt: number) {
    for (const e of engine.world.with('position', 'velocity')) {
      e.position.x += e.velocity.vx * dt
      e.position.y += e.velocity.vy * dt
    }
  },
})
```

Add in scene setup: `engine.addSystem(movementSystem)`

## Entity Factories

```ts
import type { Entity } from '@engine'

export function createBullet(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: 0, vy: -400 },
    ascii: { char: '|', font: '14px "Fira Code", monospace', color: '#ff0' },
    lifetime: { remaining: 2 },
  }
}
```

## Rendering

The engine auto-renders any entity that has `position` + `ascii` (single character) or `position` + `textBlock` (multi-line text).

- **ascii**: `{ char, font, color }` — single glyph rendered at position.
- **textBlock**: `{ text, font, color, align }` — text block with Pretext layout.

### Pretext rules

- `prepare(text, font)` is **cached** — call once per unique text+font combo.
- `layout()` is cheap and can run every frame.
- **Never re-prepare the same text+font** — it wastes time.
- The engine handles all Pretext calls; you just set component data.

## React Boundary

The zustand store (`ui/store.ts`) is the **ONLY** bridge between engine/game and React.

```ts
// From game code — update store imperatively
import { useStore } from '@ui/store'
useStore.getState().setScore(10)
useStore.getState().setHealth(player.health.current, player.health.max)

// From React — read store reactively (hook)
const score = useStore(s => s.score)
```

### Rules

- **Never import `ui/` from `engine/` or `game/`** (except the store).
- **Never import `engine/` or `game/` from `ui/`** React components.
- The store exposes: `screen`, `score`, `highScore`, `health`, `maxHealth`, `fps`, `entityCount`.

## Input

```ts
engine.keyboard.isDown('ArrowLeft')   // held this frame
engine.keyboard.justPressed('Enter')  // pressed this frame only
engine.mouse.position                 // { x, y }
engine.mouse.isDown(0)                // left button
```

## Utilities (from @engine)

```ts
import { rng, rngInt, pick, chance, clamp, lerp, vec2, dist, Cooldown, sfx, COLORS, FONTS } from '@engine'

rng()              // 0..1
rngInt(1, 6)       // 1..6 inclusive
pick(['a','b'])    // random element
chance(0.3)        // 30% true
clamp(x, 0, 100)  // constrain
lerp(a, b, 0.5)   // interpolate
dist(a, b)         // Vec2 distance
vec2(10, 20)       // { x: 10, y: 20 }

const cd = new Cooldown(0.5)
if (cd.ready(dt)) { /* fire! */ }
```

## Collision

```ts
import { overlaps, overlapAll } from '@engine'

if (overlaps(entityA, entityB)) { /* hit */ }
const hits = overlapAll(bullet, engine.world.with('collider'))
```

## Common Patterns

### Spawn-on-timer

```ts
const spawnTimer = new Cooldown(1.0)
// in update:
if (spawnTimer.ready(dt)) {
  engine.world.add(createEnemy(rng() * 800, -20))
}
```

### Screen-wrap

```ts
if (e.position.x < 0) e.position.x = 800
if (e.position.x > 800) e.position.x = 0
```

### Lifetime cleanup (engine handles automatically if lifetime system is running)

Entities with `lifetime: { remaining: N }` are auto-removed after N seconds.

## What NOT To Do

- **Don't put game logic in engine/.** Engine is a reusable framework.
- **Don't import React components in game code.** Use the store.
- **Don't create classes for entities.** Entities are plain objects with components.
- **Don't call `prepare()` directly.** The renderer handles Pretext caching.
- **Don't use `setInterval`/`setTimeout` for game timing.** Use `Cooldown` or `dt`.
- **Don't mutate the world during iteration** without collecting first.
- **Don't store game state in React** — store it on entities or in the zustand store.
