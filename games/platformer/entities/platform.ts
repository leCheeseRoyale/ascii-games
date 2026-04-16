import { FONTS } from '@engine'
import type { Entity } from '@engine'

/** A rectangular platform the player can land on. */
export function createPlatform(
  x: number,
  y: number,
  widthInTiles: number,
  color = '#6677aa',
): Partial<Entity> {
  const char = '\u2580'.repeat(widthInTiles) // upper half block
  return {
    position: { x, y },
    ascii: { char, font: FONTS.large, color },
    collider: {
      type: 'rect',
      width: widthInTiles * 12, // ~12px per char at large font
      height: 12,
    },
    tags: { values: new Set(['platform']) },
  }
}
