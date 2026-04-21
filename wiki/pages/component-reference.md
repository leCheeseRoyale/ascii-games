---
title: Component Reference
created: 2026-04-07
updated: 2026-04-21
type: reference
tags: [ecs, components, types, entities]
sources: [shared/types.ts]
---

# Component Reference

Complete reference of all ECS component types in the ASCII Game Engine. All components are defined as TypeScript interfaces in `shared/types.ts`.

See also: [[ecs-architecture]], [[entity-factory-pattern]], [[collision-detection]]

## Entity Structure

Entity is a **union type** — entities only have the components you add. There is no base class, no required components. An entity is just a plain object:

```typescript
export interface Entity {
  position: Position
  velocity: Velocity
  acceleration: Acceleration
  ascii: Ascii
  sprite: Sprite
  textBlock: TextBlock
  collider: Collider
  health: Health
  lifetime: Lifetime
  player: Player
  obstacle: Obstacle
  emitter: ParticleEmitter
  physics: Physics
  tags: Tags
  tween: Tween
  animation: Animation
  image: ImageComponent
  parent: Parent
  child: Child
  stateMachine: StateMachine
  screenWrap: ScreenWrap
  screenClamp: ScreenClamp
  offScreenDestroy: OffScreenDestroy
  gauge: Gauge
  typewriter: TypewriterComponent
  interactive: Interactive
  tilemap: TilemapComponent
  textEffect: TextEffectComponent
  trail: Trail
  visualBounds: VisualBounds
  spring: Spring
}
```

In practice, you create partial entities:

```typescript
engine.world.add({
  position: { x: 100, y: 200 },
  ascii: { char: '@', font: FONTS.normal, color: COLORS.accent },
})
```

## Component Types

### Position

```typescript
export interface Position { x: number; y: number }
```

World-space coordinates. Required by the renderer, collision system, and most systems.

| Field | Type | Description |
|-------|------|-------------|
| `x` | number | Horizontal position |
| `y` | number | Vertical position |

**Used by:** Renderer, collision system, movement system, all spatial queries

### Velocity

```typescript
export interface Velocity { vx: number; vy: number }
```

| Field | Type | Description |
|-------|------|-------------|
| `vx` | number | Horizontal velocity (pixels/sec) |
| `vy` | number | Vertical velocity (pixels/sec) |

**Used by:** Movement system (`position.x += velocity.vx * dt`)

### Acceleration

```typescript
export interface Acceleration { ax: number; ay: number }
```

| Field | Type | Description |
|-------|------|-------------|
| `ax` | number | Horizontal acceleration (pixels/sec²) |
| `ay` | number | Vertical acceleration (pixels/sec²) |

**Used by:** Movement system (`velocity.vx += acceleration.ax * dt`)

### Ascii

```typescript
export interface Ascii {
  char: string
  font: string
  color: string
  glow?: string
  opacity?: number
  scale?: number
  layer?: number
}
```

Single-character rendering component. Entities with `position` + `ascii` are auto-rendered.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `char` | string | required | The character to render |
| `font` | string | required | CSS font string (use `FONTS` constants) |
| `color` | string | required | CSS color string |
| `glow` | string | undefined | Shadow color for glow effect |
| `opacity` | number | 1.0 | Transparency (0-1) |
| `scale` | number | 1.0 | Size multiplier |
| `layer` | number | 0 | Render layer ordering |

**Used by:** Renderer

### TextBlock

```typescript
export interface TextBlock {
  text: string
  font: string
  maxWidth: number
  lineHeight: number
  color: string
}
```

Multi-line text rendering. Entities with `position` + `textBlock` are auto-rendered. Uses Pretext for layout (see [[pretext-integration]]).

| Field | Type | Description |
|-------|------|-------------|
| `text` | string | Text content (can be multi-line) |
| `font` | string | CSS font string |
| `maxWidth` | number | Maximum line width before wrapping |
| `lineHeight` | number | Vertical spacing between lines |
| `color` | string | CSS color string |

**Used by:** Renderer (via Pretext layout)

### Collider

