---
title: Juice Helpers
created: 2026-04-21
updated: 2026-04-21
type: reference
tags: [engine, rendering, animation, feedback]
sources: [engine/core/engine.ts]
---

# Juice Helpers

Quick-fire visual and physical feedback methods on the `Engine` instance. These are the one-liner "game feel" tools -- screen flashes, entity blinks, knockback impulses, and global time scaling.

## engine.flash(color?, duration?)

Draws a full-screen color overlay that fades out over the given duration. Renders on top of the game world but under scene transitions.

```ts
flash(color = "#ffffff", duration = 0.15): void
```

The overlay alpha is linearly interpolated from full opacity to zero over `duration` seconds. Internally tracked as `{ color, remaining, duration }` and ticked in the main render loop.

```ts
engine.flash("#ff0000", 0.2)   // red flash for damage
engine.flash("#ffcc00", 0.1)   // gold flash for pickup
engine.flash()                 // default white, 150ms
```

## engine.blink(entity, duration?, interval?)

Oscillates an entity's opacity between its original value and 0 at a fixed interval, then restores the original opacity. Useful for invincibility frames or warning flickers.

```ts
blink(entity: Partial<Entity>, duration = 0.5, interval = 0.1): void
```

Uses `engine.every(interval, ...)` internally -- the timer is automatically cancelled when the duration elapses. Works with both `ascii` and `sprite` components.

```ts
engine.blink(player, 1.0, 0.08)   // 1 second of fast blinking
```

## engine.knockback(entity, fromX, fromY, force)

Applies an instantaneous velocity impulse away from a point. The direction is computed from the entity's position relative to `(fromX, fromY)`, normalized, then scaled by `force`. Requires the entity to have both `position` and `velocity` components.

```ts
knockback(entity: Partial<Entity>, fromX: number, fromY: number, force: number): void
```

Implementation detail: uses `Math.hypot` for distance, falls back to 1 if distance is zero (avoids NaN).

```ts
// Push the player away from an explosion at (200, 150)
engine.knockback(player, 200, 150, 500)
```

## engine.timeScale

A global multiplier on delta-time that affects every system. Delegates to `GameLoop.timeScale`. Normal speed is 1.

```ts
get timeScale(): number
set timeScale(value: number)
```

```ts
engine.timeScale = 0.3   // slow-motion (30% speed)
engine.timeScale = 1     // resume normal
engine.timeScale = 2     // double speed
```

All built-in systems (`_physics`, `_tween`, `_animation`, `_spring`, etc.) receive the scaled dt, so slow-motion "just works" without per-system changes.

## Usage: Damage Response Pattern

Combining all four helpers for a complete hit-reaction:

```ts
function onPlayerHit(engine: Engine, player: Partial<Entity>, enemy: Partial<Entity>) {
  // Screen flash -- red tint
  engine.flash("#ff0000", 0.15)

  // Knockback away from the enemy
  engine.knockback(player, enemy.position!.x, enemy.position!.y, 400)

  // Invincibility blink
  engine.blink(player, 0.8, 0.08)

  // Brief slow-motion for impact emphasis
  engine.timeScale = 0.3
  engine.after(0.2, () => { engine.timeScale = 1 })
}
```

For the physics that integrates the knockback velocity, see [[physics-system]]. For the rendering pipeline that draws the flash overlay, see [[renderer]]. For a high-level view of all engine APIs, see [[engine-overview]].
