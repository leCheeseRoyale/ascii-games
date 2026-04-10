import type { Engine } from '@engine'
import { titleScene } from './scenes/title'
import { playScene } from './scenes/play'

export function setupGame(engine: Engine): string {
  engine.registerScene(titleScene)
  engine.registerScene(playScene)
  return 'title'
}
