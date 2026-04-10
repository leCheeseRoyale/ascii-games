import { defineScene } from '@engine'
import type { Engine } from '@engine'
import { useStore } from '@ui/store'
import { createPlayer } from '../entities/player'
import { collectionSystem } from '../systems/collection'
import { playerInputSystem } from '../systems/player-input'
import { starSpawnerSystem } from '../systems/star-spawner'

export const playScene = defineScene({
  name: 'play',

  setup(engine: Engine) {
    useStore.getState().setScreen('playing')
    useStore.getState().setScore(0)

    // Spawn player near bottom
    engine.spawn(createPlayer(engine.width / 2, engine.height * 0.85))

    // Ground line (visual only)
    const groundY = engine.height * 0.85 + 20
    engine.spawn({
      position: { x: engine.width / 2, y: groundY },
      ascii: {
        char: '\u2500'.repeat(80),
        font: '16px "Fira Code", monospace',
        color: '#444444',
      },
    })

    engine.addSystem(playerInputSystem)
    engine.addSystem(starSpawnerSystem)
    engine.addSystem(collectionSystem)
  },

  update(engine: Engine) {
    const entities = [...engine.world.with('position')].length
    useStore.getState().setDebugInfo(Math.round(engine.time.fps), entities)

    if (engine.keyboard.pressed('Escape')) {
      if (engine.isPaused) {
        engine.resume()
        useStore.getState().setScreen('playing')
      } else {
        engine.pause()
        useStore.getState().setScreen('paused')
      }
    }
  },
})
