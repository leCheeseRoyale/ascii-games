---
name: behaviors
description: Use when working with any behavior module under `engine/behaviors/`, composing AI state machines (`createPatrolBehavior`, `createChaseBehavior`, `createFleeBehavior`, `createWanderBehavior`), setting up crafting recipes (`RecipeBook`, `canCraft`, `craft`), managing currency wallets (`createWallet`, `add`, `spend`, `transfer`), wiring damage systems (`createDamageSystem`, `createDamageFlash`), building dialog trees (`runDialogTree`, `DialogTree`, `DialogNode`), managing inventories (`createInventory`, `addItem`, `removeItem`, `transferItem`), configuring loot tables (`rollLoot`, `LootTable`, `createSeededRandom`), tracking quests (`QuestTracker`, `start`, `progress`, `completeObjective`), or tracking achievements (`AchievementTracker`, `register`, `unlock`, `progress`). Also use when deciding which behavior pattern (tracker, component, system) fits a feature.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Behaviors subsystem

Nine composable modules for common game mechanics. Each follows one of three patterns — knowing which pattern a module uses tells you how to integrate it.

## Why three patterns

Not all behaviors need the same coupling to the ECS:

| Pattern | Modules | Coupling | Lifecycle |
|---|---|---|---|
| **System-based** | AI, Damage | Direct ECS — returns systems or state-machine states, reads/writes entity components | Per-frame update, scene-scoped |
| **Component-based** | Currency, Inventory | Pure functions on component-shaped data — attach to entity or use standalone | Call when needed, no frame loop |
| **Tracker class** | Achievements, Quests | Self-contained with internal event emitter — no ECS coupling | Registration + state transitions |
| **Pure utility** | Crafting, Dialog, Loot | Standalone functions/runners — no forced integration | Call when needed |

This prevents over-coupling: a loot table doesn't need to know about the ECS, and an achievement tracker doesn't need per-frame updates.

## Source files

All under `engine/behaviors/`:

| File | Pattern | What it provides |
|---|---|---|
| `ai.ts` | System | Patrol, chase, flee, wander state-machine states |
| `damage.ts` | System | Damage processing system + visual flash helper |
| `crafting.ts` | Pure utility | Recipe registry + craft/canCraft pure functions |
| `currency.ts` | Component | Multi-currency wallet with caps, history, transfer |
| `inventory.ts` | Component | Slot-based inventory with stacking, weight, transfer |
| `loot.ts` | Pure utility | Weighted loot tables with nested tables + seeded RNG |
| `dialog-tree.ts` | Pure utility | Async dialog tree runner with flags and branching |
| `quests.ts` | Tracker | Quest state machine with objectives, prerequisites, rewards |
| `achievements.ts` | Tracker | Achievement tracker with progress, events, prerequisites |

## AI behaviors (`ai.ts`)

Four factory functions, each returning a `StateMachineState` for use with the `stateMachine` component:

```typescript
createPatrolBehavior(waypoints: {x,y}[], opts?: { speed, waitTime?, loop? })
createChaseBehavior(opts: { targetTag, speed, range, onLostTarget? })
createFleeBehavior(opts: { targetTag, speed, range, onSafe? })
createWanderBehavior(opts?: { speed?, changeInterval? })
```

**How they work:** Each state has `enter`, `update`, `exit` lifecycle hooks. On update, they directly set `entity.velocity.vx/vy` — the `_physics` system handles integration. State transitions use `transition(entity, stateName)`.

**Compose via state machine:**
```typescript
entity.stateMachine = {
  current: 'patrol',
  states: {
    patrol: createPatrolBehavior([{x:100,y:100}, {x:300,y:100}], { speed: 40 }),
    chase: createChaseBehavior({ targetTag: 'player', speed: 80, range: 200 }),
  },
}
```

The built-in `_stateMachine` system runs the active state's `update()` each frame. Transition logic (when to switch from patrol to chase) goes in the state's `update` callback or in a separate system.

**Why state machines instead of behavior trees?** Simpler mental model for the game types this engine targets. State machines are explicit about transitions and easy to debug visually. Behavior trees add complexity without benefit for most ASCII game AI.

## Damage system (`damage.ts`)

**System factory:**
```typescript
const damageSystem = createDamageSystem({
  invincibilityDuration: 0.5,                     // seconds of i-frames after hit
  onDamage: (entity, damage, engine) => boolean,   // return false to cancel
  onDeath: (entity, lastDamage, engine) => void,
})
engine.addSystem(damageSystem)
```

