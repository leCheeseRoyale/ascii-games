# Cookbook

Copy-pasteable recipes. Imports use `@engine` / `@game` / `@ui` / `@shared` aliases.

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
