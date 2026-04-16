/**
 * Roguelike — Game Setup
 *
 * The roguelike draws ALL UI on the canvas (UIMenu, engine.ui.*, engine.dialog).
 * Return empty `screens` and `hud` to suppress the default React overlays.
 */

import type { Engine } from "@engine";
import { setStoragePrefix } from "@engine";
import { gameOverScene } from "./scenes/game-over";
import { playScene } from "./scenes/play";
import { titleScene } from "./scenes/title";

const Empty = () => null;

export function setupGame(engine: Engine) {
  setStoragePrefix("roguelike");
  engine.registerScene(titleScene);
  engine.registerScene(playScene);
  engine.registerScene(gameOverScene);
  return {
    startScene: "title",
    screens: {
      menu: Empty,
      playing: Empty,
      gameOver: Empty,
    },
    hud: [],
  };
}
