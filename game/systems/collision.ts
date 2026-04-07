import { defineSystem, overlaps, sfx, ParticlePool, pick } from '@engine'
import { GAME } from '../config'
import { useStore } from '@ui/store'

// Shared particle pool for explosions — accessed by play scene for rendering
export const particles = new ParticlePool()

let score = 0
let invincibleTimer = 0

export function getScore() { return score }
export function resetScore() { score = 0 }

export const collisionSystem = defineSystem({
  name: 'collision',

  init() {
    score = 0
    invincibleTimer = 0
  },

  update(engine, dt) {
    invincibleTimer = Math.max(0, invincibleTimer - dt)
    particles.update(dt)

    const bullets = [...engine.world.with('position', 'collider', 'tags')]
      .filter(e => e.tags.values.has('bullet'))
    const asteroids = [...engine.world.with('position', 'collider', 'tags')]
      .filter(e => e.tags.values.has('asteroid'))
    const players = [...engine.world.with('position', 'collider', 'player', 'health')]

    // Bullet ↔ Asteroid collisions
    for (const bullet of bullets) {
      for (const asteroid of asteroids) {
        if (overlaps(bullet, asteroid)) {
          // Explosion particles
          const color = asteroid.ascii?.color ?? '#ffaa22'
          particles.burst({
            x: asteroid.position.x,
            y: asteroid.position.y,
            count: 12,
            chars: ['.', '*', '·', '+', '×'],
            color,
            speed: 120,
            lifetime: 0.6,
          })

          score += GAME.scoring.perKill
          useStore.getState().setScore(score)

          engine.destroy(bullet)
          engine.destroy(asteroid)
          sfx.hit()
          engine.camera.shake(3)
          break // bullet is gone, stop checking
        }
      }
    }

    // Player ↔ Asteroid collisions
    for (const player of players) {
      if (invincibleTimer > 0) break
      for (const asteroid of asteroids) {
        // Skip already-destroyed asteroids
        if (!asteroid.position) continue
        if (overlaps(player, asteroid)) {
          player.health.current -= 1
          useStore.getState().setHealth(player.health.current, player.health.max)
          invincibleTimer = GAME.player.invincibleTime

          // Explosion + shake
          particles.burst({
            x: player.position.x,
            y: player.position.y,
            count: 20,
            chars: ['!', '#', '*', '@', '×'],
            color: '#ff4444',
            speed: 150,
            lifetime: 0.8,
          })
          engine.camera.shake(8)
          sfx.explode()

          engine.destroy(asteroid)

          if (player.health.current <= 0) {
            sfx.death()
            // Big death explosion
            particles.burst({
              x: player.position.x,
              y: player.position.y,
              count: 40,
              chars: ['@', '#', '*', '!', '×', '·'],
              color: '#00ff88',
              speed: 200,
              lifetime: 1.5,
            })
            engine.loadScene('game-over')
            return
          }
          break
        }
      }
    }

    // Clean up off-screen asteroids (with margin)
    const margin = 100
    const w = engine.width
    const h = engine.height
    for (const asteroid of asteroids) {
      if (!asteroid.position) continue
      const { x, y } = asteroid.position
      if (x < -margin || x > w + margin || y < -margin || y > h + margin) {
        engine.destroy(asteroid)
      }
    }
  },
})
