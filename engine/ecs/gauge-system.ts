/**
 * Gauge System — renders ASCII progress bars.
 *
 * Entities with a `gauge` component get their `ascii.char` updated
 * each frame to reflect gauge.current / gauge.max as a visual bar.
 *
 * Not auto-registered. Add with: engine.addSystem(gaugeSystem)
 */

import type { Engine } from "../core/engine";
import type { System } from "./systems";

export const gaugeSystem: System = {
  name: "_gauge",

  update(engine: Engine, _dt: number) {
    for (const entity of engine.world.with("gauge")) {
      const g = entity.gauge;
      const ratio = Math.max(0, Math.min(1, g.current / g.max));
      const filled = Math.round(ratio * g.width);
      const empty = g.width - filled;

      const fillChar = g.fillChar ?? "█";
      const emptyChar = g.emptyChar ?? "░";
      const bar = fillChar.repeat(filled) + emptyChar.repeat(empty);

      const e = entity as Record<string, unknown>;
      const ascii = e.ascii as { char: string; color: string } | undefined;
      if (ascii) {
        ascii.char = bar;
        if (g.color) ascii.color = g.color;
      }
    }
  },
};
