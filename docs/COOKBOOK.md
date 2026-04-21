# Cookbook

Copy-pasteable recipes. Imports use `@engine` / `@game` / `@ui` / `@shared` aliases.

## Declarative games with `defineGame`

`defineGame` wraps scenes, turn phases, and state into a single object —
the boardgame.io-style ergonomic layer for turn-based games. `engine.runGame(def)`
registers an auto-generated scene and returns its name. Moves mutate
`ctx.state` directly; return `'invalid'` to reject. Auto-rotates `turns.order`
after each successful move. Phase transitions via `phases[name].endIf`;
game-over via top-level `endIf`.

```ts
import { defineGame, type Engine } from "@engine";
const Empty = () => null;
type S = { board: (string | null)[] };
const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const winner = (b: S["board"]) => {
  for (const [a,c,d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return null;
};

export const ticTacToe = defineGame<S>({
  name: "tic-tac-toe",
  players: { min: 2, max: 2, default: 2 },
  setup: () => ({ board: Array(9).fill(null) }),
  turns: { order: ["X", "O"] },
  moves: {
    place(ctx, idx: number) {
      if (ctx.state.board[idx] !== null) return "invalid";
      ctx.state.board[idx] = ctx.currentPlayer as string;
    },
    reset: (ctx) => { ctx.state.board = Array(9).fill(null); },
  },
  endIf: (ctx) => {
    const w = winner(ctx.state.board);
    if (w) return { winner: w };
    if (ctx.state.board.every((c) => c !== null)) return { draw: true };
  },
  render(ctx) {
    // Called each frame. Use engine.ui.* to draw; engine.mouse/keyboard for input.
    const e = ctx.engine;
    if (e.mouse.justDown && !ctx.result) {
      const cell = 320 / 3, ox = e.width/2 - 160, oy = e.height/2 - 160;
      const col = Math.floor((e.mouse.x - ox) / cell);
      const row = Math.floor((e.mouse.y - oy) / cell);
      if (col >= 0 && col < 3 && row >= 0 && row < 3) ctx.moves.place(row * 3 + col);
    }
    if (e.keyboard.pressed("KeyR")) ctx.moves.reset();
    // ...draw board with e.ui.panel / e.ui.text (see games/tic-tac-toe)
  },
});

// Canvas-only UI → suppress React default screens.
export function setupGame(engine: Engine) {
  return {
    startScene: engine.runGame(ticTacToe),
    screens: { menu: Empty, playing: Empty, gameOver: Empty },
    hud: [],
  };
}
```

`ctx` also exposes: `turn`, `phase`, `playerIndex`, `numPlayers`, `random()`
(seeded — pass `def.seed` for reproducibility), `log(msg)`, `endTurn()`,
`endPhase()`, `goToPhase(name)`, plus the full `ctx.engine`. Add `systems:
[...]` to register extra systems; add `phases: { order: [...], myPhase:
{ onEnter, endIf, moves: [...] } }` for multi-phase turns.

## Multiplayer games in one line

`createMultiplayerGame` wraps a `defineGame` definition with lockstep
netcode. It composes `NetworkAdapter` + `TurnSync` + `GameRuntime`, hooks
`runtime.dispatch` so moves travel through the wire instead of being
applied locally, and hashes post-turn state so desync fires automatically
if peers diverge. `transport: { kind: 'local', players: N }` runs N peers
in-process over `MockAdapter` — ideal for a same-keyboard hotseat mode or
smoke tests. `transport: { kind: 'socket', url }` connects to a
`GameServer` via `SocketAdapter`.

Critical rules for the wrapped game:

- Every `ctx.random()` must flow through the seeded RNG (`def.seed` set).
  Ad-hoc `Math.random()` will desync immediately.
- `turns.order` should use the peer ids (`player-1`, `player-2`, ...) or
  numbered ids that match peer positions, so the wrapper can resolve the
  active player without an extra mapping config.
- Moves mutate `ctx.state` only — no hidden side-effects. The wrapper
  hashes `state` after each turn and compares across peers.

```ts
import {
  createMultiplayerGame,
  defineGame,
  Engine,
} from "@engine";

type Mark = "X" | "O" | null;
type State = { board: Mark[] };
const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const winner = (b: State["board"]) => {
  for (const [a,c,d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return null;
};

const ticTacToe = defineGame<State>({
  name: "tic-tac-toe",
  players: { min: 2, max: 2, default: 2 },
  seed: 1, // required for deterministic RNG across peers
  setup: () => ({ board: Array(9).fill(null) }),
  // turns.order MUST use peer ids so the wrapper can gate moves per peer.
  turns: { order: ["player-1", "player-2"] },
  moves: {
    place(ctx, idx: number) {
      if (ctx.state.board[idx] !== null) return "invalid";
      // Map peer id → mark.
      ctx.state.board[idx] = ctx.currentPlayer === "player-1" ? "X" : "O";
    },
  },
  endIf: (ctx) => {
    const w = winner(ctx.state.board);
    if (w) return { winner: w };
    if (ctx.state.board.every((c) => c !== null)) return { draw: true };
  },
});

// Spin up 2 peers in one process for dev / hotseat testing.
const handle = await createMultiplayerGame(ticTacToe, {
  transport: { kind: "local", players: 2 },
  engineFactory: () => new Engine(document.querySelector("canvas")!),
  onDesync: (e) => console.warn("desync at turn", e.turn, e.hashes),
});

// Dispatch a move on peer A — every peer's runtime applies it after the
// lockstep turn completes. `handle.allPeers` lets UI show both views.
handle.runtime.dispatch("place", [4]); // player-1 plays center
```

For socket transport, swap the transport and point at a `GameServer`:

```ts
const handle = await createMultiplayerGame(myGame, {
  transport: { kind: "socket", url: "wss://my-server/play", resumeOnReconnect: true },
  roomId: "abc-123",
  engineFactory: () => new Engine(canvas),
});
```

## Scenes & Systems

