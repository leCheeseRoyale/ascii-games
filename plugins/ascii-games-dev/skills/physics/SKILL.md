---
name: physics
description: Use when editing files under `engine/physics/`, tuning movement or collision behavior, working with velocity/acceleration/gravity/friction/drag/bounce/maxSpeed, configuring collider shapes or collision groups/masks, debugging spatial hash performance, setting up `engine.onCollide()` handlers, using `collider: "auto"` with text measurement, spring physics for `spawnText`/`spawnSprite`, `createCursorRepelSystem`, `createAmbientDriftSystem`, `SpatialHash`, `overlaps()`, `pairsFromHash()`, or diagnosing NaN recovery, double-speed movement, or collision detection issues.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Physics and collision subsystem

This skill covers all physical simulation — forces, integration, collision detection, springs, and interactive text physics. **For `collider: "auto"` and per-character physics text, also invoke the globally installed `pretext` skill** — it documents the text measurement that computes collider dimensions and character home positions.

## Why this architecture

The engine uses **simple Euler integration** rather than Verlet or RK4. Why:
- Sufficient for ASCII games at 60fps (small dt means low energy drift)
- Predictable: `position += velocity * dt` is easy to reason about
- NaN recovery catches pathological states from user code bugs

Collision uses a **spatial hash broad phase** + narrow-phase shape tests. No built-in collision response (no bounce/slide/push-apart). Why:
- ASCII games have diverse collision semantics (damage on touch, pickup on overlap, wall blocking)
- Response is game-specific — the engine provides detection, the game decides what happens
- Spatial hash gives O(n) broad phase vs O(n²) brute force, critical above ~50 entities

## Source files

| File | What it owns |
|---|---|
| `engine/physics/physics-system.ts` | Velocity integration, gravity, friction, drag, maxSpeed, NaN recovery, boundary bounce |
| `engine/physics/collision.ts` | Shape overlap tests (circle-circle, rect-rect, circle-rect), collision group/mask filtering, `overlapAll()` |
| `engine/physics/spatial-hash.ts` | `SpatialHash` class, `pairsFromHash()` generator for duplicate-free pair iteration |

## Physics system execution order (per frame)

The built-in `_physics` system runs at `SystemPriority.physics` (20). Within one frame:

```
Pass 1: Acceleration → velocity    (for entities with position + velocity + acceleration)
         velocity += acceleration * dt

Pass 2: Physics forces              (for entities with position + velocity + physics)
         gravity:   vy += gravity * dt
         friction:  vx *= max(0, 1 - friction * dt)     [only when physics.grounded === true]
         drag:      vx *= max(0, 1 - drag * dt)         [both axes, always active]
                    vy *= max(0, 1 - drag * dt)
         maxSpeed:  if speed² > maxSpeed² → scale velocity to maxSpeed (preserves direction)

Pass 3: Position integration
         position.x += velocity.vx * dt
         position.y += velocity.vy * dt

Pass 3b: NaN recovery
         if any position/velocity component is non-finite → reset to 0, log error + debug toast

Pass 4: Boundary bounce             (for entities with physics.bounce > 0 + collider)
         if entity exits world bounds → clamp position, reverse + scale velocity by bounce coefficient
         bottom wall hit → sets physics.grounded = true
```

**Why this order matters:**
- Acceleration applied before forces so gravity stacks correctly
- Forces applied before integration so clamping is effective
- NaN recovery after integration catches bugs before they propagate
- Boundary bounce after integration catches escaped entities

## Physics component properties

```typescript
physics: {
  gravity?: number,    // downward acceleration (positive = down in screen coords)
  friction?: number,   // ground-only vx damping (multiplicative per frame)
  drag?: number,       // air resistance on both axes (multiplicative per frame)
  maxSpeed?: number,   // velocity magnitude cap
  bounce?: number,     // world-bounds energy coefficient (0-1, where 1 = perfect bounce)
  grounded?: boolean,  // auto-set on bottom wall hit; used by friction
}
```

**Why multiplicative damping?** `vx *= (1 - friction * dt)` decays exponentially, which feels natural and is frame-rate independent. Absolute subtraction (`vx -= friction * dt`) causes jitter at low speeds.

## Collision detection

### Shape overlap tests

`overlaps(a, b)` in `engine/physics/collision.ts` dispatches by collider type:

| Pair | Algorithm | Performance |
|---|---|---|
| Circle-Circle | Squared distance < squared radius sum | O(1), no sqrt |
| Rect-Rect | AABB intersection (4 axis projections) | O(1) |
| Circle-Rect | Clamp circle center to rect bounds, check distance | O(1) |

### Collision groups and masks

Before shape tests, `overlaps()` checks bitmask filtering:

```typescript
collider: {
  type: 'circle' | 'rect',
  width: number,
  height: number,
  group: number,    // identity bits (default 1)
  mask: number,     // which groups to collide with (default 0xffffffff = all)
}
```

Early-out if `(a.group & b.mask) === 0 || (b.group & a.mask) === 0`. This lets you define collision layers (player=1, enemy=2, bullet=4, wall=8) and control which pairs interact.

**Why bitmask instead of named layers?** Bitmasks are a single integer comparison — zero allocation, zero lookup. 32 layers is more than enough for ASCII games.

### Spatial hash

`SpatialHash<T>` in `engine/physics/spatial-hash.ts` partitions the world into a grid of cells for O(1) neighbor queries.

```typescript
const hash = new SpatialHash(64)   // 64px cells
hash.rebuild(entities)              // clear + insert all

// Query neighbors
const nearby = hash.queryPoint(x, y)         // center cell + 8 neighbors
const inArea = hash.queryRect(x, y, w, h)    // all cells overlapped by rect
const inRange = hash.queryCircle(x, y, r)    // bounding-box approximation
```

