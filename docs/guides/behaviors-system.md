# Behaviors System Guide

The behaviors layer (`engine/behaviors/`) provides modular, reusable gameplay systems that plug into the ASCII game engine. Each behavior is a standalone module exporting pure functions, factory functions, or manager classes -- none of them depend on each other (though they compose naturally), and all are optional.

This guide covers every behavior module in detail: its purpose, full public API, integration patterns, events, persistence, and tested usage examples drawn from the actual codebase.

---

## Table of Contents

- [How Behaviors Fit Into the Engine](#how-behaviors-fit-into-the-engine)
- [Behavior Modules](#behavior-modules)
  - [Achievements](#achievements)
  - [AI](#ai)
  - [Crafting](#crafting)
  - [Currency](#currency)
  - [Damage](#damage)
  - [Dialog Tree](#dialog-tree)
  - [Equipment](#equipment)
  - [Inventory](#inventory)
  - [Loot](#loot)
  - [Quests](#quests)
  - [Stats](#stats)
  - [Wave Spawner](#wave-spawner)
- [Cross-Behavior Patterns](#cross-behavior-patterns)
- [Creating a New Behavior](#creating-a-new-behavior)
- [Testing Behaviors](#testing-behaviors)

---

## How Behaviors Fit Into the Engine

Behaviors live at `engine/behaviors/` and are re-exported through `engine/index.ts` so games import them from `@engine`:

```ts
import { createInventory, addItem, AchievementTracker, rollLoot } from '@engine';
```

Behaviors follow three structural patterns:

| Pattern | Examples | Description |
|---------|----------|-------------|
| **Manager class** | `AchievementTracker`, `QuestTracker`, `RecipeBook` | Stateful registry with its own event emitter. Game creates an instance and drives it via method calls. |
| **Pure functions + component** | `inventory`, `currency`, `stats`, `equipment`, `loot` | Define a data shape (component/wallet/stats bag) plus pure helper functions that mutate it. No global state. |
| **System factory** | `damage`, `wave-spawner` | Return a `System` object via `defineSystem()` that plugs into the ECS update loop. |
| **State machine states** | `ai` | Return `StateMachineState` objects that plug into the built-in `_stateMachine` system. |

**Event integration**: Behaviors that need to communicate with the rest of the engine use the global `events` bus from `shared/events.ts` (a mitt instance). Manager classes (`AchievementTracker`, `QuestTracker`) have their own self-contained emitters to avoid cross-talk between independent instances.

**Entity integration**: Behavior data attaches to ECS entities via the `[key: string]: any` indexer on the `Entity` type (`shared/types.ts`). Some behaviors define dedicated component interfaces (`InventoryComponent`, `EquipmentComponent`, `CurrencyWallet`, `Stats`); others use transient properties (`damage`, `_invincibleTimer`, `_patrol`, `_wander`).

**Persistence**: Most behaviors provide `serialize()` / `deserialize()` pairs. These produce JSON-safe snapshots that work with the engine's `save()` / `load()` storage helpers.

---

## Behavior Modules

### Achievements

**File**: `engine/behaviors/achievements.ts`
**Pattern**: Manager class with self-contained event emitter
**Import**: `import { AchievementTracker, type Achievement, type AchievementState, type AchievementCondition } from '@engine'`

#### Purpose

Track milestones, unlocks, and persistent progress. Supports numeric counters, named event counters, and arbitrary custom predicates. Achievements gate behind prerequisites, accumulate progress while prerequisites are pending, and auto-unlock when both the condition and prerequisites are satisfied.

#### Public API

**Types**:

| Type | Description |
|------|-------------|
| `AchievementCondition` | Union: `{ type: 'progress', target: number }`, `{ type: 'event', eventName: string, count: number }`, or `{ type: 'custom', check: (tracker) => boolean }` |
| `Achievement` | Definition: `id`, `name`, `description`, `condition`, plus optional `hidden`, `icon`, `category`, `points`, `prerequisites` |
| `AchievementState` | Runtime: `id`, `unlocked`, `progress`, optional `unlockedAt` timestamp |
| `AchievementEvent` | `'unlock' | 'progress'` |
| `AchievementGetAllOptions` | Filter: `unlocked?`, `category?`, `includeHidden?` |

**Class `AchievementTracker`**:

| Method | Signature | Description |
|--------|-----------|-------------|
| `register` | `(achievement: Achievement) => void` | Register one definition. Re-registering does not wipe existing progress. |
| `registerAll` | `(achievements: Achievement[]) => void` | Register multiple at once. |
| `getState` | `(id: string) => AchievementState \| undefined` | Current runtime state. |
| `getDefinition` | `(id: string) => Achievement \| undefined` | Registered definition. |
| `getAll` | `(opts?: AchievementGetAllOptions) => AchievementState[]` | Filtered list. Hidden achievements omitted by default unless unlocked. |
| `progress` | `(id: string, amount?: number) => void` | Add to a `progress`-type achievement counter. Auto-unlocks when target reached and prereqs met. |
| `recordEvent` | `(eventName: string) => void` | Increment every `event`-type achievement matching the event name. |
| `checkCustom` | `() => string[]` | Evaluate all `custom`-type predicates. Returns newly unlocked IDs. |
| `unlock` | `(id: string) => void` | Force-unlock (bypasses prerequisites). Idempotent. |
| `unlockedCount` | `() => number` | Count of unlocked achievements. |
| `totalPoints` | `() => number` | Sum of `points` across unlocked achievements. |
| `on` | `(event, handler) => () => void` | Subscribe. Returns unsubscribe function. |
| `serialize` | `() => Record<string, AchievementState>` | JSON-safe snapshot. |
| `deserialize` | `(data) => void` | Restore from snapshot. Unknown IDs are ignored. |
| `save` | `(storageKey?: string) => void` | Persist to localStorage (default key: `'achievements'`). |
| `load` | `(storageKey?: string) => boolean` | Restore from localStorage. Returns `true` if data was found. |

#### Events (self-contained)

| Event | Payload | When |
|-------|---------|------|
| `'unlock'` | `(id: string, state: AchievementState)` | Achievement unlocks |
| `'progress'` | `(id: string, state: AchievementState)` | Progress increments |

#### Usage Example

```ts
import { AchievementTracker, events } from '@engine';

const achievements = new AchievementTracker();
achievements.registerAll([
  {
    id: 'first-blood',
    name: 'First Blood',
    description: 'Defeat your first enemy.',
    condition: { type: 'progress', target: 1 },
    points: 10,
    category: 'combat',
  },
  {
    id: 'slayer',
    name: 'Slayer',
    description: 'Defeat 100 enemies.',
    condition: { type: 'progress', target: 100 },
    prerequisites: ['first-blood'],
    points: 100,
    category: 'combat',
  },
]);

achievements.on('unlock', (id) => engine.toast.show(`Unlocked: ${id}`));

// Wire to combat events:
events.on('combat:entity-defeated', () => {
  achievements.progress('first-blood', 1);
  achievements.progress('slayer', 1);
});

// Persistence:
achievements.save();
achievements.load();
```

---

### AI

**File**: `engine/behaviors/ai.ts`
**Pattern**: Factory functions returning `StateMachineState` objects
**Import**: `import { createPatrolBehavior, createChaseBehavior, createFleeBehavior, createWanderBehavior } from '@engine'`

#### Purpose

Provide common enemy/NPC movement behaviors that plug into the engine's built-in `_stateMachine` system. Each factory returns a `StateMachineState` with `enter`, `update`, and `exit` hooks. They set `velocity` on entities; the built-in `_physics` system handles position integration (never integrate manually).

Internal state is stored on entities with underscore-prefixed keys (`_patrol`, `_wander`) that are cleaned up in `exit`.

#### Public API

**`createPatrolBehavior(waypoints, options?)`**

Moves an entity along a sequence of waypoints.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `speed` | `number` | `60` | Movement speed in pixels/sec |
| `waitTime` | `number` | `0` | Pause at each waypoint in seconds |
| `loop` | `boolean` | `true` | Loop back to start after last waypoint |

**`createChaseBehavior(options)`**

Pursues the nearest entity with a given tag.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `targetTag` | `string` | Yes | Tag of entities to chase |
| `speed` | `number` | Yes | Pursuit speed in pixels/sec |
| `range` | `number` | Yes | Detection range in pixels |
| `onLostTarget` | `string` | No | State to transition to when target escapes range |

**`createFleeBehavior(options)`**

Moves away from the nearest entity with a given tag.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `targetTag` | `string` | Yes | Tag of entities to flee from |
| `speed` | `number` | Yes | Flee speed |
| `range` | `number` | Yes | Distance at which to start fleeing |
| `onSafe` | `string` | No | State to transition to when out of range |

**`createWanderBehavior(options?)`**

Wanders in random directions, changing heading periodically.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `speed` | `number` | `40` | Movement speed |
| `changeInterval` | `number` | `1` | Seconds between random direction changes |

#### Events

AI behaviors do not emit events directly. State transitions can be observed through the `_stateMachine` system.

#### Usage Example

```ts
import { createPatrolBehavior, createChaseBehavior, createWanderBehavior } from '@engine';
import { transition } from '@engine';

const guard = engine.spawn({
  position: { x: 100, y: 100 },
  velocity: { vx: 0, vy: 0 },
  ascii: { char: 'G', color: '#ff0000' },
  stateMachine: {
    current: 'patrol',
    states: {
      patrol: createPatrolBehavior(
        [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 300 }],
        { speed: 50, waitTime: 1.5, loop: true },
      ),
      chase: createChaseBehavior({
        targetTag: 'player',
        speed: 80,
        range: 200,
        onLostTarget: 'patrol',
      }),
      wander: createWanderBehavior({ speed: 30 }),
    },
  },
});
```

---

### Crafting

**File**: `engine/behaviors/crafting.ts`
**Pattern**: Pure functions + `RecipeBook` registry class
**Import**: `import { RecipeBook, craft, canCraft, type Recipe, type CraftResult, type CanCraftResult } from '@engine'`

#### Purpose

Recipe-based item creation. A `Recipe` maps ingredient items (consumed from an inventory) to output items (added to the same inventory). Features: skill-level gating, per-recipe `successChance` (failed crafts still consume ingredients), per-output `chance` for probabilistic multi-outputs, tool-style ingredients (`consumed: false`) that are checked but not removed.

#### Public API

**Types**:

| Type | Description |
|------|-------------|
| `CraftIngredient` | `{ itemId, count, consumed?: boolean }` -- `consumed: false` for tools |
| `CraftOutput` | `{ itemId, count?, chance? }` -- each output rolls independently |
| `Recipe` | Full recipe: `id`, `name`, `ingredients`, `outputs`, optional `time`, `skill`, `skillLevel`, `xp`, `successChance`, `category`, `description` |
| `CraftResult` | Outcome: `success`, `items`, `consumed`, `xpGained?`, `reason?` |
| `CanCraftResult` | Pre-check: `ok`, `reason?`, `missing?` |

**Functions**:

| Function | Signature | Description |
|----------|-----------|-------------|
| `canCraft` | `(recipe, inventory, skills?) => CanCraftResult` | Pre-check without side effects. Reports missing ingredients with exact shortfall counts. |
| `craft` | `(recipe, inventory, itemLookup, opts?) => CraftResult` | Execute the craft. Consumes ingredients, rolls success, produces outputs. |

`craft` options: `{ skills?, rng?, engine?, entity? }`. The `rng` parameter accepts a `() => number` for deterministic testing. XP is returned in the result but never mutated -- the caller decides how to apply it.

**Class `RecipeBook`**:

| Method | Description |
|--------|-------------|
| `register(recipe)` | Register or replace a recipe |
| `unregister(id)` | Remove by ID |
| `get(id)` | Lookup by ID |
| `all()` | All registered recipes |
| `byCategory(category)` | Filter by category |
| `findByOutput(itemId)` | Recipes that produce this item |
| `findByIngredient(itemId)` | Recipes that use this item ("what can I make with this?") |
| `canCraft(recipe, inventory, skills?)` | Convenience delegate to the pure function |
| `size` | Number of registered recipes |
| `clear()` | Remove all |

#### Events (global bus)

| Event | Payload | When |
|-------|---------|------|
| `craft:complete` | `{ entity, recipeId, items, consumed, xpGained? }` | Craft succeeds |
| `craft:failed` | `{ entity, recipeId, reason, missing?, consumed? }` | Craft fails (skill gate, missing ingredients, or success roll failure) |

Events only fire when `engine` is passed in `opts`.

#### Usage Example

```ts
import { RecipeBook, craft, createInventory, addItem } from '@engine';

const book = new RecipeBook();
book.register({
  id: 'sword',
  name: 'Iron Sword',
  ingredients: [
    { itemId: 'iron', count: 3 },
    { itemId: 'wood', count: 1 },
    { itemId: 'anvil', count: 1, consumed: false }, // tool -- checked but not removed
  ],
  outputs: [{ itemId: 'iron_sword' }],
  skill: 'smithing',
  skillLevel: 5,
  xp: 20,
  successChance: 0.9,
  category: 'weapons',
});

const result = craft(
  book.get('sword')!,
  player.inventory,
  (id) => itemDb[id],
  { skills: { smithing: 6 }, engine, entity: player },
);

if (result.success) {
  grantXp(result.xpGained ?? 0);
} else {
  engine.toast.show(result.reason ?? 'Craft failed');
}
```

---

### Currency

**File**: `engine/behaviors/currency.ts`
**Pattern**: Pure functions operating on a `CurrencyWallet` component
**Import**: `import { createWallet, addCurrency, spendCurrency, spendMulti, canAfford, getBalance, transferCurrency } from '@engine'`

Note: `add` and `spend` are re-exported as `addCurrency` and `spendCurrency` from `engine/index.ts` to avoid naming collisions.

#### Purpose

Multi-currency economy (gold, gems, mana, xp, tokens, etc.) with per-currency caps, atomic multi-currency spending, wallet-to-wallet transfers, and an optional transaction history ring buffer.

#### Public API

**Types**:

| Type | Description |
|------|-------------|
| `CurrencyId` | `string` alias |
| `CurrencyWallet` | `{ balances, caps?, history?, maxHistory? }` |
| `CurrencyTransaction` | `{ currency, amount, reason?, timestamp }` |
| `SerializedWallet` | JSON-safe snapshot |

**Functions**:

| Function | Signature | Description |
|----------|-----------|-------------|
| `createWallet` | `(initial?, opts?) => CurrencyWallet` | Create wallet with optional seed balances, caps, and history tracking |
| `getBalance` | `(wallet, currency) => number` | Current balance (0 for unseen currencies) |
| `canAfford` | `(wallet, cost) => boolean` | Check all currencies in a cost map |
| `addCurrency` | `(wallet, currency, amount, reason?, engine?, entity?) => number` | Add funds. Returns actual delta applied (may be less due to cap). |
| `spendCurrency` | `(wallet, currency, amount, reason?, engine?, entity?) => boolean` | Spend. No partial spend -- returns `false` if insufficient. |
| `spendMulti` | `(wallet, cost, reason?, engine?, entity?) => boolean` | Atomic multi-currency spend. All-or-nothing. |
| `transferCurrency` | `(from, to, currency, amount, reason?, engine?, entity?) => boolean` | Move between wallets. Respects destination caps. |
| `setBalance` | `(wallet, currency, amount) => void` | Direct set (bypasses events/history). |
| `setCap` | `(wallet, currency, cap \| undefined) => void` | Set or clear a cap. Clamps existing balance down. |
| `clearHistory` | `(wallet) => void` | Wipe transaction log. |
| `getHistory` | `(wallet, filter?) => CurrencyTransaction[]` | Read history, optionally filtered by currency or timestamp. |
| `serializeWallet` | `(wallet) => SerializedWallet` | Snapshot for persistence. |
| `deserializeWallet` | `(data) => CurrencyWallet` | Rehydrate. |

#### Events (global bus)

| Event | Payload | When |
|-------|---------|------|
| `currency:gained` | `{ entity, currency, amount, reason? }` | Funds added |
| `currency:spent` | `{ entity, currency, amount, reason? }` | Funds deducted |
| `currency:insufficient` | `{ entity, currency, required, available, reason? }` | Spend rejected |

Events only fire when `engine` is passed.

#### Usage Example

```ts
import { createWallet, addCurrency, spendMulti, canAfford } from '@engine';

const wallet = createWallet(
  { gold: 100, gems: 5 },
  { caps: { gold: 9999 }, trackHistory: true, maxHistory: 50 },
);

addCurrency(wallet, 'gold', 50, 'quest-reward', engine, player);

const shopCost = { gold: 80, gems: 1 };
if (canAfford(wallet, shopCost)) {
  spendMulti(wallet, shopCost, 'buy-sword', engine, player);
}
```

---

### Damage

**File**: `engine/behaviors/damage.ts`
**Pattern**: System factory (returns a `System` via `defineSystem()`) + one-shot visual helper
**Import**: `import { createDamageSystem, createDamageFlash, type DamageComponent, type DamageSystemConfig } from '@engine'`

#### Purpose

Process transient `damage` components on entities with `health`. The system deducts HP, applies invincibility frames, fires combat events, and calls configurable `onDamage` / `onDeath` hooks. A companion `createDamageFlash` function provides one-shot visual feedback (color flash, camera shake, particles).

#### Public API

**Types**:

| Type | Description |
|------|-------------|
| `DamageComponent` | `{ amount, source?, type? }` -- attach as `entity.damage` |
| `DamageSystemConfig` | `{ invincibilityDuration?, onDamage?, onDeath? }` |
| `DamageFlashOptions` | `{ flashColor?, flashDuration?, shakeMagnitude?, particles?, particleColor? }` |

**Functions**:

| Function | Returns | Description |
|----------|---------|-------------|
| `createDamageSystem(config?)` | `System` | Returns an ECS system. Add via `engine.addSystem()`. |
| `createDamageFlash(entity, engine, options?)` | `void` | One-shot visual feedback. Temporarily flashes color, shakes camera, emits particles. |

**`DamageSystemConfig` options**:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `invincibilityDuration` | `number` | `0.5` | Seconds of invincibility after hit |
| `onDamage` | `(entity, damage, engine) => boolean \| undefined` | -- | Return `false` to cancel damage |
| `onDeath` | `(entity, damage, engine) => void` | -- | Called when health reaches 0 |

#### How it works

1. Each frame, the system iterates entities with `health`.
2. If `entity._invincibleTimer > 0`, tick it down and skip any `damage` component.
3. If `entity.damage` exists: call `onDamage` (cancel if it returns `false`), subtract `damage.amount` from `health.current`, set invincibility timer, emit `combat:damage-taken`.
4. If `health.current <= 0`: clamp to 0, call `onDeath`, emit `combat:entity-defeated`.
5. Delete the transient `entity.damage` component.

#### Events (global bus)

| Event | Payload | When |
|-------|---------|------|
| `combat:damage-taken` | `{ entity, amount, source?, type?, remainingHp }` | Damage applied |
| `combat:entity-defeated` | `{ entity, source?, type? }` | Health reaches 0 |

#### Usage Example

```ts
import { createDamageSystem, createDamageFlash } from '@engine';

engine.addSystem(createDamageSystem({
  invincibilityDuration: 0.5,
  onDamage: (entity, _damage, eng) => {
    createDamageFlash(entity, eng, { particleColor: '#ff8800' });
    return true; // allow damage
  },
  onDeath: (entity, _damage, eng) => {
    eng.particles.explosion(entity.position!.x, entity.position!.y);
    eng.destroy(entity as any);
  },
}));

// Apply damage by setting the transient component:
(enemy as any).damage = { amount: 10, source: player, type: 'physical' };
```

---

### Dialog Tree

**File**: `engine/behaviors/dialog-tree.ts`
**Pattern**: Async runner function with a tree data structure
**Import**: `import { runDialogTree, type DialogTree, type DialogNode, type DialogChoice, type DialogContext } from '@engine'`

#### Purpose

Branching dialog trees for RPGs, adventures, and visual novels. The runner walks a graph of nodes, displaying each via `engine.dialog.show()` (linear) or `engine.dialog.choice()` (branching). Supports conditional choices, callbacks (`onEnter`, `onExit`, `action`), a `flags` bag for persistent dialog state, and `ctx.goto()` for dynamic jumps.

#### Public API

**Types**:

| Type | Description |
|------|-------------|
| `DialogTree` | `{ start: string, nodes: Record<string, DialogNode> }` |
| `DialogNode` | `{ id, speaker?, text, typeSpeed?, border?, choices?, next?, onEnter?, onExit?, condition? }` |
| `DialogChoice` | `{ text, next, condition?, action? }` |
| `DialogContext` | `{ flags, engine, setFlag(), getFlag(), goto() }` |
| `DialogEngine` | Minimal engine shape: `{ dialog: { show, choice } }` |

**Function**:

| Function | Signature | Description |
|----------|-----------|-------------|
| `runDialogTree` | `(engine, tree, initialFlags?) => Promise<Record<string, unknown>>` | Run the tree. Returns final flags state when dialog ends. |

**Node features**:
- `condition`: If returns `false`, the node is skipped (jumps to `next`).
- `onEnter` / `onExit`: Callbacks with access to `DialogContext`.
- `choices[].condition`: If returns `false`, the choice is hidden.
- `choices[].action`: Runs when the choice is picked (before transitioning).
- `ctx.goto(nodeId)`: Override the next node from any callback.
- Built-in loop guard: warns and ends dialog if any node is visited more than 100 times.

#### Events

Dialog trees do not emit events. Side effects happen in node callbacks.

#### Usage Example

```ts
import { runDialogTree, type DialogTree } from '@engine';

const tree: DialogTree = {
  start: 'greeting',
  nodes: {
    greeting: {
      id: 'greeting',
      speaker: 'Merchant',
      text: 'Hello, traveler! What can I do for you?',
      choices: [
        { text: 'Browse wares', next: 'shop' },
        {
          text: 'Ask about the dungeon',
          next: 'dungeon-info',
          condition: (ctx) => ctx.getFlag('visited-tavern', false),
        },
        { text: 'Leave', next: null },
      ],
    },
    shop: {
      id: 'shop',
      speaker: 'Merchant',
      text: 'Take a look at my finest goods...',
      onEnter: (ctx) => ctx.setFlag('browsed-shop', true),
      next: 'greeting',
    },
    'dungeon-info': {
      id: 'dungeon-info',
      speaker: 'Merchant',
      text: 'The dungeon entrance is to the north. Be careful!',
      next: null,
    },
  },
};

const flags = await runDialogTree(engine, tree, { 'visited-tavern': true });
// flags now contains any state set during the dialog
```

---

### Equipment

**File**: `engine/behaviors/equipment.ts`
**Pattern**: Pure functions operating on an `EquipmentComponent` + `Stats`
**Import**: `import { createEquipment, equipItem, unequipItem, canEquip, getEquipped, clearEquipment } from '@engine'`

#### Purpose

Slot-based gear system that binds inventory items to stat bonuses. Equipment slots are game-defined strings (`'weapon'`, `'head'`, `'ring1'`, etc.). Equipping an item applies its `modifiers` to a `Stats` object under a tagged source (`equipment:<slotId>`) so they are cleanly removed on unequip. Supports two-handed weapons that block secondary slots, stat requirements, and automatic displacement of existing gear.

#### Public API

**Types**:

| Type | Description |
|------|-------------|
| `EquipmentSlotId` | `string` alias |
| `EquippableItem` | Extends `InventoryItem` with `equipSlot`, optional `twoHanded`, `modifiers`, `requirements` |
| `EquipmentComponent` | `{ slots: Record<slotId, item \| null>, blocks? }` |
| `SerializedEquipment` | `{ slots: Record<slotId, itemId \| null> }` |

**Functions**:

| Function | Returns | Description |
|----------|---------|-------------|
| `createEquipment(slotIds, blocks?)` | `EquipmentComponent` | Create with named slots. `blocks` maps slots to what they block (e.g., `{ weapon: ['offhand'] }`). |
| `getEquipped(equipment, slotId)` | `EquippableItem \| null` | What's in a slot. |
| `isSlotAvailable(equipment, slotId)` | `boolean` | Slot exists and is empty. |
| `canEquip(equipment, item, stats?)` | `{ ok, reason? }` | Pre-check: slot exists, requirements met. Existing items are not a failure (displacement handles them). |
| `equipItem(equipment, item, stats?, engine?, entity?)` | `EquippableItem[]` | Equip. Returns displaced items. Applies modifiers. |
| `unequipItem(equipment, slotId, stats?, engine?, entity?)` | `EquippableItem \| null` | Unequip. Returns removed item. Clears modifiers. |
| `clearEquipment(equipment, stats?, engine?, entity?)` | `EquippableItem[]` | Unequip everything. |
| `serializeEquipment(equipment)` | `SerializedEquipment` | Snapshot (item IDs only). |
| `deserializeEquipment(data, itemLookup, stats?, blocks?)` | `EquipmentComponent` | Rehydrate. Optionally re-applies modifiers. |

#### Events (global bus)

| Event | Payload | When |
|-------|---------|------|
| `equipment:equip` | `{ entity, item, slotId }` | Item equipped |
| `equipment:unequip` | `{ entity, item, slotId }` | Item removed (including displacement) |

Events only fire when `engine` is passed.

#### Usage Example

```ts
import { createStats, createEquipment, equipItem, unequipItem, getStat } from '@engine';

const stats = createStats({ strength: 10, attack: 5 });
const equipment = createEquipment(
  ['weapon', 'offhand', 'head', 'chest'],
  { weapon: ['offhand'] },
);

const greatsword = {
  id: 'greatsword', name: 'Greatsword', icon: '/',
  equipSlot: 'weapon',
  twoHanded: true,
  modifiers: [{ stat: 'attack', type: 'flat' as const, value: 15 }],
  requirements: { strength: 10 },
};

const displaced = equipItem(equipment, greatsword, stats, engine, player);
// displaced contains any items that were in the weapon or offhand slots
getStat(stats, 'attack'); // 5 + 15 = 20

unequipItem(equipment, 'weapon', stats, engine, player);
getStat(stats, 'attack'); // 5
```

---

### Inventory

**File**: `engine/behaviors/inventory.ts`
**Pattern**: Pure functions operating on an `InventoryComponent`
**Import**: `import { createInventory, addItem, removeItem, hasItem, countItem, transferItem, isFull } from '@engine'`

#### Purpose

Slot-based item management. Items are plain objects with an `id` and `name` plus any game-specific data. Stackable items collapse into single slots (up to `maxStack`); non-stackable items occupy one slot each. Supports `maxSlots` and `maxWeight` capacity limits, multi-slot transfers, and serialization.

#### Public API

**Types**:

| Type | Description |
|------|-------------|
| `InventoryItem` | `{ id, name, icon?, color?, description?, stackable?, maxStack?, weight?, [key]: any }` |
| `InventorySlot` | `{ item: InventoryItem, count: number }` |
| `InventoryComponent` | `{ slots, maxSlots?, maxWeight? }` |
| `SerializedInventory` | `{ slots: Array<{ itemId, count }>, maxSlots?, maxWeight? }` |

**Functions**:

| Function | Returns | Description |
|----------|---------|-------------|
| `createInventory(opts?)` | `InventoryComponent` | Empty inventory with optional `maxSlots` and `maxWeight`. |
| `addItem(inv, item, count?, engine?, entity?)` | `boolean` | Add items. Stacks into existing slots first, then creates new ones. Returns `true` if ALL items fit. |
| `removeItem(inv, itemId, count?, engine?, entity?)` | `number` | Remove up to `count`. Returns actual count removed. Drains largest stacks first. |
| `hasItem(inv, itemId, count?)` | `boolean` | Has at least `count` of the item. |
| `countItem(inv, itemId)` | `number` | Total count across all slots. |
| `findSlot(inv, itemId)` | `number` | Index of first slot containing the item, or `-1`. |
| `getSlot(inv, index)` | `InventorySlot \| undefined` | Slot at index (for UI). |
| `totalWeight(inv)` | `number` | Sum of all items' weight times count. |
| `isFull(inv)` | `boolean` | All slots used with no stack room, or at/over `maxWeight`. |
| `clearInventory(inv)` | `void` | Remove everything. |
| `transferItem(from, to, itemId, count?, engine?, fromEntity?, toEntity?)` | `number` | Move between inventories. Items are never destroyed -- leftover stays in source. |
| `serializeInventory(inv)` | `SerializedInventory` | Snapshot (item IDs + counts only). |
| `deserializeInventory(data, itemLookup)` | `InventoryComponent` | Rehydrate via lookup function. Unknown IDs are skipped. |

#### Events (global bus)

| Event | Payload | When |
|-------|---------|------|
| `inventory:add` | `{ entity, item, count }` | Items added |
| `inventory:remove` | `{ entity, itemId, count }` | Items removed |
| `inventory:full` | `{ entity, item }` | Add blocked by capacity |

Events only fire when `engine` is passed.

#### Usage Example

```ts
import { createInventory, addItem, removeItem, hasItem, overlaps } from '@engine';

const backpack = createInventory({ maxSlots: 20, maxWeight: 50 });
const player = engine.spawn({
  position: { x: 0, y: 0 },
  inventory: backpack,
});

const potion = {
  id: 'potion', name: 'Health Potion', icon: '!',
  stackable: true, maxStack: 10, heal: 25,
};

addItem(backpack, potion, 3, engine, player); // fires 'inventory:add'

// Pickup loop in a system:
for (const item of [...engine.findAllByTag('pickup')]) {
  if (overlaps(player as any, item as any)) {
    addItem(player.inventory!, item.itemData, 1, engine, player);
    engine.destroy(item);
  }
}
```

---

### Loot

**File**: `engine/behaviors/loot.ts`
**Pattern**: Pure functions with a deterministic seeded RNG
**Import**: `import { rollLoot, createSeededRandom, type LootTable, type LootEntry, type LootDrop } from '@engine'`

#### Purpose

Weighted random drop tables for RPGs, roguelikes, and action games. Tables are data-driven arrays of entries with weights, conditions, chance rolls, count ranges, and nested sub-tables. All randomness uses a deterministic seeded RNG (xorshift32 with splitmix32 seed mixing), so passing the same `seed` always produces the same drops.

#### Public API

**Types**:

| Type | Description |
|------|-------------|
| `LootContext` | `{ flags: Record<string, unknown>, random: () => number }` |
| `LootEntry<T>` | `{ weight?, item?, table?, count?, condition?, chance? }` |
| `LootTable<T>` | `{ entries, rolls?, withReplacement?, guaranteed? }` |
| `LootDrop<T>` | `{ item: T, count: number }` |

**Functions**:

| Function | Returns | Description |
|----------|---------|-------------|
| `rollLoot<T>(table, options?)` | `LootDrop<T>[]` | Roll the table. Options: `{ seed?, flags? }`. |
| `createSeededRandom(seed?)` | `() => number` | Create a deterministic RNG. Omit seed for fresh randomness. |

**Table features**:
- `rolls`: Number or `[min, max]` range. Default `1`.
- `withReplacement`: Default `true`. Set `false` for "one of each" chests.
- `guaranteed`: Entries that always fire (still subject to their own `condition` and `chance`).
- `condition`: `(ctx: LootContext) => boolean` -- filter entries by game state.
- `chance`: Per-entry probability (0-1) after selection.
- `table`: Nested sub-table for hierarchical loot.
- `count`: `[min, max]` quantity range per drop.
- Identical items across all rolls are aggregated into a single `LootDrop` with summed count.

#### Events

Loot tables do not emit events. Games wire drops to inventory/currency systems manually.

#### Usage Example

```ts
import { rollLoot, type LootTable } from '@engine';

const chestTable: LootTable<string> = {
  rolls: [1, 3],
  entries: [
    { item: 'gold', weight: 50, count: [1, 10] },
    { item: 'potion', weight: 20, count: [1, 2] },
    { item: 'sword', weight: 1, condition: (ctx) => (ctx.flags.level as number) >= 5 },
  ],
  guaranteed: [{ item: 'xp', count: [5, 15] }],
};

const drops = rollLoot(chestTable, { seed: 42, flags: { level: 7 } });
// drops is like [{ item: 'xp', count: 11 }, { item: 'gold', count: 4 }, ...]

// Feed drops into inventory:
for (const drop of drops) {
  const itemDef = itemDatabase[drop.item];
  if (itemDef) addItem(player.inventory, itemDef, drop.count, engine, player);
}
```

---

### Quests

**File**: `engine/behaviors/quests.ts`
**Pattern**: Manager class with self-contained event emitter
**Import**: `import { QuestTracker, type QuestDefinition, type QuestState, type QuestStatus, type QuestObjective } from '@engine'`

#### Purpose

Quest tracking with objectives, progress, prerequisites, and completion. Quests follow a lifecycle: `locked` -> `available` -> `active` -> `completed` or `failed`. Prerequisites gate quests behind other quests. Objectives can be incremental (progress toward a target) or boolean (done/not done). When all required objectives are satisfied, the quest auto-completes.

#### Public API

**Types**:

| Type | Description |
|------|-------------|
| `QuestStatus` | `'locked' \| 'available' \| 'active' \| 'completed' \| 'failed'` |
| `QuestObjective` | `{ id, description, target?, progress?, hidden?, required? }` |
| `QuestDefinition` | `{ id, name, description, objectives, prerequisites?, rewards? }` |
| `QuestState` | `{ id, status, objectives: Record<id, { progress, done }>, startedAt?, completedAt? }` |
| `QuestEvent` | `'start' \| 'progress' \| 'complete' \| 'fail'` |

**Class `QuestTracker`**:

| Method | Signature | Description |
|--------|-----------|-------------|
| `register` | `(quest: QuestDefinition) => void` | Register one quest. Initial status depends on prerequisites. |
| `registerAll` | `(quests: QuestDefinition[]) => void` | Register multiple. Reconciles prereq lock state across the set. |
| `getState` | `(questId: string) => QuestState \| undefined` | Current state. |
| `getDefinition` | `(questId: string) => QuestDefinition \| undefined` | Registered definition. |
| `getAll` | `(status?: QuestStatus) => QuestState[]` | All quests, optionally filtered by status. |
| `start` | `(questId: string) => boolean` | Start a quest. Returns `false` if not `available` or prereqs unmet. |
| `progress` | `(questId, objectiveId, amount?) => void` | Increment an objective. Auto-completes quest if all required objectives done. |
| `completeObjective` | `(questId, objectiveId) => void` | Mark an objective as done. |
| `fail` | `(questId) => void` | Fail a quest. |
| `complete` | `(questId) => void` | Force-complete. Marks all required objectives as done. Unlocks dependent quests. |
| `isComplete` | `(questId) => boolean` | All required objectives done? |
| `on` | `(event, handler) => () => void` | Subscribe. Returns unsubscribe function. |
| `serialize` | `() => Record<string, QuestState>` | JSON-safe snapshot. |
| `deserialize` | `(data) => void` | Restore. Reconciles locks, preserves new objectives added after the save. |

#### Events (self-contained)

| Event | Payload | When |
|-------|---------|------|
| `'start'` | `(questId, state)` | Quest started |
| `'progress'` | `(questId, { objectiveId, progress, target, state })` | Objective progressed |
| `'complete'` | `(questId, { state, rewards })` | Quest completed |
| `'fail'` | `(questId, state)` | Quest failed |

#### Usage Example

```ts
import { QuestTracker, events } from '@engine';

const quests = new QuestTracker();
quests.registerAll([
  {
    id: 'rats',
    name: 'Rat Problem',
    description: 'The innkeeper is desperate.',
    objectives: [
      { id: 'kill', description: 'Slay 5 rats', target: 5 },
      { id: 'report', description: 'Talk to the innkeeper' },
    ],
    rewards: { xp: 100, gold: 50 },
  },
  {
    id: 'ratking',
    name: 'The Rat King',
    description: 'Find and defeat the rat king.',
    prerequisites: ['rats'],
    objectives: [
      { id: 'slay', description: 'Slay the rat king' },
      { id: 'loot', description: 'Grab the crown', required: false },
    ],
    rewards: { xp: 500 },
  },
]);

quests.start('rats');
quests.on('complete', (id, data) => {
  const { rewards } = data;
  if (rewards?.gold) addCurrency(wallet, 'gold', rewards.gold, 'quest', engine, player);
});

// Wire to game events:
events.on('combat:entity-defeated', (e) => {
  if (e.type === 'rat') quests.progress('rats', 'kill', 1);
});
```

---

### Stats

**File**: `engine/behaviors/stats.ts`
**Pattern**: Pure functions operating on a `Stats` bag
**Import**: `import { createStats, getStat, addModifier, removeModifier, tickModifiers, setBaseStat } from '@engine'`

#### Purpose

The numeric backbone for RPG-style games. A `Stats` object holds named base values (`strength`, `maxHp`, `speed`, etc.) plus a list of active `StatModifier`s. The final value for any stat is computed as:

```
final = (base + sum(flat)) * (1 + sum(percent)) * product(multipliers)
```

Modifiers can be permanent or timed (auto-expire via `tickModifiers(dt)`). Stacking rules per `source` control how duplicate modifiers interact:

- `'stack'` (default): Multiple modifiers coexist.
- `'refresh'`: Reusing the same source resets duration and replaces value.
- `'replace'`: Same as refresh semantically.

#### Public API

**Types**:

| Type | Description |
|------|-------------|
| `ModifierType` | `'flat' \| 'percent' \| 'multiplier'` |
| `StatModifier` | `{ id, stat, type, value, duration?, source?, stacking?, _remaining? }` |
| `Stats` | `{ base: Record<string, number>, modifiers: StatModifier[] }` |

**Functions**:

| Function | Returns | Description |
|----------|---------|-------------|
| `createStats(base)` | `Stats` | Create from base values. |
| `getStat(stats, name)` | `number` | Computed final value. Returns 0 if no base and no modifiers. |
| `getModifiersFor(stats, statName)` | `StatModifier[]` | Active modifiers targeting the stat. |
| `hasModifier(stats, id)` | `boolean` | Is a modifier with this ID active? |
| `setBaseStat(stats, name, value)` | `void` | Update base value. |
| `addModifier(stats, mod)` | `boolean` | Add modifier. Returns `true` if new, `false` if refreshed/replaced. |
| `removeModifier(stats, id)` | `boolean` | Remove by ID. |
| `removeModifiersBySource(stats, source)` | `number` | Remove all with matching source. Returns count removed. |
| `clearModifiers(stats)` | `void` | Remove all modifiers. |
| `tickModifiers(stats, dt)` | `StatModifier[]` | Decrement timed modifiers. Returns expired ones. |
| `serializeStats(stats)` | `Record<string, any>` | Snapshot. |
| `deserializeStats(data)` | `Stats` | Rehydrate. |

#### Events

Stats do not emit events directly. Games react to modifier changes in their own logic.

#### Usage Example

```ts
import { createStats, addModifier, getStat, tickModifiers } from '@engine';

const stats = createStats({ strength: 10, maxHp: 100 });

// Permanent equipment modifier:
addModifier(stats, {
  id: 'belt-of-giant-strength',
  stat: 'strength',
  type: 'flat',
  value: 5,
  source: 'equipment:belt',
});

// Timed buff with refresh stacking:
addModifier(stats, {
  id: 'berserk',
  stat: 'strength',
  type: 'percent',
  value: 0.5, // +50%
  duration: 8,
  source: 'buff:berserk',
  stacking: 'refresh',
});

getStat(stats, 'strength'); // (10 + 5) * (1 + 0.5) = 22.5

// In your update loop:
const expired = tickModifiers(stats, dt);
for (const mod of expired) {
  engine.toast.show(`${mod.source} wore off`);
}
```

---

### Wave Spawner

**File**: `engine/behaviors/wave-spawner.ts`
**Pattern**: System factory (returns a `System` via `defineSystem()`)
**Import**: `import { createWaveSpawner, type WaveSpawnerConfig, type WaveDefinition, type WaveEnemy } from '@engine'`

#### Purpose

Manage escalating enemy waves. The system progresses through wave definitions, spawning enemies with configurable delays and tracking wave completion by monitoring alive enemies with a given tag. Uses a closure-based state machine with phases: `waiting` -> `spawning` -> `active` -> `done`.

#### Public API

**Types**:

| Type | Description |
|------|-------------|
| `WaveEnemy` | `{ create: (x, y) => Partial<Entity>, count, spawnDelay? }` |
| `WaveDefinition` | `{ enemies, tag?, delay? }` |
| `WaveSpawnerConfig` | Full config below |

**`WaveSpawnerConfig` options**:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `waves` | `WaveDefinition[]` | Required | Array of wave definitions |
| `spawnPositions` | `Array<{ x, y }>` | -- | Fixed spawn positions (cycles through) |
| `useEdgeSpawns` | `boolean` | `true` | Use `engine.randomEdgePosition()` |
| `enemyTag` | `string` | `'wave-enemy'` | Tag for tracking spawned enemies |
| `onWaveStart` | `(waveIndex, engine) => void` | -- | Called when wave begins spawning |
| `onWaveComplete` | `(waveIndex, engine) => void` | -- | Called when all wave enemies are destroyed |
| `onAllWavesComplete` | `(engine) => void` | -- | Called after the final wave is cleared |

**Function**:

| Function | Returns | Description |
|----------|---------|-------------|
| `createWaveSpawner(config)` | `System` | Returns an ECS system. Add via `engine.addSystem()`. |

#### How it works

1. **`init`**: Resets state and starts the first wave.
2. **`waiting`**: Counts down the wave's `delay` before spawning begins.
3. **`spawning`**: Pops enemies from the spawn queue at the configured `spawnDelay` intervals. Each spawned entity gets the tracking tag.
4. **`active`**: Monitors alive enemies with the tracking tag. When count reaches 0, fires `onWaveComplete` and advances to the next wave.
5. **`done`**: All waves completed. Fires `onAllWavesComplete`.

#### Events

Wave spawner uses callbacks, not the global event bus. Wire callbacks in the config.

#### Usage Example

```ts
import { createWaveSpawner } from '@engine';

engine.addSystem(createWaveSpawner({
  enemyTag: 'enemy',
  waves: [
    {
      delay: 3,
      enemies: [
        {
          count: 5,
          spawnDelay: 0.5,
          create: (x, y) => ({
            position: { x, y },
            velocity: { vx: 0, vy: 30 },
            ascii: { char: 'X', color: '#ff0000' },
            health: { current: 3, max: 3 },
            tags: { values: new Set() },
          }),
        },
      ],
    },
    {
      delay: 5,
      enemies: [
        { count: 8, create: (x, y) => createBasicEnemy(x, y) },
        { count: 2, create: (x, y) => createEliteEnemy(x, y) },
      ],
    },
  ],
  onWaveStart: (i, eng) => eng.toast.show(`Wave ${i + 1}!`),
  onWaveComplete: (i, eng) => eng.toast.show(`Wave ${i + 1} cleared!`),
  onAllWavesComplete: (eng) => eng.toast.show('You survived!'),
}));
```

---

## Cross-Behavior Patterns

### Common Design Principles

All behaviors share these conventions:

1. **Pure functions with opt-in side effects**: Core logic is pure. Pass `engine` and `entity` to opt into event emission; omit them for silent operation (useful in tests).

2. **Component-based data**: Behavior state is a plain object (component) that attaches to entities or lives standalone. No classes for data.

3. **Serialize / deserialize pairs**: JSON-safe snapshots for persistence. Deserialization uses a lookup function for item definitions (inventory, equipment) so save files survive code changes.

4. **Self-contained event emitters for managers**: `AchievementTracker` and `QuestTracker` use internal Map-based emitters, not the global mitt bus. This avoids cross-talk between multiple instances.

5. **Global mitt bus for interop**: Cross-behavior communication happens through `shared/events.ts`. Behaviors emit events there; games wire listeners.

### Composition Examples

**Loot + Inventory**: Roll a loot table, feed drops into an inventory:

```ts
const drops = rollLoot(enemyLootTable, { seed: enemySeed, flags: { level: playerLevel } });
for (const drop of drops) {
  const item = itemDatabase[drop.item];
  if (item) addItem(player.inventory, item, drop.count, engine, player);
}
```

**Damage + Currency (gold on kill)**: React to combat events with currency rewards:

```ts
events.on('combat:entity-defeated', (e) => {
  addCurrency(player.wallet, 'gold', e.entity.goldValue ?? 10, 'kill', engine, player);
  achievements.progress('slayer', 1);
  quests.progress('bounty', 'kills', 1);
});
```

**Equipment + Stats + Inventory**: Equip from inventory, displaced items return to inventory:

```ts
const displaced = equipItem(equipment, newWeapon, stats, engine, player);
for (const item of displaced) {
  addItem(inventory, item, 1, engine, player);
}
removeItem(inventory, newWeapon.id, 1, engine, player);
```

**Crafting + Inventory + Currency (shop crafting fee)**: Spend gold, then craft:

```ts
if (canAfford(wallet, { gold: recipe.fee })) {
  spendCurrency(wallet, 'gold', recipe.fee, 'craft-fee', engine, player);
  const result = craft(recipe, inventory, itemLookup, { skills, engine, entity: player });
  if (result.success && result.xpGained) {
    addModifier(stats, {
      id: `craft-xp-${Date.now()}`,
      stat: 'craftingXp',
      type: 'flat',
      value: result.xpGained,
    });
  }
}
```

**Quests + Achievements + Events**: Wire everything together via the global event bus:

```ts
events.on('combat:entity-defeated', () => {
  quests.progress('rats', 'kill', 1);
  achievements.progress('first-kill', 1);
});

quests.on('complete', (id, data) => {
  if (data.rewards?.gold) addCurrency(wallet, 'gold', data.rewards.gold, 'quest', engine, player);
  achievements.recordEvent('quest-complete');
});
```

---

## Creating a New Behavior

This section walks through adding a hypothetical "reputation" behavior, step by step.

### 1. Create the Behavior File

Create `engine/behaviors/reputation.ts`:

```ts
/**
 * Reputation behavior -- faction standing for NPCs, shops, and quest gating.
 */

import { events } from '@shared/events';
import type { Entity } from '@shared/types';
import type { Engine } from '../core/engine';

// ── Public types ────────────────────────────────────────────────

export type FactionId = string;

export interface ReputationComponent {
  standings: Record<FactionId, number>;
  caps?: { min?: number; max?: number };
}

export interface SerializedReputation {
  standings: Record<FactionId, number>;
  caps?: { min?: number; max?: number };
}

// ── Factory ─────────────────────────────────────────────────────

export function createReputation(
  initial?: Record<FactionId, number>,
  caps?: { min?: number; max?: number },
): ReputationComponent {
  return {
    standings: { ...(initial ?? {}) },
    caps: caps ? { ...caps } : undefined,
  };
}

// ── Queries ─────────────────────────────────────────────────────

export function getStanding(rep: ReputationComponent, faction: FactionId): number {
  return rep.standings[faction] ?? 0;
}

export function getStandingTier(rep: ReputationComponent, faction: FactionId): string {
  const val = getStanding(rep, faction);
  if (val >= 100) return 'exalted';
  if (val >= 50) return 'friendly';
  if (val >= 0) return 'neutral';
  if (val >= -50) return 'unfriendly';
  return 'hostile';
}

// ── Mutations ───────────────────────────────────────────────────

export function adjustReputation(
  rep: ReputationComponent,
  faction: FactionId,
  amount: number,
  reason?: string,
  engine?: Engine,
  entity?: Partial<Entity>,
): number {
  const current = rep.standings[faction] ?? 0;
  let next = current + amount;

  // Apply caps
  if (rep.caps?.min !== undefined && next < rep.caps.min) next = rep.caps.min;
  if (rep.caps?.max !== undefined && next > rep.caps.max) next = rep.caps.max;

  const delta = next - current;
  rep.standings[faction] = next;

  if (engine && delta !== 0) {
    // You'd add this event type to shared/events.ts
    events.emit('reputation:changed' as any, {
      entity,
      faction,
      amount: delta,
      total: next,
      reason,
    });
  }

  return delta;
}

// ── Persistence ─────────────────────────────────────────────────

export function serializeReputation(rep: ReputationComponent): SerializedReputation {
  return {
    standings: { ...rep.standings },
    caps: rep.caps ? { ...rep.caps } : undefined,
  };
}

export function deserializeReputation(data: SerializedReputation): ReputationComponent {
  return {
    standings: { ...(data?.standings ?? {}) },
    caps: data?.caps ? { ...data.caps } : undefined,
  };
}
```

### 2. Add Events to `shared/events.ts`

Add the new event type to the `EngineEvents` type:

```ts
// Reputation events (see engine/behaviors/reputation.ts)
'reputation:changed': {
  entity: unknown;
  faction: string;
  amount: number;
  total: number;
  reason?: string;
};
```

### 3. Export from `engine/index.ts`

Add re-exports to the engine barrel file:

```ts
// Reputation -- faction standing
export {
  adjustReputation,
  createReputation,
  deserializeReputation,
  type FactionId,
  getStanding,
  getStandingTier,
  type ReputationComponent,
  type SerializedReputation,
  serializeReputation,
} from './behaviors/reputation';
```

### 4. Write Tests

Create `engine/__tests__/behaviors/reputation.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import {
  adjustReputation,
  createReputation,
  deserializeReputation,
  getStanding,
  getStandingTier,
  serializeReputation,
} from '../../behaviors/reputation';

describe('createReputation', () => {
  test('creates empty reputation', () => {
    const rep = createReputation();
    expect(getStanding(rep, 'elves')).toBe(0);
  });

  test('accepts initial standings', () => {
    const rep = createReputation({ elves: 50, dwarves: -20 });
    expect(getStanding(rep, 'elves')).toBe(50);
    expect(getStanding(rep, 'dwarves')).toBe(-20);
  });
});

describe('adjustReputation', () => {
  test('increases standing', () => {
    const rep = createReputation();
    adjustReputation(rep, 'elves', 25);
    expect(getStanding(rep, 'elves')).toBe(25);
  });

  test('respects caps', () => {
    const rep = createReputation({}, { min: -100, max: 100 });
    adjustReputation(rep, 'elves', 200);
    expect(getStanding(rep, 'elves')).toBe(100);
  });
});

describe('getStandingTier', () => {
  test('returns correct tiers', () => {
    const rep = createReputation({ a: 100, b: 50, c: 0, d: -50, e: -100 });
    expect(getStandingTier(rep, 'a')).toBe('exalted');
    expect(getStandingTier(rep, 'b')).toBe('friendly');
    expect(getStandingTier(rep, 'c')).toBe('neutral');
    expect(getStandingTier(rep, 'd')).toBe('unfriendly');
    expect(getStandingTier(rep, 'e')).toBe('hostile');
  });
});

describe('serialize / deserialize', () => {
  test('round-trips correctly', () => {
    const rep = createReputation({ elves: 75 }, { min: -100, max: 100 });
    const snapshot = serializeReputation(rep);
    const restored = deserializeReputation(snapshot);
    expect(getStanding(restored, 'elves')).toBe(75);
    expect(restored.caps?.max).toBe(100);
  });
});
```

### 5. Verify

Run the verification loop as specified in `CLAUDE.md`:

```bash
bun run check:all   # typecheck + boundary enforcement + lint
bun test engine/__tests__/behaviors/reputation.test.ts
```

### Summary of Files Touched

| File | Change |
|------|--------|
| `engine/behaviors/reputation.ts` | New behavior module |
| `shared/events.ts` | New event type in `EngineEvents` |
| `engine/index.ts` | Re-exports |
| `engine/__tests__/behaviors/reputation.test.ts` | Tests |

---

## Testing Behaviors

### Test File Structure

All behavior tests live at `engine/__tests__/behaviors/<name>.test.ts`. Each follows a consistent pattern:

```ts
import { describe, expect, test } from 'bun:test';
import { /* behavior exports */ } from '../../behaviors/<name>';
```

For behaviors that emit events, tests also import:
```ts
import { events } from '../../../shared/events';
import { mockEngine } from '../helpers';
```

### The `mockEngine()` Helper

Located at `engine/__tests__/helpers.ts`, `mockEngine()` provides a minimal engine-like object with:

- A real miniplex `World` (via `createWorld()`)
- `spawn(data)` that adds entities to the world
- `destroy(entity)` that removes entities
- `width` / `height` defaults (800 x 600)
- `turns` stub
- `systems.clear()` stub
- `debug.showError()` stub

```ts
import { mockEngine } from '../helpers';
const engine = mockEngine();
const entity = engine.spawn({ health: { current: 10, max: 10 } });
```

### What to Test

For each behavior, tests cover:

1. **Factory / creation**: Default values, options respected, no aliasing of input objects.
2. **Core operations**: Add, remove, progress, spend, equip -- the happy path.
3. **Edge cases**: Zero/negative inputs, unknown IDs, empty containers, re-registration.
4. **Capacity limits**: `maxSlots`, `maxWeight`, caps, stack limits.
5. **Events**: Fire only when `engine` is passed. Correct payload shape.
6. **Serialization**: Round-trip through serialize/deserialize. Unknown IDs are skipped gracefully.
7. **Determinism** (loot): Same seed produces same drops.

### Event Testing Pattern

Subscribe before the action, unsubscribe after, then assert:

```ts
test('fires inventory:add when engine is supplied', () => {
  const inv = createInventory();
  const engine = mockEngine();
  const received: any[] = [];
  const handler = (e: any) => received.push(e);

  events.on('inventory:add', handler);
  addItem(inv, potion, 3, engine as any, { tags: { values: new Set() } });
  events.off('inventory:add', handler);

  expect(received.length).toBe(1);
  expect(received[0].count).toBe(3);
});
```

### Running Tests

```bash
# Full suite:
bun test

# Single behavior:
bun test engine/__tests__/behaviors/inventory.test.ts

# Filter by test name:
bun test -t "addItem"
```
