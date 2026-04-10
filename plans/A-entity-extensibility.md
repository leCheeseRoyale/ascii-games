# Plan A: Entity Extensibility

## Problem
The `Entity` interface in `shared/types.ts:182-202` is a closed set of 20 components. Adding a game-specific component (e.g., `inventory`, `dialogue`, `aiState`) requires editing engine-level code. This makes every new game type require engine modifications.

## Solution: Index signature escape hatch + generic world

Add an index signature to Entity so games can attach arbitrary components, and export a helper type for game-specific entities.

## Changes

### 1. `shared/types.ts` — Add index signature to Entity

At the end of the `Entity` interface (line ~201), add:

```ts
export interface Entity {
  // ... all existing components stay unchanged ...

  /** Game-specific custom components. Use this for any data not covered above. */
  [key: string]: any;
}
```

This is the simplest approach: it preserves full type safety for all built-in components (autocomplete, type checking) while allowing games to attach anything. Miniplex already stores entities as plain objects, so this requires zero runtime changes.

**Why not a `custom: Record<string, unknown>` bag?** Because miniplex queries use `world.with('componentName')` — a top-level key is required for queries to work. A nested bag would break `engine.world.with('inventory')`.

**Why not generics on World?** Miniplex's `World<E>` already supports this, but threading a generic through Engine, Scene, System, and every import site would be a massive breaking change. The index signature gives the same flexibility with zero churn.

### 2. `engine/ecs/world.ts` — No changes needed

`createWorld()` returns `World<Entity>`. With the index signature, `world.add({ position: ..., inventory: [...] })` just works. Miniplex doesn't validate component keys.

### 3. `engine/core/engine.ts` — No changes needed

`engine.spawn()` takes `Partial<Entity>`. With the index signature, custom components pass through.

### 4. Add a game-level type helper — `shared/types.ts`

Add a utility type so games can define their custom shape with type safety:

```ts
/** Helper for games to define typed custom entities. */
export type GameEntity<T extends Record<string, any> = {}> = Partial<Entity> & T;
```

Usage in game code:
```ts
type MyEntity = GameEntity<{ inventory: Item[]; aiState: 'idle' | 'chase' }>;

function createEnemy(x: number, y: number): MyEntity {
  return {
    position: { x, y },
    ascii: { char: 'E', font: FONTS.base, color: '#f00' },
    aiState: 'idle',
    inventory: [],
  };
}
```

### 5. `engine/index.ts` — Export the new type

Add `GameEntity` (the utility type, not the existing `GameEntity` alias in world.ts) to the exports. Rename the existing `GameEntity` in `engine/ecs/world.ts` to `WorldEntity` to avoid the name collision:

```ts
// world.ts
export type WorldEntity = Entity;  // renamed from GameEntity

// engine/index.ts — add to re-exports
export type { GameEntity } from '@shared/types';
```

### 6. Update existing game code — Optional, non-breaking

The asteroid-field game continues to work unchanged. Optionally, move the game-specific `Player` and `Obstacle` interfaces out of `shared/types.ts` into `game/types.ts` to demonstrate the new pattern:

- Remove `Player` and `Obstacle` from `shared/types.ts`
- Remove them from the `Entity` interface
- Create `game/types.ts` with those interfaces
- Game code uses the index signature to attach them

**This step is optional** — leaving them in shared/types.ts doesn't break anything.

## Files touched
- `shared/types.ts` — add index signature + GameEntity type
- `engine/ecs/world.ts` — rename GameEntity to WorldEntity
- `engine/index.ts` — update re-exports

## Verification
- `bun run check` passes (TypeScript)
- `bun run build` succeeds
- `bun dev` — asteroid-field game plays identically
- Verify: `engine.spawn({ position: { x: 0, y: 0 }, myCustomThing: 42 })` compiles
