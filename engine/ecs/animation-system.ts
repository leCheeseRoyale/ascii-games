import type { Entity } from "@shared/types";
import type { Engine } from "../core/engine";
import type { System } from "./systems";

export const animationSystem: System = {
  name: "_animation",
  update(engine: Engine, dt: number) {
    for (const entity of [...engine.world.with("animation")]) {
      const anim = entity.animation;
      if (anim.playing === false) continue;

      anim.elapsed += dt;
      const frameDur = anim.frames[anim.currentFrame]?.duration ?? anim.frameDuration;

      if (anim.elapsed >= frameDur) {
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
              continue;
            }
            continue;
          }
        }

        // Apply frame to entity
        const frame = anim.frames[anim.currentFrame];
        if (frame.char && (entity as any).ascii) {
          (entity as any).ascii.char = frame.char;
        }
        if (frame.lines && (entity as any).sprite) {
          (entity as any).sprite.lines = frame.lines;
        }
        if (frame.color) {
          if ((entity as any).ascii) (entity as any).ascii.color = frame.color;
          if ((entity as any).sprite) (entity as any).sprite.color = frame.color;
        }
      }
    }
  },
};
