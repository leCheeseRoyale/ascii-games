# Codebase Review — Full Audit

> Generated 2026-04-08 from manual review of all engine/, game/, ui/, shared/ files.

---

## CRITICAL BUGS

### 1. Double velocity integration — entities move at 2x speed
**Files:** `game/systems/movement.ts` + `engine/physics/physics-system.ts:62-65`
**What:** The game registers `movementSystem` which does `position += velocity * dt`. The engine auto-registers `_physics` which ALSO does `position += velocity * dt` (Pass 3). Every entity with position+velocity gets moved **twice per frame**, doubling their effective speed.
**Fix:** Remove `movementSystem` from `game/systems/movement.ts` and from `play.ts` scene setup. The physics system already handles velocity integration.

### 2. Title scene triple-integrates ambient asteroids
**File:** `game/scenes/title.ts:100-103`
**What:** Title scene's `update()` manually does `e.position += e.velocity * dt`. But `_physics` is auto-registered and already does this. Ambient asteroids move at 2x speed on the title screen.
**Fix:** Remove the manual movement loop from `title.ts` update.

### 3. DPR scale accumulates on resize
**File:** `engine/render/ascii-renderer.ts:41-48`
**What:** `resize()` calls `ctx.scale(dpr, dpr)` every time the canvas dimensions change but never resets the transform first. Multiple resize events (window resize, device rotation) compound the scale, making everything progressively larger and blurrier.
**Fix:** Replace `ctx.scale(dpr, dpr)` with `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` to reset before setting.

### 4. Transition midpoint doesn't await async scene load
**Files:** `engine/render/transitions.ts:43` + `engine/core/engine.ts:278`
**What:** `engine.loadScene('play', { transition: 'fade' })` passes an `async () => { await this.scenes.load(...) }` callback to `transition.start()`. But `update()` calls `this.onMidpoint?.()` without awaiting — the transition's "in" phase begins immediately while the scene is still loading asynchronously. Scene setup might not complete before the fade-in reveals the next scene.
**Fix:** Make `Transition.update()` aware of async midpoint, or make scene load synchronous within the transition.

### 5. Scheduler.sequence() cancel only removes first step
**File:** `engine/utils/scheduler.ts:41-49`
**What:** `sequence()` creates N timers but returns only `ids[0]`. The comment says "cancel clears all" but `cancel()` only removes one timer by ID. Cancelling a sequence leaves steps 2..N active.
**Fix:** Use a group ID — tag all timers in a sequence, cancel removes all with that group.

### 6. Destroyed entities re-accessed in collision loop
**File:** `game/systems/collision.ts:35-58, 108-113`
**What:** Bullet-asteroid collision destroys both entities (lines 52-53), but the `asteroids` array was pre-collected. Destroyed asteroids are later iterated in the off-screen cleanup loop (line 108). The guard `if (!asteroid.position) continue` partially helps but accessing properties on removed entities is fragile — miniplex may recycle or invalidate them.
**Fix:** Track destroyed entities in a Set and skip them in subsequent loops, or break out of the asteroid loop after destroying.

---

## MEDIUM BUGS

### 7. playerInputSystem state persists across scenes
**File:** `game/systems/player-input.ts:5-9`
**What:** `shootCooldown`, `lastDirX`, `lastDirY` are module-level variables. They survive scene changes (play -> game-over -> play). The cooldown timer continues from where it left off; aim direction remembers the last direction from the previous run.
**Fix:** Add `init()` hook to reset: `shootCooldown = new Cooldown(...)`, `lastDirX = 0`, `lastDirY = -1`.

### 8. drawTextBlock leaks Canvas state
**File:** `engine/render/ascii-renderer.ts:207-238`
**What:** `drawTextBlock()` sets `ctx.font`, `ctx.fillStyle`, `ctx.textBaseline` without `ctx.save()/ctx.restore()`. Every other draw method (drawAscii, drawSprite, drawImage) properly saves/restores. Text block state leaks to subsequent draw calls.
**Fix:** Add `ctx.save()` at start and `ctx.restore()` at end.

### 9. Camera smoothing is frame-rate dependent
**File:** `engine/render/camera.ts:78-80`
**What:** `lerp(this.x, this.targetX, this.smoothing)` doesn't use `dt`. At 30fps the camera moves half as fast as at 60fps.
**Fix:** Use frame-rate independent smoothing: `1 - Math.pow(1 - this.smoothing, dt * 60)`.

