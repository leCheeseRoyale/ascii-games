---
title: Entity Parenting
created: 2026-04-07
updated: 2026-04-07
type: pattern
tags: [ecs, entity, component, system, engine]
sources: [engine/ecs/parent-system.ts, shared/types.ts, engine/core/engine.ts]
---

# Entity Parenting

Entity parenting allows you to attach entities to other entities so they move together as a group. The `_parent` system manages this relationship, and the engine provides helper methods for attaching, detaching, and destroying entity hierarchies.

## Interfaces

```ts
export interface Parent {
  children: Partial<Entity>[]
}

export interface Child {
  parent: Partial<Entity>
  offsetX: number
  offsetY: number
  inheritRotation?: boolean
}
```

A `Parent` component holds references to all of its children. A `Child` component holds a back-reference to its parent along with an offset that defines where the child sits relative to the parent's position.

## The _parent System

The `_parent` system auto-registers on scene load and runs **first** among all built-in systems — before `_physics`, `_tween`, and `_animation`. This ensures children have correct world positions before collision detection and rendering occur.

Every frame, the system queries all entities that have both a `child` and a `position` component. For each one, it sets:

```
entity.position.x = parent.position.x + child.offsetX
entity.position.y = parent.position.y + child.offsetY
```

If `inheritRotation` is enabled, the child's rotation is also synchronized with the parent.

## Engine Helpers

### engine.attachChild(parent, child, offsetX, offsetY)

Sets up the parenting relationship between two entities:
- Adds (or updates) the `Parent` component on the parent entity, appending the child to its `children` array.
- Adds the `Child` component to the child entity with the given offsets and a reference back to the parent.
- Immediately syncs the child's position so there is no single-frame lag.

### engine.detachChild(child)

Removes the parent-child relationship:
- Removes the child from the parent's `children` array.
- Removes the `Child` component from the child entity.
- The child's position remains at its current world position — it does not snap back to any origin.

### engine.destroyWithChildren(entity)

Recursively destroys an entity and all of its descendants. If a child itself has children, those are destroyed too, all the way down the hierarchy.

## Usage Examples

**Weapon attached to a character:**
```ts
const player = engine.spawn({
  position: { x: 10, y: 10 },
  velocity: { x: 0, y: 0 },
  ascii: { char: '@' }
})

const sword = engine.spawn({
  position: { x: 0, y: 0 },
  ascii: { char: '/' }
})

engine.attachChild(player, sword, 1, 0)
// sword now follows player at offset (1, 0)
```

**UI label following an entity:**
```ts
const healthLabel = engine.spawn({
  position: { x: 0, y: 0 },
  ascii: { char: '♥' }
})

engine.attachChild(player, healthLabel, 0, -1)
// label hovers one row above the player
```

**Particle source on a moving ship:**
```ts
const ship = engine.spawn({
  position: { x: 40, y: 20 },
  velocity: { x: -5, y: 0 },
  ascii: { char: '>' }
})

const emitter = engine.spawn({
  position: { x: 0, y: 0 },
  ascii: { char: '.' }
})

engine.attachChild(ship, emitter, -1, 0)
// emitter trails behind the ship
```

## Important Notes

Moving the parent automatically moves all children — the offset is re-applied every frame. If you move a child entity's position directly, your change will be **overwritten** on the next frame by the parent system. To reposition a child, update its `offsetX` and `offsetY` instead, or detach it first.

## See Also

For details on how entities and components are structured, see [[ecs-architecture]]. For a full list of built-in components including Parent and Child, see [[component-reference]]. To understand the order in which built-in systems execute, see [[system-runner]].
