/**
 * ECS world powered by miniplex.
 *
 * Usage:
 *   const e = world.add({ position: { x: 0, y: 0 }, ascii: { ... } })
 *   world.remove(e)
 *
 * Queries (archetypes) are created via world.with('position', 'velocity').
 * They're live views — entities appear/disappear automatically.
 */

import { World } from 'miniplex'
import type { Entity } from '@shared/types'

/** The single ECS world. Created fresh per engine instance. */
export function createWorld() {
  return new World<Entity>()
}

export type GameWorld = ReturnType<typeof createWorld>
export type GameEntity = Entity
