/**
 * Player Input System — Turn-based movement (phase: 'player').
 *
 * Reads arrow/WASD keys, validates grid movement against walls,
 * picks up items, attacks adjacent enemies, and descends stairs.
 * Only advances the turn on valid actions.
 */

import {
  defineSystem,
  gridToWorld,
  sfx,
  type Engine,
} from "@engine";
import { useStore } from "@ui/store";
import { GAME } from "../config";
import { getNavGrid, getDungeonGrid, addMessage, getMessages } from "../scenes/play";

let hasMoved = false;

export const playerInputSystem = defineSystem({
  name: "playerInput",
  phase: "player",

  init() {
    hasMoved = false;
  },

  update(engine: Engine) {
    if (hasMoved) return;

    const player = engine.findByTag("player");
    if (!player?.gridPos || !player.health || !player.playerStats) return;

    const kb = engine.keyboard;
    let dx = 0;
    let dy = 0;

    if (kb.pressed("ArrowUp") || kb.pressed("KeyW")) dy = -1;
    else if (kb.pressed("ArrowDown") || kb.pressed("KeyS")) dy = 1;
    else if (kb.pressed("ArrowLeft") || kb.pressed("KeyA")) dx = -1;
    else if (kb.pressed("ArrowRight") || kb.pressed("KeyD")) dx = 1;

    // Wait in place (skip turn)
    if (kb.pressed("Space") || kb.pressed("Period")) {
      addMessage("You wait...");
      hasMoved = true;
      engine.turns.endPhase();
      return;
    }

    if (dx === 0 && dy === 0) return;

    const newCol = player.gridPos.col + dx;
    const newRow = player.gridPos.row + dy;

    const navGrid = getNavGrid();
    if (!navGrid || !navGrid.inBounds(newCol, newRow)) return;

    // Check for enemy at target position
    const enemies = engine.findAllByTag("enemy");
    const enemyAtTarget = enemies.find(
      (e) => e.gridPos && e.gridPos.col === newCol && e.gridPos.row === newRow,
    );

    if (enemyAtTarget) {
      // Attack the enemy
      const atk = player.playerStats.attack;
      const def = enemyAtTarget.enemyStats?.defense ?? 0;
      const damage = Math.max(1, atk - def);

      enemyAtTarget.health!.current -= damage;

      const enemyName = enemyAtTarget.enemyStats?.name ?? "enemy";
      addMessage(`You hit the ${enemyName} for ${damage} damage!`);

      const worldPos = gridToWorld(newCol, newRow, GAME.cellSize);
      engine.floatingText(worldPos.x, worldPos.y - 12, `-${damage}`, "#ff4444");
      engine.camera.shake(3);
      sfx.hit();

      hasMoved = true;
      engine.turns.endPhase();
      return;
    }

    // Check wall collision
    const tile = navGrid.get(newCol, newRow);
    if (tile === GAME.dungeon.wallChar) return;

    // Move player
    player.gridPos.col = newCol;
    player.gridPos.row = newRow;

    // Tween to new world position
    const worldPos = gridToWorld(newCol, newRow, GAME.cellSize);
    engine.tweenEntity(player, "position.x", player.position!.x, worldPos.x, 0.1, "easeOut");
    engine.tweenEntity(player, "position.y", player.position!.y, worldPos.y, 0.1, "easeOut");

    // Check for items at new position
    const items = engine.findAllByTag("item");
    const itemHere = items.find(
      (e) => e.gridPos && e.gridPos.col === newCol && e.gridPos.row === newRow,
    );

    if (itemHere?.itemData) {
      pickupItem(engine, player, itemHere);
    }

    // Check for stairs
    const dungeonGrid = getDungeonGrid();
    if (dungeonGrid && dungeonGrid[newRow]?.[newCol] === GAME.dungeon.stairsChar) {
      const floor = player.playerStats.floor;
      const score = useStore.getState().score;
      addMessage(`You descend to floor ${floor + 1}...`);
      sfx.pickup();

      engine.loadScene("play", {
        transition: "dissolve",
        duration: 0.4,
        data: {
          floor: floor + 1,
          playerHealth: player.health.current,
          playerMaxHealth: player.health.max,
          playerStats: { ...player.playerStats, floor: floor + 1 },
          score: score + GAME.scoring.perFloor,
          messages: getMessages(),
        },
      });
      return;
    }

    hasMoved = true;
    engine.turns.endPhase();
  },
});

function pickupItem(engine: Engine, player: any, item: any): void {
  const data = item.itemData;

  switch (data.type) {
    case "healthPotion": {
      const healed = Math.min(data.healAmount, player.health.max - player.health.current);
      player.health.current += healed;
      useStore.getState().setHealth(player.health.current, player.health.max);
      addMessage(`You drink a ${data.name}. +${healed} HP!`);
      engine.floatingText(
        player.position.x,
        player.position.y - 12,
        `+${healed}`,
        GAME.items.healthPotion.color,
      );
      sfx.pickup();
      break;
    }
    case "sword": {
      player.playerStats.attack += data.attackBonus;
      addMessage(`You pick up a ${data.name}. +${data.attackBonus} ATK!`);
      engine.floatingText(
        player.position.x,
        player.position.y - 12,
        `+${data.attackBonus} ATK`,
        GAME.items.sword.color,
      );
      sfx.pickup();
      break;
    }
    case "shield": {
      player.playerStats.defense += data.defenseBonus;
      addMessage(`You pick up a ${data.name}. +${data.defenseBonus} DEF!`);
      engine.floatingText(
        player.position.x,
        player.position.y - 12,
        `+${data.defenseBonus} DEF`,
        GAME.items.shield.color,
      );
      sfx.pickup();
      break;
    }
  }

  engine.particles.sparkle(item.position.x, item.position.y, item.ascii?.color);
  engine.destroy(item);
}

/** Called at the start of each player phase to allow new input. */
export function resetPlayerMoved(): void {
  hasMoved = false;
}
