/**
 * Combat Resolution System — Handles death (phase: 'resolve').
 *
 * Checks health of all combatants after the player and enemy phases.
 * Dead enemies are destroyed with particle effects. Dead player
 * triggers game over.
 */

import {
  defineSystem,
  sfx,
  type Engine,
} from "@engine";
import { useStore } from "@ui/store";
import { GAME } from "../config";
import { addMessage, getMessages } from "../scenes/play";
import { resetPlayerMoved } from "./player-input";

export const combatSystem = defineSystem({
  name: "combat",
  phase: "resolve",

  update(engine: Engine) {
    const player = engine.findByTag("player");

    // Check dead enemies
    const enemies = engine.findAllByTag("enemy");
    for (const enemy of enemies) {
      if (!enemy.health || enemy.health.current > 0) continue;

      const name = enemy.enemyStats?.name ?? "enemy";
      const xp = enemy.enemyStats?.xp ?? 0;
      const score = GAME.scoring.perKill;

      addMessage(`The ${name} is destroyed! +${xp} XP`);

      // Particles and effects
      if (enemy.position) {
        engine.particles.explosion(enemy.position.x, enemy.position.y, enemy.ascii?.color);
        engine.floatingText(enemy.position.x, enemy.position.y - 20, `+${score}`, "#ffcc00");
      }

      // Award XP to player
      if (player?.playerStats) {
        player.playerStats.xp += xp;

        // Level up check (every 100 XP)
        const nextLevel = player.playerStats.level * 100;
        if (player.playerStats.xp >= nextLevel) {
          player.playerStats.level += 1;
          player.playerStats.attack += 1;
          player.playerStats.defense += 1;
          player.health!.max += 5;
          player.health!.current = player.health!.max;
          useStore.getState().setHealth(player.health!.current, player.health!.max);
          addMessage(`LEVEL UP! You are now level ${player.playerStats.level}!`);
          if (player.position) {
            engine.particles.sparkle(player.position.x, player.position.y, "#ffcc00");
          }
          sfx.pickup();
        }
      }

      // Update score
      const currentScore = useStore.getState().score + score;
      useStore.getState().setScore(currentScore);

      sfx.explode();
      engine.destroy(enemy);
    }

    // Check player death
    if (player?.health && player.health.current <= 0) {
      sfx.death();
      if (player.position) {
        engine.particles.explosion(player.position.x, player.position.y, GAME.player.color);
      }
      addMessage("You have perished in the depths...");

      const score = useStore.getState().score;
      const floor = player.playerStats?.floor ?? 1;
      const level = player.playerStats?.level ?? 1;

      engine.loadScene("game-over", {
        transition: "fade",
        duration: 0.5,
        data: { score, floor, level, messages: getMessages() },
      });
      return;
    }

    // Sync player health to store
    if (player?.health) {
      useStore.getState().setHealth(player.health.current, player.health.max);
    }

    // Reset for next turn and go back to player phase
    resetPlayerMoved();
    engine.turns.endPhase();
  },
});
