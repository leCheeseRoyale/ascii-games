/**
 * Engine — the main orchestrator.
 *
 * Owns: ECS world, renderer, input, camera, game loop, scene manager.
 * Exposes a clean API for scenes and systems to use.
 *
 * Lifecycle:
 *   1. new Engine(canvas, config)
 *   2. engine.registerScene(scene)
 *   3. engine.start('title')  — loads the scene and starts the loop
 *   4. Per frame: input.update → systems.update → scene.update → render
 *   5. engine.stop() — cleanup
 */

import type { Entity, EngineConfig, GameTime } from '@shared/types'
import { DEFAULT_CONFIG } from '@shared/types'
import { events } from '@shared/events'
import { createWorld, type GameWorld } from '../ecs/world'
import { SystemRunner, type System } from '../ecs/systems'
import { GameLoop } from './game-loop'
import { SceneManager, type Scene } from './scene'
import { AsciiRenderer } from '../render/ascii-renderer'
import { Camera } from '../render/camera'
import { Keyboard } from '../input/keyboard'
import { Mouse } from '../input/mouse'

export class Engine {
  // ── Public API (what scenes and systems use) ──────────────────
  readonly config: EngineConfig
  readonly world: GameWorld
  readonly systems: SystemRunner
  readonly scenes: SceneManager
  readonly renderer: AsciiRenderer
  readonly camera: Camera
  readonly keyboard: Keyboard
  readonly mouse: Mouse

  /** Current frame timing info. */
  get time(): GameTime {
    return {
      dt: this.loop.fixedDt,
      elapsed: this.loop.elapsed,
      frame: this.loop.frame,
      fps: this.loop.fps,
    }
  }

  /** Canvas dimensions. */
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

    this.loop = new GameLoop(
      {
        update: (dt) => this.update(dt),
        render: () => this.render(),
      },
      this.config.targetFps,
    )

    // Resize on mount + window resize
    this.renderer.resize()
    const onResize = () => this.renderer.resize()
    window.addEventListener('resize', onResize)

    // Store cleanup ref
    ;(this as any)._onResize = onResize
  }

  // ── Entity helpers ────────────────────────────────────────────

  /** Spawn an entity with the given components. */
  spawn(components: Partial<Entity>) {
    return this.world.add(components as Entity)
  }

  /** Remove an entity. */
  destroy(entity: Entity): void {
    this.world.remove(entity)
  }

  // ── System helpers ────────────────────────────────────────────

  /** Add a system to the update loop. */
  addSystem(system: System): void {
    this.systems.add(system, this)
  }

  /** Remove a system by name. */
  removeSystem(name: string): void {
    this.systems.remove(name, this)
  }

  // ── Scene helpers ─────────────────────────────────────────────

  /** Register a scene (does not load it). */
  registerScene(scene: Scene): void {
    this.scenes.register(scene)
  }

  /** Load a scene by name. Cleans up the current scene first. */
  async loadScene(name: string): Promise<void> {
    await this.scenes.load(name, this)
    events.emit('scene:loaded', name)
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  /** Start the engine with the given scene. */
  async start(sceneName: string): Promise<void> {
    await this.loadScene(sceneName)
    this.loop.start()
    events.emit('engine:started')
  }

  /** Stop the engine. */
  stop(): void {
    this.loop.stop()
    this.scenes.current?.cleanup?.(this)
    this.systems.clear(this)
    this.keyboard.destroy()
    this.mouse.destroy()
    window.removeEventListener('resize', (this as any)._onResize)
    events.emit('engine:stopped')
  }

  /** Pause the game loop (rendering continues, updates stop). */
  pause(): void {
    this.loop.pause()
    events.emit('engine:paused')
  }

  /** Resume from pause. */
  resume(): void {
    this.loop.resume()
    events.emit('engine:resumed')
  }

  get isPaused(): boolean { return this.loop.isPaused }

  // ── Frame lifecycle (private) ─────────────────────────────────

  private update(dt: number): void {
    // 1. Input
    this.keyboard.update()
    this.mouse.update()

    // 2. Systems
    this.systems.update(this, dt)

    // 3. Scene update
    this.scenes.update(this, dt)

    // 4. Camera
    this.camera.update(dt)
  }

  private render(): void {
    this.renderer.render(this.world, this.config, this.camera)
  }
}
