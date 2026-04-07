---
title: Tween System
created: 2026-04-07
updated: 2026-04-07
type: system
tags: [engine, system, animation, tween]
sources: [engine/ecs/tween-system.ts, shared/types.ts]
---

# Tween System

The tween system smoothly interpolates numeric entity properties over time. It supports dot-path property targeting, four easing functions, and automatic cleanup. Unlike the [[animation-system]] which cycles through discrete frames, tweens provide continuous value interpolation.

## Interfaces

```ts
export interface TweenEntry {
  property: string       // dot-path e.g. 'position.x'
  from: number
  to: number
  duration: number
  elapsed: number
  ease: 'linear' | 'easeOut' | 'easeIn' | 'easeInOut'
  destroyOnComplete?: boolean
}

export interface Tween {
  tweens: TweenEntry[]
}
```

An entity's `tween` component holds an array of `TweenEntry` objects. Each entry independently animates a single numeric property. Multiple tweens on the same entity run in parallel.

## Dot-Path Property Targeting

The `property` field uses dot notation to target nested properties. For example `'position.x'` resolves to `entity.position.x`. An internal `setNestedProp` helper walks the path and sets the final value. This works with any numeric property on the entity — position, opacity, scale, rotation, or custom fields.

## Easing Functions

Four built-in easing curves are available:

| Ease | Formula | Character |
|------|---------|-----------|
| `linear` | `t` | Constant speed |
| `easeOut` | `1 - (1 - t)^2` | Fast start, slow end |
| `easeIn` | `t^2` | Slow start, fast end |
| `easeInOut` | Piecewise quadratic | Smooth acceleration and deceleration |

The normalized time `t` ranges from 0 to 1 based on `elapsed / duration`.

## System Update

Each frame, the tween system iterates all entities with a `tween` component (queried from the [[ecs-architecture]] world):

1. For each `TweenEntry`, advance `elapsed` by `dt`
2. Compute `t = clamp(elapsed / duration, 0, 1)`
3. Apply the easing function to get the interpolated `t`
4. Set the property value: `from + (to - from) * easedT`
5. If `t >= 1`, the tween is complete:
   - If `destroyOnComplete` is set, remove the entire entity from the world
   - Otherwise, remove just that tween entry from the array
6. When all entries are gone, remove the `tween` component from the entity

## engine.tweenEntity Helper

A convenience method on the [[engine-overview]] class:

```ts
engine.tweenEntity(
  entity,          // target entity
  property,        // dot-path string e.g. 'position.y'
  from,            // start value
  to,              // end value
  duration,        // seconds
  ease = 'easeOut',
  destroyOnComplete = false
)
```

This creates or appends to the entity's `tween` component. If the entity already has active tweens, the new entry is pushed onto the existing array. This lets you chain or layer tweens:

```ts
engine.tweenEntity(entity, 'position.x', 0, 200, 1.0, 'easeOut')
engine.tweenEntity(entity, 'position.y', 0, -50, 0.5, 'easeIn')
```

## Auto-Cleanup

The system handles all lifecycle automatically:
- Completed tween entries are removed from the array each frame
- When an entity's tween array is empty, the tween component is removed
- If `destroyOnComplete` is true on any entry, the entity itself is removed from the world via `engine.world.remove(entity)`

This makes tweens fire-and-forget — no manual cleanup needed in [[scene-lifecycle]] or system code.

## Related

- [[animation-system]] — Frame-based animation (complementary to tweens)
- [[component-reference]] — Tween and TweenEntry component definitions
- [[engine-overview]] — The tweenEntity() helper method
- [[utility-reference]] — lerp, clamp, and other math utilities used internally