### Define a scene
`setup` spawns entities and adds systems. Built-in systems are auto-registered.
```ts
import { defineScene, type Engine } from "@engine";
export const playScene = defineScene({
  name: "play",
  setup(engine: Engine) {
    engine.spawn({ position: { x: 100, y: 100 }, ascii: { char: "@", font: "16px monospace", color: "#fff" } });
  },
  update(_engine, _dt) {},  // optional
  cleanup(_engine) {},       // optional
});
```

### Register a system with priority
Lower priority runs first. Default `0` (before all built-ins). Use `SystemPriority.*` to interleave.
```ts
import { defineSystem, SystemPriority } from "@engine";
export const collisionSystem = defineSystem({
  name: "collision",
  priority: SystemPriority.physics + 1, // after physics, before tween
  update(engine) { for (const _e of engine.world.with("position", "collider")) { /* ... */ } },
});
// engine.addSystem(collisionSystem);
```

### Switch scenes with a transition
Types: `fade`, `fadeWhite`, `wipe`, `dissolve`, `scanline`.
```ts
await engine.loadScene("play", { transition: "dissolve", duration: 0.5 });
```

### Pass data between scenes
```ts
engine.loadScene("play", { data: { floor: 2, playerHp: 50 } });
// Inside playScene.setup:
const { floor = 1, playerHp = 100 } = engine.sceneData;
```

## Entities

### Spawn a player with input-driven movement
`_physics` integrates velocity — do not write `position += velocity * dt` yourself.
```ts
import { defineSystem, FONTS } from "@engine";
engine.spawn({
  position: { x: 200, y: 200 }, velocity: { vx: 0, vy: 0 },
  ascii: { char: "@", font: FONTS.large, color: "#00ff88" },
  tags: { values: new Set(["player"]) },
});
export const playerInput = defineSystem({
  name: "playerInput",
  update(engine) {
    for (const p of engine.world.with("player", "velocity")) {
      const kb = engine.keyboard;
      p.velocity.vx = ((kb.held("KeyD") ? 1 : 0) - (kb.held("KeyA") ? 1 : 0)) * 180;
      p.velocity.vy = ((kb.held("KeyS") ? 1 : 0) - (kb.held("KeyW") ? 1 : 0)) * 180;
    }
  },
});
```

### Entity factories return `Partial<Entity>`
```ts
import { FONTS, type Entity } from "@engine";
export function createBullet(x: number, y: number, vx: number, vy: number): Partial<Entity> {
  return {
    position: { x, y }, velocity: { vx, vy },
    ascii: { char: "|", font: FONTS.normal, color: "#ffff00" },
    collider: { type: "circle", width: 4, height: 4 },
    lifetime: { remaining: 1.5 },
    tags: { values: new Set(["bullet"]) },
  };
}
```

### Destroy entities safely during iteration
Collect first — never mutate the world mid-query.
```ts
const toKill: any[] = [];
for (const e of engine.world.with("health")) if (e.health.current <= 0) toKill.push(e);
for (const e of toKill) engine.destroy(e);
```

### Entity pool for bullets / particles
Trades memory for alloc churn. `acquire` reuses a released entity or grows up to `max`.
```ts
import { createEntityPool, FONTS } from "@engine";
const bullets = createEntityPool(engine, () => ({
  position: { x: 0, y: 0 }, velocity: { vx: 0, vy: 0 },
  ascii: { char: "|", font: FONTS.normal, color: "#ff0", opacity: 1 },
  collider: { type: "circle", width: 4, height: 4 },
  tags: { values: new Set(["bullet"]) },
}), { size: 64, max: 256 });
const b = bullets.acquire({ position: { x, y }, velocity: { vx: 0, vy: -400 } });
b.ascii!.opacity = 1;
bullets.release(b); // on collision / off-screen
```

## Rendering

### Styled text tags
`engine.ui.text` and `TextBlock` components parse inline tags.
```ts
engine.ui.text(20, 20, "[#ff4444]HP[/] 42/100  [b]x3[/b]  [dim]lvl 7[/dim]  [bg:#222]status[/bg]");
engine.spawn({
  position: { x: 200, y: 200 },
  textBlock: { text: "[#0f8]OK[/] — [b]Space[/b]", font: "16px monospace", maxWidth: 300, lineHeight: 20, color: "#e0e0e0" },
});
```

### Mixed-font HUD row via `CanvasUI.inlineRun`
Each chunk keeps its own font / color / bg / padding, baseline-aligned. No wrapping.
```ts
import { FONTS } from "@engine";
engine.ui.inlineRun(16, 20, [
  { text: " HP ",     font: FONTS.bold,   color: "#fff",    bg: "#aa2233", padX: 4 },
  { text: " 42/100 ", font: FONTS.normal, color: "#e0e0e0",                padX: 4 },
  { text: " LVL 7 ",  font: FONTS.small,  color: "#aaa",    bg: "#222",    padX: 4 },
], { gap: 6 });
```

### Multi-line text block entity
Spawn a `textBlock` entity for auto-wrapping paragraphs in world space. Supports styled tags, alignment, justified layout, and obstacle flow.
```ts
engine.spawn({
  position: { x: 100, y: 50 },
  textBlock: {
    text: "The [b]Ancient Door[/b] is locked. [dim]A faint glow seeps through the cracks.[/dim]",
    font: '16px "Fira Code", monospace',
    maxWidth: 400,
    lineHeight: 22,
    color: "#d0d0d0",
    align: "left", // "left" | "center" | "right" | "justify"
  },
});
```

### Text flowing around obstacles
Any entity with `position` + `obstacle` automatically pushes `textBlock` layout aside.
```ts
engine.spawn({ position: { x: 300, y: 120 }, obstacle: { radius: 60 } });
engine.spawn({
  position: { x: 50, y: 80 },
  textBlock: { text: longDescription, font: FONTS.normal, maxWidth: 500, lineHeight: 20, color: "#ccc" },
});
```

### Text effects on entities
Attach `textEffect` to any `ascii` entity for per-character animation.
```ts
import { wave, shake, rainbow, compose } from "@engine";
engine.spawn({
  position: { x: 400, y: 200 },
  ascii: { char: "GAME OVER", font: '48px "Fira Code"', color: "#ff4444" },
  textEffect: { fn: compose(shake(3), rainbow(2)) },
});
```

