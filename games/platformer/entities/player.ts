import { FONTS } from '@engine'
import type { Entity } from '@engine'
import { GAME } from '../config'

export function createPlayer(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    ascii: { char: '@', font: FONTS.large, color: GAME.player.color, glow: GAME.player.glow },
    collider: { type: 'circle', width: 20, height: 20 },
    physics: { gravity: GAME.world.gravity, friction: 0.85 },
    tags: { values: new Set(['player']) },
  }
}
