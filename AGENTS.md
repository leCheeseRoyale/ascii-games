# AGENTS.md — Quick Reference for AI Agents

## Commands

| Command | Purpose |
|---|---|
| `bun dev` | Dev server (auto-runs template picker if `game/` missing) |
| `bun run check` | Typecheck (`tsc --noEmit`) |
| `bun run check:bounds` | Enforce import boundaries between engine/game/ui/shared |
| `bun run check:all` | Typecheck + boundaries + lint (full verification) |
| `bun test` | Run all tests (1140+ in `engine/__tests__/`) |
| `bun test <path>` | Single test file |
| `bun run lint` / `lint:fix` | Biome lint |
| `bun run build` | Production build |
| `bun run export` | Single-file `dist/game.html` |
| `bun run gen:api` | Regenerate `docs/API-generated.md` |

**Scaffolding:**

| Command | Creates |
|---|---|
| `bun run init:game [blank\|asteroid-field\|platformer\|roguelike\|physics-text\|tic-tac-toe\|connect-four]` | Copies template → `game/` |
| `bun run new:scene <name>` | `game/scenes/<name>.ts` |
| `bun run new:system <name>` | `game/systems/<name>.ts` |
| `bun run new:entity <name>` | `game/entities/<name>.ts` |

**AI-assisted (require `ANTHROPIC_API_KEY` in `.env.local`):**

| Command | Creates |
|---|---|
| `bun run ai:game "<pitch>"` | `game/<slug>.ts` — complete `defineGame` module |
| `bun run ai:sprite "<prompt>"` | `game/entities/<slug>.ts` — sprite factory |
| `bun run ai:mechanic "<desc>"` | `game/systems/<slug>.ts` — behavior system |
| `bun run ai:juice "<event>"` | `game/helpers/<slug>.ts` — particles+sfx+shake |

Flags: `--model=opus|sonnet|haiku`, `--out=<path>`, `--force`, `--dry-run`

## Architecture

```
engine/   Framework — never add game logic here
game/     Per-project game code (gitignored, from games/<template>/)
games/    Source-of-truth templates (edit THESE to change template content)
ui/       React overlay — zustand store is the ONLY bridge to engine/game
shared/   Types, constants, events
```

Path aliases: `@engine`, `@game`, `@ui`, `@shared`

**Boundaries** (enforced by `bun run check:bounds`):

| Layer | May import | Must NOT import |
|---|---|---|
| `engine/` | `@shared`, `@engine` | `@game`, `@ui` |
| `game/`, `games/` | `@engine`, `@shared`, `@ui/store` | `@ui/*` (except store) |
| `ui/` | `@engine`, `@shared`, `@ui/*`, `@game/index` | `@game/*` (except index) |
| `shared/` | nothing from `@engine`/`@game`/`@ui` | `@engine`, `@game`, `@ui` |

## Decision: Which API to Use?

| Game type | Use | Why |
|---|---|---|
| Turn-based, board game, puzzle, hotseat | `defineGame` + `engine.runGame()` | State + moves + turns + render in one object. Engine handles turn rotation, phases, game-over. |
| Real-time action, platformer, shooter | `defineScene` + `defineSystem` | Full ECS control, physics, continuous input. |
| Roguelike / turn-based with grid + FOV | `defineScene` + `engine.turns.configure({ phases })` | Need tilemaps, pathfinding, camera — too complex for `defineGame`'s `render()` callback. |

## `defineGame` — Declarative Game API

Best for turn-based/board/puzzle games. Single-file, 30–80 lines typical.

```ts
import { defineGame, type Engine, type MoveInputCtx } from "@engine";
const Empty = () => null;
type State = { board: (string | null)[] };
type Player = "X" | "O";

export const myGame = defineGame<State, Player>({
  name: "my-game",
  players: { min: 2, max: 2, default: 2 },
  setup: (ctx) => ({ board: Array(9).fill(null) }),
  turns: { order: ["X", "O"], autoEnd: true },
  moves: {
    place(ctx, idx: number) {
      if (ctx.state.board[idx] !== null) return "invalid"; // reject + no turn advance
      ctx.state.board[idx] = ctx.currentPlayer;
    },
  },
  endIf(ctx) {
    // return truthy → game over
    if (checkWin(ctx.state.board)) return { winner: ctx.currentPlayer };
    if (ctx.state.board.every(c => c !== null)) return { draw: true };
  },
  render(ctx) {
    // called each frame — draw with engine.ui.*, read input
    const e = ctx.engine;
    e.ui.panel(/* ... */);
    if (e.mouse.justDown && !ctx.result) {
      ctx.moves.place(computeCell(e.mouse.x, e.mouse.y));
    }
  },
});

export function setupGame(engine: Engine) {
  return {
    startScene: engine.runGame(myGame),
    screens: { menu: Empty, playing: Empty, gameOver: Empty },
    hud: [],
  };
}
```