**Insert methods:**
- `insert(entity)` — single-cell, fast. Use for small entities (< cellSize).
- `insertWithBounds(entity, width, height)` — multi-cell. Use for large entities (>= cellSize) to avoid missing them at cell boundaries.

**Pair iteration:** `pairsFromHash(hash)` yields all candidate collision pairs **without duplicates**:
- Within-cell pairs: all combinations in each cell
- Cross-cell pairs: only "forward" neighbors (right, down-left, down, down-right) to avoid (a,b)/(b,a) duplication
- Deduplication Set for multi-cell entities (from `insertWithBounds`)

### engine.onCollide()

```typescript
const unsub = engine.onCollide('player', 'enemy', (player, enemy) => {
  player.damage = { amount: 1 }
})
```

**Lazy creation:** The first `onCollide()` call creates and registers the `_collisionEvents` system. If you never call `onCollide()`, no collision detection runs — zero overhead.

**Why lazy?** Collision detection is CPU-expensive (spatial hash rebuild + pair iteration + overlap tests). Many games (board games, puzzles) don't need it.

## `collider: "auto"` and text measurement

When an entity has `collider: "auto"`:
1. At spawn time, the `_measure` system measures the entity's text dimensions via Pretext
2. Creates a rect collider sized to the measured text
3. Updates each frame if text changes (e.g., score display)

**This bridges rendering and physics** — the collider matches what you see on screen. For the measurement internals, see the **`pretext` skill**.

## Spring physics

Entities with a `spring` component are pulled toward a home position by the `_spring` built-in system (priority 15, runs before physics):

```typescript
spring: {
  homeX: number,
  homeY: number,
  stiffness: number,   // spring constant (higher = snappier return)
  damping: number,     // energy dissipation (higher = less oscillation)
}
```

The spring applies a force: `acceleration = (home - position) * stiffness - velocity * damping`.

**Spring presets** for `engine.spawnText()` / `engine.spawnSprite()`:

| Preset | Feel | Use case |
|---|---|---|
| `SpringPresets.stiff` | Tight, minimal overshoot | UI text that snaps back |
| `SpringPresets.snappy` | Quick with slight bounce | Button labels, interactive elements |
| `SpringPresets.bouncy` | Significant overshoot | Playful titles, rewards |
| `SpringPresets.smooth` | Slow, damped return | Background text, ambient |
| `SpringPresets.floaty` | Very slow, drifty | Atmospheric elements |
| `SpringPresets.gentle` | Moderate, soft feel | General-purpose |

## Interactive text helpers

### Cursor repel

```typescript
engine.addSystem(createCursorRepelSystem({
  radius: 120,    // repel radius in pixels
  force: 800,     // repel strength
  query: ['spring'],  // which entities to affect (default: entities with spring)
}))
```

Applies a force away from mouse position to nearby entities. Combined with spring-to-home, characters scatter on hover and reform when the cursor leaves.

### Ambient drift

```typescript
engine.addSystem(createAmbientDriftSystem({
  strength: 20,    // drift magnitude
  frequency: 0.5,  // change direction interval
}))
```

Applies small random velocity nudges for organic background motion.

**Both of these create per-character physics effects on `spawnText`/`spawnSprite` entities.** The measurement that places characters comes from Pretext — see the **`pretext` skill** for details on how home positions are computed.

## Common physics tuning patterns

| Want | Set |
|---|---|
| Floaty space movement | `drag: 0.3`, no gravity, no friction |
| Snappy ground movement | `friction: 8`, `drag: 0`, `gravity: 600` |
| Bouncy ball | `bounce: 0.8`, `gravity: 400` |
| Bullet (no drag) | velocity only, no physics component |
| Top-down RPG | `friction: 12`, no gravity (screen is overhead view) |
| Speed cap | `maxSpeed: 200` (clamps velocity magnitude, preserves direction) |

## Performance characteristics

| Operation | Complexity |
|---|---|
| Spatial hash insert (single-cell) | O(1) |
| Spatial hash insert (multi-cell, N cells) | O(N) |
| queryPoint | O(1) — fixed 9 cells |
| queryRect (M×M cells) | O(M²) |
| Rebuild (n entities) | O(n) |
| pairsFromHash (k pairs) | O(k) with dedup |
| **Overall vs brute-force** | **O(n) vs O(n²)** — hash wins above ~50 colliders |

**Cell size tuning:** Default 64px. Set to roughly 2× the average entity size. Too small → entities span many cells (expensive inserts). Too large → cells contain many entities (slow queries).

## Things NOT to do

- **Don't integrate velocity manually.** `_physics` does `position += velocity * dt`. Custom integration causes double-speed movement.
- **Don't assume collision response.** `overlaps()` is detection only — you must write the response (damage, bounce, pickup, block).
- **Don't rebuild the spatial hash every frame in game code.** The engine's collision system handles this. Only use SpatialHash directly for custom spatial queries.
- **Don't set `physics.grounded = true` manually** unless you have a custom ground detection system. Boundary bounce sets it automatically.
- **Don't use `bounce` for entity-entity collision** — it only works for world-bounds bouncing. Entity-entity bounce needs custom response code.

## When to read further

- Text measurement for collider:auto → invoke the **`pretext` skill**
- Per-character physics text → invoke the **`pretext` skill** + see `engine.spawnText()` in `engine/core/engine.ts`
- Collision callbacks → `engine.onCollide()` in `engine/core/engine.ts`
- Adding feedback on collision → invoke **`/ascii-games-dev:juice`**
