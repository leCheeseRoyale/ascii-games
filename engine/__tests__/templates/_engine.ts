/**
 * Template smoke-test harness.
 *
 * Provides a mock engine rich enough to boot a game template (scenes +
 * systems + scene-state-change), tick it for a handful of frames, and
 * query entities by tag — without a DOM/canvas/audio stack.
 *
 * Anything that would render (ui.*, dialog.draw, particles draw, etc.)
 * is a no-op. Anything systems read during a normal frame (engine.width,
 * keyboard state, findByTag, spawn, addSystem, loadScene) is wired to
 * real machinery where cheap, stubbed where it would require the DOM.
 */

import type { Entity, TweenEntry } from "../../../shared/types";
import type { Scene } from "../../core/scene";
import { SceneManager } from "../../core/scene";
import { TurnManager } from "../../core/turn-manager";
import type { System } from "../../ecs/systems";
import { SystemRunner } from "../../ecs/systems";
import { createWorld, type GameWorld } from "../../ecs/world";

export interface MockTemplateEngine {
  world: GameWorld;
  config: { bgColor: string; targetFps: number };
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  systems: SystemRunner;
  scenes: SceneManager;
  turns: TurnManager;
  camera: { x: number; y: number; shake: (_mag: number) => void };
  keyboard: {
    held: (code: string) => boolean;
    pressed: (code: string) => boolean;
    released: (code: string) => boolean;
    update: () => void;
  };
  mouse: {
    x: number;
    y: number;
    down: boolean;
    justDown: boolean;
    update: () => void;
  };
  particles: {
    burst: (_opts: Record<string, unknown>) => void;
    explosion: (_opts: Record<string, unknown>) => void;
    sparkle: (_x: number, _y: number, _c?: string) => void;
    smoke: (_opts: Record<string, unknown>) => void;
    clear: () => void;
    update: (_dt: number) => void;
  };
  ui: {
    text: (..._a: unknown[]) => void;
    panel: (..._a: unknown[]) => void;
    textPanel: (..._a: unknown[]) => void;
    bar: (..._a: unknown[]) => void;
    effectText: (..._a: unknown[]) => void;
    inlineRun: (..._a: unknown[]) => number;
    update: (_dt: number) => void;
  };
  dialog: {
    active: boolean;
    show: (_t: string, _opts?: Record<string, unknown>) => Promise<void>;
    choice: (_t: string, _c: string[], _opts?: Record<string, unknown>) => Promise<number>;
    update: (_dt: number, _e: MockTemplateEngine) => void;
  };
  debug: {
    showError: (_msg: string, _dur?: number) => void;
  };
  toast: { add: (_msg: string) => void };
  time: { dt: number; elapsed: number; frame: number; fps: number };
  sceneData: Record<string, unknown>;
  sceneTime: number;
  isPaused: boolean;
  spawn: (data: Partial<Entity>) => Entity;
  destroy: (entity: Entity) => void;
  destroyAll: (tag: string) => number;
  destroyWithChildren: (entity: Partial<Entity>) => void;
  findByTag: (tag: string) => Entity | undefined;
  findAllByTag: (tag: string) => Entity[];
  registerScene: (scene: Scene) => void;
  loadScene: (name: string, opts?: { data?: Record<string, unknown> }) => Promise<void>;
  addSystem: (sys: System) => void;
  removeSystem: (name: string) => void;
  pause: () => void;
  resume: () => void;
  tweenEntity: (
    entity: Partial<Entity>,
    property: string,
    from: number,
    to: number,
    duration: number,
    ease?: TweenEntry["ease"],
    destroyOnComplete?: boolean,
  ) => void;
  floatingText: (_x: number, _y: number, _text: string, _color?: string, _font?: string) => void;
  after: (_seconds: number, _cb: () => void) => number;
  every: (_seconds: number, _cb: () => void) => number;
  spawnEvery: (_seconds: number, _factory: () => Partial<Entity>) => number;
  cancelTimer: (_id: number) => void;
  tick: (dt: number) => void;
}

/**
 * Create a mock engine that can boot and tick a game template.
 * - Skips rendering (no canvas, no pretext).
 * - Skips audio (zzfx is stubbed at setup.ts preload).
 * - Keyboard/mouse/dialog are inert — no input events are injected.
 */
