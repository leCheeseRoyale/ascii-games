# CLAUDE.md — Instructions for Claude Code

## Commands

```
bun dev          # Start dev server (Vite + HMR)
bun run check    # TypeScript type-check (no emit)
bun run build    # Production build
bun run lint     # Biome linter
bun run lint:fix # Auto-fix lint issues
bun run knip     # Find unused deps/exports/files
bun run gen:api  # Regenerate docs/API-generated.md from code
bun run new:scene <name>   # Scaffold a scene
bun run new:system <name>  # Scaffold a system
bun run new:entity <name>  # Scaffold an entity factory
bun run init:game <blank|asteroid-field|platformer>  # Initialize game from template
bun run export         # Build single-file HTML (dist/game.html)
bun run list:games     # List available game templates
```

## Architecture

```
engine/   — Framework code. Do not put game logic here.
game/     — User game code (scenes, systems, entities, data).
ui/       — React UI only. Mounted independently of the canvas.
shared/   — Types, constants, events shared across all layers.
scripts/  — Bun scaffolding scripts.
docs/     — API reference (API-generated.md is auto-generated).
```

**Path aliases:** `@engine`, `@game`, `@ui`, `@shared` — use these for imports.

## ECS (Entity Component System)

- **World**: miniplex `World<Entity>`. Access via `engine.world`.
- **Entity**: plain object with optional components (`position`, `velocity`, `acceleration`, `ascii`, `sprite`, `textBlock`, `collider`, `health`, `lifetime`, `physics`, `tween`, `animation`, `image`, `parent`, `child`, `emitter`, `tags`, `screenWrap`, `screenClamp`, `offScreenDestroy`).
- **Built-in systems**: `_parent`, `_physics`, `_tween`, `_animation`, `_lifetime`, `_screenBounds` — auto-registered on every scene load. Do not add them manually. `_physics` handles velocity→position integration, so do NOT write a custom movement system that does `position += velocity * dt`. `_lifetime` counts down `lifetime.remaining` and destroys at 0. `_screenBounds` handles `screenWrap`, `screenClamp`, and `offScreenDestroy` components.
- **Components**: plain TypeScript objects — no classes, no decorators.
- **Systems**: functions that receive `(engine: Engine, dt: number)` and iterate over entities.

### Component shapes (key types)

```ts
Position:       { x: number, y: number }
Velocity:       { vx: number, vy: number }
Acceleration:   { ax: number, ay: number }
Ascii:          { char: string, font: string, color: string, glow?: string, opacity?: number, scale?: number, layer?: number }
Sprite:         { lines: string[], font: string, color: string, glow?: string, opacity?: number, layer?: number }
TextBlock:      { text: string, font: string, maxWidth: number, lineHeight: number, color: string, layer?: number }
Collider:       { type: 'circle' | 'rect', width: number, height: number, sensor?: boolean }
Health:         { current: number, max: number }
Lifetime:       { remaining: number }
Physics:        { gravity?: number, friction?: number, drag?: number, bounce?: number, maxSpeed?: number, mass?: number, grounded?: boolean }
Tags:           { values: Set<string> }
ImageComponent: { image: HTMLImageElement, width: number, height: number, opacity?: number, layer?: number, anchor?: 'center' | 'topLeft', rotation?: number, tint?: string }
ScreenWrap:     { margin?: number }       // auto-wrap at screen edges
ScreenClamp:    { padding?: number }      // keep entity on screen
OffScreenDestroy: { margin?: number }     // destroy when off screen
```

### Querying entities

```ts
// All entities with position + velocity
for (const e of engine.world.with('position', 'velocity')) {
  e.position.x += e.velocity.vx * dt
}

// First entity matching a tag (shorthand)
const player = engine.findByTag('player')

// Without a component
for (const e of engine.world.with('position').without('velocity')) { ... }
```

### Spawning & removing entities

```ts
// Spawn (preferred — use engine.spawn, not engine.world.add)
engine.spawn({
  position: { x: 100, y: 200 },
  velocity: { vx: 50, vy: 0 },
  ascii: { char: '*', font: '16px "Fira Code", monospace', color: '#ff0' },
  collider: { type: 'circle', width: 16, height: 16 },
})

// Remove
engine.destroy(entity)

// Remove all entities with a tag
engine.destroyAll('enemy')  // returns count of destroyed entities

// Remove entity and all children
engine.destroyWithChildren(entity)
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

Switch scenes:
```ts
engine.loadScene('other-scene')
engine.loadScene('play', { transition: 'fade' })
engine.loadScene('play', { transition: 'fadeWhite', duration: 0.3 })
engine.loadScene('play', { transition: 'wipe' })
```

## Systems

```ts
import { defineSystem, type Engine } from '@engine'

