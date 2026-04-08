/**
 * Built-in tween system. Processes Tween components automatically.
 *
 * Add a tween to any entity:
 *   engine.spawn({
 *     position: { x: 0, y: 0 },
 *     ascii: { char: '*', font: FONTS.normal, color: '#fff', opacity: 1 },
 *     tween: { tweens: [
 *       { property: 'position.x', from: 0, to: 400, duration: 1, elapsed: 0, ease: 'easeOut' },
 *       { property: 'ascii.opacity', from: 1, to: 0, duration: 1, elapsed: 0, ease: 'linear' },
 *     ]},
 *   })
 *
 * Or use the helper: engine.tweenEntity(entity, 'position.x', 0, 400, 1, 'easeOut')
 */

import type { Entity, TweenEntry } from "@shared/types";
import type { Engine } from "../core/engine";
import type { System } from "./systems";

function applyEasing(t: number, ease: TweenEntry["ease"]): number {
  switch (ease) {
    case "linear":
      return t;
    case "easeOut":
      return 1 - (1 - t) * (1 - t);
    case "easeIn":
      return t * t;
    case "easeInOut":
      return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    default:
      return t;
  }
}

/** Set a nested property by dot-path: 'position.x', 'ascii.opacity', etc. */
function setNestedProp(obj: any, path: string, value: number): void {
  const parts = path.split(".");
  let target = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    target = target[parts[i]];
    if (!target) return;
  }
  target[parts[parts.length - 1]] = value;
}

export const tweenSystem: System = {
  name: "_tween",

  update(engine: Engine, dt: number) {
    const entities = [...engine.world.with("tween")];

    for (const entity of entities) {
      const tween = entity.tween;
      let allDone = true;
      let shouldDestroy = false;

      for (let i = tween.tweens.length - 1; i >= 0; i--) {
        const t = tween.tweens[i];
        t.elapsed += dt;
        const progress = Math.min(t.elapsed / t.duration, 1);
        const eased = applyEasing(progress, t.ease);
        const value = t.from + (t.to - t.from) * eased;

        setNestedProp(entity, t.property, value);

        if (progress >= 1) {
          if (t.destroyOnComplete) shouldDestroy = true;
          tween.tweens.splice(i, 1);
        } else {
          allDone = false;
        }
      }

      if (shouldDestroy) {
        engine.destroy(entity as Entity);
      } else if (allDone && tween.tweens.length === 0) {
        // Remove the tween component when all tweens complete
        delete (entity as any).tween;
      }
    }
  },
};
