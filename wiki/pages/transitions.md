---
title: Transitions
created: 2026-04-07
updated: 2026-04-07
type: component
tags: [rendering, scene, transitions, engine]
sources: [engine/render/transitions.ts]
---

# Transitions

The transition system provides visual effects when switching between scenes. It renders a full-screen overlay that animates out, triggers a midpoint callback to swap the scene, then animates back in. Transitions integrate directly with [[scene-lifecycle]] via `engine.loadScene`.

## TransitionType

```ts
export type TransitionType = 'fade' | 'fadeWhite' | 'wipe' | 'none'
```

- `fade` — Screen fades to black, then fades back in
- `fadeWhite` — Same as fade but through white instead of black
- `wipe` — A horizontal wipe sweeps across the screen
- `none` — No visual transition; scene swaps immediately

## Transition Class

```ts
export class Transition {
  type: TransitionType
  duration: number
  elapsed: number
  active: boolean
  phase: 'out' | 'in'

  start(onMidpoint?: () => void): void
  update(dt: number): void
  render(ctx: CanvasRenderingContext2D, width: number, height: number): void
}
```

### Lifecycle

1. `start(onMidpoint)` — Sets `active = true`, `elapsed = 0`, `phase = 'out'`, stores the midpoint callback
2. `update(dt)` — Advances `elapsed` by `dt`. When elapsed reaches `duration / 2`, fires the midpoint callback and flips `phase` to `'in'`. When elapsed reaches `duration`, sets `active = false`
3. `render(ctx, width, height)` — Draws the overlay effect on top of the scene. The effect intensity is based on progress within the current phase (0→1 during out, 1→0 during in)

The two-phase design ensures the old scene is fully obscured before the swap happens, so the player never sees a half-constructed scene.

## Engine Integration

When `engine.loadScene` is called with a transition option, the engine configures and starts the Transition instance:

```ts
if (opts?.transition && opts.transition !== 'none') {
  this.transition.type = opts.transition
  this.transition.duration = opts.duration ?? 0.4
  this.transition.start(async () => {
    // midpoint: cleanup old scene, clear world, run new scene setup
  })
}
```

The midpoint callback performs the full scene swap — calling `cleanup()` on the old scene, clearing the ECS world, then calling `setup()` on the new scene and registering its systems. This all happens while the screen is fully covered by the transition overlay.

The [[game-loop]] calls `transition.update(dt)` every frame while the transition is active, and the [[renderer]] calls `transition.render()` as the final draw step so the overlay sits on top of all scene content.

## Default Duration

The default transition duration is `0.4` seconds (400ms) — 200ms for the out phase and 200ms for the in phase. This can be overridden per call:

```ts
engine.loadScene('menu', { transition: 'fade', duration: 0.8 })
```

## Related

- [[scene-lifecycle]] — Scene setup/cleanup flow that transitions wrap around
- [[engine-overview]] — Engine.loadScene API and frame lifecycle
- [[renderer]] — Final render step where transition overlay is drawn
