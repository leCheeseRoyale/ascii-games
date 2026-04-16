/**
 * Item entity factories — Health Potion, Sword, Shield.
 *
 * Items sit on the dungeon floor and are picked up when the player
 * walks over them (handled by the player-input system).
 */

import type { Entity } from "@engine";
import { FONTS } from "@engine";
import { GAME } from "../config";

export function createHealthPotion(
  col: number,
  row: number,
  worldX: number,
  worldY: number,
): Partial<Entity> {
  return {
    position: { x: worldX, y: worldY },
    ascii: {
      char: GAME.items.healthPotion.char,
      font: FONTS.large,
      color: GAME.items.healthPotion.color,
      layer: 2,
    },
    tags: { values: new Set(["item", "healthPotion"]) },
    gridPos: { col, row },
    itemData: {
      name: GAME.items.healthPotion.name,
      type: "healthPotion" as const,
      healAmount: GAME.items.healthPotion.healAmount,
    },
  };
}

export function createSword(
  col: number,
  row: number,
  worldX: number,
  worldY: number,
): Partial<Entity> {
  return {
    position: { x: worldX, y: worldY },
    ascii: {
      char: GAME.items.sword.char,
      font: FONTS.large,
      color: GAME.items.sword.color,
      layer: 2,
    },
    tags: { values: new Set(["item", "sword"]) },
    gridPos: { col, row },
    itemData: {
      name: GAME.items.sword.name,
      type: "sword" as const,
      attackBonus: GAME.items.sword.attackBonus,
    },
  };
}

export function createShield(
  col: number,
  row: number,
  worldX: number,
  worldY: number,
): Partial<Entity> {
  return {
    position: { x: worldX, y: worldY },
    ascii: {
      char: GAME.items.shield.char,
      font: FONTS.large,
      color: GAME.items.shield.color,
      layer: 2,
    },
    tags: { values: new Set(["item", "shield"]) },
    gridPos: { col, row },
    itemData: {
      name: GAME.items.shield.name,
      type: "shield" as const,
      defenseBonus: GAME.items.shield.defenseBonus,
    },
  };
}
