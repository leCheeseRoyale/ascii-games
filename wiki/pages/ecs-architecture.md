---
title: ECS Architecture
created: 2026-04-07
updated: 2026-04-07
type: architecture
tags:
  - engine
  - ecs
  - miniplex
  - entities
  - components
sources:
  - engine/ecs/world.ts
  - shared/types.ts
  - engine/core/engine.ts
---

# ECS Architecture

The engine uses an **Entity Component System** powered by [miniplex](https://github.com/hmans/miniplex). Entities are plain TypeScript objects — no classes, no inheritance. Components are optional properties on a single `Entity` interface. Systems query for entities with specific components and operate on them.

## World Setup

Each `Engine` instance creates a fresh ECS world:

```ts
// engine/ecs/world.ts
import { World } from 'miniplex'
import type { Entity } from '@shared/types'

export function createWorld() {
  return new World<Entity>()
}

export type GameWorld = ReturnType<typeof createWorld>
```

The world is accessible as `engine.world` from any system or scene.

## The Entity Type

The `Entity` interface is a union of all possible components (currently 18). Every property is optional when spawning — an entity only has the components you give it:

```ts
// shared/types.ts
export interface Entity {
  position: Position       // { x, y }
  velocity: Velocity       // { x, y }
  acceleration: Acceleration // { x, y }
  ascii: Ascii             // { char, font, color, glow?, opacity?, scale? }
  sprite: Sprite           // { lines, font, color, glow?, opacity? }
  image: ImageComponent    // { src, width, height, rotation?, anchor?, opacity? }
  textBlock: TextBlock     // { text, font, color, maxWidth, lineHeight }
  collider: Collider       // { width, height, layer, onCollide? }
  health: Health           // { current, max }
  lifetime: Lifetime       // { remaining }
  player: Player           // marker component
  obstacle: Obstacle       // { width, height }
  emitter: ParticleEmitter // particle system config
  tags: Tags               // { values: Set<string> }
  animation: Animation     // { frames, frameDuration, currentFrame, elapsed, loop?, playing? }
  tween: Tween             // { property, from, to, duration, elapsed, ease?, destroyOnComplete? }
  parent: Parent           // { children: Entity[] }
  child: Child             // { parent: Entity, offsetX, offsetY }
  layer: number            // render order (lower = behind)
  physics: Physics         // { bounce?, friction?, mass? }
}
```

**No classes for entities.** An entity is just a plain object with whichever properties it needs. This keeps things simple, serializable, and fast.

## Spawning Entities

Use `engine.spawn()` (or `engine.world.add()` directly) with a `Partial<Entity>`:

```ts
// Spawn a simple character
const player = engine.spawn({
  position: { x: 100, y: 200 },
  velocity: { x: 0, y: 0 },
  ascii: { char: '@', font: '24px monospace', color: '#00ff00' },
  player: { speed: 200 },
  collider: { width: 20, height: 20, layer: 'player' },
})
```

The returned value is a reference to the entity in the world. You can mutate its components directly:

```ts
player.position.x += 10  // direct mutation is fine
```

## Removing Entities

```ts
engine.destroy(entity)
// or directly:
engine.world.remove(entity)
```

The entity is immediately removed from all queries.

## Queries (Archetypes)

Queries are the core of the ECS pattern. Use `world.with()` to get a **live view** of all entities that have specific components:

```ts
// All entities with position and velocity
const movers = engine.world.with('position', 'velocity')

// Iterate in a system
for (const entity of movers) {
  entity.position.x += entity.velocity.x * dt
  entity.position.y += entity.velocity.y * dt
}
```

Queries are **live** — when an entity gains or loses a matching component, it automatically appears in or disappears from the query. You don't need to re-query.

### Query Variants

```ts
world.with('position', 'ascii')        // entities with both components
world.without('player')                 // entities lacking a component
world.where(e => e.health.current > 0)  // predicate filter
world.with('position').first            // first matching entity (or undefined)
```

## Entity Factory Pattern

Rather than scattering spawn calls throughout scenes, use factory functions:

```ts
// game/entities/bullet.ts
export function createBullet(x: number, y: number, dx: number, dy: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { x: dx, y: dy },
    ascii: { char: '·', font: '16px monospace', color: '#ffff00' },
    lifetime: { remaining: 2 },
    collider: { width: 4, height: 4, layer: 'bullet' },
  }
}

// In a system:
engine.spawn(createBullet(player.position.x, player.position.y, 0, -300))
```

This keeps entity definitions reusable and testable.

## Important Rules

1. **Never mutate the world during iteration** — collect entities first, then add/remove.
2. **No classes for entities** — plain objects only.
3. **Components are data** — behavior lives in systems, not components.

## Related Pages

- [[component-reference]] — Detailed docs for each component type
- [[system-runner]] — How systems query and operate on entities
- [[entity-factory-pattern]] — Reusable entity constructors
- [[engine-overview]] — How ECS fits into the overall architecture
- [[renderer]] — How renderable components (ascii, sprite, image, textBlock) are drawn
- [[animation-system]] — The animation component and system
- [[physics-system]] — The physics component and system
