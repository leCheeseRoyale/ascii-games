import { defineSystem } from "@engine";

export const movementSystem = defineSystem({
  name: "movement",
  update(engine, dt) {
    for (const e of engine.world.with("position", "velocity")) {
      e.position.x += e.velocity.vx * dt;
      e.position.y += e.velocity.vy * dt;
    }
  },
});