### Text measurement helpers
Use Pretext-powered measurement without spawning entities.
```ts
import { measureHeight, shrinkwrap, getLineCount, measureLineWidth } from "@engine";
const h = measureHeight(text, font, 400, 20);
const tightW = shrinkwrap(text, font, 400);
const lines = getLineCount(text, font, 400);
const singleLineW = measureLineWidth("Score: 1234", font);
```

### Camera follow + deadzone + bounds
```ts
const player = engine.findByTag("player")!;
engine.camera.follow(player, {
  smoothing: 0.15, deadzone: { width: 120, height: 80 },
  lookahead: 0.25, offset: { x: 0, y: -20 },
});
engine.camera.setBounds({ minX: 0, minY: 0, maxX: 2000, maxY: 1200 });
```

### Floating text / toast / particles / shake
```ts
engine.floatingText(x, y - 12, "-7", "#ff4444");
engine.toast.show("Wave 3", { y: 80, color: "#ffcc00" });
engine.particles.burst({ x, y, count: 16, chars: ["*", "."], color: "#fa0", speed: 140, lifetime: 0.6 });
engine.particles.explosion(x, y, "#f44");
engine.particles.sparkle(x, y, "#ff0");
engine.camera.shake(6);
```

### Scene transition (fade, wipe, dissolve)
```ts
engine.loadScene("gameOver", { transition: "fade", duration: 0.4, data: { score } });
// fade | fadeWhite | wipe | dissolve | scanline
```

## Game Feel & Juice

### Screen flash
Flash the entire screen with a color overlay that fades out. Useful for damage feedback, powerup pickups, or lightning effects.
```ts
// Flash red on player damage
engine.flash("#ff4444", 0.15);

// Flash white on powerup pickup
engine.flash("#ffffff", 0.1);
```

### Entity blinking (i-frames)
Oscillate an entity's opacity for invincibility frames, warnings, or low-health indicators.
```ts
// Blink player for 1 second after taking damage
engine.blink(player, 1.0, 0.08);
```

### Knockback
Apply an impulse that pushes an entity away from a point. The entity needs `velocity` for this to work.
```ts
// Push enemy away from explosion center
engine.knockback(enemy, explosionX, explosionY, 500);

// Push enemy away from bullet on hit
engine.knockback(enemy, bullet.position!.x, bullet.position!.y, 300);
```

### Slow motion
`engine.timeScale` multiplies `dt` for all systems. Set below 1 for slowmo, above 1 for fast-forward. Combine with `engine.after` to auto-restore.
```ts
// Dramatic slowmo for 0.5 seconds
engine.timeScale = 0.2;
engine.after(0.5, () => { engine.timeScale = 1; });
```

### Trail effect
The `trail` component auto-spawns fading afterimage entities behind any moving entity. Add it at spawn time.
```ts
// Add trail to any moving entity
engine.spawn({
  position: { x, y },
  velocity: { vx: 0, vy: -400 },
  ascii: { char: "•", font, color: "#ffcc00" },
  trail: { interval: 0.03, lifetime: 0.2, color: "#ff8800", opacity: 0.5 },
  lifetime: { remaining: 3 },
});
```

### Declarative collision handling
`engine.onCollide` replaces the manual nested-loop pattern with a one-liner. It fires on the first overlap frame per pair and returns an unsubscribe function.
```ts
// Instead of writing a collision system with nested loops:
engine.onCollide("bullet", "enemy", (bullet, enemy) => {
  engine.destroy(bullet);
  engine.destroy(enemy);
  engine.particles.explosion(enemy.position!.x, enemy.position!.y);
  sfx.explode();
  score += 100;
});

// Filter by collision groups (bitmask):
engine.spawn({
  ...createBullet(x, y),
  collider: { type: "circle", width: 6, height: 6, group: 2, mask: 0b100 },
  // group 2 = player bullets, mask 0b100 = only hits group 3 (enemies)
});
```

### Quick HUD
`drawQuickHud` renders a score/health/lives display in one call. Useful for prototyping or jam games where you don't want to wire up React.
```ts
// In your scene's update or a HUD system:
import { drawQuickHud } from '@engine';

drawQuickHud(engine.ui, engine.width, engine.height, {
  score: useStore.getState().score,
  health: { current: 80, max: 100 },
  lives: 3,
  position: "topLeft",
});
```

## Input

### Keyboard held / pressed / released
```ts
const kb = engine.keyboard;
if (kb.held("KeyW"))    moveUp();        // true while down
if (kb.pressed("Space")) jump();         // only the frame it went down
if (kb.released("KeyE")) releaseBomb();
```

### Mouse + touch unified via `Touch`
Recognizes tap / swipe / pinch. Not auto-wired — instantiate once, call `update()` per frame.
```ts
import { Touch } from "@engine";
const touch = new Touch(engine.renderer.canvas, { unifyMouse: true });
touch.onTap  ((g) => fireAt(g.x, g.y));
touch.onSwipe((g) => { if (g.direction === "up") jump(); });
// Per frame: touch.update() to drain the gesture queue
```

### VirtualJoystick + VirtualDpad on mobile
Both read a `Touch` and draw themselves. `visibleOnlyOnTouch` hides on desktop.
```ts
import { Touch, VirtualJoystick, VirtualDpad, defineSystem } from "@engine";
const touch = new Touch(engine.renderer.canvas);
const stick = new VirtualJoystick({ anchor: "bottomLeft",  touch, visibleOnlyOnTouch: true });
const dpad  = new VirtualDpad    ({ anchor: "bottomRight", touch, visibleOnlyOnTouch: true });
engine.addSystem(defineSystem({
  name: "virtual-controls",
  update(e) {
    stick.update(); dpad.update(); touch.update();
    stick.render(e.renderer.ctx, e.width, e.height);
    dpad .render(e.renderer.ctx, e.width, e.height);
  },
}));
// Read: stick.x, stick.y (-1..1), dpad.up/down/left/right
```

