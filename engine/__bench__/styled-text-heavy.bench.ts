/**
 * textBlock entities with inline [#color]/[b]/[dim] tags — exercises the styled
 * segment render path in AsciiRenderer.drawTextBlock.
 */

import { createBenchEngine, measure, report, stats } from "./harness";

const COUNTS = [100, 1000, 5000];
const DT = 1 / 60;
const ITERS = 100;
const WARMUP = 10;
const FONT = '14px "Fira Code", monospace';
const SAMPLES = [
  "plain [#ff0]yellow[/] plain [b]bold[/b] [dim]faded[/dim] end",
  "[#44ff88]HP[/] 42/100 — [b]DMG[/b] [#ff4444]+12[/] [bg:#222]slot[/bg]",
  "[b]mission:[/b] [#88ccff]deliver[/] [#ffaa00]3 crates[/] to [dim]depot[/dim]",
  "[#ff6666]alert[/] [b]enemy spotted[/b] at [#ffff88]sector 7[/] [bg:#330000]!![/bg]",
];

for (const count of COUNTS) {
  const engine = createBenchEngine();

  for (let i = 0; i < count; i++) {
    engine.spawn({
      position: { x: (i * 9) % engine.width, y: (i * 23) % engine.height },
      textBlock: {
        text: SAMPLES[i % SAMPLES.length],
        font: FONT,
        color: "#ffffff",
        maxWidth: 220,
        lineHeight: 18,
      },
    });
  }

  const tickSamples = measure(() => engine.tick(DT), ITERS, WARMUP);
  const renderSamples = measure(() => engine.render(), ITERS, WARMUP);

  const tickStats = stats(tickSamples);
  const renderStats = stats(renderSamples);

  report("styled-text-heavy", count, tickStats, renderStats);

  const tickBudgetMs = count <= 100 ? 5 : count <= 1000 ? 25 : 100;
  const renderBudgetMs = count <= 100 ? 30 : count <= 1000 ? 200 : 900;
  if (tickStats.median > tickBudgetMs) {
    throw new Error(
      `[regression] styled-text-heavy n=${count} tick median ${tickStats.median.toFixed(2)}ms > ${tickBudgetMs}ms`,
    );
  }
  if (renderStats.median > renderBudgetMs) {
    throw new Error(
      `[regression] styled-text-heavy n=${count} render median ${renderStats.median.toFixed(2)}ms > ${renderBudgetMs}ms`,
    );
  }
}
