---
title: Animation System
created: 2026-04-07
updated: 2026-04-07
type: system
tags: [engine, system, animation]
sources: [engine/ecs/animation-system.ts, shared/types.ts]
---

# Animation System

The animation system (`_animation`) drives frame-by-frame sprite and character animations. It auto-registers on scene load and handles frame advancement, looping, and completion behavior.

## Interfaces

```ts
export interface AnimationFrame {
  char?: string
  lines?: string[]
  color?: string
  duration?: number
}

export interface Animation {
  frames: AnimationFrame[]
  frameDuration: number
  currentFrame: number
  elapsed: number
  loop?: boolean
  playing?: boolean
  onComplete?: 'destroy' | 'stop'
}
```

## How It Works

Each frame, the system queries all entities that have an `animation` component. For each playing animation, it accumulates elapsed time. When the elapsed time exceeds the current frame's duration, it advances to the next frame and applies that frame's visual properties to the entity.

- **ASCII entities** (`char`): the frame's `char` value replaces the entity's displayed character.
- **Sprite entities** (`lines`): the frame's `lines` array replaces the entity's multi-line sprite.
- **Color**: if a frame specifies `color`, it is applied to the entity for that frame's duration.

## Per-Frame Duration Override

The global `frameDuration` on the Animation component sets the default time **in seconds** each frame is displayed. For example, `0.1` means 100ms per frame. Individual frames can override this by setting their own `duration` field (also in seconds), allowing variable-speed animations like a slow windup followed by a fast strike.

The system accumulates elapsed time each frame: `anim.elapsed += dt` (where `dt` is in seconds). When `elapsed >= frameDuration`, it advances to the next frame.

## Loop and Playback Control

- `loop` (default: `true`): when the animation reaches the last frame, it wraps back to frame 0.
- `playing` (default: `true`): set to `false` to pause the animation on the current frame.

## onComplete Behavior

When a non-looping animation reaches its final frame:
- `'destroy'`: the entity is removed from the world entirely. Useful for one-shot effects like explosions.
- `'stop'`: the animation freezes on the last frame and `playing` is set to `false`.

If `onComplete` is not specified, the animation simply stops advancing.

## Engine Helpers

**`engine.playAnimation(entity, frames, frameDuration, loop)`**
Sets up the animation component on the given entity and begins playback. The first frame is applied immediately so there is no single-frame delay before the animation is visible.

**`engine.stopAnimation(entity)`**
Stops playback by setting `playing = false` on the animation component. The component is **not** removed — the entity keeps its current frame displayed. You can resume by setting `entity.animation.playing = true`.

```ts
// engine/core/engine.ts
stopAnimation(entity: Partial<Entity>): void {
  const e = entity as any
  if (e.animation) e.animation.playing = false
}
```

## Execution Order

The `_animation` system runs after `_tween`. This means tweened properties (like position or color) are applied first, and then animation frames can layer on top.

## Usage Examples

**Character walk cycle (looping):**
```ts
engine.playAnimation(player, [
  { char: '|' },
  { char: '/' },
  { char: '|' },
  { char: '\\' }
], 0.15, true)
```

**Blinking cursor:**
```ts
engine.playAnimation(cursor, [
  { char: '_', duration: 0.5 },
  { char: ' ', duration: 0.5 }
], 0.5, true)
```

**Explosion that self-destructs:**
```ts
engine.spawn({
  position: { x: 20, y: 10 },
  ascii: { char: '*' },
  animation: {
    frames: [
      { char: '.', color: 'yellow' },
      { char: 'o', color: 'orange' },
      { char: 'O', color: 'red' },
      { char: '*', color: 'darkred' },
      { char: '.', color: 'gray' }
    ],
    frameDuration: 0.08,
    currentFrame: 0,
    elapsed: 0,
    loop: false,
    onComplete: 'destroy'
  }
})
```

## See Also

For a complete list of entity components, see [[component-reference]]. To understand how built-in systems are scheduled, see [[system-runner]]. For a broad overview of engine architecture, see [[engine-overview]].
