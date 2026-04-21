---
title: Collision Events
created: 2026-04-21
updated: 2026-04-21
type: system
tags: [physics, collision, system, events]
sources: [engine/ecs/collision-event-system.ts, engine/core/engine.ts, shared/types.ts]
---

# Collision Events

The collision event system (`_collisionEvents`) provides declarative collision callbacks between tagged entity groups. Unlike raw overlap checks, it tracks enter/stay/exit lifecycle events for each colliding pair. The system is lazy-registered -- it is only created on the first call to `engine.onCollide()`.

## Engine API

```ts
engine.onCollide(
  tagA: string,
  tagB: string,
  callback: (a: Partial<Entity>, b: Partial<Entity>) => void,
): () => void
```

The `callback` fires on the first frame two entities with the given tags overlap (the "enter" event). The returned function is an unsubscribe handle. Internally, `engine.onCollide` delegates to the full collision event system which supports three lifecycle phases:

```ts
const unsub = collisionSystem.onCollide('bullet', 'enemy', {
  onEnter(a, b) { /* first frame of overlap */ },
  onStay(a, b)  { /* each subsequent frame while overlapping */ },
  onExit(a, b)  { /* first frame after separation */ },
});
```

## Collision Groups and Masks

The `Collider` component supports bitmask-based filtering:

```ts
export interface Collider {
  type: "circle" | "rect";
  width: number;
  height: number;
  group?: number;  // default 1
  mask?: number;   // default 0xFFFFFFFF (all groups)
}
```

Two entities interact only when both conditions hold:
- `(a.group & b.mask) !== 0`
- `(b.group & a.mask) !== 0`

This allows selective collision layers:

```ts
// Bullet (group 2) only hits enemies (group 4)
engine.spawn({
  collider: { type: "rect", width: 4, height: 4, group: 2, mask: 4 },
  tags: { values: new Set(["bullet"]) }, // ...
});
// Enemy (group 4) hit by player (1) and bullets (2)
engine.spawn({
  collider: { type: "rect", width: 16, height: 16, group: 4, mask: 0b011 },
  tags: { values: new Set(["enemy"]) }, // ...
});
```

## Pair Tracking

The system assigns a stable numeric ID to each entity via a WeakMap. Pairs are tracked by a composite key of `handlerIndex:idA:idB` (canonicalized so the lower ID comes first). Enter fires only on the first overlap frame; exit fires once when the pair separates. Multiple handlers for the same tag pair are tracked independently.

## Unsubscribe Pattern

Always store the unsubscribe function and call it during cleanup to prevent stale callbacks:

```ts
const scene = defineScene({
  name: "play",
  setup(engine) {
    const unsub = engine.onCollide("bullet", "enemy", (bullet, enemy) => {
      engine.destroy(bullet);
      enemy.health!.current -= 10;
    });

    return { unsub };
  },
  cleanup(_engine, state) {
    state.unsub();
  },
});
```

## Execution Order

The system runs at `SystemPriority.physics + 1` (21), immediately after `_physics` (20) integrates positions.

## See Also

- [[collision-detection]] -- the underlying `overlaps()` function and spatial hash used for broad-phase checks
- [[physics-system]] -- velocity integration that determines entity positions before collision checks
- [[component-reference]] -- full Collider interface including group/mask fields