**`GameContext` fields** (passed to every callback as `ctx`):

| Field | Type | Description |
|---|---|---|
| `engine` | `Engine` | Full engine instance |
| `state` | `TState` | Mutable game state — mutate directly in moves |
| `phase` | `string \| null` | Current phase name |
| `turn` | `number` | 1-based turn counter |
| `currentPlayer` | `TPlayer` | Current player from `turns.order` |
| `playerIndex` | `number` | 1-based player index |
| `numPlayers` | `number` | Total players |
| `moves` | `Record<string, (...args) => MoveResult>` | Bound move dispatchers |
| `random` | `() => number` | Deterministic seeded RNG [0,1) |
| `log` | `(msg: string) => void` | Append to game history |
| `result` | `GameResult \| null` | Non-null after `endIf` fires |
| `endTurn` | `() => void` | Skip to next turn immediately |
| `endPhase` | `() => void` | Advance to next phase |
| `goToPhase` | `(name: string) => void` | Jump to a named phase |

**Phases:** Add `phases: { order: ["play", "draw"], play: { endIf, moves: ["place"] }, draw: { onEnter } }` to gate moves and transitions.

**Single-player / real-time:** Omit `turns` and `players`. Use `render()` for the game loop. `ctx.moves` still works for input dispatch.

**`MoveInputCtx`** = `Pick<GameContext, 'engine' | 'moves' | 'state' | 'result' | 'currentPlayer'>` — pass to input helpers.

## `defineScene` + `defineSystem` — ECS Game API

Best for real-time, physics-heavy, or complex games.

```ts
// Scene
export const playScene = defineScene({
  name: "play",
  setup(engine: Engine) {
    engine.spawn(createPlayer(engine.centerX, engine.centerY));
    engine.addSystem(playerInputSystem);
    engine.addSystem(collisionSystem);
  },
  update(engine: Engine, dt: number) { /* per-frame logic */ },
  cleanup(engine: Engine) { /* runs on scene exit */ },
});

// System
export const collisionSystem = defineSystem({
  name: "collision",
  priority: SystemPriority.physics + 1, // after physics, before tween
  update(engine: Engine, dt: number) {
    const bullets = [...engine.world.with("position", "collider", "tags")].filter(e => e.tags.values.has("bullet"));
    // ...
  },
});
```

**Wiring in `setupGame`:**

```ts
// ECS-style (returns string or object)
export function setupGame(engine: Engine) {
  engine.registerScene(titleScene);
  engine.registerScene(playScene);
  return "title"; // starting scene name
}

// Canvas-only (suppress React overlay)
export function setupGame(engine: Engine) {
  const Empty = () => null;
  engine.registerScene(titleScene);
  engine.registerScene(playScene);
  return { startScene: "title", screens: { menu: Empty, playing: Empty, gameOver: Empty }, hud: [] };
}
```

## ECS Quick Reference

**World:** `engine.world` (miniplex `World<Entity>`)

**Entity components** — plain objects, all optional:

