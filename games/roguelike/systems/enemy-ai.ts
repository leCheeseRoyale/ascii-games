/**
 * Enemy AI System — Executes enemy actions (phase: 'enemy').
 *
 * Reads the enemyIntent set by each enemy's stateMachine during the
 * state-machine update, then executes movement or attacks.
 * Uses gridToWorld() and engine.tweenEntity() for smooth movement.
 */

import {
  defineSystem,
  gridDistance,
  gridToWorld,
  sfx,
  type Engine,
} from "@engine";
import { GAME } from "../config";
import { addMessage, getNavGrid } from "../scenes/play";

export const enemyAISystem = defineSystem({
  name: "enemyAI",
  phase: "enemy",

  update(engine: Engine) {
    const player = engine.findByTag("player");
    if (!player?.gridPos) {
      engine.turns.endPhase();
      return;
    }

    const navGrid = getNavGrid();
    const enemies = engine.findAllByTag("enemy");

    // Collect all enemy grid positions to avoid collisions
    const occupied = new Set<string>();
    occupied.add(`${player.gridPos.col},${player.gridPos.row}`);
    for (const e of enemies) {
      if (e.gridPos) occupied.add(`${e.gridPos.col},${e.gridPos.row}`);
    }

    for (const enemy of enemies) {
      if (!enemy.gridPos || !enemy.position || !enemy.enemyIntent) continue;
      // Skip dead enemies — they'll be removed in the resolve phase
      if (enemy.health && enemy.health.current <= 0) {
        enemy.enemyIntent = undefined;
        continue;
      }

      const intent = enemy.enemyIntent;

      if (intent.type === "move") {
        const targetKey = `${intent.targetCol},${intent.targetRow}`;
        const playerKey = `${player.gridPos.col},${player.gridPos.row}`;

        // Don't move onto player or other enemies
        if (targetKey === playerKey) {
          // Switch to attack instead
          performAttack(engine, enemy, player);
        } else if (!occupied.has(targetKey)) {
          // Check that target is walkable
          const canPhase = enemy.enemyStats?.phaseWalls;
          const tile = navGrid?.get(intent.targetCol, intent.targetRow);
          const walkable = canPhase || tile !== GAME.dungeon.wallChar;

          if (walkable) {
            // Remove from old position in occupied set
            occupied.delete(`${enemy.gridPos.col},${enemy.gridPos.row}`);

            // Move
            enemy.gridPos.col = intent.targetCol;
            enemy.gridPos.row = intent.targetRow;
            occupied.add(targetKey);

            // Tween visual position
            const worldPos = gridToWorld(intent.targetCol, intent.targetRow, GAME.cellSize);
            engine.tweenEntity(enemy, "position.x", enemy.position.x, worldPos.x, 0.1, "easeOut");
            engine.tweenEntity(enemy, "position.y", enemy.position.y, worldPos.y, 0.1, "easeOut");
          }
        }
      } else if (intent.type === "attack") {
        // Ensure still adjacent
        const dist = gridDistance(enemy.gridPos, player.gridPos);
        if (dist <= 1) {
          performAttack(engine, enemy, player);
        }
      }

      // Clear intent for next turn
      enemy.enemyIntent = undefined;
    }

    engine.turns.endPhase();
  },
});

function performAttack(engine: Engine, enemy: any, player: any): void {
  const atk = enemy.enemyStats?.attack ?? 1;
  const def = player.playerStats?.defense ?? 0;
  const damage = Math.max(1, atk - def);

  player.health.current -= damage;

  const name = enemy.enemyStats?.name ?? "Enemy";
  addMessage(`The ${name} hits you for ${damage} damage!`);

  engine.floatingText(
    player.position.x,
    player.position.y - 12,
    `-${damage}`,
    "#ff4444",
  );
  engine.camera.shake(4);
  sfx.hit();
}
