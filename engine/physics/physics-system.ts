/**
 * Built-in physics system — velocity/acceleration integration, gravity, friction, drag, bounce.
 *
 * Runs automatically for all entities with position+velocity.
 * Entities with a `physics` component get additional forces applied.
 */

import type { Engine } from '../core/engine'
import type { System } from '../ecs/systems'

export const physicsSystem: System = {
  name: '_physics',

  update(engine: Engine, dt: number) {
    const w = engine.width
    const h = engine.height

    // ── Pass 1: apply acceleration → velocity (entities with all three) ──
    for (const e of engine.world.with('position', 'velocity', 'acceleration')) {
      e.velocity.vx += e.acceleration.ax * dt
      e.velocity.vy += e.acceleration.ay * dt
    }

    // ── Pass 2: apply physics forces (entities with physics component) ──
    for (const e of engine.world.with('position', 'velocity', 'physics')) {
      const p = e.physics

      // Gravity (added to vy)
      const gravity = p.gravity ?? 0
      if (gravity) {
        e.velocity.vy += gravity * dt
      }

      // Friction (ground friction on vx — only when grounded or always if no grounded tracking)
      const friction = p.friction ?? 0
      if (friction) {
        const factor = Math.max(0, 1 - friction * dt)
        e.velocity.vx *= factor
      }

      // Drag (air resistance on both axes)
      const drag = p.drag ?? 0
      if (drag) {
        const factor = Math.max(0, 1 - drag * dt)
        e.velocity.vx *= factor
        e.velocity.vy *= factor
      }

      // Clamp to maxSpeed
      if (p.maxSpeed != null && p.maxSpeed > 0) {
        const speed2 = e.velocity.vx * e.velocity.vx + e.velocity.vy * e.velocity.vy
        const max2 = p.maxSpeed * p.maxSpeed
        if (speed2 > max2) {
          const ratio = p.maxSpeed / Math.sqrt(speed2)
          e.velocity.vx *= ratio
          e.velocity.vy *= ratio
        }
      }
    }

    // ── Pass 3: integrate velocity → position ──
    for (const e of engine.world.with('position', 'velocity')) {
      e.position.x += e.velocity.vx * dt
      e.position.y += e.velocity.vy * dt
    }

    // ── Pass 4: bounce off world bounds (entities with physics.bounce and collider) ──
    for (const e of engine.world.with('position', 'velocity', 'physics', 'collider')) {
      const p = e.physics
      const bounce = p.bounce ?? 0
      if (bounce <= 0) continue

      const hw = e.collider.width / 2
      const hh = e.collider.height / 2

      // Left wall
      if (e.position.x - hw < 0) {
        e.position.x = hw
        e.velocity.vx = Math.abs(e.velocity.vx) * bounce
      }
      // Right wall
      else if (e.position.x + hw > w) {
        e.position.x = w - hw
        e.velocity.vx = -Math.abs(e.velocity.vx) * bounce
      }

      // Top wall
      if (e.position.y - hh < 0) {
        e.position.y = hh
        e.velocity.vy = Math.abs(e.velocity.vy) * bounce
      }
      // Bottom wall (ground)
      else if (e.position.y + hh > h) {
        e.position.y = h - hh
        e.velocity.vy = -Math.abs(e.velocity.vy) * bounce
        p.grounded = true
      } else {
        p.grounded = false
      }
    }
  },
}
