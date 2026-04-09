import type { Engine } from "../core/engine";
import type { System } from "./systems";

export const emitterSystem: System = {
  name: "_emitter",
  update(engine: Engine, dt: number) {
    for (const e of engine.world.with("position", "emitter")) {
      const em = e.emitter;
      em._acc += dt;
      const interval = 1 / em.rate;
      while (em._acc >= interval) {
        em._acc -= interval;
        engine.particles.burst({
          x: e.position.x,
          y: e.position.y,
          count: 1,
          chars: em.char,
          color: em.color,
          speed: em.speed,
          spread: em.spread,
          lifetime: em.lifetime,
        });
      }
    }
  },
};
