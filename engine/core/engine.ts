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

import { events } from "@shared/events";
import type { AnimationFrame, EngineConfig, Entity, GameTime, TweenEntry } from "@shared/types";
import { DEFAULT_CONFIG } from "@shared/types";
import { animationSystem } from "../ecs/animation-system";
import { emitterSystem } from "../ecs/emitter-system";
import { lifetimeSystem } from "../ecs/lifetime-system";
import { parentSystem } from "../ecs/parent-system";
import { screenBoundsSystem } from "../ecs/screen-bounds-system";
import { stateMachineSystem } from "../ecs/state-machine-system";
import { type System, SystemRunner } from "../ecs/systems";
import { tweenSystem } from "../ecs/tween-system";
import { createWorld, type GameWorld } from "../ecs/world";
import { Gamepad } from "../input/gamepad";
import { Keyboard } from "../input/keyboard";
import { Mouse } from "../input/mouse";
import { physicsSystem } from "../physics/physics-system";
import { AsciiRenderer } from "../render/ascii-renderer";
import { Camera } from "../render/camera";
import { CanvasUI, DialogManager } from "../render/canvas-ui";
import { DebugOverlay } from "../render/debug";
import { loadImage, preloadImages } from "../render/image-loader";
import { ParticlePool } from "../render/particles";
import { ToastManager } from "../render/toast";
import { Transition, type TransitionType } from "../render/transitions";
import { Viewport } from "../render/viewport";
import { Scheduler } from "../utils/scheduler";
import { buildGameScene, type GameDefinition, GameRuntime } from "./define-game";
import { GameLoop } from "./game-loop";
import { type Scene, SceneManager } from "./scene";
import { TurnManager } from "./turn-manager";

const BUILTIN_SYSTEMS = [
  parentSystem,
  physicsSystem,
  tweenSystem,
  animationSystem,
  emitterSystem,
  stateMachineSystem,
  lifetimeSystem,
  screenBoundsSystem,
];

export class Engine {
  // ── Public API ────────────────────────────────────────────────
  readonly config: EngineConfig;
  readonly world: GameWorld;
  readonly systems: SystemRunner;
  readonly scenes: SceneManager;
  readonly renderer: AsciiRenderer;
  readonly camera: Camera;
  readonly keyboard: Keyboard;
  readonly mouse: Mouse;
  readonly gamepad: Gamepad;
  readonly particles: ParticlePool;
  readonly scheduler: Scheduler;
  readonly transition: Transition;
  readonly debug: DebugOverlay;
  readonly toast: ToastManager;
  readonly turns: TurnManager;
  readonly ui: CanvasUI;
  readonly dialog: DialogManager;
  readonly viewport: Viewport;

  get time(): GameTime {
    return {
      dt: this.loop.fixedDt,
      elapsed: this.loop.elapsed,
      frame: this.loop.frame,
      fps: this.loop.fps,
    };
  }

  get width(): number {
    return this.renderer.width;
  }
  get height(): number {
    return this.renderer.height;
  }

  get centerX(): number {
    return this.renderer.width / 2;
  }
  get centerY(): number {
    return this.renderer.height / 2;
  }

  /** Seconds elapsed since the current scene loaded. Resets on scene change. */
  get sceneTime(): number {
    return this._sceneTime;
  }

  /** Data passed to the current scene via loadScene(name, { data }). */
  get sceneData(): Record<string, any> {
    return this._sceneData;
  }

  // ── Private ───────────────────────────────────────────────────
  private loop: GameLoop;
  private _onResize: (() => void) | null = null;
  private _sceneTime = 0;
  private _sceneData: Record<string, any> = {};

  constructor(canvas: HTMLCanvasElement, config: Partial<EngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.world = createWorld();
    this.systems = new SystemRunner();
    this.scenes = new SceneManager();
    this.renderer = new AsciiRenderer(canvas);
    this.camera = new Camera();
    this.keyboard = new Keyboard();
    this.mouse = new Mouse(canvas);
    this.gamepad = new Gamepad();
    this.particles = new ParticlePool();
    this.scheduler = new Scheduler();
    this.transition = new Transition();
    this.debug = new DebugOverlay();
    this.toast = new ToastManager();
    this.turns = new TurnManager();
    this.ui = new CanvasUI(canvas.getContext("2d")!);
    this.dialog = new DialogManager();
    this.viewport = new Viewport();

    // Wire debug overlay back to engine so the profiler can access
    // systems/world/scheduler when rendering.
    this.debug.setEngine(this);

    this.loop = new GameLoop(
      {
        update: (dt) => this.update(dt),
        render: () => this.render(),
      },
      this.config.targetFps,
    );

    this.renderer.resize();
    const onResize = () => {
      this.renderer.resize();
      this.camera.setViewport(this.renderer.width, this.renderer.height);
    };
    window.addEventListener("resize", onResize);
    onResize();
    this._onResize = onResize;
  }