```typescript
export interface Collider {
  type: 'circle' | 'rect'
  width: number
  height: number
  sensor?: boolean
  _auto?: boolean
  group?: number
  mask?: number
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `type` | 'circle' \| 'rect' | required | Shape type. Circle uses `width` as diameter |
| `width` | number | required | Width (or diameter for circles) |
| `height` | number | required | Height (ignored for circles) |
| `sensor` | boolean | false | If true, detects overlaps but game logic can treat differently |
| `_auto` | boolean | false | Internal marker, set when collider was resolved from `"auto"` |
| `group` | number | `1` | Bitmask identifying which collision group(s) this entity belongs to |
| `mask` | number | `0xFFFFFFFF` | Bitmask of groups this entity can collide with |

Collision group filtering: entities only overlap when `(a.group & b.mask) !== 0` AND `(b.group & a.mask) !== 0`. See [[collision-detection]] for details.

Pass `"auto"` as the collider value in `engine.spawn()` to auto-size from the entity's text bounds via Pretext measurement. The [[measure-system]] updates auto-colliders each frame if text changes.

**Used by:** Collision system (see [[collision-detection]])

### Health

```typescript
export interface Health { current: number; max: number }
```

| Field | Type | Description |
|-------|------|-------------|
| `current` | number | Current health points |
| `max` | number | Maximum health points |

**Used by:** Damage systems, health display, death checks

### Lifetime

```typescript
export interface Lifetime { remaining: number }
```

| Field | Type | Description |
|-------|------|-------------|
| `remaining` | number | Seconds until auto-removal |

**Used by:** Lifetime system (decrements each frame, removes entity at 0)

### Player

```typescript
export interface Player { index: number }
```

| Field | Type | Description |
|-------|------|-------------|
| `index` | number | Player number (0-based, for multiplayer) |

**Used by:** Player input system, camera, scoring

### Obstacle

```typescript
export interface Obstacle { radius: number }
```

| Field | Type | Description |
|-------|------|-------------|
| `radius` | number | Radius for text flow-around calculations |

**Used by:** Text layout system (see [[text-flow-pattern]])

### ParticleEmitter

```typescript
export interface ParticleEmitter {
  rate: number
  spread: number
  speed: number
  lifetime: number
  char: string
  color: string
  _acc: number
}
```

| Field | Type | Description |
|-------|------|-------------|
| `rate` | number | Particles per second |
| `spread` | number | Angular spread (radians) |
| `speed` | number | Initial particle speed |
| `lifetime` | number | Particle lifetime in seconds |
| `char` | string | Character(s) to emit |
| `color` | string | Particle color |
| `_acc` | number | Internal accumulator (do not set manually) |

**Used by:** Particle emitter system

### Tags

```typescript
export interface Tags { values: Set<string> }
```

| Field | Type | Description |
|-------|------|-------------|
| `values` | Set\<string\> | Arbitrary string tags for categorization |

**Used by:** Any system via `entity.tags.values.has('enemy')`, query filtering with `.where()`

### Physics

```typescript
export interface Physics {
  gravity?: number
  friction?: number
  drag?: number
  bounce?: number
  maxSpeed?: number
  mass?: number
  grounded?: boolean
}
```

Per-entity physics configuration. All fields optional, defaults to 0/off. The built-in physics system reads this to apply forces. `grounded` is set by the system, not by user code.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| gravity | number | 0 | Downward acceleration in px/s² |
| friction | number | 0 | Ground friction on vx (0-1) |
| drag | number | 0 | Air resistance on both axes (0-1) |
| bounce | number | 0 | Velocity retention on wall bounce (0-1) |
| maxSpeed | number | none | Speed clamp magnitude |
| mass | number | 1 | For future collision response |
| grounded | boolean | false | Set by physics system when on ground |

**Used by:** Physics system (see [[physics-system]])

### Animation

```typescript
export interface AnimationFrame {
  char?: string
  lines?: string[]
  color?: string
  duration?: number
}

