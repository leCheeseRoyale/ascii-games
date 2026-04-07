---
title: Physics System
created: 2026-04-07
updated: 2026-04-07
type: system
tags: [physics, engine, system, velocity]
sources: [engine/physics/physics-system.ts, shared/types.ts]
---

# Physics System

The physics system (`_physics`) handles velocity integration, gravity, friction, drag, and world-bounds bouncing. It auto-registers on scene load and runs as part of the built-in system pipeline.

## Physics Component Interface

```ts
export interface Physics {
  gravity?: number      // pixels/s^2 added to vy each frame (default 0)
  friction?: number     // 0-1, ground friction multiplier on vx (default 0)
  drag?: number         // 0-1, air resistance on both axes (default 0)
  bounce?: number       // 0-1, velocity retention on bounce (0 = no bounce, 1 = perfect)
  maxSpeed?: number     // max velocity magnitude
  mass?: number         // for future collision response (default 1)
  grounded?: boolean    // set by system when entity is on ground (world bottom)
}
```

## 4-Pass Pipeline

The system processes entities in four sequential passes each frame:

**Pass 1 — Acceleration to Velocity**
Queries all entities that have `position`, `velocity`, and `acceleration` components. Adds acceleration scaled by delta-time onto velocity.

**Pass 2 — Physics Forces**
Queries entities that have the `physics` component and applies forces in order:
- Gravity: added to `vy` each frame (`vy += gravity * dt`)
- Friction: applied to `vx` when the entity is grounded (`vx *= 1 - friction`)
- Drag: applied to both `vx` and `vy` as air resistance (`v *= 1 - drag`)
- Max speed clamp: if `maxSpeed` is set, the velocity magnitude is clamped to that value

**Pass 3 — Velocity to Position**
Queries all entities with `position` and `velocity`. Updates position by adding velocity scaled by delta-time.

**Pass 4 — World-Bounds Bounce**
Queries entities with `physics` and `collider` components. When an entity crosses a world boundary, its position is clamped to the boundary edge and the relevant velocity axis is reversed and multiplied by the `bounce` restitution coefficient.

## Grounded Detection

The system automatically sets `physics.grounded = true` when an entity's bottom edge touches the bottom boundary of the world. This flag is used by Pass 2 to determine whether ground friction should apply.

## Execution Order

The `_physics` system runs after `_parent` and before `_tween` and `_animation`. This ensures that parented entities have their correct world positions before physics is applied, and that tweens/animations can override physics results if needed.

## Usage Examples

**Platformer entity with gravity and bounce:**
```ts
engine.spawn({
  position: { x: 10, y: 5 },
  velocity: { x: 2, y: 0 },
  physics: { gravity: 60, bounce: 0.4, friction: 0.3 },
  collider: { width: 1, height: 1 },
  ascii: { char: '@' }
})
```

**Space ship with drag and max speed:**
```ts
engine.spawn({
  position: { x: 40, y: 20 },
  velocity: { x: 0, y: 0 },
  acceleration: { x: 0, y: 0 },
  physics: { drag: 0.02, maxSpeed: 30 },
  ascii: { char: '^' }
})
```

## Notes

This system handles velocity integration internally. If you are using the built-in physics, you typically do not need a separate movement system for those entities — doing so would double-apply velocity changes. Use acceleration or direct velocity manipulation in your game systems and let `_physics` handle the rest.

For a full list of built-in components, see [[component-reference]]. For information on how entities interact spatially, see [[collision-detection]]. For a high-level view of all engine systems, see [[engine-overview]].
