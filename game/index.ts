/**
 * Asteroid Field — Game Setup
 *
 * Registers all scenes and returns the starting scene name.
 */

import type { Engine } from '@engine'
import { titleScene } from './scenes/title'
import { playScene } from './scenes/play'
import { gameOverScene } from './scenes/game-over'

export function setupGame(engine: Engine): string {
  engine.registerScene(titleScene)
  engine.registerScene(playScene)
  engine.registerScene(gameOverScene)
  return 'title'
}