| Component | Shape | Purpose |
|---|---|---|
| `position` | `{ x, y }` | World position (required for rendering) |
| `velocity` | `{ vx, vy }` | Speed/direction — `_physics` integrates `position += velocity * dt` |
| `acceleration` | `{ ax, ay }` | Applied to velocity each frame |
| `ascii` | `{ char, font, color, glow?, opacity?, scale?, layer? }` | Single-character/text render |
| `sprite` | `{ lines: string[], font, color, colorMap?, glow?, opacity?, layer? }` | Multi-line ASCII art |
| `textBlock` | `{ text, font, maxWidth, lineHeight, color, align?, layer? }` | Wrapped paragraph |
| `collider` | `{ type: "circle"\|"rect", width, height, sensor? }` | Collision bounds |
| `health` | `{ current, max }` | HP tracking |
| `lifetime` | `{ remaining }` | Auto-destroy countdown |
| `physics` | `{ gravity?, friction?, drag?, bounce?, maxSpeed?, mass?, grounded? }` | Physics params |
| `tags` | `{ values: Set<string> }` | Named tags for queries |
| `tween` | `{ tweens: TweenEntry[] }` | Declarative animation |
| `animation` | `{ frames, frameDuration, currentFrame, elapsed, loop?, playing? }` | Frame animation |
| `stateMachine` | `{ current, states: Record<string, { enter?, update?, exit? }>, next? }` | FSM |
| `image` | `{ image: HTMLImageElement, width, height, opacity?, layer?, anchor? }` | Loaded image |
| `parent` | `{ children: Partial<Entity>[] }` | Children array |
| `child` | `{ parent, offsetX, offsetY }` | Parent reference |
| `screenWrap` | `{ margin? }` | Wrap position at screen edges |
| `screenClamp` | `{ padding? }` | Clamp to screen bounds |
| `offScreenDestroy` | `{ margin? }` | Destroy when off screen |
| `gauge` | `{ current, max, width, fillChar?, emptyChar?, color?, emptyColor? }` | ASCII progress bar |
| `interactive` | `{ hovered, clicked, dragging, dragOffset, cursor?, autoMove? }` | Click/drag state |
| `tilemap` | `{ data: string[], legend, cellSize, offsetX, offsetY, font?, layer? }` | Tile grid render |
| `textEffect` | `{ fn: (charIndex, total, time) => CharTransform }` | Per-char effects |
| `typewriter` | `{ fullText, revealed, speed, done, _acc, onComplete?, onChar? }` | Progressive text |
| `emitter` | `{ rate, spread, speed, lifetime, char, color, _acc }` | Particle emitter |

**Custom components:** `Entity` has `[key: string]: any` — add any field. Use `GameEntity<T>` for typed custom entities.

**Spawn:** `engine.spawn({ position: {x,y}, ascii: {char,font,color} })` — validates + adds to world
**Destroy:** `engine.destroy(entity)` / `engine.destroyAll('tag')` / `engine.destroyWithChildren(entity)`
**Query:** `engine.world.with('position', 'velocity')`, `.without('health')`, `.where(e => ...)`, `engine.findByTag('player')`, `engine.findAllByTag('enemy')`
**Factory pattern:** `function createX(x,y): Partial<Entity> { return { position, ascii, ... } }`

## Built-in Systems (auto-registered, do NOT add manually)

| System | Priority | Handles |
|---|---|---|
| `_parent` | 10 | Child position offsets |
| `_physics` | 20 | `position += velocity * dt`, gravity, friction, drag, bounce |
| `_tween` | 30 | Tween entry interpolation |
| `_animation` | 40 | Frame cycling |
| `_emitter` | 50 | Particle spawning |
| `_stateMachine` | 60 | FSM transitions + updates |
| `_lifetime` | 70 | Countdown + destroy |
| `_screenBounds` | 80 | screenWrap / screenClamp / offScreenDestroy |

Custom systems default to priority `0` (before all built-ins). Use `SystemPriority.physics + 1` to interleave.

## 6 Don'ts

1. **Don't integrate velocity manually.** `_physics` already does `position += velocity * dt`. Writing it again = double-speed.
2. **Don't add built-in systems manually.** They auto-register on scene load.
3. **Don't mutate the world during iteration.** Collect first: `const list = [...engine.world.with(...)]`, then iterate.
4. **Don't put game logic in `engine/`.** It's a reusable framework.
5. **Don't import `ui/` from `engine/` or `game/`** except the zustand store.
6. **Don't use `setInterval`/`setTimeout`/classes for entities.** Use `engine.after()`, `engine.every()`, plain objects.

## Common Patterns

### Input
```ts
engine.keyboard.held("ArrowLeft")    // true while held
engine.keyboard.pressed("Space")     // true only on frame it went down
engine.keyboard.released("KeyE")     // true only on frame it went up
engine.mouse.x / engine.mouse.y     // cursor position
engine.mouse.justDown / .justUp      // single-frame click
```

### Movement (set velocity only — physics integrates)
```ts
const speed = 200;
entity.velocity.vx = (kb.held("KeyD") ? speed : 0) - (kb.held("KeyA") ? speed : 0);
entity.velocity.vy = (kb.held("KeyS") ? speed : 0) - (kb.held("KeyW") ? speed : 0);
```

### Collision detection
```ts
import { overlaps } from "@engine";
if (overlaps(entityA, entityB)) { /* handle */ }
// Both entities need `collider` + `position` components
```

