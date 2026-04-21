---
name: procgen
description: Use when working with procedural generation, dungeon building (`generateDungeon`, `generateBSP`, `generateCave`, `generateWalkerCave`), pathfinding (`findPath`, A*), noise generation (`createNoise2D`, `generateNoiseGrid`, simplex/FBM), tilemaps (`createTilemap`, `GridMap`), cutscene scripting (`Cutscene`, `play`, `waitForInput`), or engine timing (`engine.after`, `engine.every`, `engine.sequence`, `Cooldown`, `Scheduler`). Also use when designing procedural content pipelines, level generation, or terrain systems.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Procedural generation and utilities

Five utility modules for content generation, spatial queries, narrative scripting, and game timing. All use deterministic seeded RNG where applicable — critical for multiplayer lockstep and reproducible testing.

## Why seeded RNG everywhere

Every generation function accepts an optional `seed` parameter. Same seed = same output, always. This enables:
- **Multiplayer:** All peers generate the same dungeon from the same seed
- **Testing:** Reproducible test cases for procedural content
- **Replays:** Seed + move history = full replay

The engine provides `createSeededRandom(seed?)` — xorshift32 + splitmix32 seed mixing. Small sequential seeds (1, 2, 3) produce uncorrelated outputs.

## Source files

| File | What it provides |
|---|---|
| `engine/utils/dungeon.ts` | 4 dungeon generation algorithms + shared helpers |
| `engine/utils/pathfinding.ts` | A* pathfinding on GridMap |
| `engine/utils/noise.ts` | 2D simplex noise with fractal Brownian motion |
| `engine/utils/cutscene.ts` | Chainable cutscene builder |
| `engine/utils/scheduler.ts` | Timer management (engine.after/every/sequence internals) |

## Dungeon generation — 4 algorithms

All algorithms return `DungeonResult: { grid: GridMap<string>, rooms: RoomInfo[] }` and accept customizable tile characters (`{ wall: "#", floor: ".", corridor: ".", door: "+" }`).

### 1. `generateDungeon(config)` — Random room placement

Places `roomCount` rectangular rooms with overlap rejection, connects with L-shaped corridors.

```typescript
const { grid, rooms } = generateDungeon({
  cols: 60, rows: 30,
  minRoomSize: 4, maxRoomSize: 10,
  roomCount: 8,
  corridorWidth: 1,
  seed: 42,
})
```

**Why this algorithm:** Fast, simple, guaranteed connectivity (each room connects to the previous one). Good for action-oriented dungeons with loose room placement. Max 20 placement attempts per room — if the map is too crowded, fewer rooms are placed.

### 2. `generateBSP(config)` — Binary space partition

Recursively splits the map into leaves, places one room per leaf, connects siblings.

```typescript
const { grid, rooms } = generateBSP({
  cols: 80, rows: 40,
  minLeafSize: 8,
  maxDepth: 5,
  corridorWidth: 1,
  seed: 42,
})
```

**Why this algorithm:** Produces well-distributed rooms with no overlap (guaranteed by the partition tree). Rooms fill the space more evenly than random placement. Best for roguelikes that need balanced exploration. Used by the roguelike template (`games/roguelike/utils/dungeon.ts`).

### 3. `generateCave(config)` — Cellular automata

Starts with random fill, applies Conway-like smoothing rules over N iterations.

```typescript
const { grid, rooms } = generateCave({
  cols: 60, rows: 30,
  fillChance: 0.45,       // initial wall probability
  birthThreshold: 5,      // neighbors to birth a wall
  deathThreshold: 4,      // neighbors to kill a wall
  iterations: 4,
  seed: 42,
})
```

**Why this algorithm:** Produces organic, cave-like spaces. The cellular automata rules create natural-feeling caverns with irregular walls. Rooms identified post-hoc via flood-fill BFS. Good for underground/natural environments.

### 4. `generateWalkerCave(config)` — Drunkard's walk

Random walker carves floor tiles until `coverage` fraction of the map is carved.

```typescript
const { grid, rooms } = generateWalkerCave({
  cols: 60, rows: 30,
  coverage: 0.35,         // carve 35% of interior cells
  start: { col: 30, row: 15 },
  seed: 42,
})
```

**Why this algorithm:** Produces winding, maze-like tunnels. Simple to implement and tune. `coverage` directly controls density. Safety limit: max `target × 20` steps to prevent infinite loops. Best for worm tunnels, mine shafts, or connecting pre-placed features.

### Shared helpers

| Function | Purpose |
|---|---|
| `rectsOverlap(a, b, padding)` | AABB collision with padding margin |
| `carveRect(grid, rect, tile)` | Fill rectangular region |
| `roomCenter(rect)` | Calculate center of rectangle |
| `floodFillRooms(grid, cols, rows, floorTile)` | BFS to identify connected regions |
| `gridMapToTilemapData(grid)` | Convert GridMap to string[] for `createTilemap()` |

### Wiring a dungeon to the engine

```typescript
const { grid, rooms } = generateBSP({ cols: 80, rows: 40, seed: 42 })
const tilemapData = gridMapToTilemapData(grid)

engine.spawn({
  position: { x: 0, y: 0 },
  tilemap: {
    data: tilemapData,
    cellSize: 16,
    legend: {
      '#': { char: '#', color: '#666', solid: true },
      '.': { char: '.', color: '#333' },
    },
    offsetX: 0, offsetY: 0,
  },
})
```

## A* pathfinding

Grid-based A* with min-heap priority queue.

```typescript
const path = findPath(grid, start, goal, {
  diagonal: true,           // 8-directional (Chebyshev heuristic) vs 4-directional (Manhattan)
  isWalkable: (cell) => cell !== '#',
  maxIterations: 5000,      // budget limit (default: cols × rows × 2)
})
// Returns { col, row }[] from start to goal (inclusive), or null if no path
```

