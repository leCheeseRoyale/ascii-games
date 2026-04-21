---
name: templates
description: Use when choosing a starting template for a new game, understanding how existing game templates work, extending a template with new features, comparing `defineGame` vs `defineScene` approaches, or studying patterns from the reference games. Covers all 7 templates: `blank`, `asteroid-field`, `platformer`, `roguelike`, `physics-text`, `tic-tac-toe`, `connect-four`. Also use when the user asks "which template should I use", "how does the roguelike work", "show me a defineGame example", or "how do I structure a new game".
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Game templates reference

Seven templates in `games/` serve as both starting points and pattern references. Each demonstrates a different game architecture. **Templates are source-of-truth** — `game/` is a gitignored working copy generated from a template via `bun run init:game <template>`.

## Which template to use

```
Is it a board game, card game, puzzle, or 2-player hotseat?
  YES → defineGame template (tic-tac-toe or connect-four)
  NO ↓

Does it need physics, real-time input, or multiple scenes?
  YES ↓
  NO → blank (minimal starter)

Is it a top-down roguelike with grid movement, FOV, tilemaps?
  YES → roguelike
  NO ↓

Is it a side-scroller with gravity?
  YES → platformer
  NO ↓

Is it a shooter / arena / real-time action game?
  YES → asteroid-field
  NO ↓

Is it a text-art demo or physics playground?
  YES → physics-text
  NO → blank (customize from there)
```

## Template comparison

| Template | API | Pacing | UI | Key patterns |
|---|---|---|---|---|
| **blank** | defineScene | Real-time | React | Minimal: 1 entity, 1 inline system |
| **asteroid-field** | defineScene | Real-time | React HUD | Physics, collision, particles, waves, scoring |
| **platformer** | defineScene | Real-time | React HUD | Gravity, platform collision, collectibles |
| **roguelike** | defineScene | Turn-based | Canvas-only | BSP dungeons, FOV, phases, pathfinding, save/load |
| **physics-text** | defineScene | Real-time | Canvas-only | Spring physics, per-character entities, cursor repel |
| **tic-tac-toe** | defineGame | Turn-based | Canvas-only | Moves, turns, endIf, render, mouse input |
| **connect-four** | defineGame | Turn-based | Canvas-only | 2D board, gravity in moves, 4-in-a-row detection |

## defineGame templates (declarative)

### tic-tac-toe (`games/tic-tac-toe/`)

**Files:** `index.ts` (single file with defineGame + setupGame), `config.ts`

**What it demonstrates:**
- `defineGame` with `setup`, `moves`, `turns`, `endIf`, `render`
- State = `{ board: (Mark | null)[] }` — a flat 9-element array
- Moves mutate `ctx.state` directly; return `"invalid"` if cell occupied
- `turns.order: ["X", "O"]` — engine rotates automatically
- `endIf` checks all 8 winning lines and draw condition
- `render(ctx)` draws board with `engine.ui.panel/text` + reads `engine.mouse.justDown` for click input
- Canvas-only: `screens: { menu: Empty, playing: Empty, gameOver: Empty }, hud: []`

**Key pattern:** `render()` is both the display and input handler. It runs every frame, checks mouse state, and dispatches moves via `ctx.moves.place(index)`.

**Why this matters:** Shows the minimal defineGame contract. A complete game in ~80 lines. No systems, no entities, no ECS — just state + moves + rules + render.

### connect-four (`games/connect-four/`)

**Files:** `index.ts`, `config.ts`

**What it adds over tic-tac-toe:**
- 2D board (`Cell[][]`) instead of 1D array
- Gravity logic in the `drop` move — finds lowest empty row in column
- 4-in-a-row detection scanning 4 directions (horizontal, vertical, both diagonals)
- Column-based click detection (click anywhere in column to drop)

**Key pattern:** Game rules encoded in moves. The `drop` move scans bottom-up for the first empty row — this is the "gravity" mechanic, not physics.

## defineScene templates (ECS)

### blank (`games/blank/`)

**Files:** `index.ts`, `config.ts`, `scenes/title.ts`, `scenes/play.ts`

**What it demonstrates:**
- Minimal boilerplate: title + play scenes, one player entity, one inline system
- `defineSystem` with WASD movement (set velocity, let `_physics` integrate)
- Screen wrapping with margin
- `engine.centerX`, `engine.centerY`, `engine.width`, `engine.height` helpers
- Comments pointing to expansion paths (enemies, collision, scoring)

**Why this matters:** The absolute minimum to get something moving. Start here when no other template fits.

### asteroid-field (`games/asteroid-field/`)

**Files:** `index.ts`, `config.ts`, `game.config.ts`, `entities/` (player, asteroid, bullet), `systems/` (player-input, asteroid-spawner, collision), `scenes/` (title, play, game-over)

**What it demonstrates:**
- **Entity factories** returning `Partial<Entity>` with position/velocity/ascii/collider/health/tags
- **Cooldown utility** for rate-limited shooting
- **Normalized diagonal movement** (divide by √2 when both axes active)
- **Screen wrapping** for player (via `screenWrap` component)
- **Edge spawning** for asteroids (spawn from random screen edge, aim toward center)
- **Collision system** with tag-based queries and particle feedback
- **Difficulty ramp** (spawn interval decreases, speed increases over time)
- **Three scenes** with transitions: title → play → game-over
- **React HUD** via `useStore.getState()` for score/health display

**Key patterns:**
- Module-level state in systems (cooldown timers, score, difficulty)
- `[...engine.world.with(...)]` to materialize before destroy
- `engine.particles.burst()` for collision feedback
- `engine.camera.shake()` on player damage

### platformer (`games/platformer/`)

