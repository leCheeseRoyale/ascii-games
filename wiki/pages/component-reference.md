---
title: Component Reference
created: 2026-04-07
updated: 2026-04-07
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
  textBlock: TextBlock
  collider: Collider
  health: Health
  lifetime: Lifetime
  player: Player
  obstacle: Obstacle
  emitter: ParticleEmitter
  tags: Tags
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
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | 'circle' \| 'rect' | Shape type. Circle uses `width` as diameter |
| `width` | number | Width (or diameter for circles) |
| `height` | number | Height (ignored for circles) |
| `sensor` | boolean | If true, detects overlaps but game logic can treat differently |

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