export default defineSystem({
  name: 'my-system',
  init(engine: Engine) { /* called once when system is added — reset module-level state here */ },
  update(engine: Engine, dt: number) {
    for (const e of engine.world.with('position', 'tags')) {
      if (e.tags.values.has('enemy')) { /* per-frame logic */ }
    }
  },
  cleanup(engine: Engine) { /* called when system is removed */ },
})
```

Add in scene setup: `engine.addSystem(mySystem)` (duplicate names are silently ignored)

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

The engine auto-renders any entity that has `position` + (`ascii` | `textBlock` | `sprite` | `image`).

- **ascii**: `{ char, font, color }` — rendered at position. Can be multi-char strings.
- **textBlock**: `{ text, font, maxWidth, lineHeight, color }` — word-wrapped text block via Pretext.
- **sprite**: `{ lines, font, color }` — multi-line ASCII art.
- **image**: `{ image, width, height }` — rendered HTML image. Load with `engine.loadImage(url)`.
- **Layering**: set `layer` on any renderable component. Lower = behind, higher = in front. Default 0.

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
- Store state: `screen`, `score`, `highScore`, `health`, `maxHealth`, `fps`, `entityCount`, `sceneName`.
- Store actions: `setScreen`, `setScore`, `setHealth`, `setDebugInfo`, `setSceneName`, `reset`.

## Input

```ts
engine.keyboard.held('ArrowLeft')     // true while key is down
engine.keyboard.pressed('Enter')      // true only on the frame key was pressed
engine.keyboard.released('Escape')    // true only on the frame key was released
engine.mouse.x                        // mouse X relative to canvas
engine.mouse.y                        // mouse Y relative to canvas
engine.mouse.down                     // true while mouse button is held
engine.mouse.justDown                 // true on frame mouse was pressed
engine.mouse.justUp                   // true on frame mouse was released
```

## Engine Properties

```ts
engine.width / engine.height       // canvas dimensions
engine.centerX / engine.centerY    // half of width/height
engine.sceneTime                   // seconds since current scene loaded (resets on scene change)
engine.debug                       // DebugOverlay instance (toggle with backtick key)
engine.toast                       // ToastManager instance
engine.isPaused                    // boolean
```

## Utilities (from @engine)

```ts
import { rng, rngInt, pick, chance, clamp, lerp, vec2, dist, Cooldown, sfx, COLORS, FONTS, PALETTES } from '@engine'

// Random
rng(0, 1)          // random float in [min, max)
rngInt(1, 6)       // random int in [1, 6] inclusive
pick(['a','b'])    // random element from array
chance(0.3)        // 30% chance → true

// Math
clamp(x, 0, 100)  // constrain to range
lerp(a, b, 0.5)   // linear interpolation
dist(a, b)         // Vec2 distance
vec2(10, 20)       // { x: 10, y: 20 }

// Timers & scheduling
engine.after(1.0, () => { /* runs once after 1s */ })
engine.every(0.5, () => { /* runs every 0.5s */ })
engine.sequence([{ delay: 1, fn: step1 }, { delay: 2, fn: step2 }]) // delays are cumulative: step2 fires at t=3
engine.cancelTimer(id) // cancel a timer or entire sequence
engine.spawnEvery(1.0, () => createEnemy(rng(0, 800), -20))  // spawn on repeating timer, returns cancel ID

// Spawn helpers
engine.randomEdgePosition(margin?)  // returns { x, y, edge } just off a random screen edge

// Cooldown (for fire rates, spawn timers, etc.)
const cd = new Cooldown(0.5)
// in update:
cd.update(dt)
if (cd.fire()) { /* fires and resets cooldown */ }
// or check without firing:
if (cd.ready) { /* cooldown is ready */ }

// Tweening
engine.tweenEntity(entity, 'position.x', 0, 200, 0.5, 'easeOut')
// args: entity, property (dot-path), from, to, duration, ease?, destroyOnComplete?
// ease options: 'linear' | 'easeOut' | 'easeIn' | 'easeInOut'

// Animation
engine.playAnimation(entity, frames, frameDuration, loop)
// frames: AnimationFrame[] — each frame: { char?, lines?, color?, duration? }
// frameDuration: default seconds per frame (default 0.1)
// loop: boolean (default true)

// Images
engine.loadImage('url')        // async, returns HTMLImageElement
engine.preloadImages([...])    // parallel preload, use in scene setup

// Audio (powered by ZzFX)
sfx.shoot()    // laser sound
sfx.hit()      // impact
sfx.pickup()   // item pickup
sfx.explode()  // explosion
sfx.menu()     // menu blip
sfx.death()    // death sound
sfx.custom(0.15, 0.05, 880, 0.05, 0.02, 0, 1, 0, 0)  // raw ZzFX params

// Music & volume control
import { playMusic, stopMusic, pauseMusic, resumeMusic, setVolume, setMusicVolume, mute, unmute, toggleMute } from '@engine'
playMusic('/music.mp3')                    // loop background music
playMusic('/music.mp3', { volume: 0.5, loop: false })
stopMusic() / pauseMusic() / resumeMusic()
setVolume(0.5)       // master volume 0-1
setMusicVolume(0.3)  // music volume 0-1
mute() / unmute() / toggleMute()

