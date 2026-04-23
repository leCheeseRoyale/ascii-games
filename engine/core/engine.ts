import { events } from "@shared/events";
import type {
  AnimationFrame,
  EngineConfig,
  Entity,
  GameTime,
  SpawnInput,
  TweenEntry,
} from "@shared/types";
import { DEFAULT_CONFIG } from "@shared/types";
import type { ArtAsset } from "../data/art-asset";
import { animationSystem } from "../ecs/animation-system";
import { createCollisionEventSystem } from "../ecs/collision-event-system";
import { emitterSystem } from "../ecs/emitter-system";
import { lifetimeSystem } from "../ecs/lifetime-system";
import { measureSystem } from "../ecs/measure-system";
import { meshRenderSystem } from "../ecs/mesh-render-system";
import { parentSystem } from "../ecs/parent-system";
import { screenBoundsSystem } from "../ecs/screen-bounds-system";
import { springSystem } from "../ecs/spring-system";
import { stateMachineSystem } from "../ecs/state-machine-system";
import { type System, SystemRunner } from "../ecs/systems";
import { trailSystem } from "../ecs/trail-system";
import { tweenSystem } from "../ecs/tween-system";
import { createWorld, type GameWorld } from "../ecs/world";
import { Gamepad } from "../input/gamepad";
import { Keyboard } from "../input/keyboard";
import { Mouse } from "../input/mouse";
import { Touch } from "../input/touch";
import { physicsSystem } from "../physics/physics-system";
import { AsciiRenderer } from "../render/ascii-renderer";
import { Camera } from "../render/camera";
import { CanvasUI, DialogManager } from "../render/canvas-ui";
import { DebugOverlay } from "../render/debug";
import { loadImage, preloadImages } from "../render/image-loader";
import {
  measureCharacterPositions,
  measureSpriteCharacterPositions,
  resolveAutoCollider,
} from "../render/measure-entity";
import { createNullCanvas, createNullCtx } from "../render/null-ctx";
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
  measureSystem,
  parentSystem,
  springSystem,
  physicsSystem,
  tweenSystem,
  animationSystem,
  emitterSystem,
  stateMachineSystem,
  lifetimeSystem,
  screenBoundsSystem,
  trailSystem,
  meshRenderSystem,
];

/** Options for `engine.spawnImageMesh()`. */
export interface SpawnImageMeshOpts {
  /** URL string or preloaded HTMLImageElement */
  image: string | HTMLImageElement;
  /** Number of columns in the mesh grid */
  cols: number;
  /** Number of rows in the mesh grid */
  rows: number;
  /** Top-left position of the mesh in world space */
  position: { x: number; y: number };
  /** Character to use for each cell (default: '█') */
  char?: string;
  /** Font for character measurement (determines cell size). Default: '12px monospace' */
  font?: string;
  /** Spring preset for home-pull behavior */
  spring?: { strength: number; damping: number };
  /** Whether to draw lines between adjacent cells */
  showLines?: boolean;
  /** Color of the mesh lines (default: '#333') */
  lineColor?: string;
  /** Width of mesh lines in pixels (default: 1) */
  lineWidth?: number;
  /** Tags applied to every cell entity */
  tags?: string[];
  /** Render layer for the mesh cells */
  layer?: number;
}

export class Engine {
  // ── Public API ────────────────────────────────────────────────
  readonly config: EngineConfig;
  readonly headless: boolean;
  readonly world: GameWorld;
  readonly systems: SystemRunner;
  readonly scenes: SceneManager;
  readonly renderer: AsciiRenderer;
  readonly camera: Camera;
  readonly keyboard: Keyboard;
  readonly mouse: Mouse;
  readonly gamepad: Gamepad;
  readonly touch: Touch | null;
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