**How it works:** Entities with a `damage: { amount, source?, type? }` component get processed each frame:
1. Skip if invincible (i-timer ticking down)
2. Call `onDamage` callback — return false to cancel
3. `entity.health.current -= amount`
4. Set invincibility window
5. Emit `combat:damage-taken` event
6. If health ≤ 0: call `onDeath`, emit `combat:entity-defeated`

**Damage is transient:** Set `entity.damage = { amount: 5 }` once. The system processes and removes it. Don't set it every frame.

**Visual helper:** `createDamageFlash(entity, engine, opts?)` — swaps entity color briefly, shakes camera, emits particles. Uses `engine.after()` for cleanup.

## Crafting (`crafting.ts`)

**Dual-layer:** Pure functions for one-off crafting + `RecipeBook` registry class for recipe management.

```typescript
// Registry
const recipes = new RecipeBook()
recipes.register({ id: 'iron-sword', name: 'Iron Sword',
  ingredients: [{ itemId: 'iron', count: 3 }, { itemId: 'wood', count: 1 }],
  outputs: [{ itemId: 'iron-sword' }],
  successChance: 0.9,
})

// Check + execute
const check = canCraft(recipes.get('iron-sword')!, inventory)
if (check.ok) {
  const result = craft(recipes.get('iron-sword')!, inventory, { engine, entity })
}
```

**Craft flow:** `canCraft()` checks materials + skill level → `craft()` rolls success chance → consumes ingredients (unless `consumed: false` for tools) → rolls per-output chances → adds outputs → emits `craft:complete` or `craft:failed`.

**Why pure functions + registry?** Pure functions enable testing without engine context. The registry adds convenience (lookup by category, find by output) without forcing it.

## Currency (`currency.ts`)

**Pure functions on a `CurrencyWallet` component:**

```typescript
const wallet = createWallet({ gold: 100, gems: 5 }, { maxHistory: 50 })

add(wallet, 'gold', 50, 'quest reward', engine, entity)     // emits currency:gained
spend(wallet, 'gold', 30, 'shop purchase', engine, entity)   // emits currency:spent
spendMulti(wallet, { gold: 10, gems: 2 }, 'upgrade')         // atomic multi-currency
transfer(from, to, 'gold', 25, 'trade')                      // respects destination cap
canAfford(wallet, { gold: 30 })                               // boolean check
```

**Features:** Multi-currency (gold, gems, mana, xp, anything), per-currency caps, ring-buffer transaction history (default 100 entries), negative balances clamped to 0.

**Why pure functions?** Wallets can live on entities or standalone (shop NPC, world bank). No forced ECS coupling. Events are optional — only emitted when `engine` is passed.

## Inventory (`inventory.ts`)

**Pure functions on an `InventoryComponent`:**

```typescript
const inv = createInventory({ maxSlots: 20, maxWeight: 50 })

addItem(inv, { id: 'potion', name: 'Potion', stackable: true, maxStack: 10, weight: 0.5 }, 3)
removeItem(inv, 'potion', 1)
transferItem(fromInv, toInv, 'potion', 2)   // atomic — fails if destination can't fit
const full = isFull(inv)                      // checks both slots and weight
```

**Capacity system:** Slot-based (max distinct items) + weight-based (total kg/units). Stackable items fill existing stacks first, then create new slots. Non-stackable always get fresh slots.

**Events:** `inventory:add`, `inventory:remove`, `inventory:full` — emitted when engine/entity context is provided.

**Persistence:** `serializeInventory()` / `deserializeInventory()` for save/load.

## Loot tables (`loot.ts`)

**Deterministic weighted random selection:**

```typescript
const table: LootTable<string> = {
  entries: [
    { item: 'potion', weight: 5 },
    { item: 'sword', weight: 1, chance: 0.5 },          // 50% drop rate even when selected
    { table: rareTable, weight: 1, count: [1, 3] },     // nested table, rolled 1-3 times
    { item: 'key', condition: (ctx) => ctx.flags.bossDefeated },  // conditional
  ],
  rolls: [1, 3],        // roll 1-3 times
  guaranteed: [{ item: 'gold', count: [5, 15] }],  // always drops
}

const drops = rollLoot(table, { seed: 42, flags: gameFlags })
```

**Seeded RNG:** `createSeededRandom(seed?)` uses xorshift32 + splitmix32 seed mixing. Same seed = same drops. Critical for multiplayer determinism and testing.

**Why weighted selection?** More intuitive than flat probability lists. Weights are relative — `weight: 5` vs `weight: 1` means 5× more likely. Adding items doesn't require recalculating all probabilities.

## Dialog trees (`dialog-tree.ts`)

**Async runner for branching narrative:**

