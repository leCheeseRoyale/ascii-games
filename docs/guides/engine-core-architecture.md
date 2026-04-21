# Engine Core Architecture

Definitive reference for the ASCII game engine's internals: lifecycle, ECS, scenes, the declarative game API, events, and extension patterns. All file paths are relative to the repository root. Code examples are drawn from the actual codebase.

---

## Table of Contents

- [Engine Lifecycle](#engine-lifecycle)
  - [Construction and Ownership](#construction-and-ownership)
  - [The Game Loop](#the-game-loop)
  - [Frame Update Order](#frame-update-order)
  - [Rendering Pipeline](#rendering-pipeline)
  - [Start, Stop, Pause, Resume](#start-stop-pause-resume)
- [Entity Management](#entity-management)
  - [Spawning](#spawning)
  - [Destruction](#destruction)
  - [Tags and Queries](#tags-and-queries)
  - [Parent-Child Hierarchies](#parent-child-hierarchies)
  - [Entity Pools](#entity-pools)
- [Scheduling](#scheduling)
  - [One-Shot Timers](#one-shot-timers)
  - [Repeating Timers](#repeating-timers)
  - [Sequences](#sequences)
  - [Cooldown Class](#cooldown-class)
  - [Spawn Timers](#spawn-timers)
- [Scene Management](#scene-management)
  - [defineScene](#definescene)
  - [Scene Registry and Loading](#scene-registry-and-loading)
  - [Transitions](#transitions)
  - [Scene Data](#scene-data)
- [defineGame API](#definegame-api)
  - [Overview](#overview)
  - [GameDefinition Shape](#gamedefinition-shape)
  - [GameContext](#gamecontext)
  - [Moves](#moves)
  - [Turn Rotation](#turn-rotation)
  - [Phases](#phases)
  - [Game-Over Detection](#game-over-detection)
  - [GameRuntime Internals](#gameruntime-internals)
  - [Wiring into the Scene System](#wiring-into-the-scene-system)
- [ECS Architecture](#ecs-architecture)
  - [World](#world)
  - [Entity and Component Shapes](#entity-and-component-shapes)
  - [System Definition and Priorities](#system-definition-and-priorities)
  - [The 8 Built-in Systems](#the-8-built-in-systems)
  - [Phase-Gated Systems](#phase-gated-systems)
  - [System Error Handling](#system-error-handling)
- [Turn Manager](#turn-manager)
- [Event System](#event-system)
- [Extension Recipes](#extension-recipes)
  - [Adding a New Component Type](#adding-a-new-component-type)
  - [Adding a New System](#adding-a-new-system)
  - [Creating a New Scene](#creating-a-new-scene)

---

## Engine Lifecycle

### Construction and Ownership

The `Engine` class (`engine/core/engine.ts`) is the central orchestrator. Its constructor takes a canvas element and an optional partial config:

```ts
const engine = new Engine(canvas, { targetFps: 60, bgColor: '#0a0a0a' });
```

Construction initializes every subsystem as a `readonly` property. These are the owned subsystems, created in the constructor (lines 119-135 of `engine/core/engine.ts`):

| Property | Class | Source | Purpose |
|---|---|---|---|
| `world` | `World<Entity>` | `engine/ecs/world.ts` | miniplex ECS world |
| `systems` | `SystemRunner` | `engine/ecs/systems.ts` | Ordered system execution |
| `scenes` | `SceneManager` | `engine/core/scene.ts` | Scene registry and loading |
| `renderer` | `AsciiRenderer` | `engine/render/ascii-renderer.ts` | Canvas 2D text rendering |
| `camera` | `Camera` | `engine/render/camera.ts` | Viewport, follow, shake |
| `keyboard` | `Keyboard` | `engine/input/keyboard.ts` | Key state tracking |
| `mouse` | `Mouse` | `engine/input/mouse.ts` | Cursor and click tracking |
| `gamepad` | `Gamepad` | `engine/input/gamepad.ts` | Controller support |
| `particles` | `ParticlePool` | `engine/render/particles.ts` | Particle effects |
| `scheduler` | `Scheduler` | `engine/utils/scheduler.ts` | Game-time timers |
| `transition` | `Transition` | `engine/render/transitions.ts` | Scene transition effects |
| `debug` | `DebugOverlay` | `engine/render/debug.ts` | Backtick debug overlay |
| `toast` | `ToastManager` | `engine/render/toast.ts` | Toast notifications |
| `turns` | `TurnManager` | `engine/core/turn-manager.ts` | Turn/phase management |
| `ui` | `CanvasUI` | `engine/render/canvas-ui.ts` | Immediate-mode canvas UI |
| `dialog` | `DialogManager` | `engine/render/canvas-ui.ts` | Dialog system |
| `viewport` | `Viewport` | `engine/render/viewport.ts` | Responsive viewport |

The constructor also creates the `GameLoop` (line 141), calls `renderer.resize()`, and attaches a window resize listener that keeps the camera viewport in sync.

### The Game Loop

`engine/core/game-loop.ts` implements a **fixed-timestep** loop with variable rendering:

```
Fixed dt = 1 / targetFps     (default: 1/60 = ~16.67ms)
```

Each `requestAnimationFrame` tick:

1. Compute raw delta from `performance.now()`.
2. Clamp delta to 100ms max (prevents spiral of death after tab-away).
3. Accumulate clamped delta into an accumulator.
4. While accumulator >= fixedDt: run `update(fixedDt)`, advance elapsed/frame counters.
5. Run `render()` once per frame regardless of how many updates ran.

The FPS counter updates every second (lines 69-74 of `engine/core/game-loop.ts`). When paused, only `render()` runs --- no updates. This means the world freezes visually in place but still draws.

Accessible via `engine.time`:

```ts
engine.time.dt       // Fixed delta (1/targetFps)
engine.time.elapsed  // Total elapsed game time in seconds
engine.time.frame    // Total frame count
engine.time.fps      // Measured FPS (updated once per second)
```

### Frame Update Order

Each `update(dt)` call in the Engine (lines 539-565 of `engine/core/engine.ts`) processes in this exact order:

```
1. engine._sceneTime += dt
2. keyboard.update()          Input: latch justPressed/justReleased
3. mouse.update()             Input: latch justDown/justUp
4. gamepad.update()           Input: poll gamepad state
5. [debug toggle check]       Backtick key toggles debug overlay
6. systems.update(engine, dt) ECS systems (priority-sorted, phase-gated)
7. scenes.update(engine, dt)  Current scene's update() callback
8. scheduler.update(dt)       Fire due timers
9. particles.update(dt)       Particle pool tick
10. transition.update(dt)     Scene transition progress
11. camera.update(dt)         Follow target, shake decay
12. debug.update(dt)          Debug overlay timing
13. toast.update(dt)          Toast lifetime
14. ui.update(dt)             Canvas UI frame reset
15. dialog.update(dt, engine) Dialog typewriter/choice
```

Key insight: systems run **before** the scene's `update()`, and the scheduler fires **after** both. This means entities spawned in a scene's `update()` won't be processed by systems until the next frame, but timer callbacks run in the same frame after systems.

### Rendering Pipeline

Each `render()` call (lines 567-587):

```
1. dialog.draw(ui, width, height)       Queue dialog draw commands
2. renderer.render(world, config,       Main render pass: entities + camera + ui
     camera, particles, sceneTime, ui)
3. transition.render(ctx, w, h)         Transition overlay (if active)
4. toast.render(ctx, w, h)              Toast overlay
5. debug.render(ctx, world, cam, w, h)  Debug overlay
```

The renderer iterates all entities with `position` and a visual component (`ascii`, `sprite`, `textBlock`, `image`, `tilemap`, `gauge`), sorts by layer, applies camera transforms, and draws via the Pretext library.

### Start, Stop, Pause, Resume

```ts
await engine.start('title');   // loadScene('title') + loop.start() + emit 'engine:started'
engine.pause();                // loop.pause() + emit 'engine:paused'
engine.resume();               // loop.resume() + emit 'engine:resumed'
engine.stop();                 // loop.stop() + cleanup scene + clear systems/scheduler +
                               //   destroy input + emit 'engine:stopped'
```

`engine.stop()` is a full teardown: it cleans up the current scene, removes all systems, clears the scheduler, destroys input listeners, removes the resize handler, and destroys the viewport.

---

## Entity Management

### Spawning

`engine.spawn()` is the only correct way to create entities. It validates the entity, logs warnings to the debug overlay, and adds it to the world:

```ts
const player = engine.spawn({
  position: { x: 100, y: 200 },
  velocity: { vx: 0, vy: 0 },
  ascii: { char: '@', font: '16px "Fira Code", monospace', color: '#0f0' },
  collider: { type: 'circle', width: 16, height: 16 },
  tags: { values: new Set(['player']) },
});
```

Validation checks (lines 166-211 of `engine/core/engine.ts`):
- `position.x`/`position.y` must be defined and not NaN.
- `velocity.vx`/`velocity.vy` must be defined and not NaN.
- `ascii.char` and `ascii.font` must be non-empty (otherwise the entity is invisible).
- `collider.width`/`collider.height` must be > 0.
- `velocity` without `position` warns that physics will skip the entity.
- `physics` without `velocity` warns that gravity/drag will have no effect.

Warnings appear in the browser console and the debug overlay.

**Entity factories** return `Partial<Entity>` and are called inside `engine.spawn()`:

```ts
function createBullet(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: 0, vy: -400 },
    ascii: { char: '|', font: '16px "Fira Code", monospace', color: '#ff0' },
    collider: { type: 'rect', width: 4, height: 8 },
    offScreenDestroy: { margin: 20 },
    tags: { values: new Set(['bullet']) },
  };
}

engine.spawn(createBullet(100, 200));
```

### Destruction

Three destruction methods, each for different use cases:

```ts
engine.destroy(entity);              // Remove a single entity from the world
engine.destroyAll('enemy');          // Remove all entities with the tag 'enemy'
engine.destroyWithChildren(entity);  // Recursive: destroy entity + all children
```

`destroyAll` (line 235) materializes the list first with `findAllByTag`, then iterates --- safe during iteration. `destroyWithChildren` (line 421) recursively descends through `parent.children`, detaches from any parent, then removes from the world.

**Critical rule:** never mutate the world during iteration. Materialize first:

```ts
// WRONG: modifying world while iterating
for (const e of engine.world.with('health')) {
  if (e.health.current <= 0) engine.destroy(e);  // Breaks iteration
}

// CORRECT: collect then destroy
const dead = [...engine.world.with('health')].filter(e => e.health.current <= 0);
for (const e of dead) engine.destroy(e);
```

### Tags and Queries

Tags are a `Set<string>` on the `tags` component. The `createTags` helper (`engine/ecs/tags.ts`) is a shorthand:

```ts
import { createTags } from '@engine';
engine.spawn({ tags: createTags('enemy', 'boss'), /* ... */ });
```

Query methods:

```ts
// Archetype queries (miniplex --- live views, auto-updating):
engine.world.with('position', 'velocity')      // Entities with both components
engine.world.without('health')                  // Entities lacking a component
engine.world.with('position').where(e => ...)   // Filtered subset

// Tag-based lookups (iteration-based, not cached):
engine.findByTag('player')       // First entity with tag, or undefined
engine.findAllByTag('enemy')     // All entities with tag
```

### Parent-Child Hierarchies

Attach/detach children whose positions track a parent:

```ts
engine.attachChild(parent, child, offsetX, offsetY);
// Sets child.child = { parent, offsetX, offsetY }
// Adds child to parent.parent.children[]
// Immediately syncs position: child.pos = parent.pos + offset

engine.detachChild(child);
// Removes from parent's children array, deletes child component
// Position stays at current world position
```

The `_parent` system (priority 10) runs before physics and keeps all child positions in sync every frame.

### Entity Pools

For high-throughput scenarios (bullets, particles), `createEntityPool` (`engine/ecs/pool.ts`) avoids GC pressure by reusing entity objects:

```ts
const bulletPool = createEntityPool(engine, () => ({
  position: { x: 0, y: 0 },
  velocity: { vx: 0, vy: 0 },
  ascii: { char: '|', font: FONTS.normal, color: '#ff0' },
  collider: { type: 'circle', width: 4, height: 4 },
  tags: { values: new Set(['bullet']) },
}), { size: 64, max: 256 });

// Acquire: pulls from pool or creates new
const bullet = bulletPool.acquire({ position: { x, y }, velocity: { vx: 0, vy: -400 } });

// Release: removes from world but keeps in memory
bulletPool.release(bullet);
```

Pool properties: `active`, `available`, `total`, `max`. Methods: `warmup()`, `releaseAll()`, `destroy()`. When saturated (all active, at max), `acquire()` recycles the oldest active entity (FIFO).

---

## Scheduling

All timers live on `engine.scheduler` (`engine/utils/scheduler.ts`). They tick on game time (paused when engine is paused) and auto-clear on scene change.

### One-Shot Timers

```ts
const id = engine.after(2.0, () => {
  spawnBoss();
});
engine.cancelTimer(id);  // Cancel before it fires
```

### Repeating Timers

```ts
const id = engine.every(0.5, () => {
  spawnEnemy();
});
engine.cancelTimer(id);
```

Repeating timers preserve leftover time for accuracy: if a timer with a 0.5s interval fires at 0.52s elapsed, the next firing is at 1.0s (not 1.02s).

### Sequences

Chain delayed callbacks. Cancelling one step cancels the entire group:

```ts
engine.sequence([
  { delay: 0,   fn: () => showText('Ready') },
  { delay: 1.0, fn: () => showText('Set') },
  { delay: 1.0, fn: () => showText('Go!') },
]);
// Fires at t=0, t=1, t=2 (delays are cumulative)
```

### Cooldown Class

For rate-limiting actions (e.g., shooting), `Cooldown` (`engine/utils/timer.ts`) provides a frame-tick pattern:

```ts
import { Cooldown } from '@engine';

const shootCooldown = new Cooldown(0.3); // 0.3 second cooldown

// In system update:
shootCooldown.update(dt);
if (engine.keyboard.held('Space') && shootCooldown.fire()) {
  engine.spawn(createBullet(player.position.x, player.position.y));
}
```

`fire()` returns true and resets the timer only when `remaining <= 0`. Check `.ready` for read-only status. Call `.reset()` to force-ready.

### Spawn Timers

A convenience wrapper that combines `every()` with `spawn()`:

```ts
const id = engine.spawnEvery(1.5, () => createAsteroid());
// Equivalent to: engine.every(1.5, () => engine.spawn(createAsteroid()))
engine.cancelTimer(id);
```

---

## Scene Management

### defineScene

Scenes are discrete game states: title screen, gameplay, game over. Defined with `defineScene` (`engine/core/scene.ts`):

```ts
import { defineScene } from '@engine';

export const playScene = defineScene({
  name: 'play',

  setup(engine) {
    // Called once when scene loads. Spawn entities, add systems.
    engine.spawn(createPlayer(engine.centerX, engine.centerY));
    engine.addSystem(playerInputSystem);
    engine.addSystem(collisionSystem);
  },

  update(engine, dt) {
    // Called every frame after systems run. Scene-level logic.
    if (engine.keyboard.pressed('Escape')) {
      engine.loadScene('menu', { transition: 'fade' });
    }
  },

  cleanup(engine) {
    // Called when leaving this scene. Runs before world.clear().
    // Custom systems added in setup are removed by SceneManager.
  },
});
```

The `Scene` interface:
- `name: string` --- unique identifier for loading.
- `setup: (engine) => void | Promise<void>` --- async is supported.
- `update?: (engine, dt) => void` --- optional per-frame hook.
- `cleanup?: (engine) => void` --- optional teardown.

### Scene Registry and Loading

Scenes must be registered before they can be loaded:

```ts
engine.registerScene(titleScene);
engine.registerScene(playScene);
engine.registerScene(gameOverScene);
```

`engine.loadScene(name, opts?)` triggers the full scene transition sequence (lines 477-498 of `engine/core/engine.ts`):

1. Clear the scheduler, particle pool, turn manager, and scene time.
2. Call `SceneManager.load(name, engine)`:
   a. If a current scene exists: run its `cleanup()`, clear all systems, clear the world.
   b. Look up the new scene by name. If not found, throw with helpful error listing registered scenes.
   c. Set as current scene, run `setup(engine)`.
3. Register all 8 built-in systems.
4. Emit `scene:loaded` event with the scene name.

If the scene name is not found, the error message lists all registered scene names --- helpful for debugging typos.

### Transitions

Scene transitions are visual effects applied during `loadScene`:

```ts
engine.loadScene('play', { transition: 'fade', duration: 0.4 });
```

Available transition types (`engine/render/transitions.ts`):

| Type | Effect |
|---|---|
| `'fade'` | Fade to black, swap scene, fade in |
| `'fadeWhite'` | Fade to white, swap scene, fade in |
| `'wipe'` | Horizontal wipe |
| `'dissolve'` | Random pixel dissolve |
| `'scanline'` | CRT scanline effect |
| `'none'` | Instant (default) |

The transition has two phases: `out` (fade to cover) and `in` (fade from cover). The scene swap happens at the midpoint. A safety timeout (5 seconds by default) prevents a hung scene loader from freezing the transition forever.

### Scene Data

Pass arbitrary data between scenes:

```ts
// Sender:
engine.loadScene('play', {
  transition: 'fade',
  data: { floor: 2, hp: 50, inventory: [...] },
});

// Receiver (in setup or update):
const { floor = 1, hp = 100 } = engine.sceneData;
```

`engine.sceneData` is a `Record<string, any>` that resets on every `loadScene` call.

`engine.sceneTime` is a float (seconds) that resets to 0 on each scene load --- useful for time-based effects within a scene.

---

## defineGame API

### Overview

`defineGame` (`engine/core/define-game.ts`) is a declarative, boardgame.io-style API for turn-based, board, and puzzle games. A single object defines state, moves, turn order, phases, win conditions, and rendering. The engine handles turn rotation, phase transitions, and game-over detection.

Best for: tic-tac-toe, connect-four, chess, card games, puzzles, any hotseat game.

Not ideal for: real-time action, physics-heavy games, complex roguelikes (use `defineScene` + ECS instead).

### GameDefinition Shape

```ts
interface GameDefinition<TState, TPlayer extends string | number> {
  name: string;
  players?: { min?: number; max?: number; default?: number };
  seed?: number;                              // Deterministic RNG seed
  setup: (ctx: SetupContext) => TState;       // Initial state constructor
  turns?: TurnsConfig<TPlayer>;               // Turn order and auto-advance
  phases?: {                                  // Named phases with lifecycle
    order: string[];
    [phaseName: string]: PhaseConfig | string[];
  };
  moves: MovesMap<TState, TPlayer>;           // Named move functions
  endIf?: (ctx: GameContext) => GameResult | null | undefined | void;
  systems?: System[];                         // Extra ECS systems
  render?: (ctx: GameContext) => void;         // Per-frame draw callback
  startScene?: string;                        // Override scene name (default 'play')
}
```

The `defineGame` function is an identity helper that preserves TypeScript generics for autocomplete:

```ts
const myGame = defineGame<MyState, 'X' | 'O'>({
  // ctx.state is typed as MyState
  // ctx.currentPlayer is typed as 'X' | 'O'
});
```

The `const` modifier on `TPlayer` infers literal unions from `turns.order` automatically, so `turns: { order: ['X', 'O'] }` gives `ctx.currentPlayer` the type `'X' | 'O'` without `as const`.

### GameContext

Every callback receives a `GameContext<TState, TPlayer>`:

```ts
interface GameContext<TState, TPlayer> {
  engine: Engine;                 // Full engine instance
  state: TState;                  // Mutable game state (mutate directly in moves)
  phase: string | null;           // Current phase, or null if no phases
  turn: number;                   // 1-based turn counter
  currentPlayer: TPlayer;         // Current player id from turns.order
  playerIndex: number;            // 0-based index into turn order
  numPlayers: number;             // Player count
  moves: Record<string, (...args) => MoveResult | 'game-over'>;  // Bound dispatchers
  random: () => number;           // Deterministic seeded RNG [0, 1)
  log: (msg: string) => void;     // Append to history
  result: GameResult | null;      // Non-null after game ends
  endTurn: () => void;            // Manually advance turn
  endPhase: () => void;           // Advance to next phase
  goToPhase: (name: string) => void;  // Jump to named phase
}
```

`MoveInputCtx<TState, TPlayer>` is a convenience alias picking only `engine`, `moves`, `state`, `result`, and `currentPlayer` --- use it to type input handler functions:

```ts
function handleInput(ctx: MoveInputCtx<State, Player>) {
  if (ctx.engine.mouse.justDown && !ctx.result) {
    ctx.moves.place(computeCell(ctx.engine.mouse.x, ctx.engine.mouse.y));
  }
}
```

### Moves

Moves are synchronous functions that mutate `ctx.state` directly:

```ts
moves: {
  place(ctx, idx: number) {
    if (ctx.state.board[idx] !== null) return 'invalid';  // Reject
    ctx.state.board[idx] = ctx.currentPlayer;
    // Returning void = success
  },
}
```

Return values:
- `void` (or no return): move accepted, state mutated, turn advances (if `autoEnd` is true).
- `'invalid'`: move rejected, state untouched, turn does not advance.

Bound moves on `ctx.moves` can additionally return `'game-over'` if dispatched after the game ended.

### Turn Rotation

```ts
turns: {
  order: ['X', 'O'],    // Player ids. Defaults to [1, 2, ..., numPlayers]
  autoEnd: true,         // Auto-advance after each successful move (default true)
}
```

After each successful (non-invalid) move, if `autoEnd !== false`, the runtime calls `endTurn()` which:
1. Increments `playerIndex` mod `order.length`.
2. If it wraps to 0, increments the turn counter.

For multi-action turns (e.g., a player can take multiple actions), set `autoEnd: false` and call `ctx.endTurn()` explicitly when the player is done.

### Phases

Phases gate moves and add lifecycle hooks:

```ts
phases: {
  order: ['play', 'draw'],   // Phase sequence
  play: {
    moves: ['place'],         // Only 'place' is valid during 'play'
    onEnter(ctx) { /* ... */ },
    onExit(ctx) { /* ... */ },
    endIf(ctx) {
      // Return a phase name to switch, or null/undefined to stay
      return ctx.state.deckEmpty ? 'draw' : null;
    },
  },
  draw: {
    moves: ['drawCard'],
    endIf(ctx) { return 'play'; },
  },
}
```

Phase transitions:
- **Automatic:** after each move, the runtime checks the current phase's `endIf`. If it returns a truthy string, `switchPhase(next)` fires.
- **Manual:** `ctx.endPhase()` advances to the next phase in `order`. `ctx.goToPhase('name')` jumps directly.

Phase lifecycle: `onExit` fires on the old phase, then `onEnter` on the new phase. The TurnManager is also notified so phase-gated ECS systems see the correct phase.

### Game-Over Detection

The top-level `endIf` is checked after every successful move, after phase checks:

```ts
endIf(ctx) {
  const winner = checkWinner(ctx.state.board);
  if (winner) return { winner };
  if (ctx.state.board.every(c => c !== null)) return { draw: true };
  // Return null/undefined/void to continue
},
```

When `endIf` returns a truthy value:
1. The result is stored on `runtime.result` (accessible as `ctx.result`).
2. All subsequent moves return `'game-over'`.
3. The `render()` callback continues to run (so you can display the result).

`GameResult` shape: `{ winner?: string | number; draw?: boolean; [key: string]: unknown }`.

### GameRuntime Internals

`GameRuntime` (`engine/core/define-game.ts`, line 223) is the internal class that owns game state and dispatches moves. Created by `engine.runGame(def)`:

```
engine.runGame(def)
  -> new GameRuntime(def, engine)    Store on engine._gameRuntime
  -> buildGameScene(def, runtime)    Create a Scene wrapping the runtime
  -> engine.registerScene(scene)     Register the scene
  -> return scene.name               Caller uses this as startScene
```

Key runtime methods:
- `start()`: runs `def.setup()`, initializes turn state, enters the first phase.
- `dispatch(name, args)`: validates move, checks phase whitelist, calls the move function, checks phase/game endIf, auto-rotates turn.
- `buildCtx()`: constructs a fresh `GameContext` on each invocation (cheap, no allocation of state).
- `tick(dt)`: called each frame from the generated scene's `update` hook; runs `def.render(ctx)`.

The runtime's seeded RNG comes from `createSeededRandom` (`engine/behaviors/loot.ts`), making `ctx.random()` deterministic for lockstep multiplayer.

### Wiring into the Scene System

`buildGameScene` (`engine/core/define-game.ts`, line 429) creates a standard `Scene`:

```ts
function buildGameScene(def, runtime) {
  return defineScene({
    name: def.startScene ?? 'play',
    setup(engine) {
      runtime.start();                         // Initialize state
      for (const sys of def.systems ?? [])
        engine.addSystem(sys);                  // Add custom systems
    },
    update(_engine, dt) {
      runtime.tick(dt);                         // Calls def.render(ctx) each frame
    },
    cleanup(engine) {
      engine.turns.stop();
      for (const sys of def.systems ?? [])
        engine.removeSystem(sys.name);
    },
  });
}
```

The full wiring from `setupGame`:

```ts
// games/tic-tac-toe/index.ts
export function setupGame(engine: Engine) {
  return {
    startScene: engine.runGame(ticTacToe),  // Returns 'play' (the scene name)
    screens: { menu: Empty, playing: Empty, gameOver: Empty },
    hud: [],
  };
}
```

Setting `screens` to empty components and `hud` to `[]` suppresses the React overlay, making the game canvas-only.

---

## ECS Architecture

### World

The ECS world is a miniplex `World<Entity>` created by `createWorld()` (`engine/ecs/world.ts`):

```ts
import { World } from 'miniplex';
export function createWorld() {
  return new World<Entity>();
}
```

It lives at `engine.world`. Entities are plain objects --- no classes, no decorators, no inheritance. Archetype queries are live views that auto-update as entities are added/removed.

### Entity and Component Shapes

The full `Entity` interface is in `shared/types.ts`. Every field is optional (entities are `Partial<Entity>`). The interface includes an index signature `[key: string]: any` for game-specific custom components.

Core component shapes:

| Component | Key Fields | Notes |
|---|---|---|
| `position` | `x, y` | Required for rendering and physics |
| `velocity` | `vx, vy` | Integrated by `_physics` |
| `acceleration` | `ax, ay` | Applied to velocity by `_physics` |
| `ascii` | `char, font, color, glow?, opacity?, scale?, layer?` | Single-char/text rendering |
| `sprite` | `lines[], font, color, colorMap?, glow?, opacity?, layer?` | Multi-line ASCII art |
| `textBlock` | `text, font, maxWidth, lineHeight, color, align?, layer?` | Wrapped paragraph |
| `collider` | `type: 'circle'\|'rect', width, height, sensor?` | Collision bounds |
| `health` | `current, max` | HP tracking |
| `lifetime` | `remaining` | Countdown to auto-destroy (seconds) |
| `physics` | `gravity?, friction?, drag?, bounce?, maxSpeed?, mass?, grounded?` | Physics parameters |
| `tags` | `values: Set<string>` | Named tags for queries |
| `tween` | `tweens: TweenEntry[]` | Declarative property interpolation |
| `animation` | `frames[], frameDuration, currentFrame, elapsed, loop?, playing?, onComplete?` | Frame-by-frame animation |
| `stateMachine` | `current, states: Record<string, {enter?, update?, exit?}>, next?` | Finite state machine |
| `parent` | `children: Partial<Entity>[]` | Parent in hierarchy |
| `child` | `parent, offsetX, offsetY` | Child in hierarchy |
| `emitter` | `rate, spread, speed, lifetime, char, color, _acc` | Particle emitter |
| `screenWrap` | `margin?` | Wrap at screen edges |
| `screenClamp` | `padding?` | Clamp to screen bounds |
| `offScreenDestroy` | `margin?` | Destroy when off screen |
| `image` | `image: HTMLImageElement, width, height, opacity?, layer?, anchor?, rotation?` | Image rendering |
| `gauge` | `current, max, width, fillChar?, emptyChar?, color?, emptyColor?` | ASCII progress bar |
| `typewriter` | `fullText, revealed, speed, done, _acc, onComplete?, onChar?` | Progressive text reveal |
| `interactive` | `hovered, clicked, dragging, dragOffset, cursor?, autoMove?` | Mouse interaction state |
| `tilemap` | `data: string[], legend, cellSize, offsetX, offsetY, font?, layer?` | Tile grid rendering |
| `textEffect` | `fn: (charIndex, totalChars, time) => CharTransform` | Per-character effects |

Use `GameEntity<T>` for typed custom entities:

```ts
type MyEntity = GameEntity<{ score: number; combo: number }>;
```

### System Definition and Priorities

Systems are plain objects with `name`, `update`, and optional `init`, `cleanup`, `phase`, and `priority` fields. Use `defineSystem` (`engine/ecs/systems.ts`) as a typed helper:

```ts
import { defineSystem, SystemPriority } from '@engine';

export const collisionSystem = defineSystem({
  name: 'collision',
  priority: SystemPriority.physics + 1,  // Runs after physics (20), before tween (30)

  init(engine) {
    // Called once when system is added
  },

  update(engine, dt) {
    const bullets = [...engine.world.with('position', 'collider', 'tags')]
      .filter(e => e.tags.values.has('bullet'));
    // ...
  },

  cleanup(engine) {
    // Called when system is removed
  },
});
```

Priority determines execution order (lower = earlier). The `SystemRunner` inserts systems at the end of their priority block, preserving registration order for ties.

`SystemPriority` constants (`engine/ecs/systems.ts`, line 42):

```ts
const SystemPriority = {
  parent:       10,
  physics:      20,
  tween:        30,
  animation:    40,
  emitter:      50,
  stateMachine: 60,
  lifetime:     70,
  screenBounds: 80,
} as const;
```

Custom systems default to priority `0`, so they run **before** all built-ins. To interleave:

```ts
// After physics, before tween:
priority: SystemPriority.physics + 1   // = 21

// After animation, before emitter:
priority: SystemPriority.animation + 1 // = 41
```

### The 8 Built-in Systems

These are auto-registered on every `loadScene()` call. Never add them manually.

**1. `_parent` (priority 10)** --- `engine/ecs/parent-system.ts`

Syncs child positions to parent positions. For each entity with `child` + `position`, sets `position = parent.position + offset`. Runs first so all other systems see correct world positions.

**2. `_physics` (priority 20)** --- `engine/physics/physics-system.ts`

Four-pass physics integration:
1. **Acceleration pass:** For entities with `position + velocity + acceleration`, applies `velocity += acceleration * dt`.
2. **Forces pass:** For entities with `position + velocity + physics`, applies gravity, friction, drag, and maxSpeed clamping.
3. **Integration pass:** For all entities with `position + velocity`, applies `position += velocity * dt`. Then NaN detection resets corrupt values to (0,0) with a console error.
4. **Bounce pass:** For entities with `position + velocity + physics + collider`, bounces off world bounds based on `physics.bounce`.

**Critical:** do NOT integrate velocity manually in custom systems. The `_physics` system already does `position += velocity * dt`. Doing it again causes double-speed movement.

**3. `_tween` (priority 30)** --- `engine/ecs/tween-system.ts`

Processes `TweenEntry` arrays on entities with a `tween` component. Each entry interpolates a dot-path property (e.g., `'position.x'`, `'ascii.opacity'`) from `from` to `to` over `duration` seconds using the specified easing. Completed tweens are removed from the array. If `destroyOnComplete` is set, the entity is destroyed when that tween finishes. When all tweens complete, the `tween` component is removed.

Easing functions: `linear`, `easeOut` (quadratic), `easeIn` (quadratic), `easeInOut`.

**4. `_animation` (priority 40)** --- `engine/ecs/animation-system.ts`

Cycles through `AnimationFrame` arrays. Each frame can override `char` (for `ascii`), `lines` (for `sprite`), and `color`. Supports per-frame duration overrides, looping, and `onComplete: 'destroy' | 'stop'`.

**5. `_emitter` (priority 50)** --- `engine/ecs/emitter-system.ts`

For entities with `position + emitter`, spawns particles at the configured rate. Uses an accumulator (`_acc`) for sub-frame accuracy. Particles are sent to `engine.particles.burst()`.

**6. `_stateMachine` (priority 60)** --- `engine/ecs/state-machine-system.ts`

For entities with `stateMachine`, processes transitions (when `sm.next` is set and differs from `sm.current`): calls `exit()` on the old state, updates `current`, calls `enter()` on the new state. Then calls `update(entity, engine, dt)` on the current state every frame.

Trigger a transition from game code:

```ts
import { transition } from '@engine';
transition(entity, 'attacking');  // Sets entity.stateMachine.next = 'attacking'
```

**7. `_lifetime` (priority 70)** --- `engine/ecs/lifetime-system.ts`

Decrements `lifetime.remaining` by `dt`. When it reaches zero, the entity is destroyed. Materializes the destruction list first (safe iteration pattern).

**8. `_screenBounds` (priority 80)** --- `engine/ecs/screen-bounds-system.ts`

Three behaviors based on which component is present:
- `screenWrap`: teleports entity to the opposite edge when it leaves the screen.
- `screenClamp`: clamps entity position to stay within screen bounds.
- `offScreenDestroy`: destroys entity when it goes beyond the margin (default 50px).

### Phase-Gated Systems

When `engine.turns.active` is true, systems with a `phase` property only run during their declared phase:

```ts
const enemyAISystem = defineSystem({
  name: 'enemyAI',
  phase: 'enemy',       // Only runs during the 'enemy' phase
  update(engine, dt) {
    // ...
  },
});
```

Systems **without** a `phase` always run, even when turn management is active. This preserves real-time behavior for animations, tweens, and particles alongside turn-based gameplay.

### System Error Handling

The `SystemRunner` wraps every `system.update()` call in a try/catch (line 137 of `engine/ecs/systems.ts`). A broken system:
1. Logs the error to console.
2. Shows the error in the debug overlay (first 3 occurrences per system).
3. Does **not** crash the game loop --- other systems and rendering continue.

Optional per-system timing tracking (for the debug profiler) can be enabled via `systems.setTimingEnabled(true)`. It measures `last`, `avg` (exponential moving average), and `max` duration per system.

---

## Turn Manager

The `TurnManager` (`engine/core/turn-manager.ts`) provides opt-in turn/phase flow for ECS games (used by `defineGame` internally, and directly by complex turn-based games like roguelikes).

```ts
// Configure
engine.turns.configure({ phases: ['player', 'enemy', 'resolve'] });
engine.turns.start();       // Begin turn 1, phase 'player'

// Query
engine.turns.active          // true if running
engine.turns.currentPhase    // 'player'
engine.turns.turnCount       // 1
engine.turns.phases          // ['player', 'enemy', 'resolve']

// Advance
engine.turns.endPhase();     // player -> enemy -> resolve -> (next turn) player
engine.turns.endTurn();      // Jump to first phase of next turn
engine.turns.goToPhase('resolve');  // Jump directly

// Stop
engine.turns.stop();         // Deactivates turn management
engine.turns.reset();        // Reset state (called on scene change)
```

Events emitted: `turn:start(turnNumber)`, `turn:end(turnNumber)`, `phase:enter(phaseName)`, `phase:exit(phaseName)`.

---

## Event System

The engine uses a typed event bus based on `mitt` (`shared/events.ts`):

```ts
import { events } from '@engine';

// Listen
const off = events.on('scene:loaded', (sceneName) => {
  console.log(`Loaded: ${sceneName}`);
});

// Emit
events.emit('game:start');

// Unlisten
off();
```

Full event catalog (`shared/events.ts`):

| Event | Payload | Emitted by |
|---|---|---|
| `game:start` | `undefined` | Game code |
| `game:resume` | `undefined` | Game code |
| `game:restart` | `undefined` | Game code |
| `game:pause` | `undefined` | Game code |
| `scene:loaded` | `string` (scene name) | `engine.loadScene()` |
| `engine:started` | `undefined` | `engine.start()` |
| `engine:stopped` | `undefined` | `engine.stop()` |
| `engine:paused` | `undefined` | `engine.pause()` |
| `engine:resumed` | `undefined` | `engine.resume()` |
| `turn:start` | `number` (turn count) | TurnManager |
| `turn:end` | `number` (turn count) | TurnManager |
| `phase:enter` | `string` (phase name) | TurnManager |
| `phase:exit` | `string` (phase name) | TurnManager |
| `inventory:add` | `{ entity, item, count }` | Inventory behaviors |
| `inventory:remove` | `{ entity, itemId, count }` | Inventory behaviors |
| `inventory:full` | `{ entity, item }` | Inventory behaviors |
| `equipment:equip` | `{ entity, item, slotId }` | Equipment behaviors |
| `equipment:unequip` | `{ entity, item, slotId }` | Equipment behaviors |
| `currency:gained` | `{ entity, currency, amount, reason? }` | Currency behaviors |
| `currency:spent` | `{ entity, currency, amount, reason? }` | Currency behaviors |
| `currency:insufficient` | `{ entity, currency, required, available, reason? }` | Currency behaviors |
| `craft:complete` | `{ entity, recipeId, items, consumed, xpGained? }` | Crafting behaviors |
| `craft:failed` | `{ entity, recipeId, reason, missing?, consumed? }` | Crafting behaviors |
| `combat:damage-taken` | `{ entity, amount, source?, type?, remainingHp }` | createDamageSystem |
| `combat:entity-defeated` | `{ entity, source?, type? }` | createDamageSystem |
| `viewport:resized` | `{ width, height, orientation }` | Viewport |
| `viewport:orientation` | `'portrait' \| 'landscape'` | Viewport |

---

## Extension Recipes

### Adding a New Component Type

**Step 1.** Define the interface in `shared/types.ts`:

```ts
// shared/types.ts
export interface Shield {
  current: number;
  max: number;
  regenRate: number;   // HP per second
  regenDelay: number;  // seconds after last hit before regen starts
  _regenTimer: number; // internal accumulator
}
```

**Step 2.** Add the field to the `Entity` interface in the same file:

```ts
// shared/types.ts, inside the Entity interface
export interface Entity {
  // ... existing components ...
  shield: Shield;
  // ...
}
```

**Step 3.** Export the type from the engine's public API in `engine/index.ts`:

```ts
// engine/index.ts
export type { Shield } from '@shared/types';
```

**Step 4.** Use it in entity factories:

```ts
engine.spawn({
  position: { x: 100, y: 200 },
  shield: { current: 50, max: 50, regenRate: 5, regenDelay: 2, _regenTimer: 0 },
});
```

**Step 5.** Query it:

```ts
for (const e of engine.world.with('shield')) {
  // e.shield is typed as Shield
}
```

### Adding a New System

**Step 1.** Create the system file (in `game/systems/` for game-specific, or `engine/ecs/` for engine-level):

```ts
// game/systems/shield-regen.ts
import { defineSystem, SystemPriority } from '@engine';

export const shieldRegenSystem = defineSystem({
  name: 'shieldRegen',
  priority: SystemPriority.physics + 1,  // After physics, before tweens

  update(engine, dt) {
    for (const e of engine.world.with('shield')) {
      const s = e.shield;
      s._regenTimer += dt;
      if (s._regenTimer >= s.regenDelay && s.current < s.max) {
        s.current = Math.min(s.max, s.current + s.regenRate * dt);
      }
    }
  },
});
```

**Step 2.** Register it in the scene's `setup`:

```ts
// In your scene
setup(engine) {
  engine.addSystem(shieldRegenSystem);
},
```

The system is automatically removed when the scene changes (the `SceneManager` calls `systems.clear()` during scene transitions). If you need explicit removal, call `engine.removeSystem('shieldRegen')`.

**Step 3.** For phase-gated systems, add the `phase` field:

```ts
export const shieldRegenSystem = defineSystem({
  name: 'shieldRegen',
  phase: 'resolve',    // Only runs during the 'resolve' turn phase
  update(engine, dt) { /* ... */ },
});
```

### Creating a New Scene

**Step 1.** Create the scene file:

```ts
// game/scenes/boss-fight.ts
import { defineScene, type Engine, SystemPriority } from '@engine';
import { createBoss } from '../entities/boss';
import { bossAISystem } from '../systems/boss-ai';

export const bossFightScene = defineScene({
  name: 'boss-fight',

  async setup(engine: Engine) {
    // Async setup is supported --- load assets, generate level, etc.
    await engine.preloadImages(['/boss-sprite.png']);

    const { floor, playerHp } = engine.sceneData;

    engine.spawn(createBoss(engine.centerX, 100, floor));
    engine.spawn(createPlayer(engine.centerX, engine.height - 100, playerHp));

    engine.addSystem(bossAISystem);
    engine.addSystem(bossCollisionSystem);

    engine.camera.shake(8);
    engine.toast.show('BOSS FIGHT', { color: '#ff4444' });
  },

  update(engine: Engine, dt: number) {
    // Check boss defeated
    const boss = engine.findByTag('boss');
    if (boss && boss.health.current <= 0) {
      engine.loadScene('victory', {
        transition: 'fadeWhite',
        duration: 0.6,
        data: { floor: engine.sceneData.floor },
      });
    }
  },

  cleanup(engine: Engine) {
    // Runs before world.clear() on scene exit
    // Custom systems are cleared automatically, but you can do
    // additional cleanup here if needed
  },
});
```

**Step 2.** Register in `setupGame`:

```ts
export function setupGame(engine: Engine) {
  engine.registerScene(titleScene);
  engine.registerScene(playScene);
  engine.registerScene(bossFightScene);
  engine.registerScene(victoryScene);
  return 'title';
}
```

**Step 3.** Load from another scene:

```ts
engine.loadScene('boss-fight', {
  transition: 'fade',
  duration: 0.4,
  data: { floor: 3, playerHp: 75 },
});
```
