/**
 * ASCII Particle System.
 *
 * Spawn bursts or streams of characters with velocity, lifetime, color, fade.
 * Particles are lightweight — NOT ECS entities. Managed in a flat array.
 */

import { rng } from '../utils/math'

export interface Particle {
  x: number; y: number
  vx: number; vy: number
  char: string
  color: string
  life: number      // remaining seconds
  maxLife: number
  font: string
}

export class ParticlePool {
  particles: Particle[] = []
  private pool: Particle[] = []

  /** Spawn a burst of particles at a position. */
  burst(opts: {
    x: number; y: number
    count: number
    chars: string | string[]
    color: string
    speed?: number
    spread?: number
    lifetime?: number
    font?: string
  }): void {
    const {
      x, y, count,
      chars,
      color,
      speed = 100,
      spread = Math.PI * 2,
      lifetime = 1,
      font = '16px "Fira Code", monospace',
    } = opts

    const charArr = Array.isArray(chars) ? chars : chars.split('')

    for (let i = 0; i < count; i++) {
      const angle = rng(-spread / 2, spread / 2) - Math.PI / 2
      const spd = rng(speed * 0.3, speed)
      const p = this.pool.pop() || {} as Particle
      p.x = x
      p.y = y
      p.vx = Math.cos(angle) * spd
      p.vy = Math.sin(angle) * spd
      p.char = charArr[Math.floor(Math.random() * charArr.length)]
      p.color = color
      p.life = rng(lifetime * 0.5, lifetime)
      p.maxLife = p.life
      p.font = font
      this.particles.push(p)
    }
  }

  /** Update all particles. Call once per frame. */
  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += 50 * dt // slight gravity
      p.life -= dt
      if (p.life <= 0) {
        this.pool.push(p)
        this.particles[i] = this.particles[this.particles.length - 1]
        this.particles.pop()
      }
    }
  }

  /** Render all particles. Call from renderer. */
  render(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife)
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.font = p.font
      ctx.fillStyle = p.color
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'center'
      ctx.fillText(p.char, p.x, p.y)
      ctx.restore()
    }
  }

  clear(): void {
    this.pool.push(...this.particles)
    this.particles.length = 0
  }
}
