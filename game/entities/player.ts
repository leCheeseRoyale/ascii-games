import type { Entity } from '@shared/types'
import { FONTS } from '@shared/constants'
import { GAME } from '../config'

export function createPlayer(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    ascii: {
      char: '@',
      font: FONTS.large,
      color: GAME.player.color,
      glow: GAME.player.glow,
    },
    player: { index: 0 },
    collider: { type: 'circle', width: 20, height: 20 },
    health: { current: GAME.player.maxHealth, max: GAME.player.maxHealth },
  }
}
