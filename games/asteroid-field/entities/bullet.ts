import { FONTS, type Entity } from "@engine";
import { GAME } from "../config";

export function createBullet(x: number, y: number, vx: number, vy: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx, vy },
    ascii: {
      char: GAME.bullet.char,
      font: FONTS.normal,
      color: GAME.bullet.color,
      glow: GAME.bullet.glow,
    },
    collider: { type: "circle", width: GAME.bullet.size, height: GAME.bullet.size },
    lifetime: { remaining: GAME.bullet.lifetime },
    tags: { values: new Set(["bullet"]) },
  };
}
