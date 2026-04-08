/**
 * Asteroid Field — Game Setup
 *
 * Registers all scenes and returns the starting scene name.
 */

import type { Engine } from "@engine";
import { gameOverScene } from "./scenes/game-over";
import { playScene } from "./scenes/play";
import { titleScene } from "./scenes/title";

export function setupGame(engine: Engine): string {
  engine.registerScene(titleScene);
  engine.registerScene(playScene);
  engine.registerScene(gameOverScene);
  return "title";
}
