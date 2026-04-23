import { z } from "zod";

export type Position = z.infer<typeof PositionSchema>;
export type Velocity = z.infer<typeof VelocitySchema>;
export type Acceleration = z.infer<typeof AccelerationSchema>;
export type Ascii = z.infer<typeof AsciiSchema>;
export type Sprite = z.infer<typeof SpriteSchema>;
export type TextBlock = z.infer<typeof TextBlockSchema>;
export type Collider = z.infer<typeof ColliderSchema>;
export type Health = z.infer<typeof HealthSchema>;
export type Lifetime = z.infer<typeof LifetimeSchema>;
export type Player = z.infer<typeof PlayerSchema>;
export type Obstacle = z.infer<typeof ObstacleSchema>;
export type Physics = z.infer<typeof PhysicsSchema>;
export type Tags = z.infer<typeof TagsSchema>;
export type Parent = z.infer<typeof ParentSchema>;
export type Child = z.infer<typeof ChildSchema>;
export type ImageComponent = z.infer<typeof ImageComponentSchema>;
export type AnimationFrame = z.infer<typeof AnimationFrameSchema>;
export type Animation = z.infer<typeof AnimationSchema>;
export type TweenEntry = z.infer<typeof TweenEntrySchema>;
export type Tween = z.infer<typeof TweenSchema>;
export type ScreenWrap = z.infer<typeof ScreenWrapSchema>;
export type ScreenClamp = z.infer<typeof ScreenClampSchema>;
export type OffScreenDestroy = z.infer<typeof OffScreenDestroySchema>;
export type Trail = z.infer<typeof TrailSchema>;
export type VisualBounds = z.infer<typeof VisualBoundsSchema>;
export type Spring = z.infer<typeof SpringSchema>;
export type Gauge = z.infer<typeof GaugeSchema>;
export type TypewriterComponent = z.infer<typeof TypewriterComponentSchema>;
export type Interactive = z.infer<typeof InteractiveSchema>;
export type TileLegendEntry = z.infer<typeof TileLegendEntrySchema>;
export type TilemapComponent = z.infer<typeof TilemapComponentSchema>;
export type EngineConfig = z.infer<typeof EngineConfigSchema>;


export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const VelocitySchema = z.object({
  vx: z.number(),
  vy: z.number(),
});

export const AccelerationSchema = z.object({
  ax: z.number(),
  ay: z.number(),
});

export const AsciiSchema = z.object({
  char: z.string(),
  font: z.string(),
  color: z.string(),
  glow: z.string().optional(),
  opacity: z.number().min(0).max(1).optional(),
  scale: z.number().positive().optional(),
  layer: z.number().int().optional(),
});

export const SpriteSchema = z.object({
  lines: z.array(z.string()),
  font: z.string(),
  color: z.string(),
  glow: z.string().optional(),
  opacity: z.number().min(0).max(1).optional(),
  layer: z.number().int().optional(),
  colorMap: z.record(z.string()).optional(),
});

export const TextBlockSchema = z.object({
  text: z.string(),
  font: z.string(),
  maxWidth: z.number().positive(),
  lineHeight: z.number().positive(),
  color: z.string(),
  align: z.enum(["left", "center", "right", "justify"]).optional(),
  glow: z.string().optional(),
  preWrap: z.boolean().optional(),
  layer: z.number().int().optional(),
});

export const ColliderSchema = z.object({
  type: z.enum(["circle", "rect"]),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  sensor: z.boolean().optional(),
  group: z.number().int().optional(),
  mask: z.number().int().optional(),
});

export const HealthSchema = z.object({
  current: z.number().int(),
  max: z.number().int().positive(),
});

export const LifetimeSchema = z.object({
  remaining: z.number(),
});

export const PlayerSchema = z.object({
  index: z.number().int().nonnegative(),
});

export const ObstacleSchema = z.object({
  radius: z.number().nonnegative(),
});

export const PhysicsSchema = z.object({
  gravity: z.number().optional(),
  friction: z.number().min(0).max(1).optional(),
  drag: z.number().min(0).max(1).optional(),
  bounce: z.number().min(0).max(1).optional(),
  maxSpeed: z.number().nonnegative().optional(),
  mass: z.number().positive().optional(),
  grounded: z.boolean().optional(),
});

