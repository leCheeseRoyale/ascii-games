# Utilities, Data Systems, Storage, and Tiles

Comprehensive reference for the engine's utility modules, persistence layer, tile system, and data definitions. All imports use the `@engine` alias unless noted otherwise.

---

## Table of Contents

- [Pathfinding (A*)](#pathfinding-a)
- [Grid Utilities](#grid-utilities)
- [Scheduler and Timers](#scheduler-and-timers)
- [Storage and Persistence](#storage-and-persistence)
- [Tile System](#tile-system)
- [Dungeon Generation](#dungeon-generation)
- [Noise Generation](#noise-generation)
- [Math Helpers](#math-helpers)
- [Color Helpers](#color-helpers)
- [Cooldown and Tween Helpers](#cooldown-and-tween-helpers)
- [Cutscene System](#cutscene-system)
- [Asset Preloader](#asset-preloader)
- [ASCII Sprite Library](#ascii-sprite-library)
- [Extension Workflows](#extension-workflows)

---

## Pathfinding (A*)

**Source:** `engine/utils/pathfinding.ts`
**Tests:** `engine/__tests__/utils/pathfinding.test.ts`

### Overview

The engine provides a grid-based A* pathfinder that operates on `GridMap<T>` instances. It returns an ordered array of `{col, row}` waypoints from start to goal (inclusive), or `null` if no path exists.

### API

```ts
import { findPath, GridMap } from "@engine";

function findPath<T>(
  grid: GridMap<T>,
  start: { col: number; row: number },
  goal: { col: number; row: number },
  options?: PathOptions,
): { col: number; row: number }[] | null;
```

**`PathOptions`:**

| Option          | Type                                           | Default              | Description                                              |
| --------------- | ---------------------------------------------- | -------------------- | -------------------------------------------------------- |
| `diagonal`      | `boolean`                                      | `false`              | Allow 8-directional movement (vs 4-directional).         |
| `isWalkable`    | `(col, row, value) => boolean`                 | `() => true`         | Predicate to determine if a cell can be traversed.       |
| `maxIterations` | `number`                                       | `cols * rows * 2`    | Safety cap to prevent runaway searches on large grids.   |

### Heuristics

The heuristic is chosen automatically based on the `diagonal` option:

- **4-directional (default):** Manhattan distance -- `|dx| + |dy|`
- **8-directional:** Chebyshev distance -- `max(|dx|, |dy|)`

Diagonal movement costs `Math.SQRT2` (~1.41) per step, while cardinal movement costs 1. This produces optimal paths that prefer straight-line movement.

### Early Rejection

Before searching, `findPath` checks two conditions and returns `null` immediately:

1. Start or goal is out of bounds (`grid.inBounds` fails).
2. The goal cell itself is not walkable (per `isWalkable`).

### Performance Characteristics

- The open set uses a linear scan for the minimum-f node (adequate for grids up to ~100x100). For larger grids, set `maxIterations` to bound worst-case time.
- A `Set<number>` tracks closed nodes and a `Map<number, number>` tracks g-scores, both keyed by `col + row * cols`.
- Typical pathfinding calls in the roguelike template use `maxIterations: 200` to keep enemy AI snappy.

### Real Usage: Roguelike Enemy Chase

From `games/roguelike/entities/enemies.ts` (lines 83-98), enemies pathfind toward the player during their "chase" state:

```ts
import { findPath, type GridMap, gridDistance } from "@engine";

// Inside the chase state of an enemy state machine:
const isWalkable = cfg.phaseWalls
  ? () => true
  : (_c: number, _r: number, val: string | null) => val !== "#";

const path = findPath(navGrid, entity.gridPos, player.gridPos, {
  isWalkable,
  maxIterations: 200,
});

if (path && path.length > 1) {
  // path[0] is the current position; path[1] is the next step
  entity.enemyIntent = {
    type: "move",
    targetCol: path[1].col,
    targetRow: path[1].row,
  };
}
```

The navGrid is built in `games/roguelike/scenes/play.ts` (lines 95-99) by copying the dungeon grid into a `GridMap<string>`:

```ts
navGrid = new GridMap<string>(cols, rows, GAME.dungeon.wallChar);
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    navGrid.set(c, r, dungeon.grid[r][c]);
  }
}
```

Wraith enemies pass `isWalkable: () => true` to path through walls (the `phaseWalls` flag).

---

## Grid Utilities

**Source:** `engine/utils/grid.ts`
**Tests:** `engine/__tests__/utils/grid.test.ts`

### GridMap Class

`GridMap<T>` is the foundational data structure for tile-based games. It stores a flat array of `T | null` values indexed by `(col, row)`.

```ts
import { GridMap } from "@engine";

const grid = new GridMap<string>(20, 15, "."); // 20 cols x 15 rows, filled with "."
grid.set(5, 3, "#"); // set a wall
const tile = grid.get(5, 3); // "#"
```

**Constructor:** `new GridMap<T>(cols, rows, fill?)` -- `fill` defaults to `null`.

**Core methods:**

| Method                     | Returns                                      | Description                                      |
| -------------------------- | -------------------------------------------- | ------------------------------------------------ |
| `get(col, row)`            | `T \| null`                                  | Returns value or `null` if out of bounds.        |
| `set(col, row, value)`     | `void`                                       | No-op if out of bounds.                          |
| `inBounds(col, row)`       | `boolean`                                    | Bounds check.                                    |
| `fill(value)`              | `void`                                       | Set all cells.                                   |
| `clear()`                  | `void`                                       | Set all cells to `null`.                         |
| `neighbors4(col, row)`     | `{col, row, value}[]`                        | 4-directional neighbors (N/E/S/W).               |
| `neighbors8(col, row)`     | `{col, row, value}[]`                        | 8-directional neighbors (includes diagonals).    |
| `forEach(fn)`              | `void`                                       | Iterate all cells as `(col, row, value)`.        |
| `find(predicate)`          | `{col, row, value} \| null`                  | First cell matching predicate.                   |
| `count(predicate)`         | `number`                                     | Count cells matching predicate.                  |

### Coordinate Conversion Functions

```ts
import { gridToWorld, worldToGrid, gridDistance } from "@engine";
```

**`gridToWorld(col, row, cellSize, offset?)`** -- Converts grid coordinates to the world-space center of the cell.

```ts
gridToWorld(2, 3, 24); // { x: 60, y: 84 }
// Formula: x = offset.x + col * cellSize + cellSize / 2
gridToWorld(0, 0, 24, { x: 100, y: 50 }); // { x: 112, y: 62 }
```

**`worldToGrid(x, y, cellSize, offset?)`** -- Converts world coordinates to grid coordinates (floors to nearest cell).

```ts
worldToGrid(60, 84, 24); // { col: 2, row: 3 }
```

**`gridDistance(a, b)`** -- Manhattan distance between two grid positions.

```ts
gridDistance({ col: 0, row: 0 }, { col: 3, row: 4 }); // 7
```

---

## Scheduler and Timers

**Source:** `engine/utils/scheduler.ts` (Scheduler class), `engine/utils/timer.ts` (Cooldown class)
**Tests:** `engine/__tests__/utils/scheduler.test.ts`, `engine/__tests__/utils/timer.test.ts`

### Why NOT setInterval / setTimeout

From the project's critical gotchas in `CLAUDE.md`:

> **Don't use `setInterval`/`setTimeout`.** Use `engine.after(sec, fn)`, `engine.every(sec, fn)`, `engine.spawnEvery(sec, factory)`, `engine.sequence([...])`, or the `Cooldown` class (advance with `dt`).

The reasons:
- Browser timers don't respect game pause state.
- Browser timers don't auto-cleanup on scene change.
- Browser timers drift and don't synchronize with the game loop's delta time.

The `Scheduler` class solves all three problems. It is ticked once per frame with the game loop's `dt`, it respects pause (no `dt` accumulation when paused), and `scheduler.clear()` is called automatically on scene change.

### Engine Convenience Methods

The engine wraps the `Scheduler` on `engine.scheduler` and exposes these methods directly (from `engine/core/engine.ts`, lines 333-351):

```ts
engine.after(seconds, callback);      // one-shot timer, returns cancel ID
engine.every(seconds, callback);      // repeating timer, returns cancel ID
engine.sequence(steps);               // chained delays, returns cancel ID
engine.cancelTimer(id);               // cancel by ID
engine.spawnEvery(seconds, factory);  // repeating entity spawn
```

### Scheduler Class

The `Scheduler` manages an array of `ScheduledTimer` objects, each tracking `remaining` time, `interval` (0 for one-shot), and a `callback`.

#### `after(seconds, callback)` -- One-Shot Timer

Fires the callback once after `seconds` elapse, then auto-removes itself.

```ts
engine.after(1.5, () => spawnBoss());
```

#### `every(seconds, callback)` -- Repeating Timer

Fires the callback every `seconds`. The remaining time carries over for accuracy (if a tick overshoots by 0.02s, the next interval starts 0.02s shorter).

```ts
const id = engine.every(0.5, () => spawnEnemy());
// Later:
engine.cancelTimer(id);
```

#### `sequence(steps)` -- Chained Delays

Delays are cumulative. The first step's delay is from now; subsequent delays are relative to the previous step.

```ts
engine.sequence([
  { delay: 0, fn: () => showText("Ready") },    // fires immediately
  { delay: 1, fn: () => showText("Set") },       // fires at t=1
  { delay: 1, fn: () => showText("Go!") },       // fires at t=2
]);
```

All steps in a sequence share a group ID. Cancelling any step cancels the entire sequence.

#### `cancel(id)` -- Cancel Timer

If the timer belongs to a group (sequence), all timers in that group are cancelled.

```ts
const id = engine.after(5, () => gameOver());
engine.cancelTimer(id); // crisis averted
```

#### `clear()` -- Remove All Timers

Called automatically on scene change. Prevents stale timers from firing after a scene transition.

### `spawnEvery(seconds, factory)`

Convenience wrapper that combines `scheduler.every` with `engine.spawn`. Returns a cancel ID.

```ts
engine.spawnEvery(1.0, () => createEnemy(randomX(), randomY()));
```

From `engine/core/engine.ts` (lines 278-283):
```ts
spawnEvery(seconds: number, factory: () => Partial<Entity>): number {
  return this.scheduler.every(seconds, () => {
    this.spawn(factory());
  });
}
```

### Cooldown Class

**Source:** `engine/utils/timer.ts` (lines 3-27)

The `Cooldown` class is a lightweight rate-limiter for things like firing weapons. Unlike the `Scheduler`, it requires manual `update(dt)` calls and does not auto-register with the game loop.

```ts
import { Cooldown } from "@engine";

const shootCooldown = new Cooldown(0.3); // 0.3 seconds between shots

// In a system's update:
shootCooldown.update(dt);
if (engine.keyboard.held("Space") && shootCooldown.fire()) {
  engine.spawn(createBullet(x, y));
}
```

**API:**

| Method       | Returns   | Description                                         |
| ------------ | --------- | --------------------------------------------------- |
| `fire()`     | `boolean` | Returns `true` and starts cooldown if ready.        |
| `update(dt)` | `void`    | Tick the cooldown. Call once per frame.              |
| `ready`      | `boolean` | (getter) Whether the cooldown has elapsed.          |
| `reset()`    | `void`    | Immediately make the cooldown ready.                |

A `Cooldown` starts ready (no initial wait).

---

## Storage and Persistence

**Source:** `engine/storage/` (5 files)
**Tests:** `engine/__tests__/storage/storage.test.ts`, `engine/__tests__/storage/game-state.test.ts`, `engine/__tests__/storage/save-slots.test.ts`

The storage layer has three tiers of increasing complexity:

1. **Low-level:** `save()` / `load()` -- raw key-value persistence via `localStorage`.
2. **Mid-level:** `serializeGameState()` / `rehydrateGameState()` -- snapshot and restore entire player state.
3. **High-level:** `SaveSlotManager` -- multi-slot saves with metadata, autosave, versioning, and migration.

### Tier 1: Raw Key-Value Storage

**Source:** `engine/storage/storage.ts`

All keys are prefixed with the game ID to prevent collisions between games sharing the same origin.

```ts
import { setStoragePrefix, save, load, remove, has, clearAll } from "@engine";

setStoragePrefix("roguelike"); // call once at game init

save("last-run", { floor: 3, hp: 40 });
const data = load<{ floor: number; hp: number }>("last-run");
// data = { floor: 3, hp: 40 }

has("last-run"); // true
remove("last-run");
has("last-run"); // false

clearAll(); // removes all keys with the "roguelike:" prefix
```

**Serialization:** All values are `JSON.stringify`'d on save and `JSON.parse`'d on load. This means:
- Primitives, plain objects, and arrays round-trip correctly.
- `Date` objects serialize to strings (need manual reconstruction).
- `Set`, `Map`, functions, and class instances do NOT survive serialization.
- Failed serialization (quota exceeded, unavailable localStorage) fails silently.

**Prefix scoping:** `setStoragePrefix("my-game")` scopes all subsequent calls to keys prefixed with `my-game:`. The prefix is sanitized to `[a-zA-Z0-9_-]` characters. Different games on the same domain will not collide if they use different prefixes.

### Tier 2: Game State Serialization

**Source:** `engine/storage/game-state.ts`

For games using the engine's behavioral systems (Stats, Equipment, Inventory, Currency, Quests, Achievements), the game state serializer bundles them into a single snapshot.

```ts
import { serializeGameState, rehydrateGameState, save, load } from "@engine";

// Save at a checkpoint
const snapshot = serializeGameState({
  stats: player.stats,
  equipment: player.equipment,
  inventory: player.inventory,
  wallet: player.wallet,
  quests,
  achievements,
});
save("checkpoint", snapshot);

// Restore on load
const data = load<SerializedGameState>("checkpoint");
if (data) {
  const state = rehydrateGameState(data, {
    itemLookup: (id) => itemRegistry[id],
    equipmentBlocks: { weapon: ["offhand"] },
    quests,        // existing tracker -- rehydrated in place
    achievements,  // existing tracker -- rehydrated in place
  });
  player.stats = state.stats ?? player.stats;
  player.inventory = state.inventory ?? player.inventory;
  // ...
}
```

**Key behaviors:**
- Any field can be omitted -- only supplied subsystems are serialized.
- Unknown item IDs in inventory/equipment are silently skipped on load (saves survive item removals).
- Quest and achievement trackers are rehydrated in-place (mutated directly) so their event listeners are preserved.
- The `custom` field on `SerializedGameState` carries opaque per-game data (board layout, puzzle grid, dialog flags) that the engine never reads or validates.

### Tier 3: Multi-Slot Save Manager

**Source:** `engine/storage/save-slots.ts`

The `SaveSlotManager<T>` provides a complete save system with slots, metadata, autosave, export/import, and version migration.

```ts
import { SaveSlotManager } from "@engine";

interface GameState {
  level: number;
  hp: number;
  inventory: string[];
}

const saves = new SaveSlotManager<GameState>({
  maxSlots: 3,
  version: "1.2.0",
  onMigrate: (old) => {
    if (old.metadata.version === "1.0.0") {
      return { ...old, data: { ...old.data, inventory: [] } };
    }
    return null; // treat as unreadable
  },
});
```

#### SaveSlotManager API

| Method                     | Returns                 | Description                                                |
| -------------------------- | ----------------------- | ---------------------------------------------------------- |
| `save(slotId, data, meta)` | `SaveSlotMetadata`      | Create or overwrite a slot. Throws if `maxSlots` reached.  |
| `load(slotId)`             | `SaveSlot<T> \| null`  | Load a slot. Returns null if missing, corrupt, or migration fails. |
| `delete(slotId)`           | `boolean`               | Delete a slot. Clears active if it was the active slot.    |
| `exists(slotId)`           | `boolean`               | Check if a slot has data.                                  |
| `rename(slotId, newName)`  | `boolean`               | Rename a slot's display name.                              |
| `list()`                   | `SaveSlotMetadata[]`    | All named slots (excluding autosave), sorted by timestamp descending. |
| `count()`                  | `number`                | Number of named slots (excluding autosave).                |
| `isFull()`                 | `boolean`               | True if `count() >= maxSlots`.                             |
| `clear()`                  | `void`                  | Delete everything -- all slots, autosave, active tracker.  |

#### Active Slot Tracking

```ts
saves.setActive("slot-1");
const active = saves.getActive(); // "slot-1"

saves.saveActive(gameState, { name: "Checkpoint" });
const slot = saves.loadActive();
```

#### Autosave

The autosave slot is reserved (ID `"autosave"`) and does NOT count toward `maxSlots`.

```ts
saves.autosave(gameState, { sceneName: "dungeon" });
const auto = saves.loadAutosave();
if (saves.hasAutosave()) { /* ... */ }
```

#### Export / Import (Cloud Sync)

```ts
const json = saves.exportSlot("slot-1"); // JSON string
// Transfer json to another device / cloud storage
saves.importSlot("slot-1", json); // returns true on success
```

Import validates the JSON shape and enforces `maxSlots`.

#### Version Migration

When the manager's `version` differs from a loaded slot's `metadata.version`, the `onMigrate` hook is called:

```ts
const saves = new SaveSlotManager<GameState>({
  version: "2.0.0",
  onMigrate: (oldSlot) => {
    if (oldSlot.metadata.version === "1.0.0") {
      // Transform old data shape to new shape
      return {
        metadata: { ...oldSlot.metadata, version: "2.0.0" },
        data: migrateV1toV2(oldSlot.data),
      };
    }
    return null; // unknown version -- treat as corrupt
  },
});
```

If `onMigrate` throws, `load` returns `null` (defensive).

#### SaveSlotMetadata

Metadata stored alongside each slot for UI display:

```ts
interface SaveSlotMetadata {
  slotId: string;           // unique identifier
  name: string;             // user-facing name (default "Slot N")
  timestamp: number;        // ms since epoch of last write
  playtime: number;         // seconds of gameplay (caller-tracked)
  sceneName?: string;       // scene name at time of save
  thumbnail?: string;       // base64 PNG (e.g., canvas.toDataURL())
  custom?: Record<string, any>; // game-specific extras
  version?: string;         // schema version for migration
}
```

### High Scores

**Source:** `engine/storage/high-scores.ts`

```ts
import { submitScore, getHighScores, getTopScore, isHighScore, clearHighScores } from "@engine";

if (isHighScore(score)) {
  submitScore(score, "Player Name", 10); // max 10 entries
}

const leaderboard = getHighScores(10); // ScoreEntry[]
// Each entry: { score: number, name: string, date: string }

const top = getTopScore(); // highest score, or 0
```

Scores are stored via the low-level `save`/`load` primitives under the key `"highscores"`, sorted descending by score.

---

## Tile System

**Source:** `engine/tiles/tilemap.ts`
**Types:** `shared/types.ts` (lines 278-295)
**Rendering:** `engine/render/ascii-renderer.ts` (lines 162-195)

### TilemapComponent and TileLegendEntry

Defined in `shared/types.ts`:

```ts
interface TileLegendEntry {
  color?: string;    // text color for this tile character
  bg?: string;       // background fill color
  solid?: boolean;   // used by isSolidAt() for collision
  [key: string]: any; // extensible -- add custom properties
}

interface TilemapComponent {
  data: string[];                         // array of strings, one per row
  legend: Record<string, TileLegendEntry>;
  cellSize: number;                       // pixel size per cell
  offsetX: number;                        // pixel offset from entity position
  offsetY: number;
  font?: string;                          // CSS font string
  layer?: number;                         // render layer (default -10, behind entities)
}
```

### Creating a Tilemap

```ts
import { createTilemap } from "@engine";

const { tilemap } = createTilemap(
  [
    "########",
    "#......#",
    "#.@..$.#",
    "########",
  ],
  24, // cellSize in pixels
  {
    "#": { color: "#888", solid: true },
    ".": { color: "#333" },
    "$": { color: "#ff0" },
    "@": { color: "#0f0" },
  },
  { offsetX: 0, offsetY: 0, layer: -10 },
);

engine.spawn({ position: { x: 0, y: 0 }, tilemap });
```

The `createTilemap` function (from `engine/tiles/tilemap.ts`, lines 22-39) returns a `{ tilemap: TilemapComponent }` partial entity. Spread it into `engine.spawn()` alongside a `position`.

### Tile-Based Collision

```ts
import { isSolidAt, tileAt } from "@engine";

// Check if a world position is on a solid tile
if (isSolidAt(entity.tilemap, worldX, worldY)) {
  // collision
}

// Get the raw character at a world position
const char = tileAt(entity.tilemap, worldX, worldY); // string | null
```

Both functions use `worldToGrid()` internally to convert from pixel coordinates to grid coordinates, accounting for `offsetX`/`offsetY`.

### Rendering Pipeline

The `AsciiRenderer` (in `engine/render/ascii-renderer.ts`) collects tilemap entities via `world.with("position", "tilemap")` and renders them at their assigned layer (default `-10`, meaning behind most entities). For each cell:

1. If the legend entry has a `bg` color, a filled rectangle is drawn.
2. The character is drawn centered in the cell using the legend's `color` (default white).
3. Space characters (`" "`) are skipped for performance.

### Integrating Procedural Generation with Tilemaps

The `gridMapToTilemapData()` function (from `engine/utils/dungeon.ts`, lines 536-546) converts a `GridMap<string>` to the `string[]` format expected by `createTilemap`:

```ts
import { generateDungeon, gridMapToTilemapData, createTilemap } from "@engine";

const { grid, rooms } = generateDungeon({ cols: 60, rows: 30, seed: 42 });
const data = gridMapToTilemapData(grid); // string[]

const { tilemap } = createTilemap(data, 16, {
  "#": { color: "#888", solid: true },
  ".": { color: "#333" },
});
engine.spawn({ position: { x: 0, y: 0 }, tilemap });
```

---

## Dungeon Generation

**Source:** `engine/utils/dungeon.ts`
**Tests:** `engine/__tests__/utils/dungeon.test.ts`

The engine provides four procedural dungeon generation algorithms, all returning `DungeonResult`:

```ts
interface DungeonResult {
  grid: GridMap<string>;
  rooms: RoomInfo[];
}

interface RoomInfo {
  bounds: Rect;  // { x, y, width, height }
  center: { col: number; row: number };
}
```

All algorithms support seeded RNG via a `seed` parameter for deterministic output and customizable tile characters via the `tiles` option (defaults: `#` wall, `.` floor, `.` corridor, `+` door).

### Algorithm 1: Random Room Placement -- `generateDungeon()`

Places rooms randomly, rejecting overlaps, then connects adjacent rooms with L-shaped corridors.

```ts
import { generateDungeon } from "@engine";

const { grid, rooms } = generateDungeon({
  cols: 60,
  rows: 30,
  minRoomSize: 4,   // default 4
  maxRoomSize: 10,   // default 10
  roomCount: 8,      // default 8
  corridorWidth: 1,  // default 1
  seed: 42,
});
```

Makes up to `roomCount * 20` attempts to place rooms. Rooms are connected sequentially (room N connects to room N-1).

### Algorithm 2: Binary Space Partition -- `generateBSP()`

Recursively splits the map into leaves, places a room in each leaf, and connects sibling leaves with corridors.

```ts
import { generateBSP } from "@engine";

const { grid, rooms } = generateBSP({
  cols: 60,
  rows: 40,
  minLeafSize: 6,   // default 6
  maxDepth: 5,       // default 5
  corridorWidth: 1,
  seed: 7,
});
```

BSP produces more evenly distributed rooms than random placement. The roguelike template uses its own BSP implementation in `games/roguelike/utils/dungeon.ts`.

### Algorithm 3: Cellular Automata Cave -- `generateCave()`

Starts with random fill, then runs cellular automata rules to form organic cave shapes. Connected regions are identified via flood-fill and reported as "rooms."

```ts
import { generateCave } from "@engine";

const { grid, rooms } = generateCave({
  cols: 40,
  rows: 30,
  fillChance: 0.45,      // initial wall probability (default 0.45)
  birthThreshold: 5,     // walls born if >= this many wall neighbors (default 5)
  deathThreshold: 4,     // walls die if < this many wall neighbors (default 4)
  iterations: 4,         // automata passes (default 4)
  seed: 5,
});
```

Borders are always walls. The automata rules:
- A **wall** cell stays wall if it has `>= deathThreshold` wall neighbors (among its 8 neighbors).
- A **floor** cell becomes wall if it has `>= birthThreshold` wall neighbors.

### Algorithm 4: Drunkard's Walk -- `generateWalkerCave()`

A random walker carves floor tiles until the target coverage is reached. Produces more winding, irregular caves.

```ts
import { generateWalkerCave } from "@engine";

const { grid, rooms } = generateWalkerCave({
  cols: 60,
  rows: 30,
  coverage: 0.35,     // fraction of interior cells to carve (default 0.35)
  start: { col: 30, row: 15 }, // optional, defaults to center
  seed: 1,
});
```

Has a safety limit of `target * 20` steps to prevent infinite loops. The walker stays within 1 cell of the border.

### Custom Tile Characters

All algorithms accept a `tiles` option:

```ts
const { grid } = generateDungeon({
  cols: 40,
  rows: 20,
  seed: 42,
  tiles: {
    wall: "X",
    floor: " ",
    corridor: " ",
    door: "+",
  },
});
```

---

## Noise Generation

**Source:** `engine/utils/noise.ts`
**Tests:** `engine/__tests__/utils/noise.test.ts`

### 2D Value Noise

The engine includes a seeded 2D value-noise generator using a permutation table (xorshift32 shuffle) and bilinear interpolation with smoothstep.

```ts
import { createNoise2D } from "@engine";

const noise = createNoise2D({
  seed: 42,          // deterministic seed (default: random)
  scale: 0.05,       // sampling frequency (default 0.1)
  octaves: 3,        // fractal octaves (default 1)
  persistence: 0.5,  // amplitude decay per octave (default 0.5)
});

const value = noise(x, y); // returns [0, 1]
```

**Octave fractal noise:** When `octaves > 1`, multiple noise layers are summed with increasing frequency (doubling each octave) and decreasing amplitude (multiplied by `persistence`). The result is normalized to [0, 1].

### Noise Grid Generation

For direct tilemap integration:

```ts
import { generateNoiseGrid } from "@engine";

const terrain = generateNoiseGrid(80, 40, {
  seed: 7,
  scale: 0.08,
  octaves: 3,
  classify: (v) => (v > 0.6 ? "#" : v > 0.4 ? "~" : "."),
});
// terrain is a GridMap<string>
```

The `classify` function maps each noise value to a tile character. Combine with `gridMapToTilemapData()` and `createTilemap()` for rendering.

---

## Math Helpers

**Source:** `engine/utils/math.ts`
**Tests:** `engine/__tests__/utils/math.test.ts`

### Vec2 Operations

```ts
import { vec2, add, sub, scale, len, normalize, dist, dot } from "@engine";

const v = vec2(3, 4);           // { x: 3, y: 4 }
const zero = vec2();            // { x: 0, y: 0 }

add({ x: 1, y: 2 }, { x: 3, y: 4 });   // { x: 4, y: 6 }
sub({ x: 5, y: 7 }, { x: 2, y: 3 });   // { x: 3, y: 4 }
scale({ x: 2, y: 3 }, 4);               // { x: 8, y: 12 }
len({ x: 3, y: 4 });                    // 5
normalize({ x: 3, y: 4 });              // { x: 0.6, y: 0.8 }
dist({ x: 0, y: 0 }, { x: 3, y: 4 });  // 5
dot({ x: 1, y: 2 }, { x: 3, y: 4 });   // 11
```

`normalize` safely returns `{x: 0, y: 0}` for zero-length vectors.

### Scalar Functions

```ts
import { lerp, clamp, rng, rngInt, pick, chance } from "@engine";

lerp(10, 20, 0.5);    // 15 (linear interpolation)
lerp(0, 100, 1.5);    // 150 (extrapolates beyond [0,1])

clamp(-5, 0, 100);    // 0
clamp(150, 0, 100);   // 100

rng(5, 10);            // random float in [5, 10)
rngInt(1, 6);          // random integer in [1, 6] (inclusive)

pick(["a", "b", "c"]); // random element from array
chance(0.3);            // true 30% of the time
```

**Note:** `rng`, `rngInt`, `pick`, and `chance` use `Math.random()` and are NOT deterministic. For seeded randomness in multiplayer/procgen, use the dungeon/noise generators' built-in seeded RNG or `ctx.random()` in `defineGame`.

---

## Color Helpers

**Source:** `engine/utils/color.ts`
**Tests:** `engine/__tests__/utils/color.test.ts`

```ts
import { hsl, hsla, lerpColor, rainbowColor } from "@engine";

hsl(120, 80, 50);              // "hsl(120, 80%, 50%)"
hsla(120, 80, 50, 0.5);       // "hsla(120, 80%, 50%, 0.5)"

lerpColor("#ff0000", "#0000ff", 0.5); // "#800080" (mid purple)

rainbowColor(elapsed, speed, saturation, lightness);
rainbowColor(engine.time.elapsed, 1, 80, 60); // cycles hue over time
```

**`lerpColor`** interpolates between two hex colors (`#rrggbb` format) in RGB space. `t=0` returns the first color, `t=1` returns the second.

**`rainbowColor`** (exported as `rainbowColor` from `@engine`, `rainbow` internally) cycles hue at `speed` rotations per second. Useful for score text, power-up effects, etc.

---

## Cooldown and Tween Helpers

**Source:** `engine/utils/timer.ts`
**Tests:** `engine/__tests__/utils/timer.test.ts`

### Tween Functions

```ts
import { tween, easeOut } from "@engine";

// Linear interpolation from a to b over duration
tween(elapsed, a, b, duration);
tween(0.5, 0, 100, 1);  // 50

// Ease-out quadratic (fast start, slow finish)
easeOut(elapsed, a, b, duration);
easeOut(0.5, 0, 100, 1); // ~75 (ahead of linear)
```

Both clamp at `b` when `elapsed >= duration`. The `easeOut` formula is `1 - (1 - t)^2`.

The `Cooldown` class is documented in the [Scheduler and Timers](#scheduler-and-timers) section above.

---

## Cutscene System

**Source:** `engine/utils/cutscene.ts`

A chainable builder for scripted sequences. Each step runs to completion before the next starts. The cutscene is driven by the game loop (not browser timers) via `engine.after`.

```ts
import { cutscene } from "@engine";

await cutscene()
  .wait(1)
  .call((engine) => engine.spawn(createNPC(100, 200)))
  .shake(8)
  .wait(0.5)
  .waitForInput("Space")
  .play(engine);
```

**Available steps:**

| Method                       | Description                                                      |
| ---------------------------- | ---------------------------------------------------------------- |
| `.wait(seconds)`             | Pause for a duration.                                            |
| `.call(fn)`                  | Run a function (can be async). Receives the engine.              |
| `.shake(magnitude)`          | Trigger camera shake.                                            |
| `.waitForInput(key)`         | Block until a key is pressed (polls via `engine.after`).         |
| `.tween(target, prop, ...)`  | Tween an entity property and wait for it to complete.            |
| `.play(engine)`              | Execute all steps sequentially. Returns a `Promise<void>`.       |

Cutscenes are ideal for boss introductions, story beats, and tutorial sequences.

---

## Asset Preloader

**Source:** `engine/utils/preloader.ts`
**Tests:** `engine/__tests__/utils/preloader.test.ts`

Bulk-load images, audio, text, and JSON with controlled concurrency and progress tracking.

```ts
import { preloadAssets, getAsset, clearAssetCache } from "@engine";

const result = await preloadAssets(
  [
    { type: "image", url: "/hero.png", id: "hero" },
    { type: "audio", url: "/bgm.mp3", id: "music" },
    { type: "json", url: "/levels.json", id: "levels" },
    { type: "text", url: "/story.txt", id: "story" },
  ],
  {
    onProgress: (loaded, total) => console.log(`${loaded}/${total}`),
    concurrency: 4,
    timeout: 10000,
    continueOnError: true,
  },
);

if (result.success) {
  const hero = result.assets.hero;     // HTMLImageElement
  const levels = result.assets.levels; // parsed JSON object
}

// Assets are also cached and retrievable later:
const hero = getAsset<HTMLImageElement>("hero");

// Free cache when no longer needed:
clearAssetCache();
```

**`PreloadResult`:**

```ts
interface PreloadResult {
  success: boolean;                    // true if zero failures
  assets: Record<string, any>;        // loaded assets keyed by id (or url)
  failures: Record<string, string>;   // failed assets with error messages
  duration: number;                   // total time in ms
}
```

**Options:**

| Option            | Type                                      | Default | Description                                       |
| ----------------- | ----------------------------------------- | ------- | ------------------------------------------------- |
| `onProgress`      | `(loaded, total, asset) => void`          | --      | Called on each asset load.                         |
| `onComplete`      | `(result) => void`                        | --      | Called when all loading finishes.                  |
| `concurrency`     | `number`                                  | 4       | Maximum simultaneous loads.                        |
| `timeout`         | `number`                                  | 10000   | Per-asset timeout in ms.                           |
| `continueOnError` | `boolean`                                 | `true`  | If false, rejects on first failure.                |

Asset IDs default to the URL if not provided. Loaded assets are cached globally and retrievable via `getAsset(id)`.

---

## ASCII Sprite Library

**Source:** `engine/data/ascii-sprites.ts`

A built-in collection of ASCII art sprites, border styles, and helper functions.

### Pre-Made Sprites

```ts
import { ASCII_SPRITES } from "@engine";

// Characters
ASCII_SPRITES.characters.player;      // ["  O  ", " /|\\ ", " / \\ "]
ASCII_SPRITES.characters.enemy;       // [" \\o/ ", "  |  ", " / \\ "]
ASCII_SPRITES.characters.ghost;       // [" .-. ", "| O O|", "|   |", " ^^^ "]
// Also: robot, wizard, skeleton, bat, slime, fish, bird

// Effects
ASCII_SPRITES.effects.explosion1;     // [" \\|/ ", "-- --", " /|\\ "]
ASCII_SPRITES.effects.sparkle;        // [" * ", "*+*", " * "]
// Also: explosion2, smoke, impact, ripple, portal

// UI elements
ASCII_SPRITES.ui.heart;
ASCII_SPRITES.ui.skull;
ASCII_SPRITES.ui.shield;
// Also: star, diamond, sword, potion, key, coin, chest, flag, arrow.*

// Block characters
ASCII_SPRITES.blocks.full;   // "█"
ASCII_SPRITES.blocks.dark;   // "▓"
ASCII_SPRITES.blocks.medium; // "▒"
ASCII_SPRITES.blocks.light;  // "░"
```

### Border Styles

Five border styles are available: `single`, `double`, `rounded`, `heavy`, `dashed`. Each provides characters for horizontal, vertical, corners, and junctions.

```ts
import { asciiBox } from "@engine";

asciiBox(5, 3);           // ["┌───┐", "│   │", "└───┘"]
asciiBox(5, 3, "double"); // ["╔═══╗", "║   ║", "╚═══╝"]
asciiBox(7, 4, "rounded");
asciiBox(7, 4, "heavy");
asciiBox(7, 4, "dashed");
```

### Loading ASCII Art from Files

```ts
import { parseAsciiArt, createAsciiSprite, createAsciiFrames } from "@engine";

// Load from a Vite ?raw import
import parrotTxt from "./assets/parrot.txt?raw";
const lines = parseAsciiArt(parrotTxt); // trims blank lines

// Create a sprite component ready for engine.spawn()
const { sprite } = createAsciiSprite(parrotTxt, {
  font: '10px "Fira Code", monospace',
  color: "#e0e0e0",
  colorMap: { "@": "#ff4444", "~": "#44aa44" },
  glow: "#ff000033",
  opacity: 0.9,
  layer: 5,
});
engine.spawn({ position: { x: 400, y: 300 }, sprite });

// Create animation frames from multiple art files
import frame1 from "./assets/parrot1.txt?raw";
import frame2 from "./assets/parrot2.txt?raw";
const frames = createAsciiFrames([frame1, frame2], 0.15);
engine.playAnimation(entity, frames, 0.15, true); // loop
```

---

## Extension Workflows

### 1. Adding a New Utility Module

1. Create the file in `engine/utils/`:

```ts
// engine/utils/my-util.ts
export function myHelper(input: number): number {
  return input * 2;
}
```

2. Export from `engine/index.ts`:

```ts
// In engine/index.ts, add:
export { myHelper } from "./utils/my-util";
```

3. Write tests in `engine/__tests__/utils/`:

```ts
// engine/__tests__/utils/my-util.test.ts
import { describe, expect, test } from "bun:test";
import { myHelper } from "../../utils/my-util";

describe("myHelper", () => {
  test("doubles input", () => {
    expect(myHelper(5)).toBe(10);
  });
});
```

4. Verify: `bun run check:all && bun test engine/__tests__/utils/my-util.test.ts`

**Import boundary rule:** `engine/` may only import from `@shared` and `@engine`. Never import `@game` or `@ui`.

### 2. Creating a Custom Pathfinding Heuristic

The `findPath` function's heuristic is internal, but you can influence pathfinding behavior via the `isWalkable` callback to implement weighted costs:

```ts
import { findPath, GridMap } from "@engine";

// Terrain-weighted pathfinding: prefer roads over swamps
const terrain = new GridMap<string>(50, 50, "grass");
// ... populate with "road", "swamp", "wall"

const path = findPath(terrain, start, goal, {
  isWalkable: (_col, _row, val) => val !== "wall",
  // The engine uses uniform cost, but you can filter costly cells:
  // Swamps could be made impassable to force road-following
});
```

For truly weighted A* with variable movement costs, you would need to extend `findPath` by modifying `engine/utils/pathfinding.ts` (lines 133-134) to consult a cost function instead of the fixed `moveCost`:

```ts
// Current (line 134):
const moveCost = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1;

// Extended with a cost function:
const baseCost = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1;
const moveCost = baseCost * (options?.getCost?.(nc, nr, grid.get(nc, nr)) ?? 1);
```

### 3. Implementing a New Storage Backend

The current storage layer uses `localStorage`. To add a different backend (e.g., IndexedDB, cloud storage), create a new module that implements the same interface:

```ts
// engine/storage/indexed-db-storage.ts
let prefix = "ascii-game";

export function setStoragePrefix(gameId: string): void {
  prefix = gameId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export async function save(name: string, data: unknown): Promise<void> {
  const db = await openDB();
  const tx = db.transaction("saves", "readwrite");
  tx.objectStore("saves").put(JSON.stringify(data), `${prefix}:${name}`);
}

export async function load<T = unknown>(name: string): Promise<T | undefined> {
  const db = await openDB();
  const tx = db.transaction("saves", "readonly");
  const raw = await tx.objectStore("saves").get(`${prefix}:${name}`);
  return raw ? JSON.parse(raw) : undefined;
}

// ... implement remove, has, clearAll similarly
```

The `SaveSlotManager` delegates to `save`/`load`/`remove`/`has` from `engine/storage/index.ts`, so swapping the backend in the index would propagate to all higher-level systems.

### 4. Creating a Procedural Tilemap Generator

Combine the engine's dungeon generators with the tilemap system:

```ts
import {
  generateCave,
  gridMapToTilemapData,
  createTilemap,
  createNoise2D,
  GridMap,
} from "@engine";

function createOverworldMap(seed: number) {
  const noise = createNoise2D({ seed, scale: 0.04, octaves: 4 });
  const cols = 100;
  const rows = 60;
  const grid = new GridMap<string>(cols, rows);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = noise(c, r);
      if (v > 0.7) grid.set(c, r, "^");       // mountains
      else if (v > 0.5) grid.set(c, r, "T");   // trees
      else if (v > 0.35) grid.set(c, r, ".");   // grass
      else if (v > 0.25) grid.set(c, r, "~");   // shallow water
      else grid.set(c, r, "W");                 // deep water
    }
  }

  return createTilemap(gridMapToTilemapData(grid), 16, {
    "^": { color: "#999", bg: "#444", solid: true },
    "T": { color: "#2a6", bg: "#143" },
    ".": { color: "#4a4", bg: "#232" },
    "~": { color: "#48f", bg: "#124" },
    "W": { color: "#26a", bg: "#013", solid: true },
  });
}
```

### 5. Adding a New Data Table Type

Game data definitions live in game code (`games/<template>/config.ts`), not in the engine. The pattern is a plain TypeScript const object:

```ts
// games/my-game/data/items.ts
export interface ItemDef {
  id: string;
  name: string;
  type: "weapon" | "armor" | "consumable";
  value: number;
  effect?: { stat: string; amount: number };
}

export const ITEMS: Record<string, ItemDef> = {
  "iron-sword": {
    id: "iron-sword",
    name: "Iron Sword",
    type: "weapon",
    value: 50,
    effect: { stat: "attack", amount: 5 },
  },
  "health-potion": {
    id: "health-potion",
    name: "Health Potion",
    type: "consumable",
    value: 25,
    effect: { stat: "hp", amount: 20 },
  },
};

// Lookup function for serializeGameState's itemLookup option
export function lookupItem(id: string): ItemDef | undefined {
  return ITEMS[id];
}
```

For the roguelike template, game data lives in `games/roguelike/config.ts` as a deeply nested `GAME` constant with sub-objects for `player`, `enemies`, `items`, `dungeon`, `scoring`, and `messages`. This pattern keeps all tunable values in one place for easy balancing.

---

## Summary of File Locations

| System              | Source                          | Tests                                    |
| ------------------- | ------------------------------- | ---------------------------------------- |
| Pathfinding         | `engine/utils/pathfinding.ts`   | `engine/__tests__/utils/pathfinding.test.ts` |
| Grid                | `engine/utils/grid.ts`          | `engine/__tests__/utils/grid.test.ts`    |
| Scheduler           | `engine/utils/scheduler.ts`     | `engine/__tests__/utils/scheduler.test.ts` |
| Cooldown / Tween    | `engine/utils/timer.ts`         | `engine/__tests__/utils/timer.test.ts`   |
| Noise               | `engine/utils/noise.ts`         | `engine/__tests__/utils/noise.test.ts`   |
| Dungeon Generation  | `engine/utils/dungeon.ts`       | `engine/__tests__/utils/dungeon.test.ts` |
| Color               | `engine/utils/color.ts`         | `engine/__tests__/utils/color.test.ts`   |
| Math                | `engine/utils/math.ts`          | `engine/__tests__/utils/math.test.ts`    |
| Cutscene            | `engine/utils/cutscene.ts`      | --                                       |
| Preloader           | `engine/utils/preloader.ts`     | `engine/__tests__/utils/preloader.test.ts` |
| Storage (raw)       | `engine/storage/storage.ts`     | `engine/__tests__/storage/storage.test.ts` |
| Game State          | `engine/storage/game-state.ts`  | `engine/__tests__/storage/game-state.test.ts` |
| Save Slots          | `engine/storage/save-slots.ts`  | `engine/__tests__/storage/save-slots.test.ts` |
| High Scores         | `engine/storage/high-scores.ts` | --                                       |
| Tilemap             | `engine/tiles/tilemap.ts`       | --                                       |
| ASCII Sprites       | `engine/data/ascii-sprites.ts`  | --                                       |
| Types               | `shared/types.ts`               | --                                       |
| Roguelike dungeon   | `games/roguelike/utils/dungeon.ts` | `engine/__tests__/templates/roguelike.test.ts` |
| Roguelike FOV       | `games/roguelike/utils/fov.ts`  | --                                       |
| Roguelike config    | `games/roguelike/config.ts`     | --                                       |
