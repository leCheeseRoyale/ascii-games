/**
 * @ascii-engine — Public API
 *
 * Import everything from '@engine':
 *   import { Engine, defineScene, defineSystem, ... } from '@engine'
 */

export { COLORS, FONTS, PALETTES } from "@shared/constants";
export { events } from "@shared/events";
// Re-export shared types
export type {
  Acceleration,
  Animation,
  AnimationFrame,
  Ascii,
  Child,
  Collider,
  EngineConfig,
  Entity,
  GameEntity,
  GameTime,
  Health,
  ImageComponent,
  InputState,
  Lifetime,
  Obstacle,
  OffScreenDestroy,
  Parent,
  ParticleEmitter,
  Physics,
  Player,
  Position,
  ScreenClamp,
  ScreenWrap,
  Sprite,
  StateMachine,
  StateMachineState,
  Tags,
  TextBlock,
  Tween,
  TweenEntry,
  Velocity,
} from "@shared/types";
export { DEFAULT_CONFIG } from "@shared/types";
// Audio
export {
  audio,
  beep,
  getVolume,
  isMuted,
  mute,
  pauseMusic,
  playMusic,
  resumeMusic,
  setMusicVolume,
  setVolume,
  sfx,
  stopMusic,
  toggleMute,
  unmute,
} from "./audio/audio";
// Core
export { Engine } from "./core/engine";
export { GameLoop } from "./core/game-loop";
export { defineScene, type Scene, SceneManager } from "./core/scene";
export { animationSystem } from "./ecs/animation-system";
export { emitterSystem } from "./ecs/emitter-system";
export { lifetimeSystem } from "./ecs/lifetime-system";
export { parentSystem } from "./ecs/parent-system";
export { screenBoundsSystem } from "./ecs/screen-bounds-system";
export { stateMachineSystem } from "./ecs/state-machine-system";
export { transition } from "./ecs/state-machine-system";
export { defineSystem, type System, SystemRunner } from "./ecs/systems";
// ECS
export { createWorld, type GameWorld, type WorldEntity } from "./ecs/world";
// Input
export { Gamepad, GAMEPAD_BUTTONS } from "./input/gamepad";
export { Keyboard } from "./input/keyboard";
export { Mouse } from "./input/mouse";
// Physics
export { type Collidable, overlapAll, overlaps } from "./physics/collision";
export { physicsSystem } from "./physics/physics-system";
// Rendering
export { AsciiRenderer } from "./render/ascii-renderer";
export { Camera } from "./render/camera";
// Debug & toast
export { DebugOverlay } from "./render/debug";
// Images
export { clearImageCache, getCachedImage, loadImage, preloadImages } from "./render/image-loader";
export { type Particle, ParticlePool } from "./render/particles";
export {
  clearTextCache,
  getLineCount,
  layoutTextAroundObstacles,
  layoutTextBlock,
  measureHeight,
  type RenderedLine,
  shrinkwrap,
} from "./render/text-layout";
export { ToastManager } from "./render/toast";
// Transitions
export { Transition, type TransitionType } from "./render/transitions";
// Storage / persistence
export {
  clearAll as clearStorage,
  clearHighScores,
  getHighScores,
  getTopScore,
  has as hasStorage,
  isHighScore,
  load,
  remove as removeStorage,
  type ScoreEntry,
  save,
  setStoragePrefix,
  submitScore,
} from "./storage/index";
// Utils — Color
export { hsl, hsla, lerpColor, rainbow } from "./utils/color";
// Utils — Grid
export { GridMap, gridDistance, gridToWorld, worldToGrid } from "./utils/grid";
// Utils — Math
export {
  add,
  chance,
  clamp,
  dist,
  dot,
  len,
  lerp,
  normalize,
  pick,
  rng,
  rngInt,
  scale,
  sub,
  type Vec2,
  vec2,
} from "./utils/math";
export { Scheduler } from "./utils/scheduler";
// Utils — Timer & Scheduler
export { Cooldown, easeOut, tween } from "./utils/timer";