### Remappable bindings via `InputBindings`
```ts
import { InputBindings, createDefaultBindings } from "@engine";
const bindings = new InputBindings(engine.keyboard, engine.gamepad, engine.mouse);
bindings.setAll(createDefaultBindings());
if (!bindings.load()) bindings.save();
if (bindings.pressed("action-a")) fire();
const captured = await bindings.capture("move-up");
if (captured) bindings.save();
for (const c of bindings.findConflicts()) console.warn("conflict:", c.input, c.actions);
```

### Gamepad sticks, triggers, buttons
```ts
import { GAMEPAD_BUTTONS } from "@engine";
const gp = engine.gamepad;
if (gp.connected) {
  const left = gp.stick("left", 0.15); // {x, y} -1..1
  const rt   = gp.trigger("right");    // 0..1
  if (gp.pressed(GAMEPAD_BUTTONS.A)) jump();
}
```

## Gameplay Systems

### Inventory + pickup on overlap
Pass `engine, entity` to emit `inventory:add` / `:remove` / `:full`.
```ts
import { createInventory, addItem, overlaps } from "@engine";
const player = engine.spawn({ /* ... */ inventory: createInventory({ maxSlots: 20 }) });
for (const item of engine.findAllByTag("pickup")) {
  if (overlaps(player as any, item as any)) {
    addItem(player.inventory!, item.itemData, 1, engine, player);
    engine.destroy(item);
  }
}
```

### Equipment with stat modifiers
Modifiers attach with source `equipment:<slotId>`, auto-removed on unequip.
```ts
import { createStats, createEquipment, equipItem, unequipItem, getStat } from "@engine";
const stats = createStats({ attack: 5 });
const gear  = createEquipment(["weapon", "offhand"], { weapon: ["offhand"] });
equipItem(gear, {
  id: "sword", name: "Short Sword", equipSlot: "weapon",
  modifiers: [{ stat: "attack", type: "flat", value: 8 }],
}, stats);
getStat(stats, "attack"); // 13
unequipItem(gear, "weapon", stats);
```

### Currency wallet + spend
```ts
import { createWallet, addCurrency, spendCurrency, canAfford } from "@engine";
const wallet = createWallet({ gold: 50 }, { caps: { gold: 9999 }, trackHistory: true });
addCurrency(wallet, "gold", 25, "quest-reward", engine, player);
if (canAfford(wallet, { gold: 40 })) spendCurrency(wallet, "gold", 40, "buy-potion", engine, player);
```

### Crafting with `RecipeBook`
`consumed: false` = tool-style (required, not removed). Failed `successChance` still consumes.
```ts
import { RecipeBook, craft } from "@engine";
const book = new RecipeBook();
book.register({
  id: "sword", name: "Iron Sword",
  ingredients: [{ itemId: "iron", count: 3 }, { itemId: "anvil", count: 1, consumed: false }],
  outputs: [{ itemId: "iron_sword" }],
  successChance: 0.9, xp: 20,
});
const r = craft(book.get("sword")!, player.inventory!, (id) => itemDb[id], { engine, entity: player });
if (r.success) grantXp(r.xpGained ?? 0);
```

### Loot tables with seeded RNG
Deterministic with `seed`. Nested `table` entries recurse.
```ts
import { rollLoot, type LootTable } from "@engine";
const chest: LootTable<string> = {
  rolls: [1, 3],
  entries: [
    { item: "gold",   weight: 50, count: [1, 10] },
    { item: "potion", weight: 20 },
    { item: "sword",  weight: 1, condition: (ctx) => ctx.flags.level >= 5 },
  ],
  guaranteed: [{ item: "xp", count: [5, 15] }],
};
const drops = rollLoot(chest, { seed: 42, flags: { level: 7 } });
```

### Quests + achievements listening to events
Both trackers have their own event bus — wire external events manually.
```ts
import { QuestTracker, AchievementTracker, events } from "@engine";
const quests = new QuestTracker();
quests.register({ id: "rats", name: "Rat Problem", description: "...",
  objectives: [{ id: "kill", description: "Slay rats", target: 5 }] });
quests.start("rats");
quests.on("complete", (id) => engine.toast.show(`Quest: ${id}`));

const achievements = new AchievementTracker();
achievements.registerAll([{ id: "first-kill", name: "First Blood", description: "Kill one enemy",
  condition: { type: "progress", target: 1 } }]);

events.on("combat:entity-defeated", () => {
  quests.progress("rats", "kill", 1);
  achievements.progress("first-kill", 1);
});
```

### Damage system with `onDamage` / `onDeath`
Attach transient `damage` components. System applies, sets invincibility, emits `combat:*`.
```ts
import { createDamageSystem, createDamageFlash } from "@engine";
engine.addSystem(createDamageSystem({
  invincibilityDuration: 0.5,
  onDamage: (e, _d, eng) => { createDamageFlash(e, eng); return true; },
  onDeath:  (e, _d, eng) => { eng.particles.explosion(e.position!.x, e.position!.y); eng.destroy(e as any); },
}));
(enemy as any).damage = { amount: 10, source: player, type: "physical" };
```

### AI: patrol / chase / flee / wander via state machine
Behaviors set `velocity`; `_physics` integrates. `transition(entity, name)` changes state.
```ts
import { createPatrolBehavior, createChaseBehavior, transition } from "@engine";
engine.spawn({
  position: { x: 100, y: 100 }, velocity: { vx: 0, vy: 0 },
  tags: { values: new Set(["enemy"]) },
  stateMachine: {
    current: "patrol",
    states: {
      patrol: createPatrolBehavior([{ x: 100, y: 100 }, { x: 300, y: 100 }], { speed: 60 }),
      chase:  createChaseBehavior({ targetTag: "player", speed: 120, range: 200, onLostTarget: "patrol" }),
    },
  },
});
// transition(enemy, "chase");
```

### Wave spawner for arena games
Returns a `System`. Add with `engine.addSystem`.
```ts
import { createWaveSpawner } from "@engine";
import { createRat } from "@game/entities/enemies";
engine.addSystem(createWaveSpawner({
  waves: [
    { enemies: [{ create: (x, y) => createRat(x, y), count: 5,  spawnDelay: 0.4 }] },
    { enemies: [{ create: (x, y) => createRat(x, y), count: 10, spawnDelay: 0.3 }], delay: 2 },
  ],
  useEdgeSpawns: true,
  onWaveComplete:     (i) => engine.toast.show(`Wave ${i + 1} cleared`),
  onAllWavesComplete: ()  => engine.loadScene("victory"),
}));
```

