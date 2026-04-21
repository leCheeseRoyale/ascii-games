# Physics, Input, and Audio Systems

Complete reference for the engine's physics simulation, input handling, and audio playback. Covers the built-in systems, component types, real-world patterns from the game templates, and step-by-step extension workflows.

---

## Table of Contents

- [Physics System](#physics-system)
  - [The Built-in `_physics` System](#the-built-in-_physics-system)
  - [Component Types](#component-types)
  - [Collision Detection](#collision-detection)
  - [Spatial Hash for Performance](#spatial-hash-for-performance)
  - [Screen Bounds System](#screen-bounds-system)
  - [Physics Gotchas](#physics-gotchas)
- [Physics Patterns](#physics-patterns)
  - [Top-Down Movement (Asteroid-Field Style)](#top-down-movement-asteroid-field-style)
  - [Platformer Physics (Gravity, Jumping, Ground Detection)](#platformer-physics-gravity-jumping-ground-detection)
  - [Grid-Based / Turn-Based Movement (Roguelike Style)](#grid-based--turn-based-movement-roguelike-style)
  - [Bullet / Projectile Patterns](#bullet--projectile-patterns)
  - [Knockback and Force Application](#knockback-and-force-application)
- [Input System](#input-system)
  - [Keyboard](#keyboard)
  - [Mouse](#mouse)
  - [Gamepad](#gamepad)
  - [Touch and Gestures](#touch-and-gestures)
  - [Input Bindings](#input-bindings)
  - [Virtual Controls](#virtual-controls)
- [Input Patterns](#input-patterns)
  - [Player Movement (WASD + Arrows)](#player-movement-wasd--arrows)
  - [Menu Navigation](#menu-navigation)
  - [Action / Confirm / Cancel Mapping](#action--confirm--cancel-mapping)
  - [Input During Different Game States](#input-during-different-game-states)
- [Audio System](#audio-system)
  - [Audio Engine API](#audio-engine-api)
  - [Sound Effects](#sound-effects)
  - [Music Playback](#music-playback)
  - [Volume and Mute Control](#volume-and-mute-control)
  - [Audio Events Integration](#audio-events-integration)
- [Extension Workflows](#extension-workflows)
  - [1. Adding a New Collision Shape](#1-adding-a-new-collision-shape)
  - [2. Creating a Custom Physics Behavior (Gravity Wells)](#2-creating-a-custom-physics-behavior-gravity-wells)
  - [3. Adding a New Input Device / Method](#3-adding-a-new-input-device--method)
  - [4. Creating an Input Binding Scheme](#4-creating-an-input-binding-scheme)
  - [5. Adding Positional Audio](#5-adding-positional-audio)

---

## Physics System

### The Built-in `_physics` System

The `_physics` system is one of eight auto-registered built-in systems. It runs automatically at `SystemPriority.physics` (priority 20) every frame. You never need to add it manually.

It executes four passes each frame:

**Pass 1 -- Acceleration to velocity.** For all entities with `position` + `velocity` + `acceleration`:
```
velocity.vx += acceleration.ax * dt
velocity.vy += acceleration.ay * dt
```

**Pass 2 -- Physics forces.** For entities with `position` + `velocity` + `physics`:
- **Gravity**: adds `physics.gravity * dt` to `velocity.vy`.
- **Friction**: multiplies `velocity.vx` by `(1 - friction * dt)`. Only applies when `physics.grounded` is not explicitly `false`.
- **Drag**: multiplies both `velocity.vx` and `velocity.vy` by `(1 - drag * dt)`. Air resistance on both axes.
- **maxSpeed**: clamps the velocity magnitude to `physics.maxSpeed` if set.

**Pass 3 -- Velocity to position (integration).** For all entities with `position` + `velocity`:
```
position.x += velocity.vx * dt
position.y += velocity.vy * dt
```

**Pass 3b -- NaN detection.** If any position or velocity component becomes `NaN` or `Infinity`, it is reset to `0` and an error appears in the debug overlay and console.

**Pass 4 -- World-bounds bounce.** For entities with `position` + `velocity` + `physics` + `collider` where `physics.bounce > 0`, the entity bounces off the canvas edges. When bouncing off the bottom edge, `physics.grounded` is set to `true`.

> **CRITICAL**: Do not integrate velocity manually. The `_physics` system already handles `position += velocity * dt`. Writing this in a custom system causes double-speed movement. This is the single most common bug in AI-generated code for this engine.

### Component Types

All component shapes are defined in `shared/types.ts`.

#### Position
```ts
interface Position {
  x: number;
  y: number;
}
```
World-space coordinates in pixels. Origin is top-left of the canvas.

#### Velocity
```ts
interface Velocity {
  vx: number;  // pixels per second, horizontal
  vy: number;  // pixels per second, vertical
}
```
Set velocity and let `_physics` move the entity. Positive `vx` = rightward, positive `vy` = downward.

#### Acceleration
```ts
interface Acceleration {
  ax: number;  // pixels/s^2, horizontal
  ay: number;  // pixels/s^2, vertical
}
```
Constant acceleration applied to velocity each frame. Useful for thrust-based movement.

#### Physics
```ts
interface Physics {
  gravity?: number;    // pixels/s^2 added to vy (default 0)
  friction?: number;   // 0-1, ground friction on vx (default 0)
  drag?: number;       // 0-1, air resistance on both axes (default 0)
  bounce?: number;     // 0-1, velocity retention on bounce (0 = none, 1 = perfect)
  maxSpeed?: number;   // max velocity magnitude
  mass?: number;       // for future collision response (default 1)
  grounded?: boolean;  // set by system when entity is on ground
}
```
The `physics` component enables additional forces on top of basic velocity integration. An entity with only `position` + `velocity` (no `physics`) still moves -- it just has no gravity, friction, or drag.

#### Collider
```ts
interface Collider {
  type: "circle" | "rect";
  width: number;
  height: number;
  sensor?: boolean;
}
```
Used for collision detection (overlap checks) and world-bounds bounce. For circles, `width` is the diameter. `sensor` is a flag for game logic (the engine does not treat sensors specially -- you check it yourself).

#### Screen Boundary Components
```ts
interface ScreenWrap { margin?: number; }
interface ScreenClamp { padding?: number; }
interface OffScreenDestroy { margin?: number; }
```
These are processed by the `_screenBounds` system (priority 80). Attach one to an entity to get automatic boundary behavior.

### Collision Detection

Collision detection is intentionally simple: overlap checks with no physics response. The engine provides two functions and three detection modes.

#### `overlaps(a, b): boolean`
Returns `true` if two entities' colliders overlap. Handles all three combinations:
- **circle-circle**: distance between centers < sum of radii.
- **rect-rect**: axis-aligned bounding box intersection.
- **circle-rect**: finds the closest point on the rect to the circle center, then checks distance < radius.

Both entities must have `position` and `collider` components. Order does not matter (`overlaps(a, b)` equals `overlaps(b, a)`).

```ts
import { overlaps } from "@engine";

// In a collision system:
for (const bullet of bullets) {
  for (const enemy of enemies) {
    if (overlaps(bullet, enemy)) {
      engine.destroy(bullet);
      enemy.health.current -= 10;
    }
  }
}
```

#### `overlapAll(entity, others): T[]`
Returns all entities from `others` that overlap with `entity`. Excludes the entity itself if present in the list.

```ts
import { overlapAll } from "@engine";

const player = engine.findByTag("player")!;
const enemies = [...engine.world.with("position", "collider", "tags")]
  .filter(e => e.tags.values.has("enemy"));
const hits = overlapAll(player, enemies);
for (const enemy of hits) {
  // handle each collision
}
```

#### Collision Handling Options
For full control, write a custom system that calls `overlaps()` and handles the result -- this lets you do custom filtering, multi-step responses, etc. Alternatively, `engine.onCollide(tagA, tagB, callback)` provides a declarative one-liner that fires on the first overlap frame per pair and returns an unsubscribe function. Choose whichever fits your game's complexity.

### Spatial Hash for Performance

For games with many colliders (50+), brute-force `overlaps()` calls become O(n^2). The `SpatialHash` class provides O(1) neighbor lookups.

```ts
import { SpatialHash, pairsFromHash, overlaps } from "@engine";

// Create once, rebuild each frame
const hash = new SpatialHash<any>(64); // 64px cells

// In your collision system:
hash.rebuild([...engine.world.with("position", "collider")]);

// Iterate unique candidate pairs (no duplicates)
for (const [a, b] of pairsFromHash(hash)) {
  if (overlaps(a, b)) {
    handleCollision(a, b);
  }
}
```

Key operations:
- `hash.rebuild(entities)`: clear and re-insert all entities (O(n)).
- `hash.insert(entity)`: single-entity insert.
- `hash.insertWithBounds(entity, width, height)`: insert into all cells the bounding box overlaps. Use for large entities.
- `hash.queryPoint(x, y)`: entities in the same cell + 8 neighbors.
- `hash.queryRect(x, y, w, h)`: entities in all cells the rect covers.
- `hash.queryCircle(x, y, radius)`: conservative -- uses the bounding rect of the circle.
- `hash.remove(entity)`: remove a specific entity.
- `pairsFromHash(hash)`: generator that yields unique `[T, T]` pairs across within-cell and cross-cell neighbors.

Note: `queryRect` and `queryCircle` return candidates that may include false positives at cell boundaries. Always do a precise `overlaps()` check on the results.

### Screen Bounds System

The `_screenBounds` system runs at priority 80 (last among built-ins). It handles three behaviors via dedicated components.

#### Screen Wrap
Teleports the entity to the opposite edge when it leaves the canvas.
```ts
engine.spawn({
  position: { x: 100, y: 100 },
  velocity: { vx: 200, vy: 0 },
  screenWrap: { margin: 20 }, // wrap 20px beyond the edge
});
```
The margin adds a buffer beyond the edge before wrapping occurs. Default is 0.

#### Screen Clamp
Constrains the entity's position to stay within the canvas.
```ts
engine.spawn({
  position: { x: 100, y: 100 },
  velocity: { vx: 0, vy: 0 },
  screenClamp: { padding: 10 }, // stay 10px from each edge
});
```

#### Off-Screen Destroy
Automatically destroys the entity when it leaves the canvas.
```ts
engine.spawn({
  position: { x: 100, y: 100 },
  velocity: { vx: 0, vy: -500 },
  offScreenDestroy: { margin: 50 }, // 50px beyond the edge
});
```
Ideal for bullets, particles, and other short-lived projectiles.

### Physics Gotchas

1. **Do not integrate velocity manually.** The `_physics` system does `position += velocity * dt`. If you also write this in a custom system, entities move at double speed.

2. **Do not mutate the world during iteration.** Collect entities first, then destroy:
   ```ts
   // WRONG:
   for (const e of engine.world.with("health")) {
     if (e.health.current <= 0) engine.destroy(e); // mutates mid-iteration
   }

   // CORRECT:
   const dead = [...engine.world.with("health")].filter(e => e.health.current <= 0);
   for (const e of dead) engine.destroy(e);
   ```

3. **NaN recovery.** The physics system detects `NaN`/`Infinity` in position and velocity, resets them to 0, and logs an error. This prevents a single bad calculation from breaking the game. However, investigate the root cause -- common triggers are dividing by zero velocity magnitude or applying force to an entity after it was destroyed.

4. **System ordering.** Custom systems default to priority 0, which runs before all built-ins. If your system reads positions that `_physics` just updated, set its priority to `SystemPriority.physics + 1` (21):
   ```ts
   import { defineSystem, SystemPriority } from "@engine";
   export const collisionSystem = defineSystem({
     name: "collision",
     priority: SystemPriority.physics + 1, // runs after physics
     update(engine) { /* ... */ },
   });
   ```

5. **Friction only applies horizontally.** `physics.friction` multiplies `vx` only (ground friction). For air resistance on both axes, use `physics.drag`.

6. **Grounded detection via bounce.** The physics system sets `physics.grounded = true` when an entity bounces off the bottom edge. For platformers with custom platforms, you must manage `grounded` yourself in a platform-collision system.

---

## Physics Patterns

### Top-Down Movement (Asteroid-Field Style)

In the asteroid-field template, the player moves freely in all directions with no gravity. Movement is velocity-based: the input system sets velocity directly each frame.

Entity factory (`games/asteroid-field/entities/player.ts`):
```ts
export function createPlayer(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    ascii: { char: "@", font: FONTS.large, color: "#00ff88" },
    collider: { type: "circle", width: 20, height: 20 },
    health: { current: 3, max: 3 },
  };
}
```
No `physics` component -- just `position` + `velocity`. The `_physics` system integrates velocity into position automatically.

Input system (`games/asteroid-field/systems/player-input.ts`):
```ts
update(engine, dt) {
  const kb = engine.keyboard;
  for (const e of engine.world.with("position", "velocity", "player")) {
    let dx = 0, dy = 0;
    if (kb.held("KeyW") || kb.held("ArrowUp"))    dy -= 1;
    if (kb.held("KeyS") || kb.held("ArrowDown"))   dy += 1;
    if (kb.held("KeyA") || kb.held("ArrowLeft"))   dx -= 1;
    if (kb.held("KeyD") || kb.held("ArrowRight"))  dx += 1;

    // Normalize diagonal movement
    if (dx !== 0 && dy !== 0) {
      const inv = 1 / Math.SQRT2;
      dx *= inv;
      dy *= inv;
    }

    e.velocity.vx = dx * 200; // speed in px/s
    e.velocity.vy = dy * 200;
  }
}
```

Key points:
- Set `velocity` -- never modify `position` directly.
- Normalize diagonal input so the player does not move faster at 45 degrees.
- Screen wrapping is handled manually in this template (checking bounds and teleporting). You could replace it with a `screenWrap` component.

Asteroids drift with constant velocity and no physics forces:
```ts
export function createAsteroid(x: number, y: number, vx: number, vy: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx, vy },
    collider: { type: "circle", width: 16, height: 16 },
    tags: { values: new Set(["asteroid"]) },
  };
}
```

### Platformer Physics (Gravity, Jumping, Ground Detection)

The platformer template uses the `physics` component for gravity and friction.

Entity factory (`games/platformer/entities/player.ts`):
```ts
export function createPlayer(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    ascii: { char: "@", font: FONTS.large, color: "#00ff88" },
    collider: { type: "circle", width: 20, height: 20 },
    physics: { gravity: 800, friction: 0.85 },
    tags: { values: new Set(["player"]) },
  };
}
```

`gravity: 800` adds 800 px/s^2 downward each frame. `friction: 0.85` dampens horizontal velocity when grounded.

Input system (`games/platformer/systems/player-input.ts`):
```ts
update(engine) {
  for (const e of engine.world.with("position", "velocity", "physics", "tags")) {
    if (!e.tags.values.has("player")) continue;

    // Horizontal: set vx directly each frame
    e.velocity.vx = 0;
    if (engine.keyboard.held("KeyA") || engine.keyboard.held("ArrowLeft"))
      e.velocity.vx = -200;
    if (engine.keyboard.held("KeyD") || engine.keyboard.held("ArrowRight"))
      e.velocity.vx = 200;

    // Jump: only when grounded
    if (e.physics.grounded && engine.keyboard.pressed("Space")) {
      e.velocity.vy = -400; // negative = upward
      e.physics.grounded = false;
    }
  }
}
```

Platform collision system (`games/platformer/systems/platform-collision.ts`):
```ts
update(engine) {
  const platforms = [...engine.world.with("position", "collider", "tags")]
    .filter(e => e.tags.values.has("platform"));

  for (const player of engine.world.with("position", "velocity", "physics", "collider", "tags")) {
    if (!player.tags.values.has("player")) continue;

    let grounded = false;
    const pBottom = player.position.y + player.collider.height / 2;

    // Ground line
    if (pBottom >= groundY) {
      player.position.y = groundY - player.collider.height / 2;
      player.velocity.vy = 0;
      grounded = true;
    }

    // Platform landing (only when falling)
    if (player.velocity.vy >= 0) {
      for (const plat of platforms) {
        const platTop = plat.position.y - plat.collider.height / 2;
        // Check horizontal overlap + vertical crossing
        if (horizontallyOverlapping && crossingPlatformTop) {
          player.position.y = platTop - player.collider.height / 2;
          player.velocity.vy = 0;
          grounded = true;
          break;
        }
      }
    }

    player.physics.grounded = grounded;
  }
}
```

Key points:
- Gravity is handled by `_physics`. You never manually add gravity to velocity.
- Jumping sets `vy` to a negative value (upward).
- Grounded detection is game-specific -- the platformer does it in a custom collision system, not the built-in physics bounce.
- Platforms are one-way: collision only triggers when the player is falling (`vy >= 0`).

### Grid-Based / Turn-Based Movement (Roguelike Style)

The roguelike template uses no velocity at all. Movement is discrete grid steps, animated via tweens.

Input system (`games/roguelike/systems/player-input.ts`):
```ts
const playerInputSystem = defineSystem({
  name: "playerInput",
  phase: "player", // only runs during the "player" turn phase

  update(engine) {
    const player = engine.findByTag("player");
    if (!player?.gridPos) return;

    const kb = engine.keyboard;
    let dx = 0, dy = 0;

    if (kb.pressed("ArrowUp") || kb.pressed("KeyW"))    dy = -1;
    else if (kb.pressed("ArrowDown") || kb.pressed("KeyS"))  dy = 1;
    else if (kb.pressed("ArrowLeft") || kb.pressed("KeyA"))  dx = -1;
    else if (kb.pressed("ArrowRight") || kb.pressed("KeyD")) dx = 1;

    if (dx === 0 && dy === 0) return;

    const newCol = player.gridPos.col + dx;
    const newRow = player.gridPos.row + dy;

    // Check wall collision against the nav grid
    if (navGrid.get(newCol, newRow) === "#") return;

    // Move on the grid
    player.gridPos.col = newCol;
    player.gridPos.row = newRow;

    // Animate the visual position via tween
    const worldPos = gridToWorld(newCol, newRow, cellSize);
    engine.tweenEntity(player, "position.x", player.position.x, worldPos.x, 0.1, "easeOut");
    engine.tweenEntity(player, "position.y", player.position.y, worldPos.y, 0.1, "easeOut");

    // Advance the turn
    engine.turns.endPhase();
  },
});
```

Key points:
- Uses `kb.pressed()` (single-frame trigger), not `kb.held()`.
- `phase: "player"` gates the system to only run during the player's turn phase.
- Grid position (`gridPos`) is the authoritative position; `position` is visual only.
- `engine.tweenEntity()` smoothly animates the visual position to the grid target.
- `engine.turns.endPhase()` advances to the next phase after a valid move.

### Bullet / Projectile Patterns

Bullets are spawned with initial velocity, a lifetime, and often an `offScreenDestroy` component.

From asteroid-field (`games/asteroid-field/entities/bullet.ts`):
```ts
export function createBullet(x: number, y: number, vx: number, vy: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx, vy },
    ascii: { char: "|", font: FONTS.normal, color: "#ffff00" },
    collider: { type: "circle", width: 6, height: 6 },
    lifetime: { remaining: 1.5 }, // auto-destroyed after 1.5 seconds
    tags: { values: new Set(["bullet"]) },
  };
}
```

Spawning from the player:
```ts
if (kb.held("Space") && shootCooldown.fire()) {
  const bSpeed = 600;
  // Normalize aim direction
  const len = Math.hypot(lastDirX, lastDirY) || 1;
  const bvx = (lastDirX / len) * bSpeed;
  const bvy = (lastDirY / len) * bSpeed;
  engine.spawn(createBullet(player.position.x, player.position.y, bvx, bvy));
  sfx.shoot();
}
```

Key points:
- Use `Cooldown` from `@engine` for fire-rate limiting.
- `lifetime: { remaining: 1.5 }` auto-destroys the bullet via the `_lifetime` built-in system.
- For screen-based cleanup, add `offScreenDestroy: { margin: 50 }` instead of or alongside lifetime.
- Bullet collisions are checked in a dedicated collision system using `overlaps()`.

### Knockback and Force Application

Apply knockback by directly modifying velocity. The physics system handles the rest.

```ts
import { defineSystem, overlaps, normalize, sub, scale } from "@engine";

export const knockbackSystem = defineSystem({
  name: "knockback",
  priority: 0, // before physics

  update(engine, dt) {
    const players = [...engine.world.with("position", "velocity", "player")];
    const hazards = [...engine.world.with("position", "collider", "tags")]
      .filter(e => e.tags.values.has("hazard"));

    for (const player of players) {
      for (const hazard of hazards) {
        if (overlaps(player, hazard)) {
          // Direction from hazard to player
          const dir = normalize(sub(player.position, hazard.position));
          const knockback = scale(dir, 400); // 400 px/s impulse

          player.velocity.vx += knockback.x;
          player.velocity.vy += knockback.y;
        }
      }
    }
  },
});
```

For drag-based deceleration after knockback, use `physics.drag`:
```ts
engine.spawn({
  position: { x: 100, y: 100 },
  velocity: { vx: 0, vy: 0 },
  physics: { drag: 3 }, // velocity decays quickly
});
```

---

## Input System

The engine provides four input device abstractions, all accessible from the engine instance. Each one buffers events between frames and exposes a per-frame API with `held()`, `pressed()`, and `released()` semantics.

### Keyboard

Access: `engine.keyboard`

```ts
const kb = engine.keyboard;

// Currently held (true every frame while the key is down)
if (kb.held("KeyW")) moveUp();

// Just pressed this frame (true for exactly one frame)
if (kb.pressed("Space")) jump();

// Just released this frame (true for exactly one frame)
if (kb.released("KeyE")) throwGrenade();
```

Key codes use the `KeyboardEvent.code` standard:
- Letters: `"KeyA"` through `"KeyZ"`
- Arrows: `"ArrowUp"`, `"ArrowDown"`, `"ArrowLeft"`, `"ArrowRight"`
- Modifiers: `"ShiftLeft"`, `"ControlLeft"`, `"AltLeft"`
- Special: `"Space"`, `"Enter"`, `"Escape"`, `"Tab"`, `"Backspace"`
- Numbers: `"Digit0"` through `"Digit9"`, `"Numpad0"` through `"Numpad9"`

The keyboard auto-prevents browser defaults for game keys (arrows, Space, Tab).

Low-level access to the raw sets:
- `kb.keys`: `Set<string>` of currently held keys.
- `kb.justPressed`: `Set<string>` of keys pressed this frame.
- `kb.justReleased`: `Set<string>` of keys released this frame.

### Mouse

Access: `engine.mouse`

```ts
const ms = engine.mouse;

ms.x         // canvas-relative X coordinate
ms.y         // canvas-relative Y coordinate
ms.down      // true while any button is held
ms.justDown  // true the frame a button was pressed
ms.justUp    // true the frame a button was released
ms.wheelDelta // scroll wheel delta (reset each frame)
```

Coordinates are relative to the canvas element's top-left corner. The mouse listener is attached to the canvas for move/down/wheel, and to `window` for mouseup (so releasing outside the canvas still registers).

Example -- click to spawn:
```ts
if (engine.mouse.justDown) {
  engine.spawn(createExplosion(engine.mouse.x, engine.mouse.y));
}
```

### Gamepad

Access: `engine.gamepad`

```ts
import { GAMEPAD_BUTTONS } from "@engine";

const gp = engine.gamepad;

if (gp.connected) {
  // Buttons: held / pressed / released (same API as keyboard)
  if (gp.pressed(GAMEPAD_BUTTONS.A)) jump();
  if (gp.held(GAMEPAD_BUTTONS.RB)) sprint();

  // Analog sticks: { x, y } in -1..1 with deadzone filtering
  const left = gp.stick("left", 0.15);   // 0.15 is the deadzone
  const right = gp.stick("right");

  // Analog triggers: 0..1
  const rt = gp.trigger("right");
  const lt = gp.trigger("left");
}
```

Standard gamepad button constants (`GAMEPAD_BUTTONS`):
| Constant     | Index | Button             |
|-------------|-------|--------------------|
| `A`         | 0     | A / Cross          |
| `B`         | 1     | B / Circle         |
| `X`         | 2     | X / Square         |
| `Y`         | 3     | Y / Triangle       |
| `LB`        | 4     | Left bumper        |
| `RB`        | 5     | Right bumper       |
| `LT`        | 6     | Left trigger       |
| `RT`        | 7     | Right trigger      |
| `BACK`      | 8     | Back / Select      |
| `START`     | 9     | Start / Options    |
| `L_STICK`   | 10    | Left stick press   |
| `R_STICK`   | 11    | Right stick press  |
| `DPAD_UP`   | 12    | D-pad up           |
| `DPAD_DOWN` | 13    | D-pad down         |
| `DPAD_LEFT` | 14    | D-pad left         |
| `DPAD_RIGHT`| 15    | D-pad right        |

### Touch and Gestures

The `Touch` class provides unified touch/pointer/mouse input with gesture recognition. It is not auto-wired to the engine -- you instantiate it yourself.

```ts
import { Touch } from "@engine";

const touch = new Touch(engine.renderer.canvas, {
  unifyMouse: true,       // treat mouse as a touch (default true)
  dragThreshold: 10,      // px before a drag/swipe is recognized (default 10)
  tapMaxDuration: 300,    // ms limit for a tap (default 300)
  swipeMinVelocity: 0.5,  // px/ms for a swipe (default 0.5)
});
```

**Active touches:**
```ts
touch.touches   // readonly TouchPoint[]  -- all active touch points
touch.primary   // TouchPoint | null      -- first active touch
touch.find(id)  // TouchPoint | null      -- look up by identifier
```

Each `TouchPoint` contains:
```ts
interface TouchPoint {
  id: number;
  x: number;         // canvas-relative
  y: number;
  startX: number;    // where the touch began
  startY: number;
  dx: number;        // x - startX
  dy: number;        // y - startY
  startTime: number;
  phase: "begin" | "active" | "end" | "cancel";
}
```

**Gesture recognition:**
```ts
touch.onTap((g) => {
  // g: { type: "tap", x, y, duration }
  fireAt(g.x, g.y);
});

touch.onSwipe((g) => {
  // g: { type: "swipe", direction: "up"|"down"|"left"|"right", dx, dy, distance, duration }
  if (g.direction === "up") jump();
});

touch.onPinch((g) => {
  // g: { type: "pinch", scale, centerX, centerY }
  engine.camera.setZoom(engine.camera.zoom * g.scale);
});
```

**Lifecycle events:**
```ts
touch.onBegin((t) => { /* finger down */ });
touch.onMove((t) => { /* finger move */ });
touch.onEnd((t) => { /* finger up */ });
```

All subscription methods return an unsubscribe function:
```ts
const unsub = touch.onTap(() => { /* ... */ });
unsub(); // stop listening
```

You must call `touch.update()` once per frame to drain the gesture queue and clean up ended touches. Call `touch.destroy()` to remove all event listeners.

### Input Bindings

The `InputBindings` class maps semantic action names to physical inputs. Games call `input.pressed("jump")` instead of `kb.pressed("Space")`, enabling runtime rebinding and persistence.

```ts
import { InputBindings, createDefaultBindings } from "@engine";

const input = new InputBindings(engine.keyboard, engine.gamepad, engine.mouse);
input.setAll(createDefaultBindings());

// Try loading saved bindings; fall back to defaults
if (!input.load()) input.save();
```

**Default bindings** (`DEFAULT_BINDINGS`):
| Action       | Keys                     | Gamepad         |
|-------------|--------------------------|-----------------|
| `move-up`    | ArrowUp, KeyW           | DPAD_UP (12)    |
| `move-down`  | ArrowDown, KeyS         | DPAD_DOWN (13)  |
| `move-left`  | ArrowLeft, KeyA         | DPAD_LEFT (14)  |
| `move-right` | ArrowRight, KeyD        | DPAD_RIGHT (15) |
| `action-a`   | Space, Enter            | A (0)           |
| `action-b`   | Escape                  | B (1)           |
| `action-x`   | KeyQ                    | X (2)           |
| `action-y`   | KeyE                    | Y (3)           |
| `pause`      | Escape                  | START (9)       |

**Usage:**
```ts
if (input.held("move-up")) moveUp();
if (input.pressed("action-a")) jump();
if (input.released("action-b")) cancelCharge();
```

**Custom bindings:**
```ts
input.set("shoot", { keys: ["Space"], mouseButtons: [0], gamepadButtons: [7] });
input.set("dash", { keys: ["ShiftLeft"], gamepadButtons: [5] });
```

**Runtime rebinding via capture:**
```ts
// Waits for the next input (key, button, or mouse click)
// and assigns it to the action. Escape cancels.
const captured = await input.capture("move-up", 10); // 10 second timeout
if (captured) {
  input.save(); // persist to localStorage
}
```

**Conflict detection:**
```ts
const conflicts = input.findConflicts();
for (const c of conflicts) {
  console.warn(`${c.input} is bound to: ${c.actions.join(", ")}`);
  // e.g. "key:Space is bound to: jump, confirm"
}
```

**Persistence:**
```ts
input.save("my-game-bindings");  // save to localStorage
input.load("my-game-bindings");  // load from localStorage (returns boolean)
```

### Virtual Controls

For mobile/touch play, the engine provides `VirtualJoystick` and `VirtualDpad`. Both read from a `Touch` instance and draw on the canvas.

#### VirtualJoystick
An analog on-screen stick returning -1..1 on both axes.

```ts
import { Touch, VirtualJoystick, defineSystem } from "@engine";

const touch = new Touch(engine.renderer.canvas);
const stick = new VirtualJoystick({
  anchor: "bottomLeft",    // or { x: 100, y: 500 }
  touch,
  size: 60,                // outer radius in px
  deadzone: 0.15,          // inner dead zone 0..1
  visibleOnlyOnTouch: true, // hide on desktop
});

engine.addSystem(defineSystem({
  name: "virtual-controls",
  update(e) {
    stick.update();
    stick.render(e.renderer.ctx, e.width, e.height);
    touch.update();

    // Read values
    const vx = stick.x;         // -1..1
    const vy = stick.y;         // -1..1
    const mag = stick.magnitude; // 0..1
    const dir = stick.direction; // radians
    const active = stick.active; // boolean
  },
}));
```

#### VirtualDpad
A four-button directional pad returning booleans.

```ts
import { Touch, VirtualDpad, defineSystem } from "@engine";

const touch = new Touch(engine.renderer.canvas);
const dpad = new VirtualDpad({
  anchor: "bottomRight",
  touch,
  size: 120,          // overall square size
  buttonSize: 40,     // each button square
  visibleOnlyOnTouch: true,
});

engine.addSystem(defineSystem({
  name: "dpad-input",
  update(e) {
    dpad.update();
    dpad.render(e.renderer.ctx, e.width, e.height);
    touch.update();

    if (dpad.up) moveUp();
    if (dpad.down) moveDown();
    if (dpad.left) moveLeft();
    if (dpad.right) moveRight();
  },
}));
```

Anchor options: `"topLeft"`, `"topCenter"`, `"topRight"`, `"center"`, `"bottomLeft"`, `"bottomCenter"`, `"bottomRight"`, or `{ x, y }` for absolute positioning.

---

## Input Patterns

### Player Movement (WASD + Arrows)

The standard pattern for continuous (real-time) movement:

```ts
import { defineSystem } from "@engine";

export const playerInput = defineSystem({
  name: "playerInput",
  update(engine) {
    const kb = engine.keyboard;
    for (const e of engine.world.with("velocity", "player")) {
      const speed = 200;
      let dx = 0, dy = 0;

      if (kb.held("KeyW") || kb.held("ArrowUp"))    dy -= 1;
      if (kb.held("KeyS") || kb.held("ArrowDown"))   dy += 1;
      if (kb.held("KeyA") || kb.held("ArrowLeft"))   dx -= 1;
      if (kb.held("KeyD") || kb.held("ArrowRight"))  dx += 1;

      // Normalize diagonal so it is not faster
      if (dx !== 0 && dy !== 0) {
        dx *= Math.SQRT1_2;
        dy *= Math.SQRT1_2;
      }

      e.velocity.vx = dx * speed;
      e.velocity.vy = dy * speed;
    }
  },
});
```

### Menu Navigation

Menu input uses `pressed()` (single-frame) for discrete selections:

```ts
import { UIMenu, sfx } from "@engine";

const menu = new UIMenu(["New Game", "Continue", "Quit"], {
  border: "double",
  title: "Main Menu",
  anchor: "center",
  onMove: () => sfx.menu(),
});

// In the scene update:
menu.update(engine); // handles up/down/enter/escape internally
menu.draw(engine.ui, engine.centerX, engine.centerY);

if (menu.confirmed) {
  switch (menu.selectedIndex) {
    case 0: engine.loadScene("play"); break;
    case 1: loadSavedGame(); break;
    case 2: window.close(); break;
  }
}
if (menu.cancelled) {
  // Escape pressed
}
```

### Action / Confirm / Cancel Mapping

Using `InputBindings` for device-agnostic action mapping:

```ts
import { InputBindings, createDefaultBindings } from "@engine";

const input = new InputBindings(engine.keyboard, engine.gamepad, engine.mouse);
input.setAll(createDefaultBindings());

// "action-a" = Space/Enter/Gamepad-A
if (input.pressed("action-a")) confirm();

// "action-b" = Escape/Gamepad-B
if (input.pressed("action-b")) cancel();

// Custom actions
input.set("interact", { keys: ["KeyE", "Enter"], gamepadButtons: [0] });
if (input.pressed("interact")) interactWithNPC();
```

### Input During Different Game States

Use the scene update function or the pause state to gate input:

```ts
// In the play scene:
update(engine) {
  // Pause toggle
  if (engine.keyboard.pressed("Escape")) {
    if (engine.isPaused) {
      engine.resume();
      useStore.getState().setScreen("playing");
    } else {
      engine.pause();
      useStore.getState().setScreen("paused");
    }
  }
}
```

For turn-based games, use `phase` on systems to gate which input system runs:

```ts
// Only runs during the "player" phase
export const playerInputSystem = defineSystem({
  name: "playerInput",
  phase: "player",
  update(engine) { /* ... */ },
});

// Only runs during the "enemy" phase
export const enemyAI = defineSystem({
  name: "enemyAI",
  phase: "enemy",
  update(engine) { /* ... */ },
});
```

---

## Audio System

The engine uses [ZzFX](https://github.com/KilledByAPixel/ZzFX) for procedural sound effects -- no audio files needed. Music playback uses the standard `HTMLAudioElement`.

### Audio Engine API

All audio exports are available from `@engine`:

```ts
import {
  sfx,           // preset sound effects
  beep,          // custom tone
  audio,         // global volume/mute controller
  setVolume, getVolume,
  mute, unmute, toggleMute, isMuted,
  playMusic, stopMusic, pauseMusic, resumeMusic, setMusicVolume,
} from "@engine";
```

### Sound Effects

**Built-in presets:**
```ts
sfx.shoot();    // short high-pitched zap
sfx.hit();      // mid-range impact
sfx.pickup();   // bright ascending tone
sfx.explode();  // low rumble with noise
sfx.menu();     // soft click
sfx.death();    // long descending rumble
```

**Custom tone:**
```ts
beep({ freq: 440, duration: 0.1, volume: 0.15 });
beep({ freq: 880, duration: 0.05, volume: 0.1 });
```

**Raw ZzFX parameters:**
```ts
sfx.custom(0.15, 0.05, 880, 0.05, 0.02, 0, 1, 0, 0);
// First parameter is volume (auto-scaled by master volume)
```

All sound effects respect the global master volume and mute state automatically.

### Music Playback

Music plays from a URL using `HTMLAudioElement`. It loops by default and handles autoplay restrictions gracefully (retries on first user interaction if blocked).

```ts
// Start background music
playMusic("/music/theme.mp3", { volume: 0.3, loop: true });

// Control playback
pauseMusic();
resumeMusic();
stopMusic();

// Adjust music volume independently (0-1)
setMusicVolume(0.5);
```

The music volume is combined with the master volume: `effective = musicVolume * masterVolume`.

### Volume and Mute Control

```ts
// Master volume (affects all SFX and music)
setVolume(0.8);     // 0 to 1
getVolume();        // returns current master volume

// Mute control
mute();             // silence everything
unmute();           // restore volume
toggleMute();       // returns new muted state
isMuted();          // check current state

// Alternative property-based API
audio.volume = 0.5;
audio.muted = true;
```

### Audio Events Integration

Audio integrates naturally with game events. The templates demonstrate the pattern:

```ts
import { sfx, events } from "@engine";

// In a collision system:
if (overlaps(bullet, enemy)) {
  sfx.hit();
  engine.camera.shake(3);
  engine.destroy(bullet);
}

// On player damage:
sfx.explode();
engine.camera.shake(8);

// On item pickup:
sfx.pickup();
engine.floatingText(x, y - 12, "+1", "#ffcc00");

// On game over:
sfx.death();

// Wiring to typed events:
events.on("combat:entity-defeated", () => sfx.explode());
events.on("inventory:add", () => sfx.pickup());
```

---

## Extension Workflows

### 1. Adding a New Collision Shape

The collision system supports circle and rect. To add a new shape (e.g., line segment):

**Step 1: Extend the Collider type** in `shared/types.ts`:
```ts
// Before:
export interface Collider {
  type: "circle" | "rect";
  width: number;
  height: number;
  sensor?: boolean;
}

// After:
export interface Collider {
  type: "circle" | "rect" | "line";
  width: number;
  height: number;
  sensor?: boolean;
  /** For line colliders: endpoint offsets from position. */
  x2?: number;
  y2?: number;
}
```

**Step 2: Add detection functions** in `engine/physics/collision.ts`:
```ts
function lineLine(a: Collidable, b: Collidable): boolean {
  // Line-line intersection math
}

function lineCircle(line: Collidable, circle: Collidable): boolean {
  // Closest point on line segment to circle center
}

function lineRect(line: Collidable, rect: Collidable): boolean {
  // Line-rect intersection (4 edge tests)
}
```

**Step 3: Extend the `overlaps()` dispatch**:
```ts
export function overlaps(a: Collidable, b: Collidable): boolean {
  const at = a.collider.type;
  const bt = b.collider.type;

  if (at === "circle" && bt === "circle") return circleCircle(a, b);
  if (at === "rect" && bt === "rect") return rectRect(a, b);
  if (at === "line" && bt === "line") return lineLine(a, b);

  // Mixed pairs (order-normalize)
  if (at === "circle" && bt === "rect") return circleRect(a, b);
  if (at === "rect" && bt === "circle") return circleRect(b, a);
  if (at === "line" && bt === "circle") return lineCircle(a, b);
  if (at === "circle" && bt === "line") return lineCircle(b, a);
  if (at === "line" && bt === "rect") return lineRect(a, b);
  if (at === "rect" && bt === "line") return lineRect(b, a);

  return false;
}
```

**Step 4: Add tests** in `engine/__tests__/physics/collision.test.ts` covering each new pair combination.

### 2. Creating a Custom Physics Behavior (Gravity Wells)

A gravity well pulls nearby entities toward a point. This is a custom system, not a modification to `_physics`.

```ts
import { defineSystem, SystemPriority, type Entity } from "@engine";

export const gravityWellSystem = defineSystem({
  name: "gravityWells",
  priority: SystemPriority.physics - 1, // run just before physics integration

  update(engine, dt) {
    const wells = [...engine.world.with("position", "tags")]
      .filter(e => e.tags.values.has("gravity-well"));

    for (const entity of engine.world.with("position", "velocity")) {
      for (const well of wells) {
        if (entity === well) continue;

        const dx = well.position.x - entity.position.x;
        const dy = well.position.y - entity.position.y;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq);

        // Skip if too far or at the same position
        const maxRange = (well as any).wellRadius ?? 300;
        if (dist > maxRange || dist < 1) continue;

        // Gravitational pull: strength / distance^2
        const strength = (well as any).wellStrength ?? 50000;
        const force = strength / distSq;

        // Apply as velocity change (acceleration * dt)
        entity.velocity.vx += (dx / dist) * force * dt;
        entity.velocity.vy += (dy / dist) * force * dt;
      }
    }
  },
});
```

Usage:
```ts
// Spawn a gravity well
engine.spawn({
  position: { x: 400, y: 300 },
  ascii: { char: "O", font: FONTS.large, color: "#8844ff", glow: "#8844ff44" },
  tags: { values: new Set(["gravity-well"]) },
  wellRadius: 250,
  wellStrength: 30000,
});

// Add the system
engine.addSystem(gravityWellSystem);
```

The system runs at priority 19 (just before physics at 20). It modifies velocity, and then `_physics` integrates velocity into position. This avoids the double-integration gotcha.

### 3. Adding a New Input Device / Method

To add a new input source (e.g., voice commands via Web Speech API), follow the pattern established by Keyboard/Mouse/Gamepad:

**Step 1: Create the device class** in `engine/input/voice.ts`:
```ts
export class VoiceInput {
  private recognition: SpeechRecognition | null = null;
  private _lastCommand: string | null = null;
  private _pendingCommand: string | null = null;

  constructor() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    this.recognition = new SR();
    this.recognition.continuous = true;
    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      const last = event.results[event.results.length - 1];
      if (last.isFinal) {
        this._pendingCommand = last[0].transcript.trim().toLowerCase();
      }
    };
    this.recognition.start();
  }

  /** Call once per frame to flush pending commands. */
  update(): void {
    this._lastCommand = this._pendingCommand;
    this._pendingCommand = null;
  }

  /** Check if a command was spoken this frame. */
  command(word: string): boolean {
    return this._lastCommand?.includes(word) ?? false;
  }

  destroy(): void {
    this.recognition?.stop();
  }
}
```

**Step 2: Export from `engine/index.ts`**:
```ts
export { VoiceInput } from "./input/voice";
```

**Step 3: Use in game code**:
```ts
import { VoiceInput, defineSystem } from "@engine";

const voice = new VoiceInput();

engine.addSystem(defineSystem({
  name: "voice-input",
  update(engine) {
    voice.update();
    if (voice.command("fire")) shoot();
    if (voice.command("jump")) jump();
  },
}));
```

### 4. Creating an Input Binding Scheme

Set up a complete binding scheme for a specific game type:

```ts
import { InputBindings, type BindingsConfig } from "@engine";

// Define a scheme for a twin-stick shooter
const twinStickBindings: BindingsConfig = {
  "move-up":     { keys: ["KeyW"],      gamepadButtons: [] },
  "move-down":   { keys: ["KeyS"],      gamepadButtons: [] },
  "move-left":   { keys: ["KeyA"],      gamepadButtons: [] },
  "move-right":  { keys: ["KeyD"],      gamepadButtons: [] },
  "aim-up":      { keys: ["ArrowUp"],   gamepadButtons: [] },
  "aim-down":    { keys: ["ArrowDown"], gamepadButtons: [] },
  "aim-left":    { keys: ["ArrowLeft"], gamepadButtons: [] },
  "aim-right":   { keys: ["ArrowRight"],gamepadButtons: [] },
  "fire":        { keys: ["Space"],      mouseButtons: [0], gamepadButtons: [7] },
  "dash":        { keys: ["ShiftLeft"], gamepadButtons: [5] },
  "pause":       { keys: ["Escape"],    gamepadButtons: [9] },
  "interact":    { keys: ["KeyE"],      gamepadButtons: [0] },
};

// Initialize
const input = new InputBindings(engine.keyboard, engine.gamepad, engine.mouse);
input.setAll(twinStickBindings);

// Load saved overrides if they exist
if (!input.load("twin-stick-bindings")) {
  input.save("twin-stick-bindings");
}

// Use in systems
if (input.held("fire")) shoot();
if (input.pressed("dash") && dashCooldown.fire()) dash();

// Rebinding UI: capture the next input for an action
async function rebind(action: string) {
  const result = await input.capture(action, 10);
  if (result) {
    // Check for conflicts before saving
    const conflicts = input.findConflicts();
    if (conflicts.length > 0) {
      showWarning(`Conflict: ${conflicts[0].input}`);
    }
    input.save("twin-stick-bindings");
  }
}
```

### 5. Adding Positional Audio

The engine's audio is global (not spatialized). To add positional audio, wrap the ZzFX calls with distance-based volume scaling:

```ts
import { sfx, getVolume, isMuted } from "@engine";
import { zzfx } from "zzfx";
import { dist } from "@engine";

interface PositionalAudioOpts {
  x: number;
  y: number;
  maxDistance?: number;  // beyond this distance, volume is 0
  falloff?: number;      // 1 = linear, 2 = inverse-square
}

const listenerPos = { x: 0, y: 0 };

/** Update the listener position (call each frame, usually to the player/camera). */
export function setListenerPosition(x: number, y: number): void {
  listenerPos.x = x;
  listenerPos.y = y;
}

/** Calculate volume multiplier based on distance from listener. */
function spatialVolume(opts: PositionalAudioOpts): number {
  if (isMuted()) return 0;
  const maxDist = opts.maxDistance ?? 500;
  const falloff = opts.falloff ?? 1;
  const d = dist(listenerPos, { x: opts.x, y: opts.y });
  if (d >= maxDist) return 0;
  const t = 1 - d / maxDist;
  return Math.pow(t, falloff) * getVolume();
}

/** Play a hit sound at a world position. */
export function spatialHit(x: number, y: number): void {
  const vol = spatialVolume({ x, y });
  if (vol > 0.01) {
    zzfx(vol * 0.15, 0.1, 220, 0.02, 0.15, 0, 2, 0, 0);
  }
}

/** Play an explosion at a world position. */
export function spatialExplode(x: number, y: number): void {
  const vol = spatialVolume({ x, y });
  if (vol > 0.01) {
    zzfx(vol * 0.2, 0.1, 110, 0.01, 0.3, 0, 4, 0, 3);
  }
}

// Usage in a system:
export const audioSystem = defineSystem({
  name: "positional-audio",
  update(engine) {
    const player = engine.findByTag("player");
    if (player?.position) {
      setListenerPosition(player.position.x, player.position.y);
    }
  },
});
```

For stereo panning, use the Web Audio API `StereoPannerNode` with panning based on the horizontal offset from the listener:
```ts
function spatialPan(x: number): number {
  const dx = x - listenerPos.x;
  return Math.max(-1, Math.min(1, dx / 400)); // -1 = left, +1 = right
}
```

---

## Quick Reference: System Priorities

Custom systems that interact with physics, input, or audio should be ordered relative to the built-in systems:

| Priority | System           | Purpose                              |
|----------|-----------------|--------------------------------------|
| 0        | (custom default) | Input reading, game logic            |
| 10       | `_parent`        | Parent-child position sync           |
| 20       | `_physics`       | Velocity integration, forces, bounce |
| 21+      | (custom)         | Post-physics collision detection     |
| 30       | `_tween`         | Declarative property animation       |
| 40       | `_animation`     | Frame-based sprite animation         |
| 50       | `_emitter`       | Particle emitter spawning            |
| 60       | `_stateMachine`  | State machine transitions            |
| 70       | `_lifetime`      | Auto-destroy expired entities        |
| 80       | `_screenBounds`  | Wrap, clamp, off-screen destroy      |

Typical ordering for a game:
- Input systems: priority 0 (default) -- read input, set velocity/forces.
- Collision systems: priority 21 -- run after physics has moved entities.
- Cleanup systems: priority 71+ -- run after lifetime has removed expired entities.
