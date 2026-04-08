/**
 * Shared types between engine, game, and UI.
 */

// ── Component types ──────────────────────────────────────────────

export interface Position {
  x: number;
  y: number;
}
export interface Velocity {
  vx: number;
  vy: number;
}
export interface Acceleration {
  ax: number;
  ay: number;
}

export interface Ascii {
  char: string;
  font: string;
  color: string;
  glow?: string;
  opacity?: number;
  scale?: number;
  /** Render layer. Lower = behind, higher = in front. Default 0. */
  layer?: number;
}

/** Multi-line ASCII art. Alternative to Ascii for richer visuals. */
export interface Sprite {
  /** Array of strings, one per line. Rendered centered on position. */
  lines: string[];
  font: string;
  color: string;
  glow?: string;
  opacity?: number;
  /** Render layer. Default 0. */
  layer?: number;
}

export interface TextBlock {
  text: string;
  font: string;
  maxWidth: number;
  lineHeight: number;
  color: string;
  /** Render layer. Default 0. */
  layer?: number;
}

export interface Collider {
  type: "circle" | "rect";
  width: number;
  height: number;
  sensor?: boolean;
}

export interface Health {
  current: number;
  max: number;
}
export interface Lifetime {
  remaining: number;
}
export interface Player {
  index: number;
}
export interface Obstacle {
  radius: number;
}

export interface ParticleEmitter {
  rate: number;
  spread: number;
  speed: number;
  lifetime: number;
  char: string;
  color: string;
  _acc: number;
}

export interface Physics {
  gravity?: number; // pixels/s^2 added to vy each frame (default 0)
  friction?: number; // 0-1, ground friction multiplier on vx (default 0)
  drag?: number; // 0-1, air resistance on both axes (default 0)
  bounce?: number; // 0-1, velocity retention on bounce (0 = no bounce, 1 = perfect)
  maxSpeed?: number; // max velocity magnitude
  mass?: number; // for future collision response (default 1)
  grounded?: boolean; // set by system when entity is on ground (world bottom)
}

export interface Tags {
  values: Set<string>;
}

/** Parent-child relationship. Children's positions are offsets from parent. */
export interface Parent {
  children: Partial<Entity>[];
}

export interface Child {
  parent: Partial<Entity>;
  /** Offset from parent position */
  offsetX: number;
  offsetY: number;
  /** If true, child inherits parent's rotation (future) */
  inheritRotation?: boolean;
}

/**
 * Image component — attach a loaded image to an entity.
 * The image renders at the entity's position, respecting camera and layers.
 * Can be combined with ascii/sprite to overlay text on images.
 */
export interface ImageComponent {
  /** The loaded HTMLImageElement (use engine.loadImage() to get one) */
  image: HTMLImageElement;
  /** Render width in px. If 0, uses natural width. */
  width: number;
  /** Render height in px. If 0, uses natural height. */
  height: number;
  /** Opacity 0-1 */
  opacity?: number;
  /** Render layer (same system as ascii/sprite) */
  layer?: number;
  /** Anchor point: 'center' (default) or 'topLeft' */
  anchor?: "center" | "topLeft";
  /** Optional rotation in radians */
  rotation?: number;
  /** Tint — not applied directly, but available for game logic */
  tint?: string;
}

export interface AnimationFrame {
  /** For ascii entities: the character(s) to display */
  char?: string;
  /** For sprite entities: the lines to display */
  lines?: string[];
  /** Optional color override per frame */
  color?: string;
  /** Duration of this frame in seconds. If omitted, uses animation.frameDuration */
  duration?: number;
}

export interface Animation {
  frames: AnimationFrame[];
  /** Default duration per frame in seconds */
  frameDuration: number;
  /** Current frame index (managed by system) */
  currentFrame: number;
  /** Time accumulated on current frame (managed by system) */
  elapsed: number;
  /** Loop the animation? Default true */
  loop?: boolean;
  /** Is the animation playing? Default true */
  playing?: boolean;
  /** Callback name/event when animation completes (non-looping) */
  onComplete?: "destroy" | "stop";
}

/** Declarative animation. Engine auto-processes and removes when done. */
export interface Tween {
  tweens: TweenEntry[];
}

export interface TweenEntry {
  /** Dot-path to the property, e.g. 'position.x' or 'ascii.opacity' */
  property: string;
  from: number;
  to: number;
  duration: number;
  elapsed: number;
  ease: "linear" | "easeOut" | "easeIn" | "easeInOut";
  /** If true, remove the entity when this tween completes */
  destroyOnComplete?: boolean;
}

// ── Entity: union of all components ──────────────────────────────

export interface Entity {
  position: Position;
  velocity: Velocity;
  acceleration: Acceleration;
  ascii: Ascii;
  sprite: Sprite;
  textBlock: TextBlock;
  collider: Collider;
  health: Health;
  lifetime: Lifetime;
  player: Player;
  obstacle: Obstacle;
  emitter: ParticleEmitter;
  physics: Physics;
  tags: Tags;
  tween: Tween;
  animation: Animation;
  image: ImageComponent;
  parent: Parent;
  child: Child;
}

// ── Engine types ─────────────────────────────────────────────────

export interface GameTime {
  dt: number;
  elapsed: number;
  frame: number;
  fps: number;
}

export interface InputState {
  keys: Set<string>;
  justPressed: Set<string>;
  justReleased: Set<string>;
  mouse: { x: number; y: number; down: boolean };
  mouseJustDown: boolean;
  mouseJustUp: boolean;
}

export interface EngineConfig {
  width: number;
  height: number;
  targetFps: number;
  bgColor: string;
  font: string;
  fontSize: number;
  debug: boolean;
}

export const DEFAULT_CONFIG: EngineConfig = {
  width: 0,
  height: 0,
  targetFps: 60,
  bgColor: "#0a0a0a",
  font: '"Fira Code", monospace',
  fontSize: 16,
  debug: false,
};