### Spatial hash for N-body collision
Use at >~100 colliders. `pairsFromHash` yields unique pairs — no O(n²).
```ts
import { SpatialHash, pairsFromHash, overlaps } from "@engine";
const hash = new SpatialHash<any>(64);
hash.rebuild([...engine.world.with("position", "collider")]);
for (const [a, b] of pairsFromHash(hash)) if (overlaps(a, b)) handleHit(a, b);
```

## Turn-Based

### Configure phases + phase-gated systems
Phased systems only run during their phase; phaseless systems always run.
```ts
import { defineSystem } from "@engine";
engine.turns.configure({ phases: ["player", "enemy", "resolve"] });
engine.turns.start();
export const enemyAI = defineSystem({ name: "enemyAI", phase: "enemy", update(_e) {} });
```

### Drive turn advancement
```ts
engine.turns.endPhase();              // next phase (wraps to next turn)
engine.turns.endTurn();               // skip to phase 0 of next turn
engine.turns.goToPhase("resolve");    // jump within current turn
```

### Listen to turn / phase events
```ts
import { events } from "@engine";
events.on("turn:start",  (n)    => console.log("turn", n));
events.on("phase:enter", (name) => console.log("phase", name));
```

## Persistence

### `save` / `load`
Call `setStoragePrefix` once at init so keys are namespaced per game.
```ts
import { save, load, remove as removeStorage, setStoragePrefix } from "@engine";
setStoragePrefix("roguelike");
save("last-run", { floor: 3, hp: 40 });
const data = load<{ floor: number; hp: number }>("last-run");
removeStorage("last-run");
```

### Multi-slot saves with `SaveSlotManager`
Reserves an `"autosave"` slot that doesn't count toward `maxSlots`.
```ts
import { SaveSlotManager } from "@engine";
const saves = new SaveSlotManager<GameState>({ maxSlots: 3, version: "1.0.0" });
saves.save("slot-1", state, { name: "Forest Boss", sceneName: "forest", playtime: 1234 });
saves.setActive("slot-1");
for (const meta of saves.list()) console.log(meta.name, meta.timestamp);
const slot = saves.loadActive();
```

### Serialize full game state
Bundles Stats / Equipment / Inventory / Currency / Quests / Achievements.
```ts
import { serializeGameState, rehydrateGameState, save, load } from "@engine";
save("checkpoint", serializeGameState({ stats, equipment, inventory, wallet, quests, achievements }));
const snap = load<any>("checkpoint");
if (snap) rehydrateGameState(snap, {
  itemLookup: (id) => itemDb[id],
  equipmentBlocks: { weapon: ["offhand"] },
  quests, achievements,
});
```

### Leaderboard `submitScore` / `getHighScores`
```ts
import { submitScore, getHighScores, isHighScore } from "@engine";
if (isHighScore(score)) submitScore(score, playerName);
for (const e of getHighScores(10)) console.log(e.name, e.score, e.date);
```

## Procgen

### Dungeon, BSP, cave, walker cave
All return `{ grid: GridMap<string>, rooms: RoomInfo[] }`. Deterministic with `seed`.
```ts
import { generateDungeon, generateBSP, generateCave, generateWalkerCave } from "@engine";
const d = generateDungeon   ({ cols: 60, rows: 30, roomCount: 10,    seed: 42 });
const b = generateBSP       ({ cols: 60, rows: 30, minLeafSize: 8,   seed: 42 });
const c = generateCave      ({ cols: 60, rows: 30, fillChance: 0.45, iterations: 4, seed: 42 });
const w = generateWalkerCave({ cols: 60, rows: 30, coverage: 0.4,    seed: 42 });
```

### Seeded noise grid
```ts
import { generateNoiseGrid } from "@engine";
const terrain = generateNoiseGrid(80, 40, {
  seed: 7, scale: 0.08, octaves: 3,
  classify: (v) => v > 0.6 ? "#" : v > 0.4 ? "~" : ".",
});
```

### Convert `GridMap` to tilemap component
```ts
import { gridMapToTilemapData, createTilemap, generateDungeon } from "@engine";
const { grid } = generateDungeon({ cols: 60, rows: 30, seed: 1 });
const { tilemap } = createTilemap(gridMapToTilemapData(grid), 16, {
  "#": { color: "#888", solid: true },
  ".": { color: "#333" },
});
engine.spawn({ position: { x: 0, y: 0 }, tilemap });
```

## UI

### Dialog with typewriter
Returns a Promise resolving on dismiss. `onChar` fires per char for SFX blips.
```ts
import { sfx } from "@engine";
await engine.dialog.show("You find a rusty key.", {
  speaker: "Narrator", typeSpeed: 40, border: "double", onChar: () => sfx.menu(),
});
```

### Choice dialog
```ts
const pick = await engine.dialog.choice("Open the chest?", ["Open", "Leave it"], { border: "rounded" });
if (pick === 0) openChest();
```

### `UIMenu` for keyboard nav
Update + draw each frame. Check `menu.confirmed` / `.cancelled` / `.selectedIndex`.
```ts
import { UIMenu, sfx } from "@engine";
let menu: UIMenu;
// setup:
menu = new UIMenu(["New Game", "Continue", "Quit"], {
  border: "double", title: "Main Menu", anchor: "center", onMove: () => sfx.menu(),
});
// update:
menu.update(engine);
menu.draw(engine.ui, engine.centerX, engine.centerY);
if (menu.confirmed) handle(menu.selectedIndex);
```

