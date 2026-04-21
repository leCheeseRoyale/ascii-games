/**
 * Trail system — spawns fading afterimage entities behind moving entities.
 *
 * Attach a `trail` component to any entity with `position` + `ascii` (or `sprite`).
 * The system periodically spawns a ghost entity at the current position that
 * fades to transparent and self-destructs.
 *
 * Priority: SystemPriority.emitter + 1 (51) — runs right after the emitter system.
 */

import type { Ascii, Entity, Sprite } from "@shared/types";
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

      // Accumulate time
      trail._acc = (trail._acc ?? 0) + dt;

      if (trail._acc < interval) continue;
      trail._acc -= interval;

      // Determine character and font from ascii or sprite
      const e = entity as Partial<Entity>;
      const ascii: Ascii | undefined = e.ascii;
      const sprite: Sprite | undefined = e.sprite;
      const color = trail.color ?? ascii?.color ?? sprite?.color ?? "#ffffff";

      if (ascii) {
        engine.spawn({
          position: { x: entity.position.x, y: entity.position.y },
          ascii: {
            char: ascii.char,
            font: ascii.font,
            color,
            opacity: startOpacity,
            layer: (ascii.layer ?? 0) - 1,
          },
          lifetime: { remaining: trailLifetime },
          tween: {
            tweens: [
              {
                property: "ascii.opacity",
                from: startOpacity,
                to: 0,
                duration: trailLifetime,
                elapsed: 0,
                ease: "linear",
              },
            ],
          },
        });
      } else if (sprite) {
        engine.spawn({
          position: { x: entity.position.x, y: entity.position.y },
          sprite: {
            lines: [...sprite.lines],
            font: sprite.font,
            color,
            opacity: startOpacity,
            layer: (sprite.layer ?? 0) - 1,
          },
          lifetime: { remaining: trailLifetime },
          tween: {
            tweens: [
              {
                property: "sprite.opacity",
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
    }
  },
};