  // ── Entity helpers ────────────────────────────────────────────

  spawn(components: Partial<Entity>) {
    this.validateEntity(components);
    return this.world.add(components as Entity);
  }

  private validateEntity(components: Partial<Entity>): void {
    const warnings: string[] = [];
    if (components.position) {
      if (
        components.position.x === undefined ||
        components.position.y === undefined ||
        Number.isNaN(components.position.x) ||
        Number.isNaN(components.position.y)
      ) {
        warnings.push("position.x or position.y is invalid");
      }
    }
    if (components.velocity) {
      if (
        components.velocity.vx === undefined ||
        components.velocity.vy === undefined ||
        Number.isNaN(components.velocity.vx) ||
        Number.isNaN(components.velocity.vy)
      ) {
        warnings.push("velocity will produce NaN");
      }
    }
    if (components.ascii) {
      if (!components.ascii.char || !components.ascii.font) {
        warnings.push("entity will be invisible (ascii.char or ascii.font is empty)");
      }
    }
    if (components.collider) {
      if (
        (components.collider.width != null && components.collider.width <= 0) ||
        (components.collider.height != null && components.collider.height <= 0)
      ) {
        warnings.push("collisions will not work (collider width/height <= 0)");
      }
    }
    if (components.velocity && !components.position) {
      warnings.push("velocity without position — physics will skip this entity");
    }
    if (components.physics && !components.velocity) {
      warnings.push("physics without velocity — gravity/drag will have no effect");
    }
    if (warnings.length > 0) {
      for (const w of warnings) console.warn(`[Engine.spawn] ${w}`);
      this.debug.showError(warnings[0]);
    }
  }

  destroy(entity: Entity): void {
    this.world.remove(entity);
  }

  /** Find first entity with the given tag. */
  findByTag(tag: string): Entity | undefined {
    for (const e of this.world.with("tags")) {
      if (e.tags.values.has(tag)) return e as Entity;
    }
    return undefined;
  }

  /** Find all entities with the given tag. */
  findAllByTag(tag: string): Entity[] {
    const result: Entity[] = [];
    for (const e of this.world.with("tags")) {
      if (e.tags.values.has(tag)) result.push(e as Entity);
    }
    return result;
  }

  /** Destroy all entities that have a given tag. */
  destroyAll(tag: string): number {
    const toRemove = this.findAllByTag(tag);
    for (const e of toRemove) this.world.remove(e);
    return toRemove.length;
  }

  /** Spawn floating text that rises and fades out, then self-destructs. */
  floatingText(
    x: number,
    y: number,
    text: string,
    color = "#ffffff",
    font = '16px "Fira Code", monospace',
  ): void {
    const entity = this.spawn({
      position: { x, y },
      ascii: { char: text, font, color, opacity: 1 },
    });
    this.tweenEntity(entity, "position.y", y, y - 40, 0.8, "easeOut");
    this.tweenEntity(entity, "ascii.opacity", 1, 0, 0.8, "linear", true);
  }

  /** Get a random position just off a random screen edge. */
  randomEdgePosition(margin = 30): {
    x: number;
    y: number;
    edge: "top" | "right" | "bottom" | "left";
  } {
    const w = this.width;
    const h = this.height;
    const edge = Math.floor(Math.random() * 4);
    switch (edge) {
      case 0:
        return { x: Math.random() * w, y: -margin, edge: "top" };
      case 1:
        return { x: w + margin, y: Math.random() * h, edge: "right" };
      case 2:
        return { x: Math.random() * w, y: h + margin, edge: "bottom" };
      default:
        return { x: -margin, y: Math.random() * h, edge: "left" };
    }
  }

  /** Spawn entities on a repeating timer. Returns cancel ID. */
  spawnEvery(seconds: number, factory: () => Partial<Entity>): number {
    return this.scheduler.every(seconds, () => {
      this.spawn(factory());
    });
  }

  // ── Tween helper ──────────────────────────────────────────────

