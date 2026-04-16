# ASCII Game Engine

A game engine for building ASCII-art games in the browser. Supports both real-time and turn-based games. Built on [Pretext](https://github.com/chenglou/pretext) for text rendering, [miniplex](https://github.com/hmans/miniplex) for ECS, and React for UI.

Everything renders as text on a canvas — characters, particles, HUD — with pixel-perfect layout powered by Pretext's font metrics.

## Quick Start

**One command** (requires Node.js):

```bash
npx create-ascii-game my-game
cd my-game
bun dev
```

First `bun dev` auto-detects no game and shows a template picker. Pick one, hit Enter, and you're playing.
s
Or pick a template upfront:

```bash
npx create-ascii-game my-game --template asteroid-field
```

### Templates

| Template | Description |
|----------|-------------|
| `blank` | Minimal starter — title screen + movable player |
| `asteroid-field` | Complete game — dodge, shoot, score, difficulty ramp |
| `platformer` | Gravity, jumping, platforms, collectibles |

### Alternative: clone directly

```bash
git clone https://github.com/leCheeseRoyale/ascii-games my-game
cd my-game
bun install
bun dev
```

## Project Structure

```
engine/          Core framework — rendering, ECS, input, physics, audio
  core/          Engine class, game loop, scene manager, turn manager
  ecs/           miniplex world, system runner, state machines
  render/        ASCII renderer, camera, particles, Pretext text layout
  input/         Keyboard, mouse, and gamepad handling
  physics/       Collision detection
  audio/         Procedural sound effects (ZzFX)
  utils/         Math, timers, colors, grid

game/            Your game code (generated from templates, gitignored)
  scenes/        Scene definitions (title, play, game-over, etc.)
  systems/       ECS systems (movement, collision response, spawning)
  entities/      Entity factory functions

games/           Source-of-truth game templates (blank, asteroid-field, platformer)

ui/              React UI overlay
  store.ts       Zustand store — bridge between engine and React
  screens/       HUD, menus, overlays

shared/          Types, constants, events shared across layers
scripts/         Scaffolding and dev scripts
```

## Commands

```bash
bun dev              # Start dev server (auto-runs template picker if game/ is missing)
bun dev:fast         # Start dev server directly (skip auto-detect)
bun run check        # TypeScript type-check
bun run build        # Production build
bun run lint         # Biome linter
bun run export       # Build single-file HTML (dist/game.html)
bun run init:game    # Interactive template picker
bun run new:scene    # Scaffold a new scene
bun run new:system   # Scaffold a new system
bun run new:entity   # Scaffold an entity factory
bun run list:games   # List available game templates
```

## Engine API

Everything imports from `@engine`:

```ts
import {
  Engine, defineScene, defineSystem,
  sfx, Cooldown, overlaps, overlapAll,
  rng, rngInt, pick, chance, clamp, lerp, vec2, dist,
  COLORS, FONTS, PALETTES, events,
} from '@engine'
```

### Scenes

Scenes are the top-level game states. Each has setup/update/cleanup hooks:

```ts
import { defineScene, FONTS, COLORS } from '@engine'
import type { Engine } from '@engine'

export default defineScene({
  name: 'play',

  setup(engine: Engine) {
    engine.spawn({
      position: { x: engine.centerX, y: engine.centerY },
      velocity: { vx: 0, vy: 0 },
      ascii: { char: '@', font: FONTS.large, color: COLORS.accent },
      tags: { values: new Set(['player']) },
    })
  },

  update(engine: Engine, dt: number) {
    const player = engine.findByTag('player')
    if (!player?.velocity) return

    const speed = 200
    player.velocity.vx = 0
    if (engine.keyboard.held('ArrowLeft')) player.velocity.vx = -speed
    if (engine.keyboard.held('ArrowRight')) player.velocity.vx = speed
    // _physics handles position += velocity * dt automatically
  },
})
```

### Systems

Systems run every frame and operate on entities by querying components:

```ts
import { defineSystem, overlaps, sfx } from '@engine'

export default defineSystem({
  name: 'collision',
  update(engine, dt) {
    const bullets = engine.findAllByTag('bullet')
    const enemies = engine.findAllByTag('enemy')
    for (const bullet of bullets) {
      for (const enemy of enemies) {
        if (overlaps(bullet, enemy)) {
          engine.particles.burst({ x: enemy.position.x, y: enemy.position.y, count: 12, chars: ['*','.','+'], color: '#ff4400', speed: 120, lifetime: 0.6 })
          engine.camera.shake(4)
          sfx.hit()
          engine.destroy(bullet)
          engine.destroy(enemy)
        }
      }
    }
  },
})
```

Systems can optionally declare a `phase` for turn-based games — see Turn Management below.

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
    tags: { values: new Set(['bullet']) },
  }
}

