/**
 * Simple collision detection. No physics response — just overlap checks.
 *
 * For full rigid-body physics, use the Rapier2D plugin (future).
 * This covers 90% of ASCII game needs: did the player touch the enemy?
 */

import type { Position, Collider } from '@shared/types'

export interface Collidable {
  position: Position
  collider: Collider
}

/** Check if two entities overlap. */
export function overlaps(a: Collidable, b: Collidable): boolean {
  if (a.collider.type === 'circle' && b.collider.type === 'circle') {
    return circleCircle(a, b)
  }
  if (a.collider.type === 'rect' && b.collider.type === 'rect') {
    return rectRect(a, b)
  }
  // Mixed: treat circle as rect for simplicity
  return rectRect(
    toRect(a),
    toRect(b),
  )
}

function circleCircle(a: Collidable, b: Collidable): boolean {
  const dx = a.position.x - b.position.x
  const dy = a.position.y - b.position.y
  const r = (a.collider.width + b.collider.width) / 2
  return dx * dx + dy * dy < r * r
}

function rectRect(a: Collidable, b: Collidable): boolean {
  const ahw = a.collider.width / 2, ahh = a.collider.height / 2
  const bhw = b.collider.width / 2, bhh = b.collider.height / 2
  return (
    a.position.x - ahw < b.position.x + bhw &&
    a.position.x + ahw > b.position.x - bhw &&
    a.position.y - ahh < b.position.y + bhh &&
    a.position.y + ahh > b.position.y - bhh
  )
}

function toRect(c: Collidable): Collidable {
  if (c.collider.type === 'rect') return c
  return {
    position: c.position,
    collider: { type: 'rect', width: c.collider.width, height: c.collider.width },
  }
}

/** Check one entity against a list, return all overlapping. */
export function overlapAll<T extends Collidable>(entity: Collidable, others: Iterable<T>): T[] {
  const result: T[] = []
  for (const o of others) {
    if (o !== entity && overlaps(entity, o)) result.push(o)
  }
  return result
}
