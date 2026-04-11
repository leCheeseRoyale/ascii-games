import type { Engine } from '@engine'
import { titleScene } from './scenes/title'
import { playScene } from './scenes/play'

// Register all your scenes here. The return value is the starting scene.
// Add new scenes:  bun run new:scene <name>

export function setupGame(engine: Engine): string {
  engine.registerScene(titleScene)
  engine.registerScene(playScene)
  return 'title'
}