### 10. SystemRunner allows duplicate systems
**File:** `engine/ecs/systems.ts:29-32`
**What:** `add()` pushes unconditionally. If a user calls `engine.addSystem(mySystem)` twice in `setup()`, the system runs twice per frame. No warning.
**Fix:** Check `if (this.systems.some(s => s.name === system.name)) return;` before pushing.

### 11. Circle-rect collision uses rect-rect fallback
**File:** `engine/physics/collision.ts:23-24`
**What:** Mixed circle+rect collisions fall back to rect-rect by converting circle to a bounding rect. This over-reports collisions at corners (false positives).
**Fix:** Implement proper circle-rect intersection (distance from circle center to nearest point on rect).

### 12. Dead computed value in title scene
**File:** `game/scenes/title.ts:106-107`
**What:** `const blink = Math.sin(...) * 0.3 + 0.7` is computed every frame but never used. The comment acknowledges this.
**Fix:** Remove the dead code, or apply it: find the prompt entity and set its `ascii.opacity`.

---

## LOW / QUALITY ISSUES

### 13. ParticleEmitter component unused
**File:** `shared/types.ts:74-82`
**What:** `ParticleEmitter` is defined in the Entity interface but no system processes it. Particles only work via imperative `engine.particles.burst()`.

### 14. `as unknown as string[]` type casts
**Files:** `game/entities/asteroid.ts:13-15`, `game/scenes/title.ts:89`
**What:** `GAME.asteroid.chars as unknown as string[]` needed because config is `as const` (readonly). The `pick()` function should accept `readonly T[]`.