export function mockTemplateEngine(
  opts: { width?: number; height?: number } = {},
): MockTemplateEngine {
  const width = opts.width ?? 800;
  const height = opts.height ?? 600;
  const world = createWorld();
  const systems = new SystemRunner();
  const scenes = new SceneManager();
  const turns = new TurnManager();

  const engine: MockTemplateEngine = {
    world,
    config: { bgColor: "#000000", targetFps: 60 },
    width,
    height,
    centerX: width / 2,
    centerY: height / 2,
    systems,
    scenes,
    turns,
    camera: {
      x: 0,
      y: 0,
      shake: () => {},
    },
    keyboard: {
      held: () => false,
      pressed: () => false,
      released: () => false,
      update: () => {},
    },
    mouse: {
      x: 0,
      y: 0,
      down: false,
      justDown: false,
      update: () => {},
    },
    particles: {
      burst: () => {},
      explosion: () => {},
      sparkle: () => {},
      smoke: () => {},
      clear: () => {},
      update: () => {},
    },
    ui: {
      text: () => {},
      panel: () => {},
      textPanel: () => {},
      bar: () => {},
      effectText: () => {},
      inlineRun: () => 0,
      update: () => {},
    },
    dialog: {
      active: false,
      show(_text: string) {
        // Track active so scenes that gate on `dialog.active` behave realistically,
        // but do not call pretext (no canvas context in tests).
        this.active = true;
        return Promise.resolve();
      },
      choice(_text: string, _choices: string[]) {
        this.active = true;
        return Promise.resolve(0);
      },
      update: () => {},
    },
    debug: {
      showError: () => {},
    },
    toast: {
      add: () => {},
    },
    time: { dt: 1 / 60, elapsed: 0, frame: 0, fps: 60 },
    sceneData: {},
    sceneTime: 0,
    isPaused: false,

    spawn(data) {
      return world.add(data as Entity);
    },
    destroy(entity) {
      world.remove(entity);
    },
    destroyAll(tag) {
      const toRemove: Entity[] = [];
      for (const e of world.with("tags")) {
        if (e.tags.values.has(tag)) toRemove.push(e as Entity);
      }
      for (const e of toRemove) world.remove(e);
      return toRemove.length;
    },
    destroyWithChildren(entity) {
      world.remove(entity as Entity);
    },
    findByTag(tag) {
      for (const e of world.with("tags")) {
        if (e.tags.values.has(tag)) return e as Entity;
      }
      return undefined;
    },
    findAllByTag(tag) {
      const out: Entity[] = [];
      for (const e of world.with("tags")) {
        if (e.tags.values.has(tag)) out.push(e as Entity);
      }
      return out;
    },
    registerScene(scene) {
      scenes.register(scene);
    },
    async loadScene(name, loadOpts) {
      engine.sceneData = (loadOpts?.data as Record<string, unknown>) ?? {};
      engine.sceneTime = 0;
      // Mirror the real engine: clear world+systems on scene change.
      await scenes.load(name, engine as unknown as Parameters<typeof scenes.load>[1]);
    },
    addSystem(sys) {
      systems.add(sys, engine as unknown as Parameters<typeof systems.add>[1]);
    },
    removeSystem(name) {
      systems.remove(name, engine as unknown as Parameters<typeof systems.remove>[1]);
    },
    pause() {
      engine.isPaused = true;
    },
    resume() {
      engine.isPaused = false;
    },
    tweenEntity(entity, property, from, to, duration, ease = "easeOut", destroyOnComplete = false) {
      const e = entity as Partial<Entity> & { tween?: { tweens: TweenEntry[] } };
      if (!e.tween) e.tween = { tweens: [] };
      e.tween.tweens.push({ property, from, to, duration, elapsed: 0, ease, destroyOnComplete });
    },
    floatingText() {},
    after: () => 0,
    every: () => 0,
    spawnEvery: () => 0,
    cancelTimer: () => {},
    tick(dt) {
      engine.time.dt = dt;
      engine.time.elapsed += dt;
      engine.time.frame += 1;
      engine.sceneTime += dt;
      // Mirror Engine.update() ordering: systems → scene.update.
      // Skip keyboard/mouse update (no events are injected in tests).
      systems.update(engine as unknown as Parameters<typeof systems.update>[0], dt);
      scenes.update(engine as unknown as Parameters<typeof scenes.update>[0], dt);
    },
  };

  return engine;
}
