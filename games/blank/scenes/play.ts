import { defineScene, FONTS, COLORS } from '@engine'
import type { Engine } from '@engine'
import { useStore } from '@ui/store'
import { GAME } from '../config'

export const playScene = defineScene({
  name: 'play',

  setup(engine: Engine) {
    useStore.getState().setScreen('playing')

    // Player — move with WASD or arrow keys
    engine.spawn({
      position: { x: engine.centerX, y: engine.centerY },
      velocity: { vx: 0, vy: 0 },
      ascii: { char: '@', font: FONTS.large, color: GAME.player.color, glow: GAME.player.glow },
      tags: { values: new Set(['player']) },
      screenWrap: { margin: 10 },
    })

    // ── Next steps ──────────────────────────────────────────────────
    //
    // 1. Add enemies:
    //      bun run new:entity enemy
    //      Then spawn them on a timer:
    //      engine.spawnEvery(1.0, () => engine.spawn(createEnemy(...)))
    //
    // 2. Add collision:
    //      bun run new:system collision
    //      Give entities a collider: { type: 'circle', width: 20, height: 20 }
    //      Check hits: if (overlaps(a, b)) { ... }
    //
    // 3. Add scoring:
    //      import { useStore } from '@ui/store'
    //      useStore.getState().setScore(score)
    //
    // 4. Add a game-over scene:
    //      bun run new:scene game-over
    //      engine.loadScene('game-over')
    //
    // See docs/TUTORIAL.md for a full walkthrough.
    // ────────────────────────────────────────────────────────────────
  },

  update(engine: Engine, dt: number) {
    // Move player with WASD/arrows
    const player = engine.findByTag('player')
    if (player?.velocity) {
      const speed = GAME.player.speed
      player.velocity.vx = 0
      player.velocity.vy = 0
      if (engine.keyboard.held('ArrowLeft') || engine.keyboard.held('KeyA')) player.velocity.vx = -speed
      if (engine.keyboard.held('ArrowRight') || engine.keyboard.held('KeyD')) player.velocity.vx = speed
      if (engine.keyboard.held('ArrowUp') || engine.keyboard.held('KeyW')) player.velocity.vy = -speed
      if (engine.keyboard.held('ArrowDown') || engine.keyboard.held('KeyS')) player.velocity.vy = speed
      // _physics system handles position += velocity * dt automatically
    }

    if (engine.keyboard.pressed('Escape')) {
      engine.loadScene('title')
    }
  },
})
