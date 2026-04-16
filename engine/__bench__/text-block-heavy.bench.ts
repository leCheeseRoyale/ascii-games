/**
 * ascii + position entities — the most common "world full of things" load.
 */

import { createBenchEngine, measure, report, stats } from "./harness";

const COUNTS = [100, 1000, 5000];
const DT = 1 / 60;
const ITERS = 100;
const WARMUP = 10;
const FONT = '16px "Fira Code", monospace';
const CHARS = "@#$%&*+=-<>!?.:;";

function populate(engine: ReturnType<typeof createBenchEngine>, count: number) {
  for (let i = 0; i < count; i++) {
    engine.spawn({
      position: { x: (i * 7) % engine.width, y: (i * 11) % engine.height },
      ascii: {
        char: CHARS[i % CHARS.length],
        font: FONT,
        color: `hsl(${(i * 37) % 360} 80% 60%)`,
      },
    });
  }
}

for (const count of COUNTS) {
  const engine = createBenchEngine();
  populate(engine, count);

  const tickSamples = measure(() => engine.tick(DT), ITERS, WARMUP);
  const renderSamples = measure(() => engine.render(), ITERS, WARMUP);

  const tickStats = stats(tickSamples);
  const renderStats = stats(renderSamples);

  report("text-block-heavy", count, tickStats, renderStats);

  // Generous 3x regression gates — catch order-of-magnitude slowdowns, not jitter.
  const tickBudgetMs = count <= 100 ? 5 : count <= 1000 ? 25 : 100;
  const renderBudgetMs = count <= 100 ? 10 : count <= 1000 ? 50 : 200;
  if (tickStats.median > tickBudgetMs) {
    throw new Error(
      `[regression] text-block-heavy n=${count} tick median ${tickStats.median.toFixed(2)}ms > ${tickBudgetMs}ms`,
    );
  }
  if (renderStats.median > renderBudgetMs) {
    throw new Error(
      `[regression] text-block-heavy n=${count} render median ${renderStats.median.toFixed(2)}ms > ${renderBudgetMs}ms`,
    );
  }
}
