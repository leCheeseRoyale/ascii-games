/**
 * Game loop with fixed timestep for physics, variable for rendering.
 *
 * Uses requestAnimationFrame. Measures real FPS.
 * The update callback receives a fixed dt (1/targetFps).
 * The render callback runs once per frame.
 */

export interface GameLoopCallbacks {
  update: (dt: number) => void
  render: () => void
}

export class GameLoop {
  private running = false
  private paused = false
  private rafId = 0
  private lastTime = 0
  private accumulator = 0
  private frameCount = 0
  private fpsTime = 0

  readonly fixedDt: number
  elapsed = 0
  frame = 0
  fps = 0

  constructor(
    private callbacks: GameLoopCallbacks,
    targetFps = 60,
  ) {
    this.fixedDt = 1 / targetFps
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.lastTime = performance.now()
    this.fpsTime = this.lastTime
    this.tick(this.lastTime)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.rafId)
  }

  pause(): void { this.paused = true }
  resume(): void { this.paused = false }
  get isPaused(): boolean { return this.paused }
  get isRunning(): boolean { return this.running }

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
}
