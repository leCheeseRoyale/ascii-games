import type { System } from "./systems";
import { SystemPriority } from "./systems";

export const springSystem: System = {
  name: "_spring",
  priority: SystemPriority.spring,
  update(engine, _dt) {
    for (const e of engine.world.with("position", "velocity", "spring")) {
      const s = e.spring;
      const dx = s.targetX - e.position.x;
      const dy = s.targetY - e.position.y;

      e.velocity.vx += dx * s.strength;
      e.velocity.vy += dy * s.strength;
      e.velocity.vx *= s.damping;
      e.velocity.vy *= s.damping;
    }
  },
};