### Destroy safely during iteration
```ts
const toKill: any[] = [];
for (const e of engine.world.with("health")) if (e.health.current <= 0) toKill.push(e);
for (const e of toKill) engine.destroy(e);
```

### Scene data (pass between scenes)
```ts
// Sender:
engine.loadScene("play", { transition: "fade", duration: 0.4, data: { floor: 2, hp: 50 } });
// Receiver (in scene setup):
const { floor = 1, hp = 100 } = engine.sceneData;
```

### Effects
```ts
engine.floatingText(x, y - 12, "+10", "#ffcc00");
engine.toast.show("Wave 3", { color: "#ffcc00" });
engine.particles.burst({ x, y, count: 16, chars: ["*", "."], color: "#fa0", speed: 140, lifetime: 0.6 });
engine.particles.explosion(x, y, "#f44");
engine.particles.sparkle(x, y, "#ff0");
engine.camera.shake(6);
engine.camera.follow(player, { smoothing: 0.15, deadzone: { width: 120, height: 80 } });
sfx.hit(); sfx.explode(); sfx.pickup(); sfx.shoot(); sfx.death(); sfx.menu();
```

### Turn-based phases
```ts
engine.turns.configure({ phases: ["player", "enemy", "resolve"] });
engine.turns.start();
// In systems, gate with phase:
defineSystem({ name: "enemyAI", phase: "enemy", update(engine, dt) { /* ... */ } });
// Advance:
engine.turns.endPhase();   // next phase
engine.turns.endTurn();    // skip to next turn
engine.turns.goToPhase("resolve"); // jump
```

### Camera
```ts
engine.camera.x / .y                          // position
engine.camera.follow(target, { smoothing, deadzone, lookahead, offset });
engine.camera.setBounds({ minX, minY, maxX, maxY });
engine.camera.shake(magnitude);
```

### Canvas UI (immediate-mode — call each frame)
```ts
engine.ui.panel(x, y, w, h, { bg, border, borderColor });
engine.ui.text(x, y, str, { font, color, glow?, align? });
engine.ui.bar(x, y, w, segments, fillPct, { fillColor, emptyColor, label? });
engine.ui.inlineRun(x, y, chunks, { gap? }); // mixed-font badges
engine.dialog.show(text, { speaker?, typeSpeed?, border?, onChar? });
engine.dialog.choice(text, options, { border? });
const menu = new UIMenu(items, { border, title, anchor, onMove });
menu.update(engine); menu.draw(engine.ui, x, y);
if (menu.confirmed) handle(menu.selectedIndex);
```

### Timers
```ts
engine.after(2, () => { /* one-shot after 2s */ });
engine.every(1, () => { /* every 1s */ });
const cd = new Cooldown(0.5); cd.update(dt); if (cd.fire()) { /* rate-limited */ }
```

### Entity pool (bullets/particles — avoids GC)
```ts
const pool = createEntityPool(engine, () => ({
  position: { x: 0, y: 0 }, velocity: { vx: 0, vy: 0 },
  ascii: { char: "•", font: FONTS.normal, color: "#ff0" },
}), { size: 64, max: 256 });
const b = pool.acquire({ position: { x, y }, velocity: { vx: 0, vy: -400 } });
pool.release(b);
```

### Tween
```ts
engine.tweenEntity(entity, "position.x", from, to, duration, "easeOut");
// easing: "linear" | "easeOut" | "easeIn" | "easeInOut"
```

## Behaviors (import from `@engine`)

| Need | API | Key functions |
|---|---|---|
| Inventory | `createInventory({ maxSlots })` | `addItem`, `removeItem`, `hasItem`, `countItem`, `isFull`, `transferItem` |
| Equipment | `createEquipment(slotIds, blocks?)` | `equipItem(eq, item, stats?)`, `unequipItem(eq, slotId, stats?)`, `canEquip` |
| Stats | `createStats({ atk: 10 })` | `getStat`, `setBaseStat`, `addModifier`, `removeModifier`, `tickModifiers` |
| Currency | `createWallet({ gold: 50 })` | `addCurrency`, `spendCurrency`, `canAfford`, `serializeWallet` |
| Damage | `createDamageSystem(config)` | Adds `damage` component, emits `combat:damage-taken` / `combat:entity-defeated` |
| AI | `createPatrolBehavior`, `createChaseBehavior`, `createFleeBehavior`, `createWanderBehavior` | Attach to `stateMachine.states` |
| Wave spawner | `createWaveSpawner(config)` | Returns a System, add with `engine.addSystem` |
| Crafting | `new RecipeBook()` + `craft()` | `canCraft`, `craft(recipe, inventory, lookup)` |
| Loot | `rollLoot(table, { seed, flags })` | `createSeededRandom`, `LootTable` |
| Quests | `new QuestTracker()` | `.register()`, `.start()`, `.progress()`, `.on("complete", fn)` |
| Achievements | `new AchievementTracker()` | `.registerAll()`, `.progress()`, `.on("unlocked", fn)` |
| Dialog tree | `runDialogTree(engine, tree)` | Branching dialog with choices |