**Files:** `index.ts`, `config.ts`, `game.config.ts`, `entities/` (player, platform, star), `systems/` (player-input, platform-collision, star-spawner, collection)

**What it demonstrates:**
- **Physics with gravity:** `physics: { gravity: 600, friction: 8 }` on player
- **Platform collision system:** Custom system that checks if player is falling onto platforms; sets `physics.grounded = true` + clamps y position
- **Jump mechanic:** Only jump when `physics.grounded` is true (set by collision system)
- **Sensor colliders:** Stars have `sensor: true` — trigger overlap detection without physical response
- **Cooldown-based spawning:** Stars spawn at intervals
- **Collection system:** `overlaps(player, star)` → destroy star, increment score, particles

**Key patterns:**
- `physics.grounded` is maintained by the platform collision system, not by the engine
- Jump = set `velocity.vy = -jumpForce` (negative = upward in screen coords)
- Ground line as an invisible entity with a wide rect collider

### roguelike (`games/roguelike/`)

**Files:** `index.ts`, `config.ts`, `game.config.ts`, `entities/` (player, enemies, items), `systems/` (player-input, enemy-ai, combat, fov, hud), `scenes/` (title, play, game-over), `utils/` (dungeon, fov)

**What it demonstrates:**
- **Turn-based phases:** `engine.turns.configure({ phases: ["player", "enemy", "resolve"] })` — systems declare which phase they run in
- **Grid-based movement:** `gridPos: { col, row }` for logic, `position: { x, y }` for rendering. Movement tweens the world position for smooth visuals.
- **BSP dungeon generation:** `generateBSP()` produces rooms + corridors, converted to tilemap
- **Shadowcasting FOV:** 8-octant recursive shadowcast computes visible cells
- **Two tilemap layers:** "memory" (dim, previously seen) and "visible" (bright, currently in FOV)
- **Enemy AI state machines:** Idle (wander), chase (pathfind toward player), attack (adjacent hit)
- **Pathfinding:** `findPath(navGrid, from, to, { isWalkable })` for enemy movement
- **Combat resolution:** Separate "resolve" phase checks health, grants XP, handles level-ups
- **Canvas-only UI:** `engine.ui.text/bar/panel` for HUD, `UIMenu` for title screen, `engine.dialog.show()` for narrative
- **Save/load:** Storage APIs for floor progression and health carry-over
- **Scene data flow:** `engine.loadScene('play', { data: { floor: 2 } })` passes state between loads

**Key patterns:**
- Module-level exports from scene (`navGrid`, `dungeonGrid`, `messageLog`, `visibleCells`) shared with systems
- `engine.turns.endPhase()` called by player-input system to advance the turn
- Enemy intent set by state machine, executed by AI system (separation of decision and action)
- Floor progression: game-over scene offers retry → reload floor 1, or continue → load next floor

**Why this is the most instructive template:** It exercises the most engine features simultaneously — turns, phases, tilemaps, FOV, pathfinding, state machines, dialog, save/load, canvas UI. Read this template to understand how complex games wire together.

### physics-text (`games/physics-text/`)

**Files:** `index.ts`, `config.ts`, `scenes/play.ts`

**What it demonstrates:**
- **Per-character physics entities:** Each non-space character spawned as individual entity with position/velocity/spring
- **Spring-to-home:** Characters return to their layout position via spring physics
- **Cursor repulsion:** Custom system applies outward force when mouse is near
- **Ambient drift:** Subtle sine/cosine wobble per character
- **Layer ordering:** Multiple ASCII art pieces at different layers (background=0, foreground=3)
- **Staggered initial scatter:** Characters start at random positions and spring to their home — creates an assembly animation

**Key patterns:**
- `engine.spawnText()` or manual per-character spawn with `spring` component
- Custom systems at default priority (0) apply forces before `_spring` (15) corrects them
- No colliders — pure physics + render demo
- `SpringPresets.bouncy`, `.smooth`, `.floaty` for different feel

**Why this matters:** Shows the engine's unique strength — ASCII text as physics bodies. The `pretext` skill documents the measurement that computes character home positions.

## Extending a template

1. Run `bun run init:game <template>` to create `game/` from the template
2. Edit files in `game/`, not `games/<template>/` (templates are source-of-truth)
3. To add an entity: create `game/entities/<name>.ts`, export a factory function
4. To add a system: create `game/systems/<name>.ts`, export via `defineSystem`
5. Wire in scene: `engine.spawn(createEntity(...))` and `engine.addSystem(mySystem)` in setup
6. To add a scene: create `game/scenes/<name>.ts`, register in `game/index.ts`
7. To add behaviors: import from `@engine` (createDamageSystem, createInventory, etc.)

**If you later want to update the template itself** (for use in future `init:game` runs), edit `games/<template>/` instead.

## Things NOT to do

- Don't edit `game/` to change a template — edit `games/<template>/` for template changes
- Don't use `defineGame` for games that need tilemaps, pathfinding, camera follow, or complex scene data — use `defineScene`
- Don't use `defineScene` for simple board/puzzle games — `defineGame` is shorter and handles turns automatically
- Don't copy-paste between templates without understanding the wiring — each template has specific assumptions about UI mode, physics, and turn structure
- Don't skip reading the template source before extending it — the patterns are deliberate

## When to read further

- Scaffolding a new game from description → invoke **`/ascii-games-dev:new-game`**
- Adding a mechanic to an existing game → invoke **`/ascii-games-dev:mechanic`**
- Understanding the ECS layer → invoke **`/ascii-games-dev:ecs-mastery`**
- Understanding defineGame internals → invoke **`/ascii-games-dev:ecs-mastery`** (covers scene lifecycle)
- Per-character physics text → invoke **`/ascii-games-dev:rendering`** + the **`pretext` skill**
