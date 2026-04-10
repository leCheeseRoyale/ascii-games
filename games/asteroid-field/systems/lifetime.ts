import { defineSystem } from "@engine";

export const lifetimeSystem = defineSystem({
  name: "lifetime",
  update(engine, dt) {
    const toRemove: any[] = [];
    for (const e of engine.world.with("lifetime")) {
      e.lifetime.remaining -= dt;
      if (e.lifetime.remaining <= 0) {
        toRemove.push(e);
      }
    }
    for (const e of toRemove) {
      engine.destroy(e);
    }
  },
});
