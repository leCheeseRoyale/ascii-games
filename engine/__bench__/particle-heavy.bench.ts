/**
 * Short-lived entities with lifetime + velocity + ascii — the "bullets/sparks" load.
 * Keeps population stable by respawning entities that die each tick.
 */

import { createBenchEngine, measure, report, stats } from "./harness";

const COUNTS = [100, 500, 1500];
const DT = 1 / 60;
const ITERS = 100;
const WARMUP = 10;
const FONT = '16px "Fira Code", monospace';

function spawnParticle(engine: ReturnType<typeof createBenchEngine>, idx: number) {
  engine.spawn({
    position: { x: engine.width / 2, y: engine.height / 2 },
    velocity: {
      vx: Math.cos(idx * 0.137) * 80,
      vy: Math.sin(idx * 0.137) * 80,
    },
    ascii: { char: "*", font: FONT, color: "#ffaa33", opacity: 1 },
    lifetime: { remaining: 2 + (idx % 10) * 0.05 },
  });
}

for (const count of COUNTS) {
  const engine = createBenchEngine();
  for (let i = 0; i < count; i++) spawnParticle(engine, i);

  // Keep the particle population roughly stable so each tick does equal work.
  let spawnCounter = count;
  const tickFn = () => {
    engine.tick(DT);
    const alive = [...engine.world.with("lifetime")].length;
    for (let i = alive; i < count; i++) spawnParticle(engine, spawnCounter++);
  };

  const tickSamples = measure(tickFn, ITERS, WARMUP);
  const renderSamples = measure(() => engine.render(), ITERS, WARMUP);

  const tickStats = stats(tickSamples);
  const renderStats = stats(renderSamples);

  report("particle-heavy", count, tickStats, renderStats);

  const tickBudgetMs = count <= 100 ? 5 : count <= 500 ? 15 : 45;
  const renderBudgetMs = count <= 100 ? 10 : count <= 500 ? 25 : 60;
  if (tickStats.median > tickBudgetMs) {
    throw new Error(
      `[regression] particle-heavy n=${count} tick median ${tickStats.median.toFixed(2)}ms > ${tickBudgetMs}ms`,
    );
  }
  if (renderStats.median > renderBudgetMs) {
    throw new Error(
      `[regression] particle-heavy n=${count} render median ${renderStats.median.toFixed(2)}ms > ${renderBudgetMs}ms`,
    );
  }
}
