# Engine Code Issues

Issues found in `engine/` — core framework, rendering, physics, input, ECS, and utilities.

---

## Critical

### E1. Async scene load not awaited in transition midpoint
**File:** `engine/core/engine.ts:261–269`, `engine/render/transitions.ts:43`

`loadScene()` with a transition passes an `async` callback to `transition.start()`, but `Transition.update()` calls it as `this.onMidpoint?.()` — the returned Promise is discarded. The scene's async `setup()` (which may `await engine.preloadImages()`) runs unwaited while the "in" phase starts immediately. Result: missing images on first frames, world in partial setup during fade-in.

**Fix:** `Transition` needs to await the midpoint callback and pause the "in" phase until it resolves.

---

### E2. `SceneManager.load()` clears the world before confirming the next scene exists
**File:** `engine/core/scene.ts:34–44`

```ts
if (this.current) {
  this.current.cleanup?.(engine)
  engine.systems.clear(engine)
  engine.world.clear()          // world nuked
}
const scene = this.scenes.get(name)
if (!scene) throw new Error(...)  // error AFTER world cleared
```

If `name` is not registered, the current scene is destroyed and the engine enters an unrecoverable state — no scene, empty world, no systems.

**Fix:** Check if the scene exists before tearing down the current one.

---

## High

### E3. Wipe transition "in" phase rect math is inverted
**File:** `engine/render/transitions.ts:84–86`

During the reveal phase (`t`: 0 to 1):
```ts
ctx.fillRect(width * (1 - t), 0, width * t, height)
```
At `t=1` this covers the entire screen. The black bar grows instead of shrinking — the scene is never revealed.

**Fix:** `ctx.fillRect(0, 0, width * (1 - t), height)`

---

### E4. `toRect()` in collision uses `width` for both dimensions
**File:** `engine/physics/collision.ts:52`

```ts
collider: { type: 'rect', width: c.collider.width, height: c.collider.width }
```

Should be `height: c.collider.height`. Copy-paste bug — non-square colliders get wrong AABB.

---

### E5. `drawTextBlock` missing `ctx.save()`/`ctx.restore()`
**File:** `engine/render/ascii-renderer.ts:195–217`

All other draw methods save/restore context state. `drawTextBlock` sets `ctx.font`, `ctx.fillStyle`, and `ctx.textBaseline` without wrapping, leaking state into subsequent draw calls in the same frame.

---

### E6. `sequence()` cancel only cancels first step
**File:** `engine/utils/scheduler.ts:41–49`

```ts
return ids[0] // comment says "cancel clears all" — it doesn't
```

`cancel(id)` removes one timer by ID. Cancelling the returned ID leaves all subsequent steps scheduled. Only `scheduler.clear()` (scene change) clears them all.

**Fix:** Return a composite cancel that removes all step IDs.

---

### E7. Camera lerp is frame-rate dependent
**File:** `engine/render/camera.ts:78–80`

```ts
this.x = lerp(this.x, this.targetX, this.smoothing)
```

`dt` is passed to `update()` but never used in the lerp. A constant smoothing factor (e.g. 0.1) gives different behavior at different frame rates. With the fixed-timestep loop this is mostly stable, but accumulator catch-up frames will run `update` multiple times, making the camera snappier during lag spikes.

**Fix:** `lerp(this.x, this.targetX, 1 - Math.pow(1 - this.smoothing, dt * 60))`

---

### E8. Camera shake applied before zoom — shake doesn't scale with zoom
**File:** `engine/render/ascii-renderer.ts:64–71`, `engine/render/camera.ts:56–63`

Shake offset is added in pre-zoom screen space. At high zoom levels, shake becomes imperceptibly small. `screenToWorld` also doesn't account for this correctly — the inverse transform is inconsistent with the forward transform.

---

### E9. No deduplication guard in `SystemRunner.add()`
**File:** `engine/ecs/systems.ts:29`

If a scene's `setup()` calls `engine.addSystem(physicsSystem)` (not knowing it's auto-registered), the system runs twice per frame. No name-based dedup check exists.

**Fix:** `if (this.systems.some(s => s.name === system.name)) return`

---

### E10. `grounded` flag stale on entities with physics but no collider
**File:** `engine/physics/physics-system.ts:67–99`

Pass 4 (which writes `p.grounded`) only runs for entities with `collider`. An entity with `physics` but no `collider` retains whatever `grounded` value was last set, forever.

---

### E11. DPR scale risk on repeated resize
**File:** `engine/render/ascii-renderer.ts:41–48`

Setting `canvas.width`/`height` resets the context transform. The subsequent `ctx.scale(dpr, dpr)` re-applies it. This is correct on each resize, but the constructor calls `resize()` before the canvas is in the DOM (0x0 dimensions), and if the first real resize doesn't change dimensions from 0x0, the scale is missed.

**Fix:** Use `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` instead of `ctx.scale()` for an absolute (non-cumulative) transform.

---

## Medium

### E12. Animation only advances one frame per tick regardless of excess time
**File:** `engine/ecs/animation-system.ts:12–15`

When `dt` exceeds multiple frame durations (e.g. tab backgrounded, 100ms dt clamp), only one frame advances per tick. The excess carries over but animations appear to run slower during lag.

---

### E13. Module-level `nextId` in scheduler shared across instances
**File:** `engine/utils/scheduler.ts:21`

`let nextId = 0` is module-scoped. Multiple `Scheduler` instances (tests, multiple engines) share IDs. Cancel from one could theoretically collide with another.
