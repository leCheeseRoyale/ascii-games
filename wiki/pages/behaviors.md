---
title: Behaviors
created: 2026-04-21
updated: 2026-04-21
type: reference
tags: [engine, system, gameplay, ai, inventory, crafting]
sources:
  - engine/behaviors/achievements.ts
  - engine/behaviors/ai.ts
  - engine/behaviors/crafting.ts
  - engine/behaviors/currency.ts
  - engine/behaviors/damage.ts
  - engine/behaviors/dialog-tree.ts
  - engine/behaviors/equipment.ts
  - engine/behaviors/inventory.ts
  - engine/behaviors/loot.ts
  - engine/behaviors/quests.ts
  - engine/behaviors/stats.ts
  - engine/behaviors/wave-spawner.ts
---

# Behaviors

The behaviors layer (`engine/behaviors/`) provides modular, reusable gameplay systems. Each module is standalone -- none depend on each other, and all are optional. Import from `@engine`.

## Structural Patterns

| Pattern | Examples | Description |
|---------|----------|-------------|
| **Manager class** | `AchievementTracker`, `QuestTracker`, `RecipeBook` | Stateful registry with own event emitter. |
| **Pure functions + component** | inventory, currency, stats, equipment, loot | Data shape plus pure helper functions. No global state. |
| **System factory** | damage, wave-spawner | Returns a `System` via `defineSystem()` for the ECS update loop. |
| **State machine states** | ai | Returns `StateMachineState` objects for the built-in `_stateMachine` system. |

Most behaviors provide `serialize()` / `deserialize()` pairs for persistence with the engine's [[save-slots]] system.

## Module Reference

### AchievementTracker

Manager class tracking milestones with numeric counters, event counters, and custom predicates. Supports prerequisites, auto-unlock, categories, and points. Key methods: `register`, `progress`, `recordEvent`, `checkCustom`, `unlock`, `serialize`/`deserialize`, `save`/`load`. Emits `'unlock'` and `'progress'` events via its own emitter.

### AI Behaviors

Factory functions returning `StateMachineState` objects that plug into `_stateMachine`:

- `createPatrolBehavior(waypoints, opts?)` -- move along waypoints with optional wait time and looping
- `createChaseBehavior(opts)` -- pursue nearest entity by tag within a detection range
- `createFleeBehavior(opts)` -- move away from nearest entity by tag
- `createWanderBehavior(opts?)` -- random direction changes at configurable intervals

All set `velocity` on entities; `_physics` handles integration. Internal state uses underscore-prefixed keys (`_patrol`, `_wander`) cleaned up on `exit`.

### Crafting (RecipeBook)

`RecipeBook` manages recipes with ingredient requirements, tool checks, and multi-output results. Pure functions `canCraft(recipe, inv)` and `craft(recipe, inv)` check/consume ingredients from an [[component-reference|InventoryComponent]]. Supports `serialize`/`deserialize`.

### Currency

`CurrencyWallet` with named currency types. Functions: `createWallet`, `getBalance`, `canAfford`, `credit`, `debit`, `transfer`. Transaction history tracking. Serializable.

### Damage System

`createDamageSystem(config?)` returns a system that processes `damage` components each frame: applies damage to `health`, triggers invincibility frames, fires `onDeath` callbacks, and emits `'combat:damage'`/`'combat:death'` events. `createDamageFlash(opts)` adds visual feedback.

### Dialog Tree

`runDialogTree(tree, context)` drives branching NPC conversations. `DialogNode` supports text, choices with conditions, and `onSelect` callbacks. Integrates with the engine's `DialogManager` for typewriter rendering.

### Equipment

Slot-based equipment system. Functions: `createEquipment`, `equipItem`, `unequipItem`, `canEquip`, `getEquipped`, `clearEquipment`. Integrates with inventory (auto-removes from inventory on equip). Serializable.

### Inventory

Slot-based inventory with stacking, weight limits, and max-slot caps. Functions: `createInventory`, `addItem`, `removeItem`, `hasItem`, `countItem`, `isFull`, `transferItem`, `serializeInventory`/`deserializeInventory`.

### Loot

`rollLoot(table, context?)` resolves weighted drop tables with per-entry conditions, guaranteed drops, min/max rolls, and nested sub-tables. `createSeededRandom(seed?)` provides deterministic RNG for replays.

### Quests (QuestTracker)

Manager class for quest lifecycle: `register`, `start`, `progress`, `complete`, `fail`. Tracks objectives with numeric targets. Supports prerequisites and status transitions (`locked` -> `available` -> `active` -> `completed`/`failed`). Emits `'start'`, `'progress'`, `'complete'`, `'fail'` events. Serializable.

### Stats

Modifier-based stat system. `createStats(base)` initializes base values. `addModifier(stats, mod)` applies flat, percent, or multiplier modifiers with optional duration and source tracking. `getStat(stats, name)` computes the final value. `tickModifiers(stats, dt)` expires timed modifiers.

### Wave Spawner

`createWaveSpawner(config)` returns a system that drives enemy wave progression. Configurable wave definitions, spawn delays, inter-wave pauses, and `onWaveStart`/`onWaveComplete`/`onAllWavesComplete` callbacks.

## See Also

- [[engine-overview]] -- how behaviors fit into the engine architecture
- [[component-reference]] -- ECS component types used by behaviors
- [[ecs-architecture]] -- the system model behaviors plug into