// Spawn: engine.spawn(createBullet(x, y))
```

### Components

| Component | Shape | Description |
|-----------|-------|-------------|
| `position` | `{ x, y }` | World position |
| `velocity` | `{ vx, vy }` | Velocity in px/sec |
| `acceleration` | `{ ax, ay }` | Acceleration in px/sec² |
| `ascii` | `{ char, font, color, glow?, opacity?, scale?, layer? }` | Single/multi character rendering |
| `sprite` | `{ lines, font, color, layer? }` | Multi-line ASCII art |
| `textBlock` | `{ text, font, maxWidth, lineHeight, color, layer? }` | Word-wrapped text block |
| `image` | `{ image, width, height, opacity?, layer? }` | HTML image rendering |
| `collider` | `{ type, width, height, sensor? }` | Circle or rect collision shape |
| `health` | `{ current, max }` | Hit points |
| `lifetime` | `{ remaining }` | Auto-remove after N seconds |
| `physics` | `{ gravity?, friction?, drag?, bounce?, maxSpeed? }` | Automatic physics simulation |
| `tags` | `{ values: Set<string> }` | Categorize entities |
| `screenWrap` | `{ margin? }` | Wrap to opposite edge |
| `screenClamp` | `{ padding? }` | Keep on screen |
| `offScreenDestroy` | `{ margin? }` | Destroy when off screen |

### Input

```ts
engine.keyboard.held('ArrowLeft')     // true while key is down
engine.keyboard.pressed('Enter')      // true only on frame key was pressed
engine.keyboard.released('Escape')    // true only on frame key was released
engine.mouse.x / engine.mouse.y      // mouse position relative to canvas
engine.mouse.down                     // true while mouse button is held
engine.mouse.justDown                 // true on frame mouse was pressed
```

### Collision

```ts
import { overlaps, overlapAll } from '@engine'

if (overlaps(entityA, entityB)) { /* hit */ }
const hits = overlapAll(bullet, engine.world.with('collider'))
```

### Visual Feedback

Layer multiple effects on gameplay events:

```ts
// Particles
engine.particles.burst({ x, y, count: 15, chars: ['*','.','+'], color: '#ff4400', speed: 120, lifetime: 0.6 })
engine.particles.explosion(x, y)    // built-in shortcut
engine.particles.sparkle(x, y)
engine.particles.smoke(x, y)

// Camera shake
engine.camera.shake(4)               // subtle hit
engine.camera.shake(12)              // big explosion

// Floating text (rises + fades, auto-destroys)
engine.floatingText(x, y, '+100', '#ffcc00')

// Tweens — animate any numeric property
engine.tweenEntity(entity, 'ascii.opacity', 1, 0, 0.8, 'linear', true)

// Frame animation — cycle chars/colors
engine.playAnimation(entity, [
  { char: '◯', color: '#ff0' },
  { char: '◎', color: '#fa0' },
], 0.1, false)

// Toast notifications
engine.toast.show('+100', { color: '#ffcc00' })
```

### Audio

```ts
import { sfx, playMusic, stopMusic, setVolume, mute, unmute, toggleMute } from '@engine'

sfx.shoot()              // Laser
sfx.hit()                // Impact
sfx.explode()            // Explosion
sfx.pickup()             // Item collect
sfx.menu()               // Menu blip
sfx.death()              // Death

playMusic('/music.mp3')  // Loop background music
stopMusic()
setVolume(0.5)           // Master volume 0-1
mute() / unmute() / toggleMute()
```

### Turn Management

Opt-in turn-based gameplay. Real-time games ignore this — nothing changes.

```ts
// Setup in scene
engine.turns.configure({ phases: ['draw', 'play', 'attack', 'end'] })
engine.turns.start()

// Advance
engine.turns.endPhase()          // draw → play → attack → end → next turn
engine.turns.endTurn()           // skip to next turn
engine.turns.currentPhase        // 'play'
engine.turns.turnCount           // 1

// Phase-gated systems — only run during their declared phase
defineSystem({
  name: 'player-input',
  phase: 'play',
  update(engine, dt) { /* only runs during 'play' phase */ }
})

// Turn events
events.on('turn:start', (turnCount) => { ... })
events.on('phase:enter', (phaseName) => { ... })
```

Systems without a `phase` always run (animations, tweens, particles stay real-time).

### Built-in Systems

Auto-registered on every scene load — do not add them manually:

- `_physics` — velocity/acceleration integration, gravity, friction, drag
- `_parent` — hierarchical transforms (parent/child positioning)
- `_tween` — property tweening
- `_animation` — frame-based animation
- `_lifetime` — removes entities when `lifetime.remaining` expires
- `_screenBounds` — handles `screenWrap`, `screenClamp`, and `offScreenDestroy`

### Utilities

```ts
rng(0, 1)          // Random float in [min, max)
rngInt(1, 6)       // Random int in [1, 6] inclusive
pick(['a', 'b'])   // Random element
chance(0.3)        // 30% chance → true
clamp(x, 0, 100)  // Constrain to range
lerp(a, b, 0.5)   // Linear interpolation

const cd = new Cooldown(0.5)  // Fire-rate limiter
cd.update(dt)
if (cd.fire()) { shoot() }

engine.centerX / engine.centerY       // Canvas center
engine.findByTag('enemy')             // First entity with tag
engine.findAllByTag('enemy')          // All entities with tag
engine.destroyAll('enemy')            // Destroy all with tag
engine.sceneTime                      // Seconds in current scene
engine.randomEdgePosition()           // Random position on screen edge
engine.spawnEvery(1.0, () => create())  // Spawn on interval
engine.after(2.0, () => { ... })      // Delayed action
engine.every(0.5, () => { ... })      // Repeating action
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

Store fields: `screen`, `score`, `highScore`, `health`, `maxHealth`, `fps`, `entityCount`, `sceneName`.

## Creating Your First Game

1. **Initialize**: `bun run init:game` (or `bun run init:game blank`)
2. **Run**: `bun dev` — you'll see a title screen
3. **Edit `game/scenes/play.ts`** — add entities, input handling
4. **Create entities**: `bun run new:entity enemy` → edit the factory
5. **Create systems**: `bun run new:system spawner` → add spawn logic
6. **Add systems to scenes**: in `setup()`, call `engine.addSystem(mySystem)`
7. **Add UI**: edit `ui/screens/` for HUD, update store from game code
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