  /** Add a tween to an entity. Convenience wrapper. */
  tweenEntity(
    entity: Partial<Entity>,
    property: string,
    from: number,
    to: number,
    duration: number,
    ease: TweenEntry["ease"] = "easeOut",
    destroyOnComplete = false,
  ): void {
    const e = entity as any;
    if (!e.tween) {
      e.tween = { tweens: [] };
    }
    e.tween.tweens.push({ property, from, to, duration, elapsed: 0, ease, destroyOnComplete });
  }

  // ── Animation helpers ────────────────────────────────────────────

  /** Play a named animation on an entity. */
  playAnimation(
    entity: Partial<Entity>,
    frames: AnimationFrame[],
    frameDuration = 0.1,
    loop = true,
  ): void {
    const e = entity as any;
    e.animation = { frames, frameDuration, currentFrame: 0, elapsed: 0, loop, playing: true };
    // Apply first frame immediately
    const first = frames[0];
    if (first.char && e.ascii) e.ascii.char = first.char;
    if (first.lines && e.sprite) e.sprite.lines = first.lines;
    if (first.color) {
      if (e.ascii) e.ascii.color = first.color;
      if (e.sprite) e.sprite.color = first.color;
    }
  }

  /** Stop animation on an entity. */
  stopAnimation(entity: Partial<Entity>): void {
    const e = entity as any;
    if (e.animation) e.animation.playing = false;
  }

  // ── Timer helpers (delegate to scheduler) ─────────────────────

  /** Schedule a one-shot callback after `seconds`. Returns cancel ID. */
  after(seconds: number, callback: () => void): number {
    return this.scheduler.after(seconds, callback);
  }

  /** Schedule a repeating callback every `seconds`. Returns cancel ID. */
  every(seconds: number, callback: () => void): number {
    return this.scheduler.every(seconds, callback);
  }

  /** Chain a sequence of delayed callbacks. Returns cancel ID. */
  sequence(steps: { delay: number; fn: () => void }[]): number {
    return this.scheduler.sequence(steps);
  }

  /** Cancel a scheduled timer. */
  cancelTimer(id: number): void {
    this.scheduler.cancel(id);
  }

  // ── Image helpers ──────────────────────────────────────────────

  /**
   * Load an image by URL. Cached — subsequent calls return instantly.
   * Place images in public/ and reference as '/myimage.png'.
   */
  loadImage(src: string): Promise<HTMLImageElement> {
    return loadImage(src);
  }

  /** Preload multiple images in parallel. Use in scene setup(). */
  preloadImages(srcs: string[]): Promise<HTMLImageElement[]> {
    return preloadImages(srcs);
  }

  // ── System helpers ────────────────────────────────────────────

  addSystem(system: System): void {
    this.systems.add(system, this);
  }

  removeSystem(name: string): void {
    this.systems.remove(name, this);
  }

  // ── Parent-child helpers ──────────────────────────────────────

  /** Attach a child entity to a parent. Child position becomes relative offset. */
  attachChild(
    parentEntity: Partial<Entity>,
    childEntity: Partial<Entity>,
    offsetX = 0,
    offsetY = 0,
  ): void {
    const p = parentEntity as any;
    const c = childEntity as any;

    // Set up child component
    c.child = { parent: parentEntity, offsetX, offsetY };

    // Set up parent tracking
    if (!p.parent) p.parent = { children: [] };
    if (!p.parent.children.includes(childEntity)) {
      p.parent.children.push(childEntity);
    }

    // Immediately sync position
    if (p.position && c.position) {
      c.position.x = p.position.x + offsetX;
      c.position.y = p.position.y + offsetY;
    }
  }

  /** Detach a child from its parent. Position stays at current world position. */
  detachChild(childEntity: Partial<Entity>): void {
    const c = childEntity as any;
    if (!c.child) return;

    const parentEntity = c.child.parent as any;
    if (parentEntity?.parent?.children) {
      const idx = parentEntity.parent.children.indexOf(childEntity);
      if (idx >= 0) parentEntity.parent.children.splice(idx, 1);
    }

    delete c.child;
  }

  /** Destroy an entity and all its children recursively. */
  destroyWithChildren(entity: Partial<Entity>): void {
    const p = entity as any;
    if (p.parent?.children) {
      for (const child of [...p.parent.children]) {
        this.destroyWithChildren(child);
      }
    }
    // Detach from own parent if any
    this.detachChild(entity);
    this.world.remove(entity as Entity);
  }

