# Gameplay Systems

Recipes for gameplay mechanics, turn-based logic, procedural generation, and enemy AI. Imports use `@engine` / `@game` / `@ui` / `@shared` aliases.

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

## Enemy AI Patterns

AI behaviors return `StateMachineState` objects. Attach them via the `stateMachine` component and the built-in `_stateMachine` system handles the rest. Behaviors set `velocity`; `_physics` integrates. Use `transition(entity, stateName)` to switch states at runtime.

### Patrol + chase with detection range
```ts
import {
  createPatrolBehavior,
  createChaseBehavior,
  createFleeBehavior,
  createWanderBehavior,
  transition,
  FONTS,
} from "@engine";

// Guard that patrols between waypoints and chases on sight
engine.spawn({
  position: { x: 100, y: 200 }, velocity: { vx: 0, vy: 0 },
  ascii: { char: "G", font: FONTS.large, color: "#ff8800" },
  tags: { values: new Set(["enemy"]) },
  stateMachine: {
    current: "patrol",
    states: {
      patrol: createPatrolBehavior(
        [{ x: 100, y: 200 }, { x: 400, y: 200 }, { x: 400, y: 400 }],
        { speed: 60, waitTime: 1.0, loop: true },
      ),
      chase: createChaseBehavior({
        targetTag: "player", speed: 120, range: 200, onLostTarget: "patrol",
      }),
    },
  },
});
```

### Detection system that triggers chase
```ts
import { defineSystem, transition } from "@engine";
export const detectionSystem = defineSystem({
  name: "detection",
  update(engine) {
    const player = engine.findByTag("player");
    if (!player?.position) return;
    for (const e of engine.world.with("position", "stateMachine")) {
      if (!e.tags?.values.has("enemy")) continue;
      const dx = e.position.x - player.position.x;
      const dy = e.position.y - player.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 150 && e.stateMachine.current === "patrol") transition(e, "chase");
    }
  },
});
```

### Flee when low health, wander when idle
```ts
engine.spawn({
  position: { x: 300, y: 300 }, velocity: { vx: 0, vy: 0 },
  ascii: { char: "s", font: FONTS.normal, color: "#88ff88" },
  health: { current: 20, max: 20 },
  tags: { values: new Set(["enemy"]) },
  stateMachine: {
    current: "wander",
    states: {
      wander: createWanderBehavior({ speed: 30, changeInterval: 2 }),
      flee: createFleeBehavior({
        targetTag: "player", speed: 100, range: 250, onSafe: "wander",
      }),
    },
  },
});
// In a system: if (enemy.health.current < 5) transition(enemy, "flee");
```