### UIScrollPanel, UIGrid, UITooltip, UITabs
```ts
import { UIScrollPanel, UIGrid, UITooltip, UITabs } from "@engine";
const log  = new UIScrollPanel(messages, 10, 320, { border: "single", title: "Log" });
const inv  = new UIGrid(cells, 5, 4, 32, 32, { title: "Inventory" });
const tip  = new UITooltip({ maxWidth: 240 });
const tabs = new UITabs([
  { label: "Stats", render: (ctx, x, y) => drawStats(ctx, x, y) },
  { label: "Gear",  render: (ctx, x, y) => drawGear (ctx, x, y) },
], 400, 300, { title: "Character" });
// each frame:
log.update(engine);  log.draw(engine.renderer.ctx, 16, 16);
inv.update(engine);  inv.draw(engine.renderer.ctx, 400, 16);
tabs.update(engine); tabs.draw(engine.renderer.ctx, 800, 16);
tip.updateHover(engine, hx, hy, hw, hh, "Flavor");
tip.draw(engine.renderer.ctx, engine.width, engine.height);
```

### Custom UI: panel + text + bar
Immediate-mode — call each frame.
```ts
engine.ui.panel(16, 16, 220, 80, { bg: "rgba(0,0,0,0.7)", border: "rounded", borderColor: "#444" });
engine.ui.text (28, 28, "Health", { color: "#f44", font: '14px "Fira Code"' });
engine.ui.bar  (28, 48, 12, hp / maxHp, { fillColor: "#0f8", emptyColor: "#222", label: `${hp}/${maxHp}` });
```

## Mobile

### Touch gestures (tap, swipe, pinch)
```ts
import { Touch } from "@engine";
const touch = new Touch(engine.renderer.canvas, { unifyMouse: true, dragThreshold: 10, tapMaxDuration: 300 });
touch.onTap  ((g) => fireAt(g.x, g.y));
touch.onSwipe((g) => console.log("swipe", g.direction, g.distance));
touch.onPinch((g) => engine.camera.setZoom(engine.camera.zoom * g.scale));
// Per frame: touch.update() to drain gestures
```

### Virtual controls — visible only on touch
See `VirtualJoystick + VirtualDpad on mobile` under Input.

### Viewport orientation + safe-area insets
Emits `viewport:resized` / `viewport:orientation` on the shared bus.
```ts
import { events } from "@engine";
const { orientation, safeArea } = engine.viewport;
engine.ui.text(16 + safeArea.left, 16 + safeArea.top, "HUD");
events.on("viewport:orientation", (o) => console.log("now", o));
```

## Multiplayer

### MockAdapter (testing) → SocketAdapter (production)
Both implement `NetworkAdapter` — game code is identical.
```ts
import { MockAdapter, MockBus, SocketAdapter, type NetworkAdapter } from "@engine";
// Tests / AI peer:
const bus = MockBus.create();
const host:   NetworkAdapter = new MockAdapter({ bus, isHost: true });
const client: NetworkAdapter = new MockAdapter({ bus });
await host.connect(); await client.connect();
// Production (browser):
const net: NetworkAdapter = new SocketAdapter({ url: "wss://server", roomId: "abc" });
await net.connect();
net.onMessage((from, msg) => console.log(from, msg));
net.broadcast({ hello: "world" });
```

### Room creation + discovery via `listRooms`
Static method works pre-connect (HTTP). Instance method uses the live socket.
```ts
import { SocketAdapter } from "@engine";
const rooms = await SocketAdapter.listRooms("https://server.example.com", { gameType: "arena" });
const adapter = new SocketAdapter({
  url: "wss://server.example.com",
  roomId: rooms[0]?.id ?? "new-room",
  roomOpts: { name: "Maxwell's Room", gameType: "arena", isPublic: true, maxPeers: 4 },
});
await adapter.connect();
```

### TurnSync lockstep with desync detection
Game logic must be deterministic — identical inputs must yield identical state.
```ts
import { TurnSync } from "@engine";
const sync = new TurnSync<MyMove>({ adapter, playerIds: ["alice", "bob"], turnTimeout: 15000 });
sync.onTurnComplete(({ turn, moves }) => {
  applyMoves(world, moves);
  sync.submitStateHash(hashWorld(world));
});
sync.onDesync(({ turn, hashes }) => console.error("DESYNC", turn, hashes));
sync.submitMove(myMove); // local player acts
```

### Session resume on reconnect
```ts
const adapter = new SocketAdapter({ url: "wss://server", roomId: "abc", resumeOnReconnect: true });
```

## Performance

