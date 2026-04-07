---
title: Game Loop
created: 2026-04-07
updated: 2026-04-07
type: architecture
tags:
  - engine
  - core
  - game-loop
  - timing
sources:
  - engine/core/game-loop.ts
  - engine/core/engine.ts
---

# Game Loop

The `GameLoop` class implements a fixed-timestep game loop using `requestAnimationFrame`. It provides deterministic physics updates at a fixed rate while allowing rendering to run at the browser's native refresh rate.

## Why Fixed Timestep?

Variable delta time causes physics instability — collisions behave differently at different frame rates, and fast machines get different gameplay than slow ones. A fixed timestep guarantees that `update(dt)` always receives the same `dt` value (1/60 = ~0.0167s by default), making physics deterministic regardless of actual frame rate.

## The Accumulator Pattern

The core technique is the **accumulator pattern**: real elapsed time is accumulated, and fixed-size update steps are consumed from it. Rendering happens once per frame regardless of how many updates ran.

```ts
// engine/core/game-loop.ts
private tick = (now: number): void => {
  if (!this.running) return
  this.rafId = requestAnimationFrame(this.tick)

  const rawDt = (now - this.lastTime) / 1000
  this.lastTime = now

  // FPS counter
  this.frameCount++
  if (now - this.fpsTime >= 1000) {
    this.fps = this.frameCount
    this.frameCount = 0
    this.fpsTime = now
  }

  if (this.paused) {
    this.callbacks.render()
    return
  }

  // Clamp to avoid spiral of death
  const dt = Math.min(rawDt, 0.1)
  this.accumulator += dt

  // Fixed timestep updates
  while (this.accumulator >= this.fixedDt) {
    this.callbacks.update(this.fixedDt)
    this.elapsed += this.fixedDt
    this.frame++
    this.accumulator -= this.fixedDt
  }

  // Render once per frame
  this.callbacks.render()
}
```

## Spiral-of-Death Clamping

If the browser tab is backgrounded or the machine stalls, `rawDt` can spike to several seconds. Without protection, the accumulator would contain hundreds of fixed-step updates, freezing the browser as it tries to catch up (the "spiral of death").

The fix is simple: clamp `rawDt` to a maximum of **0.1 seconds** (100ms). This means the game will appear to slow down rather than freeze during lag spikes:

```ts
const dt = Math.min(rawDt, 0.1)
```

At 60 FPS with `fixedDt = 1/60`, a 0.1s clamp allows at most 6 update steps per frame — a safe upper bound.

## Class Structure

```ts
export class GameLoop {
  readonly fixedDt: number    // 1/targetFps (default: 1/60)
  elapsed = 0                 // total simulated time
  frame = 0                   // total update frames
  fps = 0                     // measured FPS (updated once per second)

  constructor(callbacks: GameLoopCallbacks, targetFps = 60)

  start(): void     // begin RAF loop
  stop(): void      // cancel RAF
  pause(): void     // skip updates, still render
  resume(): void    // resume updates
  get isPaused(): boolean
  get isRunning(): boolean
}
```

## FPS Measurement

FPS is measured by counting frames over a 1-second window. Every time 1000ms has elapsed since the last measurement, `fps` is set to the frame count and the counter resets. This gives a stable, human-readable number without per-frame noise.

## Pause Behavior

When paused, the loop continues to call `render()` (the screen stays visible) but skips all `update()` calls. The accumulator is not modified. This means unpausing resumes exactly where the game left off with no time jump.

## Integration with Engine

The `Engine` class creates the `GameLoop` in its constructor, wiring in the update and render callbacks:

```ts
// engine/core/engine.ts
this.loop = new GameLoop(
  {
    update: (dt) => this.update(dt),
    render: () => this.render(),
  },
  this.config.targetFps,
)
```

The engine's `start()` method calls `this.loop.start()` after loading the initial scene. `stop()` calls `this.loop.stop()`.

## Related Pages

- [[engine-overview]] — How the game loop fits into the overall architecture
- [[scene-lifecycle]] — Scenes are updated within each fixed timestep
- [[system-runner]] — Systems execute during the update step