  /** Global time multiplier. 1 = normal, 0.3 = slow-mo, 2 = fast-forward. Affects all systems. */
  get timeScale(): number {
    return this.loop.timeScale;
  }
  set timeScale(value: number) {
    this.loop.timeScale = value;
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
  // biome-ignore lint/suspicious/noExplicitAny: game-specific scene data — callers expect arbitrary value access
  get sceneData(): Record<string, any> {
    return this._sceneData;
  }

  // ── Private ───────────────────────────────────────────────────
  private loop: GameLoop;
  private _onResize: (() => void) | null = null;
  private _sceneTime = 0;
  // biome-ignore lint/suspicious/noExplicitAny: game-specific scene data
  private _sceneData: Record<string, any> = {};
  private _flash: { color: string; remaining: number; duration: number } | null = null;
  private _collisionManager: ReturnType<typeof createCollisionEventSystem> | null = null;

  constructor(canvas?: HTMLCanvasElement | null, config: Partial<EngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.headless = !canvas;
    this.world = createWorld();
    this.systems = new SystemRunner();
    this.scenes = new SceneManager();
    this.camera = new Camera();
    this.keyboard = new Keyboard();
    this.gamepad = new Gamepad();
    this.touch = null;
    this.particles = new ParticlePool();
    this.scheduler = new Scheduler();
    this.transition = new Transition();
    this.debug = new DebugOverlay();
    this.toast = new ToastManager();
    this.turns = new TurnManager();
    this.dialog = new DialogManager();
    this.viewport = new Viewport();

    if (canvas) {
      this.renderer = new AsciiRenderer(canvas);
      this.mouse = new Mouse(canvas);
      this.touch = new Touch(canvas, { unifyMouse: false });
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context not available");
      this.ui = new CanvasUI(ctx);
    } else {
      const nullCanvas = createNullCanvas(
        this.config.headlessWidth ?? 800,
        this.config.headlessHeight ?? 600,
      );
      this.renderer = new AsciiRenderer(nullCanvas);
      this.mouse = new Mouse();
      this.ui = new CanvasUI(createNullCtx());
    }

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

    if (!this.headless) {
      this.renderer.resize();
      const onResize = () => {
        this.renderer.resize();
        this.camera.setViewport(this.renderer.width, this.renderer.height);
      };
      window.addEventListener("resize", onResize);
      onResize();
      this._onResize = onResize;
    } else {
      this.camera.setViewport(this.config.headlessWidth ?? 800, this.config.headlessHeight ?? 600);
    }
  }

  // ── Entity helpers ────────────────────────────────────────────

  spawn(components: SpawnInput): Partial<Entity> {
    resolveAutoCollider(components as Partial<Entity>);
    this.validateEntity(components as Partial<Entity>);
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

  /** Restart the current scene, preserving or resetting its data. */
  restartScene(freshData?: Record<string, unknown>): void {
    const current = this.scenes.current;
    if (!current) return;
    this.loadScene(current.name, { data: freshData ?? this._sceneData, transition: "none" });
  }

  /** Remove all entities from the world. Useful for resetting a scene manually. */
  clearWorld(): void {
    for (const entity of [...this.world.entities]) {
      this.world.remove(entity as Entity);
    }
  }

  /** Get an entity by its miniplex ID. */
  getEntityById(id: number): (Entity & { id: number }) | undefined {
    return this.world.entity(id) as (Entity & { id: number }) | undefined;
  }

  /** Shallow-clone an entity (components are shared references, not deep-copied). */
  cloneEntity(entity: Partial<Entity>): Partial<Entity> {
    const clone: Partial<Entity> = {};
    for (const [key, value] of Object.entries(entity)) {
      if (key === "id") continue;
      // biome-ignore lint/suspicious/noExplicitAny: cloning arbitrary components
      (clone as any)[key] = value;
    }
    return this.spawn(clone as SpawnInput);
  }

  // ── Juice helpers ──────────────────────────────────────────────

  /** Full-screen color flash for damage/powerup feedback. Draws on top of everything. */
  flash(color = "#ffffff", duration = 0.15): void {
    this._flash = { color, remaining: duration, duration };
  }

  /** Oscillates an entity's opacity for visual feedback (i-frames, warnings). */
  blink(entity: Partial<Entity>, duration = 0.5, interval = 0.1): void {
    let elapsed = 0;
    const originalOpacity = entity.ascii?.opacity ?? entity.sprite?.opacity ?? 1;
    const id = this.every(interval, () => {
      elapsed += interval;
      if (elapsed >= duration) {
        if (entity.ascii) entity.ascii.opacity = originalOpacity;
        if (entity.sprite) entity.sprite.opacity = originalOpacity;
        this.cancelTimer(id);
        return;
      }
      const visible = Math.floor(elapsed / interval) % 2 === 0;
      const opacity = visible ? originalOpacity : 0;
      if (entity.ascii) entity.ascii.opacity = opacity;
      if (entity.sprite) entity.sprite.opacity = opacity;
    });
  }

  /** Apply an impulse away from a point (knockback). */
  knockback(entity: Partial<Entity>, fromX: number, fromY: number, force: number): void {
    if (!entity.position || !entity.velocity) return;
    const dx = entity.position.x - fromX;
    const dy = entity.position.y - fromY;
    const dist = Math.hypot(dx, dy) || 1;
    entity.velocity.vx += (dx / dist) * force;
    entity.velocity.vy += (dy / dist) * force;
  }

  /**
   * Register a collision callback between two tagged entity groups.
   * Fires `callback` on the first frame two entities overlap.
   * Lazy-creates the collision event system on first call.
   * Returns an unsubscribe function.
   */
  onCollide(
    tagA: string,
    tagB: string,
    callback: (a: Partial<Entity>, b: Partial<Entity>) => void,
  ): () => void {
    if (!this._collisionManager) {
      this._collisionManager = createCollisionEventSystem();
      this.addSystem(this._collisionManager.system);
    }
    return this._collisionManager.onCollide(tagA, tagB, { onEnter: callback });
  }

  // ── Art asset helpers ──────────────────────────────────────────

  /**
   * Spawn an ArtAsset as a static sprite entity.
   *
   *   engine.spawnArt(dragon, { position: { x: 100, y: 200 } })
   */
  spawnArt(
    asset: ArtAsset,
    opts: {
      position: { x: number; y: number };
      layer?: number;
      opacity?: number;
      tags?: string[];
    },
  ): Partial<Entity> {
    return this.spawn({
      position: opts.position,
      sprite: {
        lines: asset.lines,
        font: asset.font ?? '16px "Fira Code", monospace',
        color: asset.color ?? "#e0e0e0",
        colorMap: asset.colorMap,
        glow: asset.glow,
        opacity: opts.opacity,
        layer: opts.layer,
      },
      ...(opts.tags?.length ? { tags: { values: new Set(opts.tags) } } : {}),
    });
  }

  /**
   * Spawn an ArtAsset as individual character entities with spring physics.
   * Each character is an independent entity that participates in collision/physics.
   * Delegates to `spawnSprite()` with art asset data.
   *
   *   engine.spawnInteractiveArt(dragon, { position: { x: 100, y: 200 }, spring: SpringPresets.bouncy })
   */
  spawnInteractiveArt(
    asset: ArtAsset,
    opts: {
      position: { x: number; y: number };
      spring?: { strength?: number; damping?: number };
      layer?: number;
      tags?: string[];
      collider?: boolean;
    },
  ): Partial<Entity>[] {
    const springConfig = opts.spring ?? { strength: 0.08, damping: 0.93 };
    return this.spawnSprite({
      lines: asset.lines,
      font: asset.font ?? '16px "Fira Code", monospace',
      position: opts.position,
      color: asset.color ?? "#e0e0e0",
      spring: springConfig,
      layer: opts.layer,
      tags: opts.tags,
      collider: opts.collider ?? false,
    });
  }

  // ── Text decomposition helpers ─────────────────────────────────

  /**
   * Spawn text as individual character entities, each with physics and spring-to-home.
   * Characters are independent entities that participate in normal collision/physics.
   */
  spawnText(opts: {
    text: string;
    font: string;
    position: { x: number; y: number };
    color?: string;
    spring?: { strength?: number; damping?: number };
    maxWidth?: number;
    lineHeight?: number;
    layer?: number;
    tags?: string[];
    collider?: boolean;
    align?: "left" | "center" | "right";
  }): Partial<Entity>[] {
    const { text, font, position: pos, maxWidth = Infinity } = opts;
    const lineHeight = opts.lineHeight ?? (parseFloat(font) || 16) * 1.3;
    const align = opts.align ?? "left";
    const chars = measureCharacterPositions(text, font, pos.x, pos.y, maxWidth, lineHeight, align);
    return this.spawnCharEntities(chars, opts);
  }

  /**
   * Spawn a multi-line sprite as individual character entities, each with physics and spring-to-home.
   * Characters are independent entities that participate in normal collision/physics.
   */
  spawnSprite(opts: {
    lines: string[];
    font: string;
    position: { x: number; y: number };
    color?: string;
    spring?: { strength?: number; damping?: number };
    layer?: number;
    tags?: string[];
    collider?: boolean;
  }): Partial<Entity>[] {
    const { lines, font, position: pos } = opts;
    const chars = measureSpriteCharacterPositions(lines, font, pos.x, pos.y);
    return this.spawnCharEntities(chars, opts);
  }

  /** Shared spawn loop for spawnText/spawnSprite — turns measured characters into spring entities. */
  private spawnCharEntities(
    chars: { char: string; homeX: number; homeY: number }[],
    opts: {
      font: string;
      color?: string;
      spring?: { strength?: number; damping?: number };
      layer?: number;
      tags?: string[];
      collider?: boolean;
    },
  ): Partial<Entity>[] {
    const {
      font,
      color = "#e0e0e0",
      spring: springOpts,
      layer = 0,
      tags: extraTags = [],
      collider: addCollider = true,
    } = opts;
    const strength = springOpts?.strength ?? 0.08;
    const damping = springOpts?.damping ?? 0.93;
    const entities: Partial<Entity>[] = [];

    for (const ch of chars) {
      const components: SpawnInput = {
        position: { x: ch.homeX, y: ch.homeY },
        velocity: { vx: 0, vy: 0 },
        ascii: { char: ch.char, font, color, layer },
        spring: { targetX: ch.homeX, targetY: ch.homeY, strength, damping },
      };
      if (addCollider) components.collider = "auto";
      if (extraTags.length > 0) components.tags = { values: new Set(extraTags) };
      entities.push(this.spawn(components));
    }
    return entities;
  }

  // ── Image mesh helper ────────────────────────────────────────

  /**
   * Spawn an image as a deformable mesh of character entities with spring physics.
   * The image is subdivided into a cols × rows grid; each cell is an independent
   * entity with position, velocity, spring-to-home, and a `meshCell` component
   * that references its slice of the source image.
   *
   * All existing systems work automatically: `_spring` reforms the image,
   * `createCursorRepelSystem` warps it, `engine.destroy(cell)` tears it, etc.
   *
   *   engine.spawnImageMesh({
   *     image: 'assets/portrait.png',
   *     cols: 10, rows: 12,
   *     position: { x: 400, y: 300 },
   *     spring: SpringPresets.bouncy,
   *     showLines: false,
   *   });
   */
  spawnImageMesh(opts: SpawnImageMeshOpts): Partial<Entity>[] {
    const meshId = `mesh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Resolve image — string URL or preloaded HTMLImageElement
    let img: HTMLImageElement;
    if (typeof opts.image === "string") {
      img = new Image();
      img.src = opts.image;
    } else {
      img = opts.image;
    }

    const { cols, rows, position: pos } = opts;
    const springStrength = opts.spring?.strength ?? 0.08;
    const springDamping = opts.spring?.damping ?? 0.93;
    const showLines = opts.showLines ?? false;
    const lineColor = opts.lineColor ?? "#333";
    const lineWidth = opts.lineWidth ?? 1;
    const char = opts.char ?? "█"; // '█'
    const font = opts.font ?? "12px monospace";

    // Cell spacing from image natural dimensions if available, else defaults.
    // naturalWidth/naturalHeight are 0 for unloaded images — fall back to reasonable defaults.
    const imgW = img.naturalWidth || img.width || cols * 16;
    const imgH = img.naturalHeight || img.height || rows * 16;
    const spacingX = imgW / cols;
    const spacingY = imgH / rows;

    // Source rectangle dimensions for each cell
    const srcW = imgW / cols;
    const srcH = imgH / rows;

    const entities: Partial<Entity>[] = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = pos.x + col * spacingX;
        const y = pos.y + row * spacingY;

        const components: SpawnInput = {
          position: { x, y },
          velocity: { vx: 0, vy: 0 },
          spring: { targetX: x, targetY: y, strength: springStrength, damping: springDamping },
          ascii: { char, font, color: "transparent" },
          collider: "auto" as const,
          meshCell: {
            image: img,
            srcX: col * srcW,
            srcY: row * srcH,
            srcW,
            srcH,
            col,
            row,
            meshId,
            cols,
            rows,
            showLines,
            lineColor,
            lineWidth,
          },
        };

        if (opts.layer !== undefined) {
          if (components.ascii) {
            components.ascii.layer = opts.layer;
          }
        }

        if (opts.tags && opts.tags.length > 0) {
          components.tags = { values: new Set(opts.tags) };
        }

        entities.push(this.spawn(components));
      }
    }

    return entities;
  }

  // ── Tween helper ──────────────────────────────────────────────

  /** Add a tween to an entity. */
  tweenEntity(
    entity: Partial<Entity>,
    property: string,
    from: number,
    to: number,
    duration: number,
    ease: TweenEntry["ease"] = "easeOut",
    destroyOnComplete = false,
  ): void {
    if (!entity.tween) {
      entity.tween = { tweens: [] };
    }
    entity.tween.tweens.push({ property, from, to, duration, elapsed: 0, ease, destroyOnComplete });
  }

  // ── Animation helpers ────────────────────────────────────────────

  /** Play a named animation on an entity. */
  playAnimation(
    entity: Partial<Entity>,
    frames: AnimationFrame[],
    frameDuration = 0.1,
    loop = true,
  ): void {
    if (frames.length === 0) return;
    entity.animation = { frames, frameDuration, currentFrame: 0, elapsed: 0, loop, playing: true };
    const first = frames[0];
    if (first.char && entity.ascii) entity.ascii.char = first.char;
    if (first.lines && entity.sprite) entity.sprite.lines = first.lines;
    if (first.color) {
      if (entity.ascii) entity.ascii.color = first.color;
      if (entity.sprite) entity.sprite.color = first.color;
    }
  }

  /** Stop animation on an entity. */
  stopAnimation(entity: Partial<Entity>): void {
    if (entity.animation) entity.animation.playing = false;
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
    childEntity.child = { parent: parentEntity, offsetX, offsetY };

    if (!parentEntity.parent) parentEntity.parent = { children: [] };
    if (!parentEntity.parent.children.includes(childEntity)) {
      parentEntity.parent.children.push(childEntity);
    }

    if (parentEntity.position && childEntity.position) {
      childEntity.position.x = parentEntity.position.x + offsetX;
      childEntity.position.y = parentEntity.position.y + offsetY;
    }
  }

  /** Detach a child from its parent. Position stays at current world position. */
  detachChild(childEntity: Partial<Entity>): void {
    if (!childEntity.child) return;

    const parent = childEntity.child.parent as Partial<Entity>;
    if (parent?.parent?.children) {
      const idx = parent.parent.children.indexOf(childEntity);
      if (idx >= 0) parent.parent.children.splice(idx, 1);
    }

    delete childEntity.child;
  }

  /** Destroy an entity and all its children recursively. */
  destroyWithChildren(entity: Partial<Entity>): void {
    if (entity.parent?.children) {
      for (const child of [...entity.parent.children]) {
        this.destroyWithChildren(child);
      }
    }
    this.detachChild(entity);
    this.world.remove(entity as Entity);
  }

  // ── Scene helpers ─────────────────────────────────────────────

  registerScene(scene: Scene): void {
    this.scenes.register(scene);
  }

  // ── Declarative game helper ───────────────────────────────────

  /** Active `defineGame` runtime — set by `runGame`, read by render/input code. */
  // biome-ignore lint/suspicious/noExplicitAny: erased game-state generic — runGame provides the concrete type
  private _gameRuntime: GameRuntime<any, any> | null = null;

  /** The currently-running declarative game runtime, if any. */
  // biome-ignore lint/suspicious/noExplicitAny: erased game-state generic — runGame provides the concrete type
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
    // biome-ignore lint/suspicious/noExplicitAny: game-specific scene data
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
    this.world.clear();
    this.scheduler.clear();
    this.keyboard.destroy();
    this.mouse.destroy();
    this.touch?.destroy();
    this.gamepad.destroy();
    if (this._onResize) {
      window.removeEventListener("resize", this._onResize);
    }
    this.viewport.destroy();
    events.emit("engine:stopped");
  }

  pause(): void {
    this.loop.pause();
    this.scheduler.pause();
    events.emit("engine:paused");
  }

  resume(): void {
    this.loop.resume();
    this.scheduler.resume();
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
    this.touch?.update();
    this.gamepad.update();

    if (this.keyboard.pressed("Backquote")) {
      this.debug.toggle();
    }

    try {
      this.systems.update(this, dt); // includes tweenSystem
      this.scenes.update(this, dt);
    } catch (err: unknown) {
      this.debug.showError(err instanceof Error ? err.message : String(err));
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

    // Tick screen flash
    if (this._flash) {
      this._flash.remaining -= dt;
      if (this._flash.remaining <= 0) this._flash = null;
    }
  }

  /** Advance the engine by a fixed time step. Useful for headless / test-driven stepping. */
  tick(dt: number): void {
    this.update(dt);
    if (!this.headless) this.render();
  }

  private render(): void {
    if (this.headless) return;
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

    // Screen flash overlay (draws on top of game world, under transition)
    if (this._flash) {
      const ctx = this.renderer.ctx;
      const alpha = this._flash.remaining / this._flash.duration;
      ctx.save();
      ctx.globalAlpha = alpha * 0.6;
      ctx.fillStyle = this._flash.color;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
    }

    // Transition overlay renders on top of everything
    if (this.transition.active) {
      this.transition.render(this.renderer.ctx, this.width, this.height);
    }
    this.toast.render(this.renderer.ctx, this.width, this.height);
    this.debug.render(this.renderer.ctx, this.world, this.camera, this.width, this.height);
  }
}
