import type { Entity } from "@shared/types";
import type { Engine } from "../core/engine";
import { type System, SystemPriority } from "./systems";

export const trailSystem: System = {
  name: "_trail",
  priority: SystemPriority.emitter + 1,

  update(engine: Engine, dt: number) {
    for (const entity of engine.world.with("trail", "position")) {
      const trail = entity.trail;
      const interval = trail.interval ?? 0.05;
      const trailLifetime = trail.lifetime ?? 0.3;
      const startOpacity = trail.opacity ?? 0.5;

      trail._acc = (trail._acc ?? 0) + dt;
      if (trail._acc < interval) continue;
      trail._acc -= interval;

      const e = entity as Partial<Entity>;
      const ascii = e.ascii;
      const sprite = e.sprite;
      if (!ascii && !sprite) continue;

      const color = trail.color ?? ascii?.color ?? sprite?.color ?? "#ffffff";
      const visualKey = ascii ? "ascii" : "sprite";
      const visual = ascii
        ? {
            char: ascii.char,
            font: ascii.font,
            color,
            opacity: startOpacity,
            layer: (ascii.layer ?? 0) - 1,
          }
        : sprite
          ? {
              lines: [...sprite.lines],
              font: sprite.font,
              color,
              opacity: startOpacity,
              layer: (sprite.layer ?? 0) - 1,
            }
          : { char: "", font: "", color, opacity: startOpacity, layer: 0 };

      engine.spawn({
        position: { x: entity.position.x, y: entity.position.y },
        [visualKey]: visual,
        lifetime: { remaining: trailLifetime },
        tween: {
          tweens: [
            {
              property: `${visualKey}.opacity`,
              from: startOpacity,
              to: 0,
              duration: trailLifetime,
              elapsed: 0,
              ease: "linear",
            },
          ],
        },
      });
    }
  },
};
