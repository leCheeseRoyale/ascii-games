import { FONTS, pick, rng, type Entity } from "@engine";
import { GAME } from "../config";

export function createAsteroid(x: number, y: number, vx: number, vy: number): Partial<Entity> {
  const scale = rng(0.8, 2.2);
  const size = 16 * scale;
  return {
    position: { x, y },
    velocity: { vx, vy },
    ascii: {
      char: pick(GAME.asteroid.chars),
      font: FONTS.normal,
      color: pick(GAME.asteroid.colors),
      scale,
    },
    collider: { type: "circle", width: size, height: size },
    tags: { values: new Set(["asteroid"]) },
  };
}
