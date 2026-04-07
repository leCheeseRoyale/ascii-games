---
title: Collision Detection
created: 2026-04-07
updated: 2026-04-07
type: subsystem
tags: [physics, collision, overlap, detection]
sources: [engine/physics/collision.ts, shared/types.ts]
---

# Collision Detection

Simple overlap checks for game entities. This is **not** a physics engine — there is no collision response, no impulse resolution, no continuous detection. Just boolean "are these two things overlapping?"

See also: [[component-reference]], [[collision-system]], [[physics-system]]

## Collidable Interface

Any object with `position` and `collider` can be checked:

```typescript
export interface Collidable {
  position: Position
  collider: Collider
}
```

Where `Position` is `{x, y}` and `Collider` is:

```typescript
export interface Collider {
  type: 'circle' | 'rect'
  width: number
  height: number
  sensor?: boolean
}
```

For circles, `width` is used as the diameter (radius = width/2). The `sensor` flag is metadata for game logic — it doesn't affect detection behavior.

## overlaps(a, b): boolean

Checks whether two collidables overlap. Dispatches by collider type:

```typescript
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
```

### Circle-Circle

Distance squared check — avoids the `sqrt` call:

```typescript
function circleCircle(a: Collidable, b: Collidable): boolean {
  const dx = a.position.x - b.position.x
  const dy = a.position.y - b.position.y
  const r = (a.collider.width + b.collider.width) / 2
  return dx * dx + dy * dy < r * r
}
```

### Rect-Rect (AABB)

Standard axis-aligned bounding box overlap:

```typescript
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
```

Positions are center-based — half-widths/heights extend in each direction.

### Mixed (Circle + Rect)

For mixed collider types, circles are converted to equivalent rect colliders:

```typescript
function toRect(c: Collidable): Collidable {
  if (c.collider.type === 'rect') return c
  return {
    position: c.position,
    collider: { type: 'rect', width: c.collider.width, height: c.collider.width },
  }
}
```

This is an approximation — the circle becomes a square. Good enough for ASCII games where characters are roughly square anyway.

## overlapAll(entity, others): T[]

Checks one entity against a collection, returns all overlapping entities:

```typescript
export function overlapAll<T extends Collidable>(entity: Collidable, others: Iterable<T>): T[] {
  const result: T[] = []
  for (const o of others) {
    if (o !== entity && overlaps(entity, o)) result.push(o)
  }
  return result
}
```

- Skips self-comparison (`o !== entity`)
- Accepts any `Iterable` — works with arrays, Sets, and miniplex query results
- Generic `T` preserves the entity type for downstream use

## Usage Example

```typescript
// In a collision system:
const player = engine.world.with('position', 'collider', 'player').first
const enemies = engine.world.with('position', 'collider', 'tags')
  .where(e => e.tags.values.has('enemy'))

const hits = overlapAll(player, enemies)
for (const enemy of hits) {
  player.health.current -= 1
  engine.world.remove(enemy)
}
```

## What This Doesn't Do

- No physics response (bouncing, pushing, sliding) — see [[physics-system]] for that
- No continuous collision detection (fast objects can tunnel through)
- No spatial partitioning (checks are brute-force O(n))
- No collision layers or masks

For most ASCII games, this is sufficient. The engine now includes a built-in [[physics-system]] that handles velocity integration, bounce/response off boundaries, and friction. That system uses these detection functions internally but adds actual physics response on top. This module (`collision.ts`) remains purely detection — it answers "are these overlapping?" but does not move or separate entities.
