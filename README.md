# ASCII Game Engine

A game engine for building ASCII-art games in the browser. Built on [Pretext](https://github.com/chenglou/pretext) for text rendering, [miniplex](https://github.com/hmans/miniplex) for ECS, and React for UI.

Everything renders as text on a canvas — characters, particles, HUD — with pixel-perfect layout powered by Pretext's font metrics.

## Quick Start

```bash
git clone <repo-url> ascii-game-engine
cd ascii-game-engine
bun install
bun dev
```

Open `http://localhost:5173`. You're running.

### Initialize from a template

```bash
bun run init:game blank           # Minimal starter: title + play scenes
bun run init:game asteroid-field  # Playable asteroid dodger
bun run init:game platformer     # Side-scrolling platformer
```

## Project Structure

```
engine/          Core framework — rendering, ECS, input, physics, audio
  core/          Engine class, game loop, scene manager
  ecs/           miniplex world, system runner
  render/        ASCII renderer, camera, particles, Pretext text layout
  input/         Keyboard and mouse handling
  physics/       Collision detection
  audio/         Procedural sound effects (beep, sfx)
  utils/         Math, timers, colors

game/            Your game code
  scenes/        Scene definitions (title, play, game-over, etc.)
  systems/       ECS systems (movement, collision response, spawning)
  entities/      Entity factory functions
  data/          Static data, level definitions

ui/              React UI overlay
  store.ts       Zustand store — bridge between engine and React
  components/    HUD, menus, overlays

shared/          Types, constants, events shared across layers
scripts/         Scaffolding scripts
```

## Scaffolding

Generate boilerplate with one command:

```bash
bun run new:scene game-over    # → game/scenes/game-over.ts
bun run new:system spawner     # → game/systems/spawner.ts
bun run new:entity asteroid    # → game/entities/asteroid.ts
```

Each generates a complete, commented file ready to fill in.

### Other Commands

```bash
bun run export       # Build single-file HTML (dist/game.html)
bun run list:games   # List available game templates
```

## Engine API

Everything imports from `@engine`:

```ts
import {
  Engine, defineScene, defineSystem,
  ParticlePool, sfx, Cooldown,
  overlaps, overlapAll,
  rng, rngInt, pick, chance, clamp, lerp, vec2, dist,
  COLORS, FONTS, events, DEFAULT_CONFIG,
} from '@engine'
```

### Scenes

Scenes are the top-level game states. Each has setup/update/cleanup hooks:

```ts
import { defineScene, type Engine } from '@engine'

export default defineScene({
  name: 'play',

  setup(engine: Engine) {
    engine.world.add({
      position: { x: 400, y: 300 },
      ascii: { char: '@', font: '24px "Fira Code", monospace', color: '#00ff88' },
      tags: { player: true },
    })
  },

  update(engine: Engine, dt: number) {
    const player = engine.world.with('position', 'tags').where(e => e.tags?.player).first
    if (!player) return

    if (engine.keyboard.isDown('ArrowLeft')) player.position.x -= 200 * dt
    if (engine.keyboard.isDown('ArrowRight')) player.position.x += 200 * dt
  },

  cleanup(engine: Engine) { },
})
```

Register scenes in `game/index.ts` and return the starting scene name.

### Systems

Systems run every frame and operate on entities by querying components:

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

### Entity Factories

Entities are plain objects. Use factory functions to create them:

```ts
import type { Entity } from '@engine'

export function createBullet(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: 0, vy: -400 },
    ascii: { char: '|', font: '14px "Fira Code", monospace', color: '#ffff00' },
    collider: { type: 'circle', width: 4, height: 12 },
    lifetime: { remaining: 2 },
  }
}

// Spawn: engine.world.add(createBullet(x, y))
```

### Components

| Component | Shape | Description |
|-----------|-------|-------------|
| `position` | `{ x, y }` | World position |
| `velocity` | `{ vx, vy }` | Velocity in px/sec |
| `acceleration` | `{ ax, ay }` | Acceleration in px/sec² |
| `ascii` | `{ char, font, color }` | Single character rendering |
| `textBlock` | `{ text, font, color, align }` | Multi-line text block |
| `collider` | `{ type, width, height }` | Collision shape |
| `health` | `{ current, max }` | Hit points |
| `lifetime` | `{ remaining }` | Auto-remove after N seconds (handled by `_lifetime` system) |
| `tags` | `{ [key]: boolean }` | Arbitrary flags |
| `screenWrap` | `boolean` | Wrap entity to opposite edge when leaving screen |
| `screenClamp` | `boolean` | Clamp entity position to screen bounds |
| `offScreenDestroy` | `boolean` | Destroy entity when it leaves the screen |

### Input

```ts
engine.keyboard.isDown('ArrowLeft')    // held down
engine.keyboard.justPressed('Enter')   // pressed this frame
engine.mouse.position                  // { x, y }
engine.mouse.isDown(0)                 // left mouse button
```

### Collision

```ts
import { overlaps, overlapAll } from '@engine'

if (overlaps(entityA, entityB)) { /* hit! */ }
const hits = overlapAll(bullet, engine.world.with('collider'))
for (const hit of hits) engine.world.remove(hit)
```

### Audio

```ts
import { sfx } from '@engine'

sfx.shoot()              // Laser sound
sfx.hit()                // Impact
sfx.explode()            // Explosion
sfx.pickup()             // Item pickup
sfx.menu()               // Menu blip
sfx.death()              // Death sound
sfx.custom(...)          // Custom ZzFX parameters

playMusic(src)           // Play background music from URL
stopMusic()              // Stop background music
setVolume(0.5)           // Set master volume (0–1)
mute()                   // Mute all audio
unmute()                 // Unmute all audio
```

### Built-in Systems

The following systems are auto-registered on every scene load — do not add them manually:

- `_physics` — velocity/acceleration integration, gravity, friction, drag
- `_parent` — hierarchical transforms (parent/child positioning)
- `_tween` — property tweening
- `_animation` — frame-based animation
- `_lifetime` — removes entities when `lifetime.remaining` expires
- `_screenBounds` — handles `screenWrap`, `screenClamp`, and `offScreenDestroy` components

### Utilities

```ts
rng()              // Random 0..1
rngInt(1, 6)       // Random integer 1..6
pick(['a', 'b'])   // Random element
chance(0.3)        // 30% chance → true
clamp(x, 0, 100)  // Constrain to range
lerp(a, b, 0.5)   // Linear interpolation

const cd = new Cooldown(0.5)  // Fire-rate limiter
if (cd.ready(dt)) { shoot() }

// Engine convenience helpers
engine.centerX               // Canvas center X
engine.centerY               // Canvas center Y
engine.findByTag('enemy')    // Find first entity with tag
engine.destroyAll('enemy')   // Destroy all entities with tag
engine.sceneTime             // Seconds elapsed in current scene
engine.randomEdgePosition()  // Random position on screen edge
engine.spawnEvery(1.0, () => createEnemy())  // Spawn on interval
```

### React UI

The zustand store bridges game state to React:

```ts
// Game code (imperative)
import { useStore } from '@ui/store'
useStore.getState().setScore(10)

// React component (reactive)
const score = useStore(s => s.score)
```

Store fields: `screen`, `score`, `highScore`, `health`, `maxHealth`, `fps`, `entityCount`.

## Creating Your First Game

1. **Initialize**: `bun run init:game blank`
2. **Run**: `bun dev` — you'll see a title screen
3. **Edit `game/scenes/play.ts`** — add entities, input handling
4. **Create entities**: `bun run new:entity enemy` → edit the factory
5. **Create systems**: `bun run new:system spawner` → add spawn logic
6. **Add systems to scenes**: in `setup()`, call `engine.addSystem(mySystem)`
7. **Add UI**: edit `ui/components/` for HUD, update store from game code
8. **Add scenes**: `bun run new:scene game-over` → register in `game/index.ts`

## Tech Stack

| Library | Role |
|---------|------|
| [Pretext](https://github.com/chenglou/pretext) | Font metrics & text layout on canvas |
| [miniplex](https://github.com/hmans/miniplex) | Entity Component System |
| [React](https://react.dev) | UI overlay (HUD, menus) |
| [zustand](https://github.com/pmndrs/zustand) | State bridge between engine and React |
| [Vite](https://vitejs.dev) | Build tool & dev server |
| [Bun](https://bun.sh) | Runtime, package manager, script runner |

## License

MIT
