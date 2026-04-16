import type { Entity } from "@engine";
import { FONTS } from "@engine";
import { GAME } from "../config";

export function createStar(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    ascii: {
      char: GAME.star.char,
      font: FONTS.large,
      color: GAME.star.color,
      glow: GAME.star.glow,
    },
    collider: { type: "circle", width: 16, height: 16, sensor: true },
    tags: { values: new Set(["star"]) },
  };
}