## Save/Load

```ts
import { save, load, removeStorage, setStoragePrefix, serializeGameState, rehydrateGameState } from "@engine";
setStoragePrefix("my-game");
save("checkpoint", { floor: 3, hp: 50 });
const data = load<{ floor: number; hp: number }>("checkpoint");

// Full state bundle:
save("full", serializeGameState({ stats, equipment, inventory, wallet, quests, achievements }));
const snap = load("full");
rehydrateGameState(snap, { itemLookup, equipmentBlocks?, quests?, achievements? });

// Multi-slot:
const saves = new SaveSlotManager<GameState>({ maxSlots: 3, version: "1.0.0" });
saves.save("slot-1", state, { name: "Forest", sceneName: "forest", playtime: 1234 });
```

## Procedural Generation

```ts
import { generateDungeon, generateBSP, generateCave, generateWalkerCave, GridMap, findPath, gridDistance, gridToWorld, worldToGrid } from "@engine";

const { grid, rooms } = generateDungeon({ cols: 60, rows: 30, seed: 42 });
const path = findPath(grid, from, to, { isWalkable, maxIterations });
```

## Networking

```ts
// Turn-based lockstep:
const sync = new TurnSync({ adapter, playerIds, turnTimeout: 15000 });
sync.onTurnComplete(({ turn, moves }) => { applyMoves(moves); sync.submitStateHash(hash); });
sync.onDesync(({ turn, hashes }) => console.error("DESYNC", turn, hashes));

// Real-time relay:
const adapter = new SocketAdapter({ url: "wss://server", roomId: "abc", resumeOnReconnect: true });
await adapter.connect();
adapter.onMessage((from, msg) => handle(msg));
adapter.broadcast(data);

// Multiplayer defineGame (one-liner):
const handle = await createMultiplayerGame(myGame, {
  transport: { kind: "local", players: 2 }, // or { kind: "socket", url }
  engineFactory: () => new Engine(canvas),
});

// Server (Bun runtime):
const server = new GameServer({ port: 3000 });
```

## Events (selected)

- Combat: `combat:damage-taken`, `combat:entity-defeated` (from `createDamageSystem`)
- Inventory: `inventory:add`, `inventory:remove`, `inventory:full`
- Equipment: `equipment:equip`, `equipment:unequip`
- Currency: `currency:gained`, `currency:spent`, `currency:insufficient`
- Crafting: `craft:complete`, `craft:failed`
- Viewport: `viewport:resized`, `viewport:orientation`
- Turns: `turn:start`, `turn:end`, `phase:enter`, `phase:exit`

## Templates (in `games/`)

| Template | Style | Key features | Use as reference for |
|---|---|---|---|
| `blank` | ECS + React HUD | Title + play scene, WASD movement | Starting point |
| `asteroid-field` | ECS + React HUD | Physics, collision, particles, waves, shooting | Real-time action |
| `platformer` | ECS + React HUD | Gravity, jumping, platforms, collection | Platformer physics |
| `roguelike` | ECS + canvas-only UI | Turn phases, FOV, BSP dungeon, pathfinding, save/load, dialog | Turn-based RPG |
| `tic-tac-toe` | `defineGame` | Mouse input, board rendering, game-over detection | Board/puzzle games |
| `connect-four` | `defineGame` | Gravity, 4-in-a-row detection, 2D grid | Grid strategy games |

## Verification Loop

Before declaring work done:

```bash
bun run check:all   # typecheck + boundary enforcement + lint
bun test            # full test suite (or bun test <path>)
```

Or individually:
```bash
bun run check       # typecheck only
bun run check:bounds # import boundary enforcement only
bun run lint        # biome only
```

All must pass. UI/render correctness is **not** verifiable headlessly — state that limitation explicitly.
