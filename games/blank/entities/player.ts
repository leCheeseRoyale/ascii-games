import { createTags, FONTS } from "@engine";
import type { Entity } from "@shared/types";
import { GAME } from "../config";

export function createPlayer(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    ascii: { char: "@", font: FONTS.large, color: GAME.player.color, glow: GAME.player.glow },
    tags: createTags("player"),
    player: { index: 0 },
    screenWrap: { margin: 10 },
  };
}