### Debug overlay / profiler
Backtick (`) toggles both. Per-system last/avg/max ms, FPS, archetype counts. Zero overhead when hidden.
```ts
engine.debug.setEnabled(true);
// engine.systems.getTimings() → ReadonlyMap<name, { last, avg, max }>
```

### Pool bullets / particles, spatial hash
See `Entity pool for bullets / particles` under Entities and `Spatial hash for N-body collision` under Gameplay Systems.

## Text-Aware Physics & Auto-Colliders

The engine measures text via Pretext to derive pixel-accurate bounding boxes.
Three features build on this: auto-sized colliders, spring physics, and
text/sprite decomposition into per-character physics entities.

### Auto-sized colliders

Before auto-colliders, you had to guess pixel dimensions for every text entity:

```ts
// Before (manual, fragile — sizes are eyeballed):
engine.spawn({
  position: { x: 100, y: 50 },
  ascii: { char: "@", font: '16px "Fira Code", monospace', color: "#0f0" },
  collider: { type: "circle", width: 20, height: 20 },
});
```

Pass `collider: "auto"` and the engine measures the text for you:

```ts
// After (Pretext-measured, exact):
engine.spawn({
  position: { x: 100, y: 50 },
  ascii: { char: "@", font: '16px "Fira Code", monospace', color: "#0f0" },
  collider: "auto",
});
```

Works for `ascii`, `sprite`, and `textBlock` entities. Single characters get a
circle collider; multi-line sprites and text blocks get a rect collider. The
`_measure` built-in system (priority 5) runs every frame and updates both
`visualBounds` and the auto-collider whenever the text content, font, or scale
changes — so if you mutate `entity.ascii.char` at runtime, the collider resizes
automatically.

If the entity has no measurable text component, `"auto"` falls back to a 16x16
rect.

### Spring physics

The `spring` component pulls any entity toward a target position. It is not
text-specific -- attach it to anything with `position` and `velocity`.

Use `SpringPresets` for common feels:

```ts
import { SpringPresets } from "@engine";

engine.spawn({
  position: { x: 0, y: 0 },
  velocity: { vx: 0, vy: 0 },
  ascii: { char: "◆", font: '16px "Fira Code", monospace', color: "#ff0" },
  spring: { targetX: 200, targetY: 150, ...SpringPresets.bouncy },
});
```

**Spring preset reference:**

| Preset | Strength | Damping | Feel |
|---|---|---|---|
| `SpringPresets.stiff` | 0.12 | 0.90 | Fast snap-back |
| `SpringPresets.snappy` | 0.10 | 0.91 | Quick return |
| `SpringPresets.bouncy` | 0.08 | 0.88 | Playful overshoot |
| `SpringPresets.smooth` | 0.06 | 0.93 | Balanced |
| `SpringPresets.floaty` | 0.04 | 0.95 | Slow, dreamy |
| `SpringPresets.gentle` | 0.02 | 0.97 | Barely perceptible |

**Custom tuning** -- pass raw numbers when presets don't match:

```ts
spring: { targetX: 200, targetY: 150, strength: 0.1, damping: 0.92 },
```

The `_spring` built-in system (priority 15) runs each frame before `_physics`.
It adds a force toward `(targetX, targetY)` scaled by `strength`, then
multiplies velocity by `damping` to bleed energy. Higher strength = snappier
return. Damping in the 0.90--0.97 range feels natural; below 0.90 is overdamped,
above 0.97 is bouncy. Update `targetX`/`targetY` at runtime to move the anchor.

### Interactive text with `spawnText`

`engine.spawnText()` decomposes a string into individual character entities.
Each character gets its own `position`, `velocity`, `ascii`, `spring`, and
auto-collider. They participate in normal physics -- anything that collides with
them pushes them away, and the spring pulls them back.

```ts
import { SpringPresets, createCursorRepelSystem } from "@engine";

// Spawn text -- each character becomes its own physics entity
const chars = engine.spawnText({
  text: "GAME OVER",
  font: '24px "Fira Code", monospace',
  position: { x: 400, y: 300 },
  color: "#ff4444",
  spring: SpringPresets.smooth,
  tags: ["game-over-text"],
});

// One line: characters flee the cursor and spring back
engine.addSystem(createCursorRepelSystem())
```

Spaces are skipped (no entity spawned). Optional fields: `maxWidth` for
line-wrapping, `lineHeight` (defaults to font size * 1.3), `layer`, and
`collider: false` to skip auto-colliders.

Apply a blast force to scatter the characters, then watch them spring home:

```ts
for (const char of chars) {
  char.velocity!.vx = (Math.random() - 0.5) * 600;
  char.velocity!.vy = (Math.random() - 0.5) * 600;
}
// Characters scatter outward, then spring back to their home positions.
```

### Interactive sprite with `spawnSprite`

`engine.spawnSprite()` does the same for multi-line ASCII art. Characters are
centered on the sprite's position:

```ts
import { SpringPresets, createCursorRepelSystem } from "@engine";

const chars = engine.spawnSprite({
  lines: [
    "  /\\  ",
    " /  \\ ",
    "/____\\",
  ],
  font: '16px "Fira Code", monospace',
  position: { x: 200, y: 100 },
  color: "#88ff88",
  spring: SpringPresets.bouncy,
});

engine.addSystem(createCursorRepelSystem())
```

Same API as `spawnText` minus `maxWidth` and `lineHeight` (line spacing is
derived from font size * 1.2). Optional `layer`, `tags`, and `collider: false`.

### Cursor repulsion and ambient drift

`createCursorRepelSystem()` pushes spring entities away from the mouse cursor.
Characters flee the cursor, then the spring pulls them back. Optional parameters:

```ts
import { createCursorRepelSystem, createAmbientDriftSystem } from "@engine";

// Default settings (radius: 100, force: 300)
engine.addSystem(createCursorRepelSystem())

// Custom radius and force
engine.addSystem(createCursorRepelSystem({ radius: 80, force: 200 }))

// Only repel entities with a specific tag
engine.addSystem(createCursorRepelSystem({ tag: "title" }))

// Add gentle floating motion to spring entities
engine.addSystem(createAmbientDriftSystem())

// Drift only star-tagged entities
engine.addSystem(createAmbientDriftSystem({ tag: "star" }))
```

The default priority (0) runs before `_spring` (15), so
the repulsion force is applied first and the spring corrects on the same frame.

**Custom repulsion system** -- when you need full control over the repulsion
behavior, write the system by hand instead of using the factory:

```ts
import { defineSystem } from "@engine";

export const cursorRepel = defineSystem({
  name: "cursor-repel",
  update(engine) {
    const mx = engine.mouse.x;
    const my = engine.mouse.y;
    for (const e of engine.world.with("position", "velocity", "spring")) {
      const dx = e.position.x - mx;
      const dy = e.position.y - my;
      const dist = Math.hypot(dx, dy);
      if (dist < 80 && dist > 0) {
        const force = 300 * ((80 - dist) / 80);
        e.velocity.vx += (dx / dist) * force;
        e.velocity.vy += (dy / dist) * force;
      }
    }
  },
});
```

### Measuring text for custom layout

Use the measurement helpers directly when you need pixel dimensions without
spawning entities — for example, to center a HUD element or size a panel:

```ts
import { measureAsciiVisual, measureSpriteVisual, measureTextBlockVisual } from "@engine";

// Single-line or multi-character ascii
const { width, height } = measureAsciiVisual({
  char: "SCORE: 999",
  font: '16px "Fira Code", monospace',
  scale: 1,
});

// Multi-line sprite
const dragonArt = ["  /\\_/\\  ", " ( o.o ) ", "  > ^ <  "];
const { width: spriteW, height: spriteH } = measureSpriteVisual({
  lines: dragonArt,
  font: '16px "Fira Code", monospace',
});

// Wrapped text block
const { width: blockW, height: blockH } = measureTextBlockVisual({
  text: "A long paragraph that wraps...",
  font: '16px "Fira Code", monospace',
  maxWidth: 400,
  lineHeight: 22,
});
```

These are pure measurement functions — no canvas drawing, no entity creation.
They use the same Pretext measurement path as the renderer, so the numbers
match exactly what you see on screen.

## Art Assets & Sprite Caching

The `ArtAsset` type and bitmap caching system provide a structured way to
define, reuse, and efficiently render multi-line ASCII art. Static art is
rendered once to an offscreen canvas and drawn via `drawImage()` every frame,
while interactive art decomposes into per-character physics entities.

### Defining Art Assets

Store reusable ASCII art as exported `ArtAsset` objects. Each asset bundles
lines, per-character colors, a base color, and optional font/glow settings:

```ts
// game/art/dragon.ts
import type { ArtAsset } from '@engine'

export const DRAGON: ArtAsset = {
  lines: [
    "   /\\_/\\   ",
    "  ( o.o )  ",
    "   > ^ <   ",
  ],
  colorMap: {
    "o": "#ffcc00",  // eyes
    "^": "#ff4444",  // nose
    "/": "#888888",  // whiskers
    "\\": "#888888",
  },
  color: "#cccccc",
}
```

The `ArtAsset` interface:

```ts
interface ArtAsset {
  lines: string[];
  colorMap?: Record<string, string>;  // per-character color overrides
  font?: string;                      // default: '16px "Fira Code", monospace'
  color?: string;                     // base color (fallback when char not in colorMap)
  glow?: string;                      // CSS glow color
}
```

### Spawning Static Art (Bitmap-Cached)

`engine.spawnArt()` renders the art once to an offscreen canvas, then draws
it as a single `drawImage()` call every frame. Ideal for backgrounds,
decorations, and any art that does not need per-character physics:

```ts
import { DRAGON } from '../art/dragon'

engine.spawnArt(DRAGON, { position: { x: 400, y: 300 }, layer: 1 })
// Rendered once to offscreen canvas, drawn as image every frame
// Spaces are transparent — layers compose naturally
```

### Spawning Interactive Art (Physics)

`engine.spawnInteractiveArt()` decomposes the art into per-character physics
entities, each with spring-to-home behavior. Use for text or art that reacts
to the cursor, collisions, or explosions:

```ts
import { DRAGON } from '../art/dragon'

engine.spawnInteractiveArt(DRAGON, {
  position: { x: 400, y: 300 },
  spring: SpringPresets.bouncy,
  tags: ["dragon"],
})
engine.addSystem(createCursorRepelSystem({ radius: 100 }))
// Each character is a physics entity that reacts to cursor
```

### Using artFromString for Inline Art

`artFromString()` parses a template literal into an `ArtAsset`, automatically
stripping leading/trailing blank lines and common indentation. Convenient for
small inline art that does not warrant its own file:

```ts
import { artFromString } from '@engine'

const HOUSE = artFromString(`
  /\\
 /  \\
 |  |
 |__|
`, { "/": "#884422", "\\": "#884422", "|": "#aa8855", "_": "#666" })
```

The second argument is an optional `colorMap`. The return value is a full
`ArtAsset` that you can pass to `spawnArt()` or `spawnInteractiveArt()`.

### ColorMap for Multi-Colored Sprites

The `colorMap` field maps individual characters to CSS color strings. The
base `color` field acts as the fallback for any character not present in the
map. This lets you color specific parts of an art asset without splitting it
into separate sprites:

```ts
const POTION: ArtAsset = {
  lines: [
    " _ ",
    "[_]",
    "|~|",
    "|_|",
  ],
  color: "#aaaaaa",      // default for all characters
  colorMap: {
    "~": "#44ccff",      // liquid
    "_": "#666666",      // cork / base
    "[": "#aa8855",      // bracket left
    "]": "#aa8855",      // bracket right
  },
}
```

Characters not in the `colorMap` inherit the base `color`. If neither is set,
the renderer uses its default text color.

### Space Transparency

Spaces in art asset lines are **not rendered** — they are fully transparent.
This means layered sprites compose naturally: an upper-layer sprite's spaces
do not overwrite lower layers with invisible rectangles. You can freely
overlap art assets at different positions and layers without masking artifacts.

```ts
// These two sprites overlap — spaces in the tree do not hide the house
engine.spawnArt(HOUSE, { position: { x: 200, y: 300 }, layer: 0 })
engine.spawnArt(TREE, { position: { x: 220, y: 280 }, layer: 1 })
```

This also means you can pad art lines with spaces for alignment without any
visual cost.

### Static vs Interactive — When to Use Each

| Use case | API | Performance |
|---|---|---|
| Background scenery | `engine.spawnArt()` | One `drawImage` per frame |
| Decorative elements | `engine.spawnArt()` | One `drawImage` per frame |
| Interactive text | `engine.spawnInteractiveArt()` | N `fillText` calls (one per char) |
| Breakable / scatterable art | `engine.spawnInteractiveArt()` | N `fillText` calls (one per char) |
| Title screens (mouse-reactive) | `engine.spawnInteractiveArt()` | N `fillText` calls (one per char) |
| Scenery with many instances | `engine.spawnArt()` | One `drawImage` per instance per frame |

**Rule of thumb:** Use `spawnArt()` by default. Switch to
`spawnInteractiveArt()` only when you need per-character physics, collisions,
or individual character manipulation.

### Combining Art Assets with Existing Sprite APIs

`ArtAsset` objects are compatible with the existing `spawnSprite()` and
`createAsciiSprite()` APIs. Use whichever entry point fits your workflow:

```ts
// ArtAsset approach (structured, reusable, bitmap-cached)
engine.spawnArt(DRAGON, { position: { x: 400, y: 300 } })

// spawnSprite approach (per-char physics, same art data)
engine.spawnSprite({
  lines: DRAGON.lines,
  font: DRAGON.font ?? '16px "Fira Code", monospace',
  position: { x: 400, y: 300 },
  color: DRAGON.color ?? '#e0e0e0',
  spring: SpringPresets.bouncy,
})

// createAsciiSprite approach (returns a sprite component to spread into spawn)
engine.spawn({
  position: { x: 400, y: 300 },
  ...createAsciiSprite(DRAGON.lines.join('\n'), {
    colorMap: DRAGON.colorMap,
    color: DRAGON.color,
  }),
})
```
