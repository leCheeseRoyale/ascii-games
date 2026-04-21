# Game Authoring Workflows

A comprehensive guide to building games with the ASCII game engine. Covers both game APIs, the template system, scaffolding tools, AI-assisted development, and step-by-step recipes for common tasks.

---

## Table of Contents

1. [Choosing Your API: defineGame vs defineScene](#choosing-your-api-definegame-vs-definescene)
2. [defineGame Deep Dive](#definegame-deep-dive)
3. [defineScene + ECS Deep Dive](#definescene--ecs-deep-dive)
4. [Template System](#template-system)
5. [Scaffolding Commands](#scaffolding-commands)
6. [AI-Assisted Development](#ai-assisted-development)
7. [Common Workflows (Step-by-Step Recipes)](#common-workflows)

---

## Choosing Your API: defineGame vs defineScene

The engine offers two distinct APIs for building games. Which one you pick depends on the kind of game you are making.

### Decision Tree

```
Is your game turn-based, board-style, or puzzle-style?
  YES --> Does it need physics, real-time movement, or complex entity hierarchies?
            YES --> defineScene + defineSystem (ECS)
            NO  --> defineGame (declarative)
  NO  --> Is it real-time (shooter, platformer, action)?
            YES --> defineScene + defineSystem (ECS)
            NO  --> Is it a card game or strategy game with discrete moves?
                      YES --> defineGame (declarative)
                      NO  --> defineScene + defineSystem (ECS)
```

### defineGame -- Declarative, Boardgame-Style

**Best for:** Turn-based games, board games, puzzles, hotseat multiplayer, card games.

**What it handles automatically:**
- Turn rotation between players
- Phase transitions (e.g., place -> resolve -> score)
- Game-over detection via `endIf`
- Move validation (return `'invalid'` to reject a move)
- Seeded RNG for deterministic replays / multiplayer
- Scene registration via `engine.runGame(def)`

**What you provide:**
- Game state shape (a plain TypeScript type)
- `setup()` to construct initial state
- `moves` -- named functions that mutate state
- `endIf()` -- win/draw/loss detection
- `render()` -- canvas drawing and input handling (called every frame)

**Typical file count:** 1-2 files (game definition + config). The tic-tac-toe template is 117 lines total.

**Reference templates:** `games/tic-tac-toe/`, `games/connect-four/`

### defineScene + defineSystem -- ECS, Full Control

**Best for:** Real-time action games, physics-heavy games, platformers, shooters, roguelikes, anything with many entities moving independently.

**What it handles automatically:**
- 8 built-in systems run every frame: `_parent`, `_physics`, `_tween`, `_animation`, `_lifetime`, `_screenBounds`, `_emitter`, `_stateMachine`
- Physics integration (`position += velocity * dt`)
- Entity lifecycle (spawn, destroy, query)
- Scene transitions with visual effects

**What you provide:**
- Entity factories (plain objects with component data)
- Custom systems (game logic that runs each frame)
- Scenes (setup, update, cleanup lifecycle)
- Input handling and scoring

**Typical file count:** 5-15 files (index + config + scenes + entities + systems).

**Reference templates:** `games/asteroid-field/` (real-time), `games/roguelike/` (turn-based ECS), `games/platformer/`

### Can They Be Mixed?

Yes. `defineGame` accepts a `systems` array for custom ECS systems that run alongside its auto-generated scene. This is useful when you want the declarative turn/move/endIf structure but also need entity-based rendering or particle effects. However, if you find yourself fighting the declarative API to get ECS-level control, switch to `defineScene` instead.

The roguelike template demonstrates the reverse -- using `defineScene` for full ECS control while manually wiring `engine.turns.configure()` for turn-based phases. This gives you the phase system without the rest of the `defineGame` abstraction.

---

## defineGame Deep Dive

### Full API Reference

```ts
import { defineGame, type Engine, type MoveInputCtx } from '@engine'

const myGame = defineGame<State, Player>({
  // Required
  name: string,                        // Scene name (default scene is 'play')
  setup: (ctx: SetupContext) => State,  // Construct initial state
  moves: {                             // Named move functions
    moveName(ctx: GameContext, ...args) {
      // Mutate ctx.state directly
      // Return 'invalid' to reject the move
    },
  },

  // Optional
  players?: {                  // Player count config
    min?: number,              // Default: 1
    max?: number,              // Default: Infinity
    default?: number,          // Default: 2 (or turns.order.length)
  },
  seed?: number,               // Deterministic RNG seed (required for multiplayer)
  turns?: {
    order?: readonly Player[], // e.g. ['X', 'O'] -- rotates currentPlayer
    autoEnd?: boolean,         // Default: true -- advance turn after each move
  },
  phases?: {
    order: string[],           // Phase names in sequence. First entered on start.
    [phaseName: string]: {     // Per-phase config
      onEnter?: (ctx) => void,
      onExit?: (ctx) => void,
      endIf?: (ctx) => string | null,  // Return next phase name to transition
      moves?: string[],                // Whitelist of allowed moves in this phase
    },
  },
  endIf?: (ctx) => GameResult | null,  // Return { winner } / { draw: true } to end
  render?: (ctx) => void,              // Called every frame for canvas drawing
  systems?: System[],                  // Extra ECS systems to register
  startScene?: string,                 // Override generated scene name (default 'play')
})
```

### SetupContext (received by `setup`)

```ts
interface SetupContext {
  numPlayers: number    // Based on players.default or turns.order.length
  random: () => number  // Seeded RNG in [0, 1)
  engine: Engine        // Full engine instance
}
```

### GameContext (received by moves, endIf, render, phase hooks)

```ts
interface GameContext<TState, TPlayer> {
  engine: Engine                 // Full engine instance
  state: TState                  // Mutable game state -- mutate directly in moves
  phase: string | null           // Current phase name, or null if no phases
  turn: number                   // 1-based turn number
  currentPlayer: TPlayer         // Current player id from turns.order
  playerIndex: number            // 0-based index into player order
  numPlayers: number             // Total player count
  moves: Record<string, (...args) => MoveResult | 'game-over'>  // Bound moves
  random: () => number           // Seeded RNG
  log: (msg: string) => void     // Append to history log
  result: GameResult | null      // Final result once endIf fires; null while live
  endTurn: () => void            // Manually advance to next player
  endPhase: () => void           // Advance to next phase
  goToPhase: (name: string) => void  // Jump to a specific phase
}
```

### MoveInputCtx (convenience subset for input helpers)

When you extract input handling into a helper function (recommended for readability), use `MoveInputCtx` instead of the full `GameContext`:

```ts
import { type MoveInputCtx } from '@engine'

function handleInput(ctx: MoveInputCtx<State, Player>) {
  // Has: ctx.engine, ctx.moves, ctx.state, ctx.result, ctx.currentPlayer
  if (ctx.engine.keyboard.pressed('KeyR')) ctx.moves.reset()
}
```

### Move Validation

Moves return nothing on success. Return `'invalid'` to reject -- state is untouched, the turn does not advance, and no side effects occur:

```ts
moves: {
  place(ctx, idx: number) {
    if (idx < 0 || idx >= 9) return 'invalid'       // out of bounds
    if (ctx.state.board[idx] !== null) return 'invalid' // cell occupied
    ctx.state.board[idx] = ctx.currentPlayer         // success -- mutate state
  },
},
```

After the game has ended (`ctx.result` is set), all moves return `'game-over'` automatically.

### Turn Rotation

When `turns.autoEnd` is `true` (the default), the engine automatically advances to the next player after each successful move. The order cycles through `turns.order`:

```ts
turns: { order: ['X', 'O'] }
// Move 1: currentPlayer = 'X'
// Move 2: currentPlayer = 'O'
// Move 3: currentPlayer = 'X' (turn 2 begins)
```

For multi-action turns (where a player takes several actions before passing), set `autoEnd: false` and call `ctx.endTurn()` explicitly:

```ts
turns: { order: ['A', 'B'], autoEnd: false },
moves: {
  act(ctx, action: string) {
    // ... do something ...
    if (action === 'done') ctx.endTurn()  // manually end the turn
  },
},
```

### Phases

Phases partition a turn into named stages. Each phase can restrict which moves are allowed and define transition conditions:

```ts
phases: {
  order: ['place', 'resolve', 'cleanup'],
  place: {
    moves: ['placeTile'],          // Only placeTile is allowed during 'place'
    endIf: (ctx) => {
      // Return the next phase name to transition, or null to stay
      return allTilesPlaced(ctx.state) ? 'resolve' : null
    },
  },
  resolve: {
    onEnter: (ctx) => { scoreRound(ctx.state) },
    endIf: () => 'cleanup',        // Always transition after one pass
  },
  cleanup: {
    onEnter: (ctx) => { resetBoard(ctx.state) },
    endIf: () => 'place',          // Loop back
  },
},
```

Phase lifecycle: `onExit` of current phase -> switch -> `onEnter` of next phase.

### Game-Over Conditions

The top-level `endIf` is checked after every successful move. Return any truthy object to end the game:

```ts
endIf(ctx) {
  const w = checkWinner(ctx.state.board)
  if (w) return { winner: w }
  if (ctx.state.board.every(c => c !== null)) return { draw: true }
  // Return nothing (undefined) to continue playing
},
```

Once `endIf` returns a result, `ctx.result` is set and all subsequent moves return `'game-over'`.

### Canvas-Only Rendering (Suppressing React Overlay)

Both `defineGame` templates use canvas-only rendering. The pattern is to return empty React components from `setupGame`:

```ts
const Empty = () => null

export function setupGame(engine: Engine) {
  return {
    startScene: engine.runGame(myGame),
    screens: { menu: Empty, playing: Empty, gameOver: Empty },
    hud: [],
  }
}
```

Inside `render()`, use the engine's immediate-mode UI API:

```ts
render(ctx) {
  const e = ctx.engine

  // Draw a bordered panel
  e.ui.panel(x, y, w, h, { border: 'double', bg: '#0a0a0a', borderColor: '#4a4a4a' })

  // Draw text (centered, styled)
  e.ui.text(e.width / 2, 20, 'Turn: X', {
    align: 'center',
    font: '20px "Fira Code", monospace',
    color: '#e0e0e0',
  })

  // Draw a health/progress bar
  e.ui.bar(x, y, width, segments, fillPercent, {
    fillColor: '#0f8',
    emptyColor: '#222',
  })

  // Handle input
  if (e.mouse.justDown && !ctx.result) {
    const col = Math.floor((e.mouse.x - offsetX) / cellSize)
    if (col >= 0 && col < numCols) ctx.moves.drop(col)
  }
  if (e.keyboard.pressed('KeyR')) ctx.moves.reset()
},
```

### Walk-Through: Tic-Tac-Toe

The `games/tic-tac-toe/index.ts` template demonstrates the complete `defineGame` pattern in a single file.

**State:** A 9-cell board array where each cell is `'X'`, `'O'`, or `null`.

```ts
type Mark = 'X' | 'O' | null
type Player = 'X' | 'O'
type State = { board: Mark[] }
```

**Win detection:** Check all 8 winning lines (3 rows, 3 columns, 2 diagonals):

```ts
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],  // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8],  // columns
  [0, 4, 8], [2, 4, 6],              // diagonals
]

function checkWinner(b: Mark[]): Mark {
  for (const [a, c, d] of LINES)
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a]
  return null
}
```

**Game definition:** Setup returns an empty board. Two moves: `place` (validates the cell is empty, writes the current player's mark) and `reset` (clears the board). `endIf` checks for a winner or a full board.

```ts
export const ticTacToe = defineGame({
  name: 'tic-tac-toe',
  players: { min: 2, max: 2, default: 2 },
  setup: (): State => ({ board: Array(9).fill(null) }),
  turns: { order: ['X', 'O'] },
  moves: {
    place(ctx, idx: number) {
      if (ctx.state.board[idx] !== null) return 'invalid'
      ctx.state.board[idx] = ctx.currentPlayer
    },
    reset(ctx) {
      ctx.state.board = Array(9).fill(null)
    },
  },
  endIf(ctx) {
    const w = checkWinner(ctx.state.board)
    if (w) return { winner: w }
    if (ctx.state.board.every(c => c !== null)) return { draw: true }
  },
  render(ctx) {
    drawBoard(ctx.engine, ctx.state.board, ctx.currentPlayer, ctx.result)
    handleInput(ctx)
  },
})
```

**Rendering:** `drawBoard` uses `engine.ui.panel` for the grid background and `engine.ui.text` for each mark and the status line. Colors come from `config.ts` via the `GAME` object.

**Input:** `handleInput` maps mouse position to a cell index. The board is centered on screen; the click position is translated into grid coordinates:

```ts
function handleInput(ctx: MoveInputCtx<State, Player>) {
  const engine = ctx.engine
  if (engine.keyboard.pressed('KeyR')) ctx.moves.reset()
  if (!engine.mouse.justDown || ctx.result) return
  const cell = GAME.board.size / 3
  const ox = engine.width / 2 - GAME.board.size / 2
  const oy = engine.height / 2 - GAME.board.size / 2
  const col = Math.floor((engine.mouse.x - ox) / cell)
  const row = Math.floor((engine.mouse.y - oy) / cell)
  if (col < 0 || col > 2 || row < 0 || row > 2) return
  ctx.moves.place(row * 3 + col)
}
```

### Walk-Through: Connect Four

The `games/connect-four/index.ts` template is a more complex `defineGame` example: a 7x6 grid with gravity (discs drop to the lowest empty row) and 4-in-a-row detection across all directions.

**State:** A 2D array of rows, each row an array of cells:

```ts
type Cell = 'R' | 'Y' | null
type Player = 'R' | 'Y'
type State = { board: Cell[][]; winner?: Cell; draw?: boolean }
```

**Gravity in the move:** The `drop` move scans from the bottom row upward to find the first empty cell in the chosen column:

```ts
moves: {
  drop(ctx, col: number) {
    if (col < 0 || col >= COLS) return 'invalid'
    const b = ctx.state.board
    for (let r = ROWS - 1; r >= 0; r--) {
      if (b[r][col] === null) {
        b[r][col] = ctx.currentPlayer
        return  // success
      }
    }
    return 'invalid'  // column is full
  },
},
```

**Win detection:** Scans every cell in 4 directions (horizontal, vertical, both diagonals) looking for 4 consecutive same-colored pieces.

**Key difference from tic-tac-toe:** The board is 2D (`Cell[][]` not `Mark[]`), rendering iterates rows and columns with a per-cell character (filled piece or empty dot), and input only needs the column (the row is determined by gravity).

---

## defineScene + ECS Deep Dive

### Scene Lifecycle

A scene is a discrete game state -- title screen, gameplay, game over. Each scene has three lifecycle hooks:

```ts
import { defineScene, type Engine } from '@engine'

export const playScene = defineScene({
  name: 'play',

  // Called once when the scene loads. Spawn entities, add systems.
  setup(engine: Engine) {
    engine.spawn(createPlayer(engine.centerX, engine.centerY))
    engine.addSystem(playerInputSystem)
    engine.addSystem(collisionSystem)
  },

  // Called every frame after all systems run. Optional.
  update(engine: Engine, dt: number) {
    if (engine.keyboard.pressed('Escape')) engine.loadScene('title')
  },

  // Called when leaving this scene. Optional.
  cleanup(engine: Engine) {
    // Remove event listeners, clear module-level state, etc.
  },
})
```

When a scene loads, the engine automatically:
1. Runs `cleanup()` on the current scene
2. Clears all custom systems
3. Clears all entities from the world
4. Runs `setup()` on the new scene (which re-registers built-in systems)

### Registering and Switching Scenes

Scenes are registered in `game/index.ts` and the starting scene name is returned:

```ts
export function setupGame(engine: Engine): string {
  engine.registerScene(titleScene)
  engine.registerScene(playScene)
  engine.registerScene(gameOverScene)
  return 'title'  // start here
}
```

Switch scenes with optional transitions:

```ts
engine.loadScene('play')                                    // instant
engine.loadScene('play', { transition: 'fade' })            // fade to black
engine.loadScene('play', { transition: 'fadeWhite' })       // fade through white
engine.loadScene('play', { transition: 'wipe' })            // horizontal wipe
engine.loadScene('play', { transition: 'dissolve', duration: 0.5 })
engine.loadScene('play', { transition: 'scanline' })
```

Pass data between scenes:

```ts
// Sender:
engine.loadScene('game-over', {
  transition: 'fade',
  duration: 0.5,
  data: { score: 500, floor: 3, messages: log },
})

// Receiver (in scene setup):
const { score = 0, floor = 1 } = engine.sceneData
```

### Entity Factories

Entity factories are functions that return `Partial<Entity>` -- plain objects with component data. The engine's `spawn()` call validates and fills in defaults.

```ts
// game/entities/player.ts
import { type Entity, FONTS } from '@engine'
import { GAME } from '../config'

export function createPlayer(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    ascii: {
      char: '@',
      font: FONTS.large,
      color: GAME.player.color,
      glow: GAME.player.glow,
    },
    player: { index: 0 },
    collider: { type: 'circle', width: 20, height: 20 },
    health: { current: GAME.player.maxHealth, max: GAME.player.maxHealth },
  }
}
```

Factories can take parameters for variation:

```ts
export function createAsteroid(x: number, y: number, vx: number, vy: number): Partial<Entity> {
  const scale = rng(0.8, 2.2)
  const size = 16 * scale
  return {
    position: { x, y },
    velocity: { vx, vy },
    ascii: {
      char: pick(GAME.asteroid.chars),
      font: FONTS.normal,
      color: pick(GAME.asteroid.colors),
      scale,
    },
    collider: { type: 'circle', width: size, height: size },
    tags: { values: new Set(['asteroid']) },
  }
}
```

Spawn entities from scenes or systems:

```ts
engine.spawn(createPlayer(engine.centerX, engine.centerY))
engine.spawn(createAsteroid(x, y, vx, vy))
engine.spawn(createBullet(player.position.x, player.position.y, bvx, bvy))
```

### System Creation with defineSystem

Systems contain game logic that runs every frame. They query entities by component and update them:

```ts
import { defineSystem, type Engine } from '@engine'

export const playerInputSystem = defineSystem({
  name: 'playerInput',

  // Called once when the system is added to a scene (optional)
  init(engine: Engine) {
    // Reset module-level state
  },

  // Called every frame
  update(engine: Engine, dt: number) {
    for (const e of engine.world.with('position', 'velocity', 'player')) {
      const speed = GAME.player.speed
      let dx = 0, dy = 0
      if (engine.keyboard.held('KeyW') || engine.keyboard.held('ArrowUp')) dy -= 1
      if (engine.keyboard.held('KeyS') || engine.keyboard.held('ArrowDown')) dy += 1
      if (engine.keyboard.held('KeyA') || engine.keyboard.held('ArrowLeft')) dx -= 1
      if (engine.keyboard.held('KeyD') || engine.keyboard.held('ArrowRight')) dx += 1

      // Normalize diagonal movement
      if (dx !== 0 && dy !== 0) {
        const inv = 1 / Math.SQRT2
        dx *= inv; dy *= inv
      }

      // Set velocity only -- _physics handles position += velocity * dt
      e.velocity.vx = dx * speed
      e.velocity.vy = dy * speed
    }
  },

  // Called when the system is removed (optional)
  cleanup(engine: Engine) {},
})
```

Add systems in a scene's `setup`:

```ts
setup(engine) {
  engine.addSystem(playerInputSystem)
  engine.addSystem(asteroidSpawnerSystem)
  engine.addSystem(collisionSystem)
}
```

**System ordering:** Custom systems default to `priority: 0` and run before all built-ins. Use `SystemPriority` constants to interleave with built-in systems:

```ts
import { defineSystem, SystemPriority } from '@engine'

export const collisionSystem = defineSystem({
  name: 'collision',
  priority: SystemPriority.physics + 1,  // after physics, before tween
  update(engine) { /* ... */ },
})
```

Built-in priority slots: `parent=10, physics=20, tween=30, animation=40, emitter=50, stateMachine=60, lifetime=70, screenBounds=80`.

### Phase-Gated Systems for Turn-Based Games

Systems can declare a `phase` to only run during a specific turn phase. This is how the roguelike template implements turn-based combat with the ECS:

```ts
// Configure phases in scene setup:
engine.turns.configure({ phases: ['player', 'enemy', 'resolve'] })
engine.turns.start()

// Player input system -- only runs during 'player' phase:
export const playerInputSystem = defineSystem({
  name: 'playerInput',
  phase: 'player',
  update(engine) {
    // Read keyboard input, validate movement, attack enemies
    // When the player acts:
    engine.turns.endPhase()  // advance to 'enemy' phase
  },
})

// Enemy AI system -- only runs during 'enemy' phase:
export const enemyAISystem = defineSystem({
  name: 'enemyAI',
  phase: 'enemy',
  update(engine) {
    // Execute enemy movement and attacks
    engine.turns.endPhase()  // advance to 'resolve' phase
  },
})

// Combat resolution -- only runs during 'resolve' phase:
export const combatSystem = defineSystem({
  name: 'combat',
  phase: 'resolve',
  update(engine) {
    // Check for dead enemies, award XP, check player death
    engine.turns.endPhase()  // advance back to 'player' phase
  },
})
```

Systems without a `phase` run every frame regardless of the current phase (e.g., FOV rendering, HUD drawing, camera follow).

### Walk-Through: Asteroid Field (Real-Time)

The `games/asteroid-field/` template is a real-time action game. Here is how it is structured:

**File layout:**
```
games/asteroid-field/
  config.ts           -- GAME constants (speeds, colors, spawn rates)
  index.ts            -- setupGame: register 3 scenes, start at 'title'
  entities/
    player.ts         -- createPlayer(x, y): position, velocity, ascii, collider, health
    asteroid.ts       -- createAsteroid(x, y, vx, vy): randomized size/char/color
    bullet.ts         -- createBullet(x, y, vx, vy): with lifetime component
  scenes/
    title.ts          -- Ambient asteroids, "Press Space" prompt
    play.ts           -- Spawns player, registers 4 systems, syncs score
    game-over.ts      -- Particle burst, score display, "Press Space to retry"
  systems/
    player-input.ts   -- WASD movement + Space to shoot (with Cooldown)
    asteroid-spawner.ts -- Spawns asteroids from screen edges on a timer
    collision.ts      -- Bullet-asteroid and player-asteroid overlap checks
    lifetime.ts       -- Removes expired entities
```

**Entry point** (`index.ts`):
```ts
export function setupGame(engine: Engine): string {
  engine.registerScene(titleScene)
  engine.registerScene(playScene)
  engine.registerScene(gameOverScene)
  return 'title'
}
```

Returns a plain string (the starting scene name). This uses the default React overlay for HUD/menus.

**Play scene** registers systems and spawns the player:
```ts
setup(engine) {
  useStore.getState().setScreen('playing')
  useStore.getState().setScore(0)
  resetScore()
  engine.spawn(createPlayer(engine.width / 2, engine.height / 2))
  engine.addSystem(playerInputSystem)
  engine.addSystem(asteroidSpawnerSystem)
  engine.addSystem(collisionSystem)
  engine.addSystem(lifetimeSystem)
},
```

**Player input system** demonstrates the Cooldown pattern for shooting:
```ts
let shootCooldown = new Cooldown(GAME.player.bulletCooldown)

export const playerInputSystem = defineSystem({
  name: 'playerInput',
  init() { shootCooldown = new Cooldown(GAME.player.bulletCooldown) },
  update(engine, dt) {
    shootCooldown.update(dt)
    for (const e of engine.world.with('position', 'velocity', 'player')) {
      // WASD movement sets velocity (physics integrates)
      // Space + cooldown fires a bullet
      if (engine.keyboard.held('Space') && shootCooldown.fire()) {
        engine.spawn(createBullet(e.position.x, e.position.y, bvx, bvy))
        sfx.shoot()
      }
    }
  },
})
```

### Walk-Through: Roguelike (Turn-Based ECS)

The `games/roguelike/` template demonstrates turn-based ECS with phase-gated systems, dungeon generation, FOV, and canvas-only rendering.

**File layout:**
```
games/roguelike/
  config.ts
  index.ts           -- Suppresses React overlay (canvas-only)
  entities/
    player.ts        -- gridPos + position (dual coordinate system)
    enemies.ts       -- createRat, createSkeleton, createWraith
    items.ts         -- createHealthPotion, createSword, createShield
  scenes/
    title.ts         -- UIMenu for navigation
    play.ts          -- Dungeon generation, entity spawning, phase config
    game-over.ts     -- Score summary
  systems/
    player-input.ts  -- phase: 'player' -- grid movement, attack, pickup
    enemy-ai.ts      -- phase: 'enemy' -- pathfinding toward player
    combat.ts        -- phase: 'resolve' -- death checks, XP, level-up
    fov.ts           -- No phase -- runs every frame for fog of war
    hud.ts           -- No phase -- draws message log, stats
  utils/
    dungeon.ts       -- BSP dungeon generator
    fov.ts           -- Raycasting FOV computation
```

**Canvas-only entry point** (`index.ts`):
```ts
const Empty = () => null

export function setupGame(engine: Engine) {
  setStoragePrefix('roguelike')
  engine.registerScene(titleScene)
  engine.registerScene(playScene)
  engine.registerScene(gameOverScene)
  return {
    startScene: 'title',
    screens: { menu: Empty, playing: Empty, gameOver: Empty },
    hud: [],
  }
}
```

**Play scene** configures turn phases and passes data between floor transitions:

```ts
setup(engine) {
  // Read scene data for floor progression
  const data = engine.sceneData
  const floor = data.floor ?? 1

  // Generate dungeon, spawn player/enemies/items...

  // Configure turn phases
  engine.turns.configure({ phases: ['player', 'enemy', 'resolve'] })
  engine.turns.start()

  // Add systems
  engine.addSystem(playerInputSystem)   // phase: 'player'
  engine.addSystem(enemyAISystem)       // phase: 'enemy'
  engine.addSystem(combatSystem)        // phase: 'resolve'
  engine.addSystem(fovSystem)           // no phase (always runs)
  engine.addSystem(hudSystem)           // no phase (always runs)
},
```

**Player input** (`phase: 'player'`) waits for keyboard input, validates the move against the grid, and advances the phase:

```ts
export const playerInputSystem = defineSystem({
  name: 'playerInput',
  phase: 'player',
  update(engine) {
    if (hasMoved) return  // Already acted this turn

    // Read WASD/arrows for dx, dy...
    // Validate against navGrid (wall check)...
    // Check for enemy at target (attack instead of move)...
    // Move player's gridPos, tween world position...

    hasMoved = true
    engine.turns.endPhase()  // -> 'enemy' phase
  },
})
```

**Floor transitions** pass player state as scene data:
```ts
engine.loadScene('play', {
  transition: 'dissolve',
  duration: 0.4,
  data: {
    floor: floor + 1,
    playerHealth: player.health.current,
    playerMaxHealth: player.health.max,
    playerStats: { ...player.playerStats, floor: floor + 1 },
    score: score + GAME.scoring.perFloor,
    messages: getMessages(),
  },
})
```

---

## Template System

### How Templates Work

Templates live in `games/<name>/` and serve as the source of truth for game starting points. The `game/` directory (singular) is a working copy created from a template -- it is gitignored.

```
games/                        # Source-of-truth templates (committed)
  blank/
  asteroid-field/
  platformer/
  roguelike/
  tic-tac-toe/
  connect-four/
game/                         # Working copy (gitignored, generated)
```

Running `bun run init:game [template]` copies a template into `game/`. First `bun dev` auto-detects a missing `game/` directory and shows an interactive template picker.

### Available Templates

| Template | API | Style | Description |
|---|---|---|---|
| `blank` | defineScene | Real-time | Minimal starter: title screen, movable `@` player. 4 files. |
| `asteroid-field` | defineScene | Real-time | Full action game: shooting, spawners, collisions, scoring. |
| `platformer` | defineScene | Real-time | Side-scrolling platformer with gravity and levels. |
| `roguelike` | defineScene | Turn-based | Dungeon crawler: BSP generation, FOV, phased turns, enemies. |
| `physics-text` | defineScene | Real-time | Interactive ASCII art with spring physics and cursor repulsion. |
| `tic-tac-toe` | defineGame | Turn-based | 2-player hotseat. Single file, canvas-only. |
| `connect-four` | defineGame | Turn-based | 2-player hotseat. 7x6 grid with gravity, 4-in-a-row. |

### The Blank Template as Starting Point

The blank template is the recommended starting point for new games. It provides the minimal structure:

```
game/
  config.ts          -- GAME object with title, description, player settings
  index.ts           -- Registers title + play scenes, returns 'title'
  scenes/
    title.ts         -- Title text, "Press Space" prompt, Space -> play
    play.ts          -- Player spawn, WASD movement, Escape -> title
```

The play scene includes commented-out "next steps" showing how to add enemies, collisions, scoring, and new scenes:

```ts
// 1. Add enemies:    bun run new:entity enemy
// 2. Add collision:  bun run new:system collision
// 3. Add scoring:    useStore.getState().setScore(score)
// 4. Add game-over:  bun run new:scene game-over
```

### Template Anatomy

Every template follows the same structure:

```
games/<name>/
  game.config.ts     -- Template metadata (name, description) for the picker
  config.ts          -- GAME constants object
  index.ts           -- setupGame(engine) entry point
  scenes/            -- Scene definitions
  entities/          -- Entity factory functions (optional)
  systems/           -- Custom systems (optional)
  utils/             -- Helper functions (optional)
```

The `index.ts` file always exports a `setupGame(engine: Engine)` function. It either:
- Returns a string (the starting scene name) -- uses default React HUD
- Returns `{ startScene, screens?, hud? }` -- custom or suppressed UI

---

## Scaffolding Commands

### `bun run new:scene <name>`

Generates a new scene file at `game/scenes/<name>.ts`.

**Usage:**
```bash
bun run new:scene boss-fight
```

**Creates:** `game/scenes/boss-fight.ts` with this template:

```ts
import { defineScene, FONTS, COLORS } from '@engine'
import type { Engine } from '@engine'
import { useStore } from '@ui/store'

export const bossFightScene = defineScene({
  name: 'boss-fight',

  setup(engine: Engine) {
    // Spawn entities, add systems
  },

  update(engine: Engine, dt: number) {
    // Scene-level per-frame logic
  },

  cleanup(engine: Engine) {
    // Runs when leaving this scene
  },
})
```

**After creating, you must:**
1. Import in `game/index.ts`: `import { bossFightScene } from './scenes/boss-fight'`
2. Register: `engine.registerScene(bossFightScene)`
3. Load from another scene: `engine.loadScene('boss-fight')`

### `bun run new:system <name>`

Generates a new system file at `game/systems/<name>.ts`.

**Usage:**
```bash
bun run new:system gravity
```

**Creates:** `game/systems/gravity.ts` with a `defineSystem` skeleton including commented-out examples for querying entities, chasing the player, and a reminder not to manually integrate velocity.

**After creating:**
1. Import in your scene: `import { gravitySystem } from '../systems/gravity'`
2. Add in scene setup: `engine.addSystem(gravitySystem)`

### `bun run new:entity <name>`

Generates a new entity factory at `game/entities/<name>.ts`.

**Usage:**
```bash
bun run new:entity power-up
```

**Creates:** `game/entities/power-up.ts`:

```ts
import type { Entity } from '@engine'
import { FONTS, COLORS } from '@engine'

export function createPowerUp(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    ascii: { char: '?', font: FONTS.normal, color: COLORS.accent },
    collider: { type: 'circle', width: 16, height: 16 },
    // health, lifetime, tags -- uncomment as needed
  }
}
```

**After creating:**
```ts
import { createPowerUp } from '../entities/power-up'
engine.spawn(createPowerUp(x, y))
```

### `bun run init:game [template]`

Copies a template from `games/<name>/` into `game/`.

**Interactive mode** (no argument):
```bash
bun run init:game
```
Shows a numbered list of templates with names and descriptions pulled from `game.config.ts`. Enter a number to select.

**Direct mode:**
```bash
bun run init:game blank
bun run init:game asteroid-field
bun run init:game roguelike
bun run init:game physics-text
bun run init:game tic-tac-toe
bun run init:game connect-four
bun run init:game platformer
```

If `game/` already contains files, the script prompts for confirmation before overwriting.

### `bun run list:games`

Lists all available templates.

---

## AI-Assisted Development

Four CLI commands use Claude to generate game code. Each requires an `ANTHROPIC_API_KEY` in `.env.local` or as a shell environment variable.

### Setup

```bash
# Get a key at https://console.anthropic.com/settings/keys
# Create .env.local in the repo root (already gitignored):
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
```

All scripts support `--dry-run` to preview the prompts without calling the API.

### Common Flags (All Scripts)

| Flag | Default | Description |
|---|---|---|
| `--model=opus\|sonnet\|haiku` | `sonnet` | Model selection (opus for complex, haiku for simple) |
| `--out=<path>` | auto-generated | Override output file path |
| `--force` | off | Overwrite an existing file |
| `--dry-run` | off | Print prompts without calling the API |

### `bun run ai:game "<pitch>"`

Generates a complete `defineGame` module from a natural-language game description.

**What it produces:** A single TypeScript file containing type definitions, the `defineGame` call (state, moves, turns, endIf, render), input handling, and a `setupGame` export. The file is self-contained and ready to wire as the game entry point.

**Usage:**
```bash
bun run ai:game "2-player strategy where you place walls to maze a runner"
bun run ai:game "hotseat battle: place cards on a 3x3 grid, highest sum wins"
bun run ai:game "single-player minesweeper with ASCII art" --model=opus
```

**Output:** `game/<slug>.ts` (slug auto-generated from the pitch).

**How it works:** The script sends a carefully crafted system prompt that includes:
- The complete `defineGame` API reference (types, ctx shape, rendering primitives)
- A minimal working example (tic-tac-toe)
- Strict output rules (single file, only `@engine` imports, required fields, TypeScript strict)
- Engine skill files for broader context

Claude returns a single fenced TypeScript code block. The script validates that it contains both `defineGame` and `setupGame`, then writes it.

**Wiring the generated game:**
```ts
// In game/index.ts:
import { setupGame as myGame } from './my-generated-game'
export const setupGame = myGame
```

**Token cost:** ~10-20k tokens per call with sonnet (full engine context in system prompt + complete game module response). Still under $0.10 per call.

### `bun run ai:sprite "<prompt>"`

Generates an ASCII sprite entity factory.

**What it produces:** A TypeScript file exporting a `create<Name>(x, y): Partial<Entity>` factory with either a `sprite` component (multi-line ASCII art) or `ascii` component (single character).

**Usage:**
```bash
bun run ai:sprite "space invader" --frames=2
bun run ai:sprite "small glowing potion bottle" --model=haiku
bun run ai:sprite "dragon boss" --frames=4 --model=opus
```

**Output:** `game/entities/<slug>.ts`

**Extra flag:** `--frames=N` requests an `animation` component with N animation frames for the sprite.

**After generating:**
```ts
import { createSpaceInvader } from './entities/space-invader'
engine.spawn(createSpaceInvader(100, 200))
```

### `bun run ai:mechanic "<description>"`

Generates a gameplay system via `defineSystem`.

**What it produces:** A TypeScript file exporting a system constant with `init` and `update` methods. The AI reuses engine behaviors (`createPatrolBehavior`, `createChaseBehavior`, `createWaveSpawner`, etc.) where appropriate rather than writing from scratch.

**Usage:**
```bash
bun run ai:mechanic "enemy that patrols then chases player when close"
bun run ai:mechanic "turret that fires at the nearest tagged enemy every 2s"
bun run ai:mechanic "pickups that orbit in a circle and grant speed boost"
```

**Output:** `game/systems/<slug>.ts`

**After generating:**
```ts
import { patrolChaseSystem } from './systems/patrol-chase'
engine.addSystem(patrolChaseSystem)  // in your scene's setup()
```

**Iteration tip:** After the mechanic works, polish its feel with `ai:juice`:
```bash
bun run ai:juice "patrol chase enemy hit / death event"
```

### `bun run ai:juice "<event>"`

Generates a feedback helper that layers particles, sound effects, camera shake, and floating text for a specific gameplay event.

**What it produces:** A TypeScript file exporting a function like `onBossDeath(engine, x, y)` that fires the appropriate combination of effects.

**Usage:**
```bash
bun run ai:juice "player getting hit by bullet"
bun run ai:juice "collecting a coin"
bun run ai:juice "boss death"
bun run ai:juice "level complete"
```

**Output:** `game/helpers/<slug>.ts`

**After generating:**
```ts
import { onBossDeath } from './helpers/boss-death'

// In your collision or event handler:
onBossDeath(engine, boss.position.x, boss.position.y)
```

**Effect budget guidelines the AI follows:**
- Light event (pickup, small hit): particles + sfx + shake <= 4
- Medium event (enemy death, damage): multi-burst particles + shake ~8
- Heavy event (boss death, level end): big particles + shake ~12-16 + toast

### How the AI Tools Work Internally

All four scripts share infrastructure from `scripts/ai-shared.ts`:

1. **Argument parsing:** Positional text becomes the prompt; flags control model, output path, and behavior.
2. **Skill loading:** Each script reads skill files from `plugins/ascii-games-dev/skills/` that give Claude engine-specific context.
3. **System prompt construction:** Combines the skill context with API references, examples, and strict output formatting rules.
4. **API call:** Uses the Anthropic SDK with the selected model (opus/sonnet/haiku).
5. **Code extraction:** Parses fenced code blocks from Claude's response.
6. **Validation:** Each script checks for required patterns (`defineGame`, `defineSystem`, `export function create`, etc.).
7. **Safe file writing:** Refuses to overwrite unless `--force` is set.

### Iterating on AI Output

The generated code is a starting point, not a finished product. Common iteration patterns:

1. **Generate -> typecheck:** Run `bun run check` immediately to catch type errors.
2. **Generate -> play -> tweak config:** Most tuning is in numeric values (speeds, sizes, timers) that you adjust in the generated code or extract to `config.ts`.
3. **Generate mechanic -> generate juice:** Use `ai:mechanic` for the logic, then `ai:juice` for the feel. They are designed to compose.
4. **Generate game -> extract entities:** If the generated `defineGame` module gets large, extract entity factories into `game/entities/` and systems into `game/systems/`.
5. **Re-run with --force:** If the first generation is not right, re-run with a more specific prompt and `--force` to overwrite.

---

## Common Workflows

### 1. Creating a New Game from Scratch

**Step 1: Initialize from a template**

Pick the template closest to your game type:

```bash
# For a blank canvas:
bun run init:game blank

# For a real-time action game:
bun run init:game asteroid-field

# For a turn-based game with defineGame:
bun run init:game tic-tac-toe

# Or let AI generate the whole thing:
bun run ai:game "my game idea here"
```

**Step 2: Configure**

Edit `game/config.ts` with your game's title, description, and constants:

```ts
export const GAME = {
  title: 'SPACE DODGER',
  description: 'Dodge the falling debris!',
  player: {
    speed: 250,
    color: '#00ff88',
    glow: '#00ff8866',
  },
  // ... game-specific constants
} as const
```

**Step 3: Build out entities, systems, scenes**

Use scaffolding commands to create files, then fill in the logic:

```bash
bun run new:entity enemy
bun run new:system spawner
bun run new:scene game-over
```

**Step 4: Wire everything in index.ts**

```ts
import type { Engine } from '@engine'
import { titleScene } from './scenes/title'
import { playScene } from './scenes/play'
import { gameOverScene } from './scenes/game-over'

export function setupGame(engine: Engine): string {
  engine.registerScene(titleScene)
  engine.registerScene(playScene)
  engine.registerScene(gameOverScene)
  return 'title'
}
```

**Step 5: Verify**

```bash
bun run check:all   # typecheck + boundary enforcement + lint
bun test             # run test suite
bun dev              # play it
```

### 2. Adding a New Entity Type to an Existing Game

**Step 1: Scaffold the factory**

```bash
bun run new:entity power-up
```

**Step 2: Define its components** (`game/entities/power-up.ts`):

```ts
import type { Entity } from '@engine'
import { FONTS } from '@engine'
import { GAME } from '../config'

export function createPowerUp(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    ascii: { char: '*', font: FONTS.large, color: '#ffcc00', glow: '#ffcc0066' },
    collider: { type: 'circle', width: 20, height: 20 },
    tags: { values: new Set(['power-up']) },
    lifetime: { remaining: 10 },  // disappears after 10 seconds
  }
}
```

**Step 3: Spawn it** (in a scene or system):

```ts
import { createPowerUp } from '../entities/power-up'

// In a system:
engine.spawnEvery(5, () => createPowerUp(rng(50, engine.width - 50), -20))

// Or spawn directly:
engine.spawn(createPowerUp(200, 300))
```

**Step 4: Handle interactions** (in a collision system):

```ts
const powerUps = [...engine.world.with('position', 'collider', 'tags')]
  .filter(e => e.tags.values.has('power-up'))

for (const p of powerUps) {
  if (overlaps(player, p)) {
    sfx.pickup()
    engine.particles.sparkle(p.position.x, p.position.y, '#ffcc00')
    engine.destroy(p)
    // Apply power-up effect...
  }
}
```

### 3. Adding a New Scene (Menu, Game-Over, etc.)

**Step 1: Scaffold**

```bash
bun run new:scene game-over
```

**Step 2: Fill in the scene** (`game/scenes/game-over.ts`):

```ts
import { COLORS, defineScene, FONTS } from '@engine'
import type { Engine } from '@engine'
import { useStore } from '@ui/store'

export const gameOverScene = defineScene({
  name: 'game-over',

  setup(engine: Engine) {
    useStore.getState().setScreen('gameOver')
    const cx = engine.centerX
    const cy = engine.centerY

    // Explosion effect at center
    engine.particles.burst({
      x: cx, y: cy, count: 40,
      chars: ['@', '#', '*', '!'],
      color: '#ff4444', speed: 200, lifetime: 2,
    })

    // Game over text
    engine.spawn({
      position: { x: cx, y: cy - 60 },
      ascii: { char: 'GAME OVER', font: FONTS.huge, color: COLORS.danger },
    })

    // Score display
    const score = useStore.getState().score
    engine.spawn({
      position: { x: cx, y: cy + 20 },
      ascii: { char: `SCORE: ${score}`, font: FONTS.boldLarge, color: COLORS.fg },
    })

    // Restart prompt
    engine.spawn({
      position: { x: cx, y: cy + 80 },
      ascii: { char: '[ PRESS SPACE TO RETRY ]', font: FONTS.bold, color: COLORS.dim },
    })
  },

  update(engine: Engine) {
    if (engine.keyboard.pressed('Space')) {
      engine.loadScene('play', { transition: 'fade' })
    }
  },
})
```

**Step 3: Register and navigate**

In `game/index.ts`:
```ts
import { gameOverScene } from './scenes/game-over'
engine.registerScene(gameOverScene)
```

From the play scene or a system:
```ts
engine.loadScene('game-over', {
  transition: 'fade',
  duration: 0.5,
  data: { score: currentScore },
})
```

### 4. Adding Particle Effects and Juice

**Quick approach -- use built-in shortcuts:**

```ts
// Explosion (enemy death)
engine.particles.explosion(x, y, '#ff4444')

// Sparkle (item pickup)
engine.particles.sparkle(x, y, '#ffcc00')

// Smoke (environmental)
engine.particles.smoke(x, y)

// Custom burst
engine.particles.burst({
  x, y,
  count: 20,
  chars: ['*', '.', '+', '·'],
  color: '#ff4400',
  speed: 150,
  lifetime: 0.8,
})
```

**Layered feedback for impactful moments:**

```ts
// Enemy destroyed -- layer multiple effects for impact
engine.particles.burst({
  x: enemy.position.x, y: enemy.position.y,
  count: 15, chars: ['*', '.', '×', '+'],
  color: '#ff4400', speed: 120, lifetime: 0.6,
})
engine.floatingText(enemy.position.x, enemy.position.y, '+100', '#ffcc00')
engine.camera.shake(4)
sfx.hit()
```

**AI-generated approach:**

```bash
bun run ai:juice "enemy destroyed by player bullet"
```

This generates a helper function in `game/helpers/` that composes the right combination of effects for the event.

### 5. Adding Sound Effects

The engine includes built-in procedural sounds -- no audio files needed:

```ts
import { sfx } from '@engine'

sfx.shoot()    // laser pew
sfx.hit()      // impact thud
sfx.pickup()   // item collect chime
sfx.explode()  // big boom
sfx.menu()     // menu blip
sfx.death()    // death sound
sfx.jump()     // jump sound
```

For background music:

```ts
import { playMusic, stopMusic, setVolume, toggleMute } from '@engine'

playMusic('/music.mp3')                    // loops by default
playMusic('/music.mp3', { volume: 0.5 })
stopMusic()
setVolume(0.5)    // master volume
toggleMute()      // mute/unmute all audio
```

### 6. Creating Interactive ASCII Art

The engine's most visually distinctive feature: every character in your ASCII art becomes its own physics entity with spring-to-home behavior, reacting to the mouse cursor in real time.

**Step 1: Start from the physics-text template (or blank)**

```bash
bun run init:game physics-text   # Full working demo
bun run init:game blank          # Start from scratch
```

**Step 2: Define art assets**

The recommended pattern is to create a `game/art/` directory and define art as exported `ArtAsset` objects. This gives you structured, reusable art with per-character coloring:

```ts
// game/art/ship.ts
import type { ArtAsset } from '@engine'

export const SHIP: ArtAsset = {
  lines: [
    '    /\\    ',
    '   /  \\   ',
    '  / ** \\  ',
    ' /______\\ ',
    ' \\||  ||/ ',
    '  \\/  \\/  ',
  ],
  colorMap: {
    '*': '#ffcc00',   // windows
    '/': '#888888',
    '\\': '#888888',
    '|': '#aaaaaa',
    '_': '#666666',
  },
  color: '#00ffaa',
}
```

For quick inline art, use `artFromString()` to parse a template literal:

```ts
import { artFromString } from '@engine'

const STAR = artFromString(`
 *
***
 *
`, { '*': '#ffcc00' })
```

Or use the AI sprite generator:

```bash
bun run ai:sprite "pixel art spaceship"
```

You can also define art as a plain string array (the older pattern), which still works everywhere:

```ts
const SHIP_LINES = [
  '    /\\    ',
  '   /  \\   ',
  '  / ** \\  ',
  ' /______\\ ',
]
```

**Step 3: Choose static or interactive spawning**

For **static art** (backgrounds, decorations) -- bitmap-cached, one `drawImage` per frame:

```ts
import { SHIP } from '../art/ship'

engine.spawnArt(SHIP, {
  position: { x: engine.centerX, y: engine.centerY },
  layer: 0,
})
```

For **interactive art** (mouse-reactive, breakable) -- per-character physics entities:

```ts
import { SHIP } from '../art/ship'

engine.spawnInteractiveArt(SHIP, {
  position: { x: engine.centerX, y: engine.centerY },
  spring: SpringPresets.bouncy,
  tags: ['ship'],
})
```

You can also use the lower-level `engine.spawnSprite()` directly for per-character control:

```ts
import { SpringPresets, createCursorRepelSystem } from '@engine'

const chars = engine.spawnSprite({
  lines: SHIP.lines,
  font: SHIP.font ?? '16px "Fira Code", monospace',
  position: { x: engine.centerX, y: engine.centerY },
  color: SHIP.color ?? '#00ffaa',
  spring: SpringPresets.bouncy,
})
```

For single-line text, use `engine.spawnText()` instead:

```ts
engine.spawnText({
  text: 'HELLO WORLD',
  font: '24px "Fira Code", monospace',
  position: { x: engine.centerX, y: 100 },
  color: '#ff4488',
  spring: SpringPresets.snappy,
})
```

**Step 4: Add cursor repulsion**

One line -- characters flee the cursor, then their spring pulls them back:

```ts
engine.addSystem(createCursorRepelSystem())
// Optional: customize radius and force
engine.addSystem(createCursorRepelSystem({ radius: 80, force: 300 }))
```

**Step 5 (optional): Add ambient drift**

```ts
import { createAmbientDriftSystem } from '@engine'

// All spring entities drift gently
engine.addSystem(createAmbientDriftSystem())

// Or only entities with a specific tag
engine.addSystem(createAmbientDriftSystem({ tag: 'star' }))
```

**Step 6 (optional): Initial scatter animation**

Give each character a random velocity on spawn so they assemble from chaos:

```ts
for (const c of chars) {
  c.velocity!.vx = (Math.random() - 0.5) * 400
  c.velocity!.vy = (Math.random() - 0.5) * 400
}
```

The springs handle the settling animation for free.

**Step 7 (optional): Multiple layers with different spring stiffness**

Vary the spring preset per layer to create visual depth:

```ts
// Background layer -- slow, dreamy
engine.spawnSprite({ ...backgroundArt, spring: SpringPresets.floaty })

// Midground layer -- balanced
engine.spawnSprite({ ...midgroundArt, spring: SpringPresets.smooth })

// Foreground layer -- snappy, responsive
engine.spawnSprite({ ...foregroundArt, spring: SpringPresets.stiff })
```

**Spring preset reference:**

| Preset | Strength | Damping | Feel |
|---|---|---|---|
| `stiff` | 0.12 | 0.90 | Fast snap-back |
| `snappy` | 0.10 | 0.91 | Quick return |
| `bouncy` | 0.08 | 0.88 | Playful overshoot |
| `smooth` | 0.06 | 0.93 | Balanced |
| `floaty` | 0.04 | 0.95 | Slow, dreamy |
| `gentle` | 0.02 | 0.97 | Barely perceptible |

Custom tuning beyond the presets:

```ts
spring: { strength: 0.07, damping: 0.91 }  // between bouncy and smooth
```

See the `physics-text` template (`games/physics-text/`) for a full working example with three art layers, ambient drift, and per-character coloring.

### 7. Converting a Prototype to a Polished Game

**Step 1: Extract constants to config**

Move all magic numbers to `game/config.ts`:

```ts
export const GAME = {
  player: { speed: 250, maxHealth: 5, bulletCooldown: 0.15 },
  enemy: { spawnRate: 1.2, baseSpeed: 80, chars: ['V', 'W', 'X'] },
  scoring: { perKill: 100, perWave: 500 },
} as const
```

**Step 2: Add a title scene**

```bash
bun run new:scene title
```

Add ambient decoration (floating characters, particles) and a "Press Space" prompt. See `games/asteroid-field/scenes/title.ts` for a reference.

**Step 3: Add a game-over scene**

```bash
bun run new:scene game-over
```

Show the score, high score, and a retry prompt. Fire a particle burst for drama. See `games/asteroid-field/scenes/game-over.ts`.

**Step 4: Add scoring and persistence**

```ts
import { useStore } from '@ui/store'
import { setStoragePrefix, submitScore, getHighScores } from '@engine'

// Once at init:
setStoragePrefix('my-game')

// During gameplay:
useStore.getState().setScore(score)

// On game over:
submitScore(score, 'Player')
```

**Step 5: Add juice to every interaction**

For each gameplay event, layer appropriate feedback:

| Event | Effects |
|---|---|
| Enemy hit | `sfx.hit()` + floating damage text + small shake (3-4) |
| Enemy killed | `sfx.explode()` + explosion particles + score float + shake (5-8) |
| Player hit | `sfx.hit()` + red flash + shake (6-8) |
| Player death | `sfx.death()` + big explosion + shake (10-12) + delay -> game-over |
| Item pickup | `sfx.pickup()` + sparkle particles + value float |
| Level complete | `sfx.pickup()` + toast "Wave N cleared" + sparkle |

Or generate them:

```bash
bun run ai:juice "enemy killed by player"
bun run ai:juice "player takes damage"
bun run ai:juice "boss defeated"
bun run ai:juice "item collected"
```

**Step 6: Add difficulty progression**

Increase spawn rates, enemy speed, or reduce resources over time:

```ts
const difficulty = 1 + elapsed * 0.05  // ramps up over time
const spawnInterval = GAME.enemy.spawnRate / difficulty
```

**Step 7: Add scene transitions**

Replace instant `engine.loadScene('x')` with animated transitions:

```ts
engine.loadScene('play', { transition: 'fade', duration: 0.4 })
engine.loadScene('game-over', { transition: 'dissolve', duration: 0.5 })
```

**Step 8: Export**

```bash
bun run export
```

Produces `dist/game.html` -- a single self-contained file you can share or host anywhere.

---

## Quick Reference

### Verification Loop

Before declaring work done, always run:

```bash
bun run check:all   # typecheck + import boundaries + lint
bun test             # or targeted: bun test engine/__tests__/physics.test.ts
```

UI/render correctness cannot be verified headlessly -- state that limitation explicitly.

### Critical Gotchas

- **Never integrate velocity manually.** `_physics` does `position += velocity * dt`. Doing it again causes double-speed.
- **Never mutate the world during iteration.** Materialize first: `const list = [...engine.world.with(...)]`, then iterate.
- **Never use `setInterval`/`setTimeout`.** Use `engine.after()`, `engine.every()`, `Cooldown`, or `engine.sequence()`.
- **Never re-register built-in systems.** They run automatically on scene load.
- **Never put game logic in `engine/`.** It belongs in `game/` or `games/<template>/`.

### Import Boundaries

```
engine/ -> may import @shared, @engine. NEVER @game or @ui.
game/   -> may import @engine, @shared, @ui/store ONLY.
ui/     -> may import @engine, @shared, @ui/*, @game/index.
shared/ -> may NOT import any other layer.
```

Enforced by `bun run check:bounds`.