```typescript
const tree: DialogTree = {
  start: 'greeting',
  nodes: {
    greeting: { speaker: 'NPC', text: 'Hello traveler!', choices: [
      { text: 'Trade', next: 'shop' },
      { text: 'Quest info', next: 'quest', condition: (ctx) => !ctx.flags.questStarted },
    ]},
    shop: { text: 'Browse my wares.', next: null },  // null = end dialog
    quest: { text: 'Find the artifact.', onExit: (ctx) => ctx.setFlag('questStarted', true), next: null },
  },
}

const finalFlags = await runDialogTree(engine, tree, { questStarted: false })
```

**Execution model:** Start at `tree.start`, check node `condition()`, fire `onEnter()`, show text or choices, fire `onExit()`, follow `next`. `ctx.goto(nodeId)` overrides normal flow. Loop guard: max 100 visits per node.

**Why async?** Dialog is inherently sequential (wait for player to read, choose). The async runner blocks game flow naturally while `engine.dialog.show()` handles typewriter display.

## Quest tracker (`quests.ts`)

**Self-contained state machine:**

```typescript
const quests = new QuestTracker()
quests.register({ id: 'artifact', name: 'Find the Artifact',
  objectives: [
    { id: 'find', description: 'Find the artifact', target: 1 },
    { id: 'return', description: 'Return to NPC', target: 1 },
  ],
  prerequisites: [],
  rewards: { xp: 100, gold: 50 },
})

quests.start('artifact')                           // available → active
quests.progress('artifact', 'find', 1)             // increment objective
quests.completeObjective('artifact', 'return')      // mark done immediately
// Auto-completes quest when all required objectives done

quests.on('complete', (questId, { state, rewards }) => { /* grant rewards */ })
```

**State machine:** `locked` → `available` → `active` → `completed` | `failed`. Prerequisites checked on registration and after each completion (cascading unlocks).

**Persistence:** `quests.serialize()` / `quests.deserialize()`.

## Achievement tracker (`achievements.ts`)

**Three condition types:**

```typescript
const achievements = new AchievementTracker()
achievements.register({
  id: 'first-blood',
  name: 'First Blood',
  condition: { type: 'event', event: 'enemy-killed', target: 1 },
})
achievements.register({
  id: 'hoarder',
  name: 'Hoarder',
  condition: { type: 'progress', target: 100 },   // manual progress calls
})
achievements.register({
  id: 'pacifist',
  name: 'Pacifist',
  condition: { type: 'custom', check: () => gameState.kills === 0 && gameState.level > 5 },
})

achievements.recordEvent('enemy-killed')           // event-based
achievements.progress('hoarder', 10)                // progress-based
achievements.checkCustom()                          // evaluate all custom predicates
```

**Features:** Hidden achievements, categories, points, prerequisites (recursive unlock checking), persistence.

**Why self-contained emitter?** Achievement tracking crosses all game systems — tying it to the ECS event bus would create coupling. The internal Map-based emitter is isolated and predictable.

## Composition patterns

### How behaviors compose with each other

```
Crafting ↔ Inventory     (consumes/produces items)
Damage  → Loot           (entity-defeated triggers loot rolls)
Currency ↔ Inventory     (shop transactions)
Quests  → Achievements   (quest completion unlocks achievements)
Dialog  → Quests/Currency (branching on state, side effects in callbacks)
Loot    → Inventory      (drops added to backpack)
```

### Typical wiring

```typescript
// In scene setup:
engine.addSystem(createDamageSystem({
  onDeath: (entity, damage, engine) => {
    const drops = rollLoot(entity.lootTable, { seed: engine.time.elapsed })
    for (const drop of drops) addItem(playerInventory, itemRegistry[drop.item], drop.count)
    quests.progress('kill-quest', 'kills', 1)
    achievements.recordEvent('enemy-killed')
  },
}))
```

## Things NOT to do

- Don't import behaviors in `engine/` internals — they're high-level building blocks for game code.
- Don't subclass tracker classes — they're designed for composition, not inheritance.
- Don't use `Math.random()` in loot tables — use `createSeededRandom()` for reproducibility.
- Don't set `entity.damage` every frame — it's a one-shot trigger consumed by the damage system.
- Don't put crafting/inventory mutation inside render callbacks — side effects belong in systems or event handlers.

## When to read further

- Composing entity + behavior + interaction → invoke **`/ascii-games-dev:mechanic`**
- Adding feedback to behavior events → invoke **`/ascii-games-dev:juice`**
- Persisting behavior state (inventory, quests, achievements) → invoke **`/ascii-games-dev:persist`**
