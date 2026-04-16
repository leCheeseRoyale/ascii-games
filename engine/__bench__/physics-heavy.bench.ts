/**
 * position + velocity (+ physics + collider) entities — the physics-system stress path.
 * Roughly half the population carries physics/collider so bounce + gravity paths are exercised.
 */

import { createBenchEngine, measure, report, stats } from "./harness";

const COUNTS = [100, 1000, 5000];
const DT = 1 / 60;
const ITERS = 100;
const WARMUP = 10;
const FONT = '16px "Fira Code", monospace';

for (const count of COUNTS) {
  const engine = createBenchEngine();

  for (let i = 0; i < count; i++) {
    const withPhysics = i % 2 === 0;
    const data: Record<string, unknown> = {
      position: { x: (i * 13) % engine.width, y: (i * 17) % engine.height },
      velocity: {
        vx: Math.cos(i * 0.19) * 120,
        vy: Math.sin(i * 0.19) * 120,
      },
      ascii: { char: "o", font: FONT, color: "#88ccff" },
    };
    if (withPhysics) {
      data.physics = { gravity: 200, drag: 0.1, bounce: 0.6, maxSpeed: 400 };
      data.collider = { type: "circle" as const, width: 12, height: 12 };
    }
    engine.spawn(data);
  }

  const tickSamples = measure(() => engine.tick(DT), ITERS, WARMUP);
  const renderSamples = measure(() => engine.render(), ITERS, WARMUP);

  const tickStats = stats(tickSamples);
  const renderStats = stats(renderSamples);

  report("physics-heavy", count, tickStats, renderStats);

  const tickBudgetMs = count <= 100 ? 5 : count <= 1000 ? 25 : 120;
  const renderBudgetMs = count <= 100 ? 10 : count <= 1000 ? 50 : 200;
  if (tickStats.median > tickBudgetMs) {
    throw new Error(
      `[regression] physics-heavy n=${count} tick median ${tickStats.median.toFixed(2)}ms > ${tickBudgetMs}ms`,
    );
  }
  if (renderStats.median > renderBudgetMs) {
    throw new Error(
      `[regression] physics-heavy n=${count} render median ${renderStats.median.toFixed(2)}ms > ${renderBudgetMs}ms`,
    );
  }
}
