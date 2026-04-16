/**
 * Player entity factory.
 *
 * The player uses gridPos for logical grid position and position for
 * world rendering. Movement is handled by the player-input system
 * which updates gridPos and tweens position for smooth visuals.
 */

import type { Entity } from "@engine";
import { FONTS } from "@engine";
import { GAME } from "../config";

export function createPlayer(
  col: number,
  row: number,
  worldX: number,
  worldY: number,
): Partial<Entity> {
  return {
    position: { x: worldX, y: worldY },
    ascii: {
      char: GAME.player.char,
      font: FONTS.large,
      color: GAME.player.color,
      glow: GAME.player.glow,
      layer: 5,
    },
    health: { current: GAME.player.maxHealth, max: GAME.player.maxHealth },
    tags: { values: new Set(["player"]) },
    gridPos: { col, row },
    playerStats: {
      attack: GAME.player.attack,
      defense: GAME.player.defense,
      xp: 0,
      level: 1,
      floor: 1,
    },
  };
}
