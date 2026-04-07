/**
 * Engine — the main orchestrator.
 *
 * Owns: ECS world, renderer, input, camera, particles, scheduler, game loop, scenes.
 * Exposes a clean API for scenes and systems to use.
 *
 * Lifecycle:
 *   1. new Engine(canvas, config)
 *   2. engine.registerScene(scene)
 *   3. engine.start('title')
 *   4. Per frame: input → systems → tweens → scene.update → timers → camera → render
 *   5. engine.stop()
 */

import type { Entity, EngineConfig, GameTime, TweenEntry } from '@shared/types'
import { DEFAULT_CONFIG } from '@shared/types'
import { events } from '@shared/events'
import { createWorld, type GameWorld } from '../ecs/world'
import { SystemRunner, type System } from '../ecs/systems'
import { GameLoop } from './game-loop'
import { SceneManager, type Scene } from './scene'
import { AsciiRenderer } from '../render/ascii-renderer'
import { Camera } from '../render/camera'
import { ParticlePool } from '../render/particles'
import { Keyboard } from '../input/keyboard'
import { Mouse } from '../input/mouse'
import { Scheduler } from '../utils/scheduler'
import { tweenSystem } from '../ecs/tween-system'

export class Engine {
  // ── Public API ────────────────────────────────────────────────
  readonly config: EngineConfig
  readonly world: GameWorld
  readonly systems: SystemRunner
  readonly scenes: SceneManager
  readonly renderer: AsciiRenderer
  readonly camera: Camera
  readonly keyboard: Keyboard
  readonly mouse: Mouse
  readonly particles: ParticlePool
  readonly scheduler: Scheduler

  get time(): GameTime {
    return {
      dt: this.loop.fixedDt,
      elapsed: this.loop.elapsed,
      frame: this.loop.frame,
      fps: this.loop.fps,
    }
  }

  get width(): number { return this.renderer.width }
  get height(): number { return this.renderer.height }

  // ── Private ───────────────────────────────────────────────────
  private loop: GameLoop

  constructor(canvas: HTMLCanvasElement, config: Partial<EngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.world = createWorld()
    this.systems = new SystemRunner()
    this.scenes = new SceneManager()
    this.renderer = new AsciiRenderer(canvas)
    this.camera = new Camera()
    this.keyboard = new Keyboard()
    this.mouse = new Mouse(canvas)
    this.particles = new ParticlePool()
    this.scheduler = new Scheduler()

    this.loop = new GameLoop(
      {
        update: (dt) => this.update(dt),
        render: () => this.render(),
      },
      this.config.targetFps,
    )

    this.renderer.resize()
    const onResize = () => {
      this.renderer.resize()
      this.camera.viewWidth = this.renderer.width
      this.camera.viewHeight = this.renderer.height
    }
    window.addEventListener('resize', onResize)
    onResize()
    ;(this as any)._onResize = onResize
  }

  // ── Entity helpers ────────────────────────────────────────────

  spawn(components: Partial<Entity>) {
    return this.world.add(components as Entity)
  }

  destroy(entity: Entity): void {
    this.world.remove(entity)
  }

  // ── Tween helper ──────────────────────────────────────────────

  /** Add a tween to an entity. Convenience wrapper. */
  tweenEntity(
    entity: Partial<Entity>,
    property: string,
    from: number,
    to: number,
    duration: number,
    ease: TweenEntry['ease'] = 'easeOut',
    destroyOnComplete = false,
  ): void {
    const e = entity as any
    if (!e.tween) {
      e.tween = { tweens: [] }
    }
    e.tween.tweens.push({ property, from, to, duration, elapsed: 0, ease, destroyOnComplete })
  }

  // ── Timer helpers (delegate to scheduler) ─────────────────────

  /** Schedule a one-shot callback after `seconds`. Returns cancel ID. */
  after(seconds: number, callback: () => void): number {
    return this.scheduler.after(seconds, callback)
  }

  /** Schedule a repeating callback every `seconds`. Returns cancel ID. */
  every(seconds: number, callback: () => void): number {
    return this.scheduler.every(seconds, callback)
  }

  /** Chain a sequence of delayed callbacks. Returns cancel ID. */
  sequence(steps: { delay: number; fn: () => void }[]): number {
    return this.scheduler.sequence(steps)
  }

  /** Cancel a scheduled timer. */
  cancelTimer(id: number): void {
    this.scheduler.cancel(id)
  }

  // ── System helpers ────────────────────────────────────────────

  addSystem(system: System): void {
    this.systems.add(system, this)
  }

  removeSystem(name: string): void {
    this.systems.remove(name, this)
  }

  // ── Scene helpers ─────────────────────────────────────────────

  registerScene(scene: Scene): void {
    this.scenes.register(scene)
  }

  async loadScene(name: string): Promise<void> {
    // Clear timers and particles on scene change
    this.scheduler.clear()
    this.particles.clear()
    await this.scenes.load(name, this)
    // Always have the tween system active
    this.systems.add(tweenSystem, this)
    events.emit('scene:loaded', name)
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  async start(sceneName: string): Promise<void> {
    await this.loadScene(sceneName)
    this.loop.start()
    events.emit('engine:started')
  }

  stop(): void {
    this.loop.stop()
    this.scenes.current?.cleanup?.(this)
    this.systems.clear(this)
    this.scheduler.clear()
    this.keyboard.destroy()
    this.mouse.destroy()
    window.removeEventListener('resize', (this as any)._onResize)
    events.emit('engine:stopped')
  }

  pause(): void {
    this.loop.pause()
    events.emit('engine:paused')
  }

  resume(): void {
    this.loop.resume()
    events.emit('engine:resumed')
  }

  get isPaused(): boolean { return this.loop.isPaused }

  // ── Frame lifecycle (private) ─────────────────────────────────

  private update(dt: number): void {
    this.keyboard.update()
    this.mouse.update()
    this.systems.update(this, dt)     // includes tweenSystem
    this.scenes.update(this, dt)
    this.scheduler.update(dt)
    this.particles.update(dt)
    this.camera.update(dt)
  }

  private render(): void {
    this.renderer.render(this.world, this.config, this.camera, this.particles)
  }
}