### 15. lerpColor only handles 6-digit hex
**File:** `engine/utils/color.ts:17-28`
**What:** Silently produces wrong results for 3-digit hex (#f00), rgb(), hsl(), or named colors.

### 16. Renderable array allocated every frame
**File:** `engine/render/ascii-renderer.ts:78`
**What:** `const renderables: Renderable[] = []` creates a new array every render. At 60fps with many entities this creates GC pressure.

### 17. Particle render is unoptimized
**File:** `engine/render/particles.ts:86-98`
**What:** Each particle calls save/restore + sets font/fill/alpha individually. For hundreds of particles, batching by font+color would be faster.

### 18. Entity count uses spread
**File:** `game/scenes/play.ts:34`
**What:** `[...engine.world.with("position")].length` spreads all entities into an array just to count them.

### 19. No React error boundary
**File:** `ui/App.tsx`
**What:** If any HUD component throws, the entire app crashes with no recovery.

### 20. High score not persisted
**File:** `ui/store.ts`
**What:** High score resets on page refresh. No localStorage persistence.

### 21. Resize listener stored as `any`
**File:** `engine/core/engine.ts:97`
**What:** `(this as any)._onResize = onResize` — fragile pattern, no type safety.

---

## OPTIMIZATIONS

| Area | Current | Improvement |
|------|---------|-------------|
| Renderable sorting | New array + sort every frame | Reuse array, insertion sort (nearly sorted each frame) |
| Particle rendering | Per-particle save/restore | Batch by font+color, single state set per batch |
| Collision queries | `[...world.with(...)]` + filter by tag | Dedicated archetypes or cached query results |
| Entity count | Spread to array for `.length` | Use `world.with("position").entities.length` if miniplex exposes it |
| Camera lerp | Frame-rate dependent | Use dt-based exponential smoothing |
| Text layout cache | Unbounded Map growth | Add LRU or size cap to pretext caches |

---

## FEATURE SUGGESTIONS

### Tier 1 — High Impact, Small Complexity

#### Entity tag helpers
```ts
// Current (verbose)
const player = engine.world.with('position', 'tags')
  .where(e => e.tags.values.has('player')).first

// Proposed
const player = engine.findByTag('player')
const enemies = engine.findAllByTag('enemy')
```
**Why:** Every game needs entity lookup. The current pattern is 2 lines of boilerplate.

#### Volume/mute control
```ts
engine.audio.volume = 0.5   // master volume 0-1
engine.audio.muted = true   // toggle all sound
sfx.shoot()                 // automatically respects volume
```
**Why:** Every shipped game needs volume control. Currently impossible without modifying engine code.

#### Particle presets
```ts
engine.particles.explosion(x, y, { color: '#ff4400' })
engine.particles.sparkle(x, y, '#ffff00')
engine.particles.floatingText(x, y, '+100', '#00ff88')
engine.particles.trail(entity, { color: '#44ffff', rate: 20 })
```
**Why:** The current `burst()` API requires 6+ parameters. Presets cover 90% of use cases.

#### Process the ParticleEmitter component
```ts
engine.spawn({
  position: { x: 400, y: 300 },
  velocity: { vx: 0, vy: -100 },
  emitter: { rate: 20, char: '*', color: '#ff0', speed: 50, spread: Math.PI, lifetime: 0.5 }
})
// Particles auto-emit from this entity's position each frame
```
**Why:** The component type already exists but does nothing. Wiring it up adds continuous particle effects (trails, exhausts, auras) declaratively.

### Tier 2 — High Impact, Medium Complexity

#### State machine component
```ts
import { defineStateMachine } from '@engine'

const enemyFSM = defineStateMachine({
  initial: 'patrol',
  states: {
    patrol: {
      update(entity, engine, dt) { /* walk back and forth */ },
      on: { seePlayer: 'chase' }
    },
    chase: {
      update(entity, engine, dt) { /* move toward player */ },
      on: { losePlayer: 'patrol', closeEnough: 'attack' }
    },
    attack: {
      enter(entity, engine) { sfx.hit() },
      update(entity, engine, dt) { /* attack animation */ },
      on: { attackDone: 'chase' }
    }
  }
})

// In system: engine.fsm.transition(entity, 'seePlayer')
```
**Why:** Enemy AI, player states, menu states — every non-trivial game needs FSMs. Currently devs have to build this from scratch with if/else chains.

#### Debug overlay
```ts
engine.debug = true
// Renders: collider outlines (green circles/rects), entity position dots,
// velocity arrows, FPS/entity count, system execution time bars
```
**Why:** Invisible colliders are the #1 frustration when building games. Toggle-able debug rendering is essential for development.

#### Gamepad support
```ts
if (engine.gamepad.connected) {
  const stick = engine.gamepad.stick('left')  // { x: -1..1, y: -1..1 }
  e.velocity.vx = stick.x * speed
  e.velocity.vy = stick.y * speed
  if (engine.gamepad.pressed('A')) engine.spawn(createBullet(...))
}
```
**Why:** Gamepad API is simple to wrap but tedious to implement per-game. First-class support makes the engine more versatile.

#### Save/Load world state
```ts
const snapshot = engine.serialize()  // JSON-safe world state
localStorage.setItem('save', JSON.stringify(snapshot))

// Later:
engine.deserialize(JSON.parse(localStorage.getItem('save')!))
```
**Why:** Persistence is a common game need. Serializing ECS entities is straightforward since they're plain objects (except Set and HTMLImageElement).

### Tier 3 — Medium Impact, Large Complexity

#### Pathfinding on GridMap
```ts
import { astar } from '@engine'
const path = astar(grid, start, end, { diagonal: true })
// Returns: { col, row }[] or null
```
**Why:** Roguelikes, strategy games, tower defense all need pathfinding. GridMap already exists — A* is the natural complement.

#### Tilemap renderer
```ts
const tilemap = engine.createTilemap(grid, {
  tileSize: 24,
  tiles: { '#': { char: '#', color: '#888' }, '.': { char: '.', color: '#333' } }
})
// Renders efficiently with camera culling — only visible tiles drawn
```
**Why:** Large grid-based games need efficient tile rendering. Currently you'd spawn thousands of entities.

#### Dialog/cutscene system
```ts
engine.dialog.show([
  { speaker: 'NPC', text: 'Welcome, traveler.', speed: 0.03 },
  { speaker: 'NPC', text: 'The dungeon awaits...', speed: 0.03 },
], { style: 'typewriter', position: 'bottom' })
```
**Why:** RPGs and narrative games need dialog boxes. Typewriter effect + pretext text layout is a natural fit.

---

## PRETEXT USAGE REVIEW

The engine's pretext integration (`engine/render/text-layout.ts`) is **correct and well-implemented**:

- `prepare()` results are properly cached by text+font key (lines 32-39, 42-50)
- `layout()` is used for the cheap height measurement (line 76)
- `layoutWithLines()` is used for fixed-width layout (line 112)
- `layoutNextLine()` is used for variable-width obstacle flow (line 168) — this is the correct API for per-line width variation
- `walkLineRanges()` is used for line counting and shrinkwrap (lines 84, 96) — correct v0.0.4 API
- Cache keys use `font + "\x00" + text` separator (line 29) — clean
- No use of `measureLineStats()` (correct — it doesn't exist in v0.0.4)
- Font strings match CSS format requirements

**One concern:** The caches (`fastCache`, `segCache`) grow unboundedly. If a game generates dynamic text (scores, timers, dialog), the caches will grow forever. Consider adding an LRU cap or periodic cleanup tied to scene changes.
