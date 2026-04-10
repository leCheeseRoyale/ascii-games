import { FONTS } from '@engine'
import type { Entity } from '@engine'

export function createPlatform(x: number, y: number, width: number): Partial<Entity> {
  const char = '='.repeat(Math.max(1, Math.floor(width / 10)))
  return {
    position: { x, y },
    ascii: { char, font: FONTS.normal, color: '#888888' },
    collider: { type: 'rect', width, height: 8 },
    tags: { values: new Set(['platform']) },
  }
}
