import { Cooldown, defineSystem, rng } from "@engine";
import { GAME } from "../config";
import { createStar } from "../entities/star";

let spawnTimer = new Cooldown(GAME.star.spawnInterval);

export const starSpawnerSystem = defineSystem({
  name: "starSpawner",

  init() {
    spawnTimer = new Cooldown(GAME.star.spawnInterval);
  },

  update(engine, dt) {
    spawnTimer.update(dt);
    if (spawnTimer.fire()) {
      const x = rng(50, engine.width - 50);
      const y = rng(engine.height * 0.2, engine.height * 0.7);
      engine.spawn(createStar(x, y));
    }
  },
});