// Color utilities
hsl(120, 80, 50)           // 'hsl(120,80%,50%)' CSS string
hsla(120, 80, 50, 0.5)    // with alpha
lerpColor('#ff0000', '#0000ff', 0.5)  // interpolate hex colors (6-digit hex only)
rainbow(elapsed, speed)    // cycling hue based on time

// Color palettes
// PALETTES.retro, .neon, .pastel, .forest, .ocean, .monochrome
// Each has: bg, fg, primary, secondary, accent, highlight

// Spatial grid
GridMap                    // tile-based grid with neighbor queries
gridToWorld(col, row, cellSize)   // grid coord → world position
worldToGrid(x, y, cellSize)      // world position → grid coord
gridDistance(a, b)                // Manhattan distance between grid cells
```

## Events (typed, powered by mitt)

```ts
import { events } from '@engine'

// Engine → UI events: 'engine:started', 'engine:stopped', 'engine:paused', 'engine:resumed', 'scene:loaded'
// UI → Engine events: 'game:start', 'game:resume', 'game:restart', 'game:pause'

events.emit('game:start')
events.on('scene:loaded', (sceneName) => { ... })
events.off('scene:loaded', handler)  // unsubscribe (pass same function reference)
```

## Collision

```ts
import { overlaps, overlapAll } from '@engine'

if (overlaps(entityA, entityB)) { /* hit */ }
const hits = overlapAll(bullet, engine.world.with('collider'))
// Supports circle-circle, rect-rect, and circle-rect combinations
```

## Common Patterns

### Spawn-on-timer

```ts
// Simple — use engine.spawnEvery (preferred)
const cancelId = engine.spawnEvery(1.0, () => createEnemy(rng(0, 800), -20))

// Manual — use Cooldown
const spawnTimer = new Cooldown(1.0)
// in update:
spawnTimer.update(dt)
if (spawnTimer.fire()) {
  engine.spawn(createEnemy(rng(0, 800), -20))
}
```

### Physics

Add a `physics` component for automatic gravity, friction, and drag:
```ts
engine.spawn({
  position: { x: 100, y: 100 },
  velocity: { vx: 0, vy: 0 },
  physics: { gravity: 800, friction: 0.9, drag: 0.01 },
})
```

### Parenting (hierarchical transforms)

```ts
engine.attachChild(parentEntity, childEntity, offsetX, offsetY)
engine.detachChild(childEntity)  // takes only the child
engine.destroyWithChildren(parentEntity)
```

### Screen-wrap / clamp / off-screen destroy

```ts
// Preferred — use built-in components (handled by _screenBounds system)
engine.spawn({ position: { x: 0, y: 0 }, screenWrap: { margin: 10 } })
engine.spawn({ position: { x: 0, y: 0 }, screenClamp: { padding: 5 } })
engine.spawn({ position: { x: 0, y: 0 }, offScreenDestroy: { margin: 50 } })

// Manual fallback
if (e.position.x < 0) e.position.x = engine.width
if (e.position.x > engine.width) e.position.x = 0
```

### Lifetime cleanup

Entities with `lifetime: { remaining: N }` are auto-removed by the built-in `_lifetime` system. No manual setup needed.

### Pause / Resume

```ts
engine.pause()
engine.resume()
engine.isPaused  // boolean
```

## Debug & Toast

```ts
// Debug overlay — press backtick (`) to toggle
// Shows collider outlines, entity count, error banner

// Toast notifications
engine.toast.show('+100', { color: '#ffcc00' })           // centered floating text
engine.toast.showAt('+100', entity.position.x, entity.position.y, { color: '#ff0' })  // at position
```

## Persistence

```ts
import { save, load, setStoragePrefix, submitScore, getHighScores, getTopScore } from '@engine'

setStoragePrefix('my-game')        // scope storage keys (call once at init)
save('checkpoint', { level: 3 })   // persist to localStorage
const data = load<{level: number}>('checkpoint')  // retrieve

submitScore(500, 'Player')         // add to persistent leaderboard
const scores = getHighScores(10)   // top 10
const best = getTopScore()         // highest score
```

## What NOT To Do

- **Don't put game logic in engine/.** Engine is a reusable framework.
- **Don't import React components in game code.** Use the store.
- **Don't create classes for entities.** Entities are plain objects with components.
- **Don't call `prepare()` directly.** The renderer handles Pretext caching.
- **Don't use `setInterval`/`setTimeout` for game timing.** Use `Cooldown`, `engine.after()`, or `dt`.
- **Don't mutate the world during iteration** without collecting first.
- **Don't store game state in React** — store it on entities or in the zustand store.
- **Don't add built-in systems manually** — `_parent`, `_physics`, `_tween`, `_animation`, `_lifetime`, `_screenBounds` are auto-registered.
- **Don't manually integrate velocity** — `_physics` does `position += velocity * dt` automatically. Writing your own movement system causes double-speed.
