# Plan B2: Built-in Gameplay Systems

## Problem
Every game reimplements the same basic systems: lifetime countdown, screen wrapping, screen clamping, and off-screen cleanup. The engine auto-registers physics/tweens/animation but NOT lifetime — the #1 gotcha for new users.

## Items addressed
- #8: Built-in lifetime system (auto-registered)
- #9: Screen-wrap component + system
- #10: Screen-clamp component + system
- #11: Off-screen cleanup component + system

## New component types in `shared/types.ts`

Add these interfaces before the Entity interface (~line 178):

```ts
/** Auto-wrap entity position when it goes off screen. */
export interface ScreenWrap {
  /** Extra margin before wrapping (default 0). */
  margin?: number;
}

/** Clamp entity position to stay within screen bounds. */
export interface ScreenClamp {
  /** Padding from edge (default 0). */
  padding?: number;
}

/** Auto-destroy entity when it leaves the screen. */
export interface OffScreenDestroy {
  /** Margin beyond screen edge before destroying (default 50). */
  margin?: number;
}
```

Add these to the Entity interface (before the index signature):

```ts
export interface Entity {
  // ... existing components ...
  screenWrap: ScreenWrap;
  screenClamp: ScreenClamp;
  offScreenDestroy: OffScreenDestroy;
  
  [key: string]: any;
}
```

## New file: `engine/ecs/lifetime-system.ts`

```ts
import { defineSystem } from './systems';

export const lifetimeSystem = defineSystem({
  name: '_lifetime',
  update(engine, dt) {
    const toRemove: any[] = [];
    for (const e of engine.world.with('lifetime')) {
      e.lifetime.remaining -= dt;
      if (e.lifetime.remaining <= 0) {
        toRemove.push(e);
      }
    }
    for (const e of toRemove) {
      engine.destroy(e);
    }
  },
});
```

Note the `_lifetime` name prefix — matches the convention of other auto-registered systems (`_parent`, `_physics`, `_tween`, `_animation`).

## New file: `engine/ecs/screen-bounds-system.ts`

A single system that handles all three screen-boundary behaviors:

```ts
import { defineSystem } from './systems';

export const screenBoundsSystem = defineSystem({
  name: '_screenBounds',
  update(engine, dt) {
    const w = engine.width;
    const h = engine.height;

    // Screen wrap
    for (const e of engine.world.with('position', 'screenWrap')) {
      const m = e.screenWrap.margin ?? 0;
      if (e.position.x < -m) e.position.x = w + m;
      else if (e.position.x > w + m) e.position.x = -m;
      if (e.position.y < -m) e.position.y = h + m;
      else if (e.position.y > h + m) e.position.y = -m;
    }

    // Screen clamp
    for (const e of engine.world.with('position', 'screenClamp')) {
      const p = e.screenClamp.padding ?? 0;
      if (e.position.x < p) e.position.x = p;
      else if (e.position.x > w - p) e.position.x = w - p;
      if (e.position.y < p) e.position.y = p;
      else if (e.position.y > h - p) e.position.y = h - p;
    }

    // Off-screen destroy
    const toRemove: any[] = [];
    for (const e of engine.world.with('position', 'offScreenDestroy')) {
      const m = e.offScreenDestroy.margin ?? 50;
      if (e.position.x < -m || e.position.x > w + m || e.position.y < -m || e.position.y > h + m) {
        toRemove.push(e);
      }
    }
    for (const e of toRemove) {
      engine.destroy(e);
    }
  },
});
```

## Rules
- ONLY create new files in `engine/ecs/` and modify `shared/types.ts`
- Do NOT touch `engine/core/engine.ts` — the integration agent will add these systems to `loadScene`
- Do NOT touch `engine/index.ts` — integration agent handles re-exports
- Import `defineSystem` from `./systems` (relative), not from `@engine` (avoids circular deps)
- Run `bun run check` and `bun run build` to verify

## Verification
- `bun run check` passes (new files compile, Entity accepts new components)
- `bun run build` succeeds
- Systems are NOT yet auto-registered (that happens in integration) — that's expected
