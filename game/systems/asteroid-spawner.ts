import { defineSystem, rng, rngInt } from "@engine";
import { GAME } from "../config";
import { createAsteroid } from "../entities/asteroid";

let timer = 0;
let elapsed = 0;

export const asteroidSpawnerSystem = defineSystem({
  name: "asteroidSpawner",

  init() {
    timer = 0;
    elapsed = 0;
  },

  update(engine, dt) {
    elapsed += dt;

    // Difficulty ramp: spawn faster and asteroids move faster over time
    const interval = Math.max(
      GAME.asteroid.minSpawnInterval,
      GAME.asteroid.spawnInterval - elapsed * GAME.asteroid.difficultyRamp,
    );
    const speedBonus = elapsed * GAME.asteroid.speedRamp;

    timer -= dt;
    if (timer > 0) return;
    timer = interval;

    const w = engine.width;
    const h = engine.height;

    // Pick a random edge (0=top, 1=right, 2=bottom, 3=left)
    const edge = rngInt(0, 3);
    let x: number, y: number;

    switch (edge) {
      case 0:
        x = rng(0, w);
        y = -30;
        break; // top
      case 1:
        x = w + 30;
        y = rng(0, h);
        break; // right
      case 2:
        x = rng(0, w);
        y = h + 30;
        break; // bottom
      default:
        x = -30;
        y = rng(0, h);
        break; // left
    }

    // Aim roughly toward center with some randomness
    const cx = w / 2 + rng(-w * 0.3, w * 0.3);
    const cy = h / 2 + rng(-h * 0.3, h * 0.3);
    const dx = cx - x;
    const dy = cy - y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = rng(GAME.asteroid.minSpeed, GAME.asteroid.maxSpeed) + speedBonus;
    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;

    engine.spawn(createAsteroid(x, y, vx, vy));
  },
});
