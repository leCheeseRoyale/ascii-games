/**
 * Shared bench harness. Keep it small — raw samples, median, p95.
 */

import { DEFAULT_CONFIG } from "@shared/types";
import { animationSystem } from "../ecs/animation-system";
import { emitterSystem } from "../ecs/emitter-system";
import { lifetimeSystem } from "../ecs/lifetime-system";
import { measureSystem } from "../ecs/measure-system";
import { parentSystem } from "../ecs/parent-system";
import { screenBoundsSystem } from "../ecs/screen-bounds-system";
import { springSystem } from "../ecs/spring-system";
import { stateMachineSystem } from "../ecs/state-machine-system";
import { type System, SystemRunner } from "../ecs/systems";
import { tweenSystem } from "../ecs/tween-system";
import { createWorld } from "../ecs/world";
import { physicsSystem } from "../physics/physics-system";
import { AsciiRenderer } from "../render/ascii-renderer";
import { Camera } from "../render/camera";
import { ParticlePool } from "../render/particles";
import { makeCanvas } from "./setup";

export const BUILTIN_SYSTEMS: System[] = [
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
];

export interface BenchEngine {
  world: ReturnType<typeof createWorld>;
  width: number;
  height: number;
  systems: SystemRunner;
  camera: Camera;
  renderer: AsciiRenderer;
  particles: ParticlePool;
  config: typeof DEFAULT_CONFIG;
  turns: { active: boolean; currentPhase: string | null };
  debug: { showError(_m: string): void };
  spawn(data: Record<string, unknown>): any;
  destroy(entity: any): void;
  tick(dt: number): void;
  render(): void;
}

export function createBenchEngine(width = 800, height = 600): BenchEngine {
  const world = createWorld();
  const systems = new SystemRunner();
  const camera = new Camera();
  camera.setViewport(width, height);
  const canvas = makeCanvas(width, height);
  const renderer = new AsciiRenderer(canvas);
  const particles = new ParticlePool();

  const engine: BenchEngine = {
    world,
    width,
    height,
    systems,
    camera,
    renderer,
    particles,
    config: { ...DEFAULT_CONFIG, debug: false },
    turns: { active: false, currentPhase: null },
    debug: { showError() {} },
    spawn(data) {
      return world.add(data as any);
    },
    destroy(entity) {
      world.remove(entity);
    },
    tick(dt) {
      systems.update(engine as any, dt);
    },
    render() {
      renderer.render(world, engine.config, camera, particles);
    },
  };

  for (const s of BUILTIN_SYSTEMS) systems.add(s, engine as any);
  return engine;
}

export interface Sample {
  tick: number;
  render: number;
}

export interface Stats {
  median: number;
  p95: number;
  min: number;
  max: number;
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.floor(sortedAsc.length * p));
  return sortedAsc[idx];
}

export function stats(samples: number[]): Stats {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
  };
}

/** Run `fn()` `iters` times, drop first `warmup`, return per-run ms. */
export function measure(fn: () => void, iters = 100, warmup = 10): number[] {
  const samples: number[] = [];
  for (let i = 0; i < warmup; i++) fn();
  for (let i = 0; i < iters; i++) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  return samples;
}

/** Format scenario output line. */
export function report(scenario: string, count: number, tick: Stats, render: Stats): void {
  const line = [
    scenario.padEnd(22),
    `n=${String(count).padStart(5)}`,
    `tick med=${tick.median.toFixed(3)}ms p95=${tick.p95.toFixed(3)}ms`,
    `render med=${render.median.toFixed(3)}ms p95=${render.p95.toFixed(3)}ms`,
  ].join("  ");
  console.log(line);
}