export const TagsSchema = z.object({
  values: z.set(z.string()),
});

export const ParentSchema = z.object({
  children: z.array(z.record(z.unknown()).and(z.object({}).passthrough())),
});

export const ChildSchema = z.object({
  parent: z.record(z.unknown()).and(z.object({}).passthrough()),
  offsetX: z.number(),
  offsetY: z.number(),
  inheritRotation: z.boolean().optional(),
});

export const ImageComponentSchema = z.object({
  image: z.instanceof(HTMLImageElement),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  opacity: z.number().min(0).max(1).optional(),
  layer: z.number().int().optional(),
  anchor: z.enum(["center", "topLeft"]).optional(),
  rotation: z.number().optional(),
  tint: z.string().optional(),
});

export const AnimationFrameSchema = z.object({
  char: z.string().optional(),
  lines: z.array(z.string()).optional(),
  color: z.string().optional(),
  duration: z.number().positive().optional(),
});

export const AnimationSchema = z.object({
  frames: z.array(AnimationFrameSchema),
  frameDuration: z.number().positive(),
  currentFrame: z.number().int().nonnegative(),
  elapsed: z.number().nonnegative(),
  loop: z.boolean().optional(),
  playing: z.boolean().optional(),
  onComplete: z.enum(["destroy", "stop"]).optional(),
});

export const TweenEntrySchema = z.object({
  property: z.string(),
  from: z.number(),
  to: z.number(),
  duration: z.number().positive(),
  elapsed: z.number().nonnegative(),
  ease: z.enum(["linear", "easeOut", "easeIn", "easeInOut"]),
  destroyOnComplete: z.boolean().optional(),
});

export const TweenSchema = z.object({
  tweens: z.array(TweenEntrySchema),
});

export const ScreenWrapSchema = z.object({
  margin: z.number().optional(),
});

export const ScreenClampSchema = z.object({
  padding: z.number().optional(),
});

export const OffScreenDestroySchema = z.object({
  margin: z.number().optional(),
});

export const TrailSchema = z.object({
  interval: z.number().positive().optional(),
  lifetime: z.number().positive().optional(),
  color: z.string().optional(),
  opacity: z.number().min(0).max(1).optional(),
  _acc: z.number().optional(),
});

export const VisualBoundsSchema = z.object({
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  halfW: z.number().nonnegative(),
  halfH: z.number().nonnegative(),
  _key: z.string(),
});

export const SpringSchema = z.object({
  targetX: z.number(),
  targetY: z.number(),
  strength: z.number(),
  damping: z.number(),
});

export const GaugeSchema = z.object({
  current: z.number(),
  max: z.number().positive(),
  width: z.number().int().positive(),
  fillChar: z.string().optional(),
  emptyChar: z.string().optional(),
  color: z.string().optional(),
  emptyColor: z.string().optional(),
});

export const TypewriterComponentSchema = z.object({
  fullText: z.string(),
  revealed: z.number().int().nonnegative(),
  speed: z.number().positive(),
  done: z.boolean(),
  _acc: z.number(),
  onComplete: z.function().args().returns(z.void()).optional(),
  onChar: z.function().args(z.string()).returns(z.void()).optional(),
});

export const InteractiveSchema = z.object({
  hovered: z.boolean(),
  clicked: z.boolean(),
  dragging: z.boolean(),
  dragOffset: z.object({ x: z.number(), y: z.number() }),
  cursor: z.string().optional(),
  autoMove: z.boolean().optional(),
});

export const TileLegendEntrySchema = z.object({
  color: z.string().optional(),
  bg: z.string().optional(),
  solid: z.boolean().optional(),
}).catchall(z.unknown());

export const TilemapComponentSchema = z.object({
  data: z.array(z.string()),
  legend: z.record(TileLegendEntrySchema),
  cellSize: z.number().positive(),
  offsetX: z.number(),
  offsetY: z.number(),
  font: z.string().optional(),
  layer: z.number().int().optional(),
});

export const EngineConfigSchema = z.object({
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  targetFps: z.number().int().positive(),
  bgColor: z.string(),
  font: z.string(),
  fontSize: z.number().positive(),
  debug: z.boolean(),
  headlessWidth: z.number().int().nonnegative().optional(),
  headlessHeight: z.number().int().nonnegative().optional(),
});