export interface Animation {
  frames: AnimationFrame[]
  frameDuration: number
  currentFrame: number
  elapsed: number
  loop?: boolean
  playing?: boolean
  onComplete?: 'destroy' | 'stop'
}
```

Frame-by-frame animation. Works with ascii (char) or sprite (lines). The system auto-advances frames and applies char/lines/color to the entity.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| frames | AnimationFrame[] | required | Array of frames |
| frameDuration | number | required | Default seconds per frame |
| currentFrame | number | 0 | Current index (managed by system) |
| elapsed | number | 0 | Time on current frame (managed) |
| loop | boolean | true | Restart when reaching end |
| playing | boolean | true | Pause/resume animation |
| onComplete | string | none | 'destroy' or 'stop' when non-looping ends |

**Used by:** Animation system (see [[animation-system]])

### Parent

```typescript
export interface Parent {
  children: Partial<Entity>[]
}
```

Tracks child entities. Set up automatically by engine.attachChild().

| Field | Type | Description |
|-------|------|-------------|
| children | Partial<Entity>[] | Array of attached child entities |

**Used by:** Parent system, engine.destroyWithChildren() (see [[entity-parenting]])

### Child

```typescript
export interface Child {
  parent: Partial<Entity>
  offsetX: number
  offsetY: number
  inheritRotation?: boolean
}
```

Marks an entity as a child. Position is auto-synced to parent + offset each frame.

| Field | Type | Description |
|-------|------|-------------|
| parent | Partial<Entity> | Reference to parent entity |
| offsetX | number | X offset from parent |
| offsetY | number | Y offset from parent |
| inheritRotation | boolean | Future: inherit parent rotation |

**Used by:** Parent system (see [[entity-parenting]])

### ImageComponent

```typescript
export interface ImageComponent {
  image: HTMLImageElement
  width: number
  height: number
  opacity?: number
  layer?: number
  anchor?: 'center' | 'topLeft'
  rotation?: number
  tint?: string
}
```

Attach a loaded image. Renders at entity position respecting camera and layers. Use engine.loadImage() to get the HTMLImageElement.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| image | HTMLImageElement | required | Loaded image element |
| width | number | natural | Render width in px |
| height | number | natural | Render height in px |
| opacity | number | 1 | Transparency 0-1 |
| layer | number | 0 | Render layer |
| anchor | string | 'center' | 'center' or 'topLeft' |
| rotation | number | 0 | Rotation in radians |
| tint | string | none | Available for game logic |

**Used by:** Renderer (see [[renderer]])

### Spring

```typescript
export interface Spring {
  targetX: number
  targetY: number
  strength: number
  damping: number
}
```

Applies a spring force pulling the entity toward a target position. Used by `engine.spawnText()` and `engine.spawnInteractiveArt()` to give each character a "home" position it returns to after being displaced.

| Field | Type | Description |
|-------|------|-------------|
| `targetX` | number | X coordinate the spring pulls toward |
| `targetY` | number | Y coordinate the spring pulls toward |
| `strength` | number | Spring stiffness (higher = snappier return) |
| `damping` | number | Velocity damping (higher = less oscillation) |

Named presets are available via `SpringPresets.stiff`, `.snappy`, `.bouncy`, `.smooth`, `.floaty`, `.gentle`.

**Used by:** `_spring` system (see [[spring-system]])

### Trail

```typescript
export interface Trail {
  interval?: number
  lifetime?: number
  color?: string
  opacity?: number
  _acc?: number
}
```

Spawns fading afterimage entities behind the parent entity as it moves.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `interval` | number | 0.05 | Spawn interval in seconds |
| `lifetime` | number | 0.3 | Lifetime of each trail entity in seconds |
| `color` | string | entity color | Trail color. If omitted, uses the entity's ascii/sprite color |
| `opacity` | number | 0.5 | Opacity of trail when spawned (fades to 0 over lifetime) |
| `_acc` | number | 0 | Internal accumulator (do not set manually) |

**Used by:** `_trail` system (see [[trail-system]])

### VisualBounds

```typescript
export interface VisualBounds {
  width: number
  height: number
  halfW: number
  halfH: number
  _key: string
}
```

Auto-computed bounding dimensions from Pretext text measurement. Set and maintained by the `_measure` system each frame. Read-only for game code.

| Field | Type | Description |
|-------|------|-------------|
| `width` | number | Total measured width in pixels |
| `height` | number | Total measured height in pixels |
| `halfW` | number | Half-width (convenience for collision/centering) |
| `halfH` | number | Half-height (convenience for collision/centering) |
| `_key` | string | Internal dirty-tracking key (hash of text + font + scale) |

**Used by:** `_measure` system (see [[measure-system]])

### TextEffectComponent

```typescript
export type TextEffectFn = (charIndex: number, totalChars: number, time: number) => CharTransform

export interface CharTransform {
  dx: number
  dy: number
  color?: string
  opacity?: number
  scale?: number
  char?: string
}

export interface TextEffectComponent {
  fn: TextEffectFn
}
```

Attach to an entity with `ascii` or `sprite` to apply per-character visual transforms each frame. The function receives the character index, total count, and elapsed time, and returns positional/visual offsets.

| Field | Type | Description |
|-------|------|-------------|
| `fn` | TextEffectFn | Function called per character per frame, returns a `CharTransform` |

Entities with `textEffect` bypass the [[sprite-cache]] so that transforms update every frame.

**Used by:** Renderer (see [[renderer]])

## Related Engine Types

### GameTime

```typescript
export interface GameTime {
  dt: number       // delta time in seconds
  elapsed: number  // total elapsed time
  frame: number    // frame count
  fps: number      // current FPS
}
```

### InputState

```typescript
export interface InputState {
  keys: Set<string>
  justPressed: Set<string>
  justReleased: Set<string>
  mouse: { x: number; y: number; down: boolean }
  mouseJustDown: boolean
  mouseJustUp: boolean
}
```

### EngineConfig

```typescript
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
```
