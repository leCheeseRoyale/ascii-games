/**
 * @ascii-engine — Public API
 *
 * Import everything from '@engine':
 *   import { Engine, defineScene, defineSystem, ... } from '@engine'
 */

// Core
export { Engine } from './core/engine'
export { GameLoop } from './core/game-loop'
export { defineScene, SceneManager, type Scene } from './core/scene'

// ECS
export { createWorld, type GameWorld, type GameEntity } from './ecs/world'
export { defineSystem, SystemRunner, type System } from './ecs/systems'

// Rendering
export { AsciiRenderer } from './render/ascii-renderer'
export { Camera } from './render/camera'
export { ParticlePool, type Particle } from './render/particles'
export {
  layoutTextBlock,
  layoutTextAroundObstacles,
  measureHeight,
  getLineCount,
  shrinkwrap,
  clearTextCache,
  type RenderedLine,
} from './render/text-layout'

// Input
export { Keyboard } from './input/keyboard'
export { Mouse } from './input/mouse'

// Physics
export { overlaps, overlapAll, type Collidable } from './physics/collision'

// Audio
export { beep, sfx } from './audio/audio'

// Utils — Math
export {
  vec2, add, sub, scale, len, normalize, dist, dot,
  lerp, clamp, rng, rngInt, pick, chance,
  type Vec2,
} from './utils/math'

// Utils — Timer & Scheduler
export { Cooldown, tween, easeOut } from './utils/timer'
export { Scheduler } from './utils/scheduler'

// Utils — Color
export { hsl, hsla, rainbow, lerpColor } from './utils/color'

// Utils — Grid
export { GridMap, gridToWorld, worldToGrid, gridDistance } from './utils/grid'

// Re-export shared types
export type {
  Entity, Position, Velocity, Acceleration, Ascii, Sprite, TextBlock,
  Collider, Health, Lifetime, Player, Obstacle, ParticleEmitter, Tags,
  Tween, TweenEntry,
  GameTime, InputState, EngineConfig,
} from '@shared/types'
export { DEFAULT_CONFIG } from '@shared/types'
export { events } from '@shared/events'
export { COLORS, FONTS } from '@shared/constants'
