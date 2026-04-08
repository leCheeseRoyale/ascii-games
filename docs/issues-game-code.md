# Game Code Issues

Issues found in `game/` — scenes, systems, entities, and data.

---

## Critical

### G1. Destroyed asteroids re-processed in collision loops
**File:** `game/systems/collision.ts:29–53, 98–108`

The `asteroids` array is snapshot once at the top of `update()`. When a bullet destroys an asteroid in the first loop, the destroyed entity remains in the snapshot. The off-screen cleanup loop (lines 98–108) calls `engine.destroy()` on the same entity a second time. Additionally, destroyed asteroids can still register as overlapping with the player in the player-collision loop (lines 56–96), causing ghost damage.

**Fix:** Track destroyed entities in a local `Set` and skip them in subsequent passes:
```ts
const destroyed = new Set()
// in bullet loop after destroy: destroyed.add(asteroid)
// in player loop: if (destroyed.has(asteroid)) continue
// in cleanup loop: if (destroyed.has(asteroid)) continue
```

---

### G2. Module-level `shootCooldown` never reset between game sessions
**File:** `game/systems/player-input.ts:5–9`

`shootCooldown`, `lastDirX`, and `lastDirY` are module-level variables with no `init()` hook to reset them on scene reload. After a game-over restart, the cooldown retains its previous elapsed state and the aim direction carries over from the last game.

**Fix:** Add an `init()` hook to `playerInputSystem`:
```ts
init() {
  shootCooldown.reset()
  lastDirX = 0
  lastDirY = -1
},
```

---

### G3. `break` instead of `continue` exits entire player loop on invincibility
**File:** `game/systems/collision.ts:57`

```ts
for (const player of players) {
  if (invincibleTimer > 0) break  // exits outer loop
```

`break` exits the entire player loop. The semantic intent is to skip the current player's collision checks while invincible. Should be `continue`. Currently harmless with one player but incorrect logic.

---

## Important

### G4. Dead computed `blink` variable every frame
**File:** `game/scenes/title.ts:94`

`Math.sin(engine.time.elapsed * 3) * 0.3 + 0.7` is computed and assigned to `blink` but never used. Wastes CPU every frame. Either apply it to an entity's opacity or remove it.

---

### G5. `ascii.char` used for multi-word strings
**Files:** `game/scenes/title.ts:18–24`, `game/scenes/game-over.ts:35–42`

The `ascii` component's `char` field is documented as "single glyph," but multi-word strings like `'ASTEROID FIELD'` and `'GAME OVER'` are assigned to it. If the renderer measures or centers based on single-character assumptions, these render incorrectly. `textBlock` is the correct component for multi-word strings.

---

### G6. `Math.random()` used directly instead of engine utilities
**Files:** `game/scenes/title.ts:59`, `game/systems/asteroid-spawner.ts:34`

`Math.floor(Math.random() * 4)` bypasses the engine's `rngInt()` utility. Should use `rngInt(0, 3)` from `@engine` for consistency and future seeded-RNG support.

---

### G7. Title scene duplicates movement logic inline
**File:** `game/scenes/title.ts:88–91`

The scene `update()` manually applies `e.velocity.vx * dt` to entities instead of registering `movementSystem` via `engine.addSystem()`. Works but is inconsistent with the rest of the codebase and duplicates system logic.

---

### G8. Duplicate score reset path
**File:** `game/systems/collision.ts:5–6, 9, 13–17` and `game/scenes/play.ts:19`

`score` is reset both by `resetScore()` called in `play.ts:setup()` AND by `collisionSystem.init()` when the system is added. The double-reset is harmless but signals confusion between two reset mechanisms for the same variable. Pick one canonical path.

---

### G9. Play scene has no explicit `cleanup` hook
**File:** `game/scenes/play.ts`

The engine's `SceneManager.load()` handles cleanup automatically (`systems.clear()` + `world.clear()`), so this works. However, an explicit `cleanup` hook documents intent and is the correct place for any future teardown logic (releasing audio, clearing external state, etc.).
