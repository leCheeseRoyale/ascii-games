/**
 * Shared types between engine, game, and UI.
 */

// ── Component types ──────────────────────────────────────────────

export interface Position { x: number; y: number }
export interface Velocity { vx: number; vy: number }
export interface Acceleration { ax: number; ay: number }

export interface Ascii {
  char: string
  font: string
  color: string
  glow?: string
  opacity?: number
  scale?: number
}

export interface TextBlock {
  text: string
  font: string
  maxWidth: number
  lineHeight: number
  color: string
}

export interface Collider {
  type: 'circle' | 'rect'
  width: number
  height: number
  sensor?: boolean
}

export interface Health { current: number; max: number }
export interface Lifetime { remaining: number }
export interface Player { index: number }
export interface Obstacle { radius: number }

export interface ParticleEmitter {
  rate: number
  spread: number
  speed: number
  lifetime: number
  char: string
  color: string
  _acc: number
}

export interface Tags { values: Set<string> }

// ── Entity: union of all components ──────────────────────────────

export interface Entity {
  position: Position
  velocity: Velocity
  acceleration: Acceleration
  ascii: Ascii
  textBlock: TextBlock
  collider: Collider
  health: Health
  lifetime: Lifetime
  player: Player
  obstacle: Obstacle
  emitter: ParticleEmitter
  tags: Tags
}

// ── Engine types ─────────────────────────────────────────────────

export interface GameTime {
  dt: number
  elapsed: number
  frame: number
  fps: number
}

export interface InputState {
  keys: Set<string>
  justPressed: Set<string>
  justReleased: Set<string>
  mouse: { x: number; y: number; down: boolean }
  mouseJustDown: boolean
  mouseJustUp: boolean
}

export interface EngineConfig {
  width: number
  height: number
  targetFps: number
  bgColor: string
  font: string
  fontSize: number
  debug: boolean
}

export const DEFAULT_CONFIG: EngineConfig = {
  width: 0,
  height: 0,
  targetFps: 60,
  bgColor: '#0a0a0a',
  font: '"Fira Code", monospace',
  fontSize: 16,
  debug: false,
}