  // ── Scene helpers ─────────────────────────────────────────────

  registerScene(scene: Scene): void {
    this.scenes.register(scene);
  }

  // ── Declarative game helper ───────────────────────────────────

  /** Active `defineGame` runtime — set by `runGame`, read by render/input code. */
  private _gameRuntime: GameRuntime<any, any> | null = null;

  /** The currently-running declarative game runtime, if any. */
  get game(): GameRuntime<any, any> | null {
    return this._gameRuntime;
  }

  /**
   * Register a declarative game definition. Creates a scene that owns
   * state + turn phases + optional systems, and returns its name so callers
   * can pass it up to `setupGame`'s return value.
   *
   * ```ts
   * export function setupGame(engine: Engine) {
   *   return { startScene: engine.runGame(ticTacToe) };
   * }
   * ```
   */
  runGame<TState, TPlayer extends string | number = string | number>(
    def: GameDefinition<TState, TPlayer>,
  ): string {
    const runtime = new GameRuntime<TState, TPlayer>(def, this);
    this._gameRuntime = runtime;
    const scene = buildGameScene(def, runtime);
    this.registerScene(scene);
    return scene.name;
  }

  /**
   * Load a scene. Optionally with a transition effect.
   *
   *   engine.loadScene('play')                              // instant
   *   engine.loadScene('play', { transition: 'fade' })      // 0.5s fade to black and back
   *   engine.loadScene('play', { transition: 'fadeWhite', duration: 0.3 })
   */
  async loadScene(
    name: string,
    opts?: { transition?: TransitionType; duration?: number; data?: Record<string, any> },
  ): Promise<void> {
    this._sceneData = opts?.data ?? {};
    const doLoad = async () => {
      this.scheduler.clear();
      this.particles.clear();
      this.turns.reset();
      this._sceneTime = 0;
      await this.scenes.load(name, this);
      for (const s of BUILTIN_SYSTEMS) this.systems.add(s, this);
      events.emit("scene:loaded", name);
    };
    if (opts?.transition && opts.transition !== "none") {
      this.transition.type = opts.transition;
      this.transition.duration = opts.duration ?? 0.4;
      this.transition.start(doLoad);
    } else {
      await doLoad();
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  async start(sceneName: string): Promise<void> {
    await this.loadScene(sceneName);
    this.loop.start();
    events.emit("engine:started");
  }

  stop(): void {
    this.loop.stop();
    this.scenes.current?.cleanup?.(this);
    this.systems.clear(this);
    this.scheduler.clear();
    this.keyboard.destroy();
    this.mouse.destroy();
    this.gamepad.destroy();
    if (this._onResize) {
      window.removeEventListener("resize", this._onResize);
    }
    this.viewport.destroy();
    events.emit("engine:stopped");
  }

  pause(): void {
    this.loop.pause();
    events.emit("engine:paused");
  }

  resume(): void {
    this.loop.resume();
    events.emit("engine:resumed");
  }

  get isPaused(): boolean {
    return this.loop.isPaused;
  }

  // ── Frame lifecycle (private) ─────────────────────────────────

  private update(dt: number): void {
    this._sceneTime += dt;
    this.keyboard.update();
    this.mouse.update();
    this.gamepad.update();

    if (this.keyboard.pressed("Backquote")) {
      this.debug.toggle();
    }

    try {
      this.systems.update(this, dt); // includes tweenSystem
      this.scenes.update(this, dt);
    } catch (err: any) {
      this.debug.showError(err?.message ?? String(err));
      console.error("Game error:", err);
    }

    this.scheduler.update(dt);
    this.particles.update(dt);
    this.transition.update(dt);
    this.camera.update(dt);
    this.debug.update(dt);
    this.toast.update(dt);
    this.ui.update(dt);
    this.dialog.update(dt, this);
  }

  private render(): void {
    // Dialog queues its draw commands into the UI system
    this.dialog.draw(this.ui, this.width, this.height);

    // Game world + screen-space UI (ui.render is called inside renderer after camera restore)
    this.renderer.render(
      this.world,
      this.config,
      this.camera,
      this.particles,
      this._sceneTime,
      this.ui,
    );

    // Transition overlay renders on top of everything
    if (this.transition.active) {
      this.transition.render(this.renderer.ctx, this.width, this.height);
    }
    this.toast.render(this.renderer.ctx, this.width, this.height);
    this.debug.render(this.renderer.ctx, this.world, this.camera, this.width, this.height);
  }
}
