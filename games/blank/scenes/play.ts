import { defineScene, FONTS, COLORS } from '@engine'
import type { Engine } from '@engine'
import { useStore } from '@ui/store'

export const playScene = defineScene({
  name: 'play',

  setup(engine: Engine) {
    useStore.getState().setScreen('playing')

    // Player
    engine.spawn({
      position: { x: engine.width / 2, y: engine.height / 2 },
      velocity: { vx: 0, vy: 0 },
      ascii: { char: '@', font: FONTS.large, color: COLORS.accent, glow: '#00ff8844' },
    })
  },

  update(engine: Engine, dt: number) {
    // Move player with WASD/arrows
    for (const e of engine.world.with('position', 'velocity', 'ascii')) {
      const speed = 200
      e.velocity.vx = 0
      e.velocity.vy = 0
      if (engine.keyboard.held('ArrowLeft') || engine.keyboard.held('KeyA')) e.velocity.vx = -speed
      if (engine.keyboard.held('ArrowRight') || engine.keyboard.held('KeyD')) e.velocity.vx = speed
      if (engine.keyboard.held('ArrowUp') || engine.keyboard.held('KeyW')) e.velocity.vy = -speed
      if (engine.keyboard.held('ArrowDown') || engine.keyboard.held('KeyS')) e.velocity.vy = speed
      // _physics system handles position += velocity * dt automatically
    }

    if (engine.keyboard.pressed('Escape')) {
      engine.loadScene('title')
    }
  },
})