**Movement costs:** Orthogonal = 1.0, diagonal = √2 ≈ 1.41.

**Why A* over Dijkstra?** Heuristic focuses the search toward the goal, exploring fewer nodes. With grid-based movement, Manhattan/Chebyshev heuristics are admissible and consistent — A* finds optimal paths.

**Budget limit:** `maxIterations` prevents pathfinding from freezing on huge maps or unreachable goals. Default is generous (`cols × rows × 2`) but configurable for tight performance budgets.

**Pre-checks:** Both start and goal must be in bounds and walkable — returns null immediately if not.

## Noise generation

2D simplex noise with fractal Brownian motion (FBM) for layered detail.

```typescript
const noise = createNoise2D({
  seed: 42,
  scale: 0.1,          // sampling frequency (lower = larger features)
  octaves: 4,          // FBM layers (more = more detail, more cost)
  persistence: 0.5,    // amplitude decay per octave (0-1)
})

const value = noise(x, y)   // returns [0, 1] (always normalized)
```

**FBM algorithm:** Sums multiple octaves of simplex noise. Each octave doubles the frequency and halves the amplitude (controlled by `persistence`). Output normalized to [0, 1] regardless of octave count.

**Grid helper:**
```typescript
const grid = generateNoiseGrid(60, 30, {
  seed: 42, scale: 0.08, octaves: 3,
  classify: (v) => v > 0.6 ? '#' : v > 0.4 ? '~' : '.',
})
```

**Why simplex over Perlin?** Better performance in 2D (fewer multiplications), no visible grid artifacts, smoother gradients. The `simplex-noise` library handles the implementation.

## Cutscene scripting

Chainable builder for scripted sequences:

```typescript
const intro = new Cutscene()
  .call((engine) => engine.dialog.show('Welcome, adventurer.', { speaker: 'NPC' }))
  .wait(2)
  .shake(8)
  .waitForInput('Space')
  .tween(() => player, 'position.x', 100, 400, 1.5, 'easeInOut')
  .wait(0.5)
  .call((engine) => engine.loadScene('dungeon'))

await intro.play(engine)
```

**Steps:** `wait(seconds)`, `call(fn)`, `shake(magnitude)`, `waitForInput(key)`, `tween(target, property, from, to, duration, ease)`.

**Why chainable builder?** Reads like a screenplay. Each step is a declarative instruction. The runtime handles timing, input polling, and cleanup. Cancellable via `intro.cancel()` (rejects pending promises).

**Integration:** Uses `engine.after()` for timing, `engine.camera.shake()` for effects, `engine.tweenEntity()` for animation, `engine.keyboard.pressed()` for input. All respect engine pause state.

## Scheduler (engine timing)

The internal system behind `engine.after()`, `engine.every()`, `engine.sequence()`:

```typescript
engine.after(2, () => spawnBoss())                    // one-shot: fire after 2 seconds
engine.every(0.5, () => spawnBullet())                // repeating: fire every 0.5 seconds
engine.sequence([                                      // chained: execute in order
  { delay: 1, fn: () => dialog.show('Ready...') },
  { delay: 1, fn: () => dialog.show('Go!') },
  { delay: 0, fn: () => engine.loadScene('play') },
])

const cd = new Cooldown(0.3)                           // rate limiter
cd.update(dt)
if (cd.fire()) shootBullet()                           // returns true when cooldown expires
```

All return a cancel ID: `const id = engine.after(2, fn); engine.cancel(id)`.

**Catch-up logic:** If a frame drops (large dt), repeating timers fire multiple times in a single update to stay on schedule. Prevents timer stalls during lag spikes.

**Scene lifecycle:** Timers are cleared automatically on scene change via `scheduler.clear()`. No manual cleanup needed.

**Why not `setInterval`/`setTimeout`?** Those run on wall-clock time, unaffected by pause/resume or `engine.timeScale`. They leak if not cleared. The scheduler respects game time and auto-cleans on scene transitions.

## Common patterns

### Dungeon + pathfinding + tilemap pipeline
```typescript
const { grid, rooms } = generateBSP({ cols: 80, rows: 40, seed: 42 })
const navGrid = grid  // same grid for navigation

// Spawn tilemap
const data = gridMapToTilemapData(grid)
engine.spawn({ position: { x: 0, y: 0 }, tilemap: { data, cellSize: 16, legend } })

// Place player in first room
const start = rooms[0].center
engine.spawn(createPlayer(start.col, start.row))

// Enemy pathfinding
const path = findPath(navGrid, enemy.gridPos, player.gridPos, {
  isWalkable: (cell) => cell !== '#',
})
if (path && path.length > 1) {
  const next = path[1]  // next step toward player
  moveEnemy(enemy, next)
}
```

### Noise-based terrain
```typescript
const terrain = generateNoiseGrid(80, 40, {
  seed: 42, scale: 0.06, octaves: 4, persistence: 0.5,
  classify: (v) => v > 0.65 ? '▲' : v > 0.45 ? '~' : v > 0.3 ? '.' : ' ',
})
```

## Things NOT to do

- Don't use `Math.random()` in generation — use `createSeededRandom()` or the `seed` parameter for reproducibility.
- Don't call `findPath()` every frame for every enemy — cache paths and recalculate on player movement or at intervals.
- Don't skip `maxIterations` on large maps — pathfinding without a budget can freeze the game.
- Don't generate dungeons in `update()` — generate in `setup()` and cache the result.
- Don't use `setTimeout`/`setInterval` — use `engine.after()`/`engine.every()`.
