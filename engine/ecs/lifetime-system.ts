import type { Entity } from "@shared/types";
import { defineSystem, SystemPriority } from "./systems";

export const lifetimeSystem = defineSystem({
  name: "_lifetime",
  priority: SystemPriority.lifetime,
  update(engine, dt) {
    const toRemove: Entity[] = [];
    for (const e of engine.world.with("lifetime")) {
      e.lifetime.remaining -= dt;
      if (e.lifetime.remaining <= 0) {
        toRemove.push(e as Entity);
      }
    }
    for (const e of toRemove) {
      engine.destroy(e);
    }
  },
});
