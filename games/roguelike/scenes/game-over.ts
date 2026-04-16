/**
 * Game Over Scene — Death screen with stats.
 *
 * Shows final score, floor reached, level, and a message log excerpt.
 * Uses submitScore for leaderboard persistence. UIMenu for restart options.
 */

import {
  COLORS,
  defineScene,
  FONTS,
  removeStorage,
  sfx,
  shake,
  submitScore,
  UIMenu,
  type Engine,
} from "@engine";
import { useStore } from "@ui/store";
import { GAME } from "../config";

let menu: UIMenu;

export const gameOverScene = defineScene({
  name: "game-over",

  setup(engine: Engine) {
    useStore.getState().setScreen("gameOver");

    const cx = engine.centerX;
    const cy = engine.centerY;
    const data = engine.sceneData;

    const score = data.score ?? useStore.getState().score;
    const floor = data.floor ?? 1;
    const level = data.level ?? 1;
    const messages: string[] = data.messages ?? [];

    // Submit score to leaderboard
    submitScore(score, `Lv${level} Floor ${floor}`);

    // Death explosion
    engine.particles.burst({
      x: cx,
      y: cy - 60,
      count: 40,
      chars: ["@", "#", "*", "!", "+", "."],
      color: GAME.player.color,
      speed: 200,
      lifetime: 2.0,
    });
    engine.particles.burst({
      x: cx,
      y: cy - 60,
      count: 20,
      chars: ["*", "."],
      color: "#ff4444",
      speed: 150,
      lifetime: 1.5,
    });

    // "YOU DIED" title with shake effect
    engine.spawn({
      position: { x: cx, y: cy - 100 },
      ascii: {
        char: "YOU DIED",
        font: FONTS.huge,
        color: COLORS.danger,
        glow: "#ff444444",
      },
      textEffect: { fn: shake(2) },
    });

    // Score display
    engine.spawn({
      position: { x: cx, y: cy - 30 },
      ascii: {
        char: `SCORE: ${score}`,
        font: FONTS.boldLarge,
        color: COLORS.fg,
      },
    });

    // Stats
    engine.spawn({
      position: { x: cx, y: cy + 10 },
      ascii: {
        char: `Floor ${floor}  |  Level ${level}`,
        font: FONTS.normal,
        color: COLORS.accent,
      },
    });

    // Last messages
    if (messages.length > 0) {
      const lastMessages = messages.slice(-3);
      for (let i = 0; i < lastMessages.length; i++) {
        engine.spawn({
          position: { x: cx, y: cy + 50 + i * 20 },
          ascii: {
            char: lastMessages[i],
            font: FONTS.small,
            color: COLORS.dim,
          },
        });
      }
    }

    // Clear save data on death
    removeStorage("roguelike-save");

    // Menu
    menu = new UIMenu(["Try Again", "Title Screen"], {
      border: "rounded",
      selectedColor: COLORS.accent,
      borderColor: "#555555",
      bg: "rgba(10, 10, 10, 0.9)",
      anchor: "center",
      onMove: () => sfx.menu(),
    });
  },

  update(engine: Engine) {
    menu.update(engine);
    menu.draw(engine.ui, engine.centerX, engine.centerY + 150);

    if (menu.confirmed) {
      sfx.menu();
      switch (menu.selectedIndex) {
        case 0:
          engine.loadScene("play", {
            transition: "fade",
            duration: 0.4,
            data: { floor: 1 },
          });
          break;
        case 1:
          engine.loadScene("title", { transition: "fade", duration: 0.4 });
          break;
      }
    }
  },
});
