# Plan A2: Engine Convenience API

## Problem
Common operations require too much boilerplate. Every game reimplements center coordinates, tag queries, edge spawning, and timed spawning.

## Items addressed
- #40: `centerX`, `centerY`
- #41: `findByTag(tag)` shortcut
- #42: `destroyAll(tag)` shortcut
- #44: `sceneTime` (resets per scene)
- #45: `randomEdgePosition()` helper
- #12: `spawnEvery()` shorthand

## File: `engine/core/engine.ts`

### 1. Add `centerX` / `centerY` getters (after existing `width`/`height` getters, ~line 63)

```ts
get centerX(): number {
  return this.renderer.width / 2;
}
get centerY(): number {
  return this.renderer.height / 2;
}
```

### 2. Add `sceneTime` property

Add a private field `private _sceneTime = 0` alongside the other privates (~line 66).

In the `update` method (~line 338), add `this._sceneTime += dt` after the existing lines.

In `loadScene` (~line 280 and ~line 290, inside both branches), add `this._sceneTime = 0` right after `this.scheduler.clear()`.

Add a public getter:
```ts
/** Seconds elapsed since the current scene loaded. Resets on scene change. */
get sceneTime(): number {
  return this._sceneTime;
}
```

### 3. Add `findByTag(tag)` method (in Entity helpers section, ~line 101)

```ts
/** Find the first entity with a given tag, or undefined. */
findByTag(tag: string): Entity | undefined {
  for (const e of this.world.with('tags')) {
    if (e.tags.values.has(tag)) return e;
  }
  return undefined;
}
```

### 4. Add `destroyAll(tag)` method

```ts
/** Destroy all entities that have a given tag. */
destroyAll(tag: string): number {
  const toRemove: Entity[] = [];
  for (const e of this.world.with('tags')) {
    if (e.tags.values.has(tag)) toRemove.push(e);
  }
  for (const e of toRemove) {
    this.world.remove(e);
  }
  return toRemove.length;
}
```

### 5. Add `randomEdgePosition(margin?)` method

```ts
/** Get a random position just off a random screen edge. */
randomEdgePosition(margin = 30): { x: number; y: number; edge: 'top' | 'right' | 'bottom' | 'left' } {
  const w = this.width;
  const h = this.height;
  const edge = Math.floor(Math.random() * 4);
  switch (edge) {
    case 0: return { x: Math.random() * w, y: -margin, edge: 'top' };
    case 1: return { x: w + margin, y: Math.random() * h, edge: 'right' };
    case 2: return { x: Math.random() * w, y: h + margin, edge: 'bottom' };
    default: return { x: -margin, y: Math.random() * h, edge: 'left' };
  }
}
```

Note: use `Math.random()` here instead of importing `rng` to avoid circular deps (engine.ts doesn't currently import from utils/math). Alternatively, import `rng` if it's already imported — check first.

### 6. Add `spawnEvery(seconds, factory)` method

```ts
/** Spawn entities on a repeating timer. Returns cancel ID. */
spawnEvery(seconds: number, factory: () => Partial<Entity>): number {
  return this.scheduler.every(seconds, () => {
    this.spawn(factory());
  });
}
```

## Rules
- Do NOT touch `engine/index.ts` — integration agent handles re-exports
- Do NOT modify `loadScene`'s system registration block (the `this.systems.add(...)` lines) — that's for integration
- DO modify `loadScene` only to add `this._sceneTime = 0` resets
- Do NOT touch any other files
- Run `bun run check` and `bun run build` to verify

## Verification
- `bun run check` passes
- `bun run build` succeeds
- Existing game code continues to work unchanged
