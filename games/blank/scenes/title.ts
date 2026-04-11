import { defineScene, FONTS, COLORS } from '@engine'
import type { Engine } from '@engine'
import { useStore } from '@ui/store'
import { GAME } from '../config'

export const titleScene = defineScene({
  name: 'title',

  setup(engine: Engine) {
    useStore.getState().setScreen('menu')

    // Game title — uses GAME.title from config.ts
    engine.spawn({
      position: { x: engine.centerX, y: engine.centerY - 60 },
      ascii: { char: GAME.title, font: FONTS.huge, color: COLORS.accent, glow: '#00ff8844' },
    })

    engine.spawn({
      position: { x: engine.centerX, y: engine.centerY + 40 },
      ascii: { char: '[ PRESS SPACE ]', font: FONTS.bold, color: COLORS.fg },
    })
  },

  update(engine: Engine) {
    if (engine.keyboard.pressed('Space')) {
      engine.loadScene('play')
    }
  },
})
