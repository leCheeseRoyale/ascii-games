import type { Entity } from "@shared/types";
import type { Engine } from "../core/engine";
import { type System, SystemPriority } from "./systems";

export const animationSystem: System = {
  name: "_animation",
  priority: SystemPriority.animation,
  update(engine: Engine, dt: number) {
    for (const entity of [...engine.world.with("animation")]) {
      const anim = entity.animation;
      if (anim.playing === false) continue;

      anim.elapsed += dt;
      const frameDur = anim.frames[anim.currentFrame]?.duration ?? anim.frameDuration;

      if (anim.elapsed < frameDur) continue;

      anim.elapsed -= frameDur;
      anim.currentFrame++;

      if (anim.currentFrame >= anim.frames.length) {
        if (anim.loop !== false) {
          anim.currentFrame = 0;
        } else {
          anim.currentFrame = anim.frames.length - 1;
          anim.playing = false;
          if (anim.onComplete === "destroy") {
            engine.destroy(entity as Entity);
          }
          continue;
        }
      }

      const frame = anim.frames[anim.currentFrame];
      const e = entity as Partial<Entity>;
      if (frame.char && e.ascii) e.ascii.char = frame.char;
      if (frame.lines && e.sprite) e.sprite.lines = frame.lines;
      if (frame.color) {
        if (e.ascii) e.ascii.color = frame.color;
        if (e.sprite) e.sprite.color = frame.color;
      }
    }
  },
};
