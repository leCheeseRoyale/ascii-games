---
title: Cursor Repel System
created: 2026-04-21
updated: 2026-04-21
type: system
tags: [system, input, physics, text]
sources: [engine/ecs/cursor-repel.ts]
---

# Cursor Repel System

The cursor repel system pushes spring-based entities away from the mouse cursor, creating an interactive "parting" effect for text and objects. It is a factory-created system (not auto-registered) commonly used on title screens and menus alongside `spawnText` / `spawnSprite`.

## Factory Function

```ts
function createCursorRepelSystem(opts?: CursorRepelOpts): System
```

### Options

```ts
export interface CursorRepelOpts {
  /** Repulsion radius in pixels. Default 100. */
  radius?: number;
  /** Repulsion force strength. Default 300. */
  force?: number;
  /** Only affect entities with this tag. Optional. */
  tag?: string;
}
```

## How It Works

Each frame the system converts the screen-space mouse position to world coordinates using the camera offset:

```ts
const mx = engine.mouse.x + cam.x - engine.width / 2;
const my = engine.mouse.y + cam.y - engine.height / 2;
```

It then iterates all entities with `position`, `velocity`, and `spring`. For each entity within the configured `radius`:

1. Computes the distance vector from cursor to entity
2. Skips if the squared distance exceeds `radiusSq` (avoids `sqrt` for far entities)
3. Calculates a force that falls off linearly with distance: `f = force * ((radius - dist) / radius)`
4. Applies the force as a velocity impulse along the direction away from the cursor

```ts
const f = force * ((radius - dist) / radius);
velocity.vx += (dx / dist) * f;
velocity.vy += (dy / dist) * f;
```

Entities at the edge of the radius receive near-zero force. Entities close to the cursor receive the full `force` value. The spring component then pulls them back to their home positions after the cursor moves away.

## Tag Filtering

When `tag` is specified, only entities whose `tags.values` set contains the given tag are affected. This prevents the cursor from disturbing unrelated spring entities on screen.

## Usage Example

**Interactive title text:**
```ts
import { createCursorRepelSystem } from "@engine/ecs/cursor-repel";
import { SpringPresets } from "@engine/utils/spring-presets";

engine.spawnText({
  text: "HOVER OVER ME",
  x: 400, y: 300,
  font: "28px monospace",
  spring: SpringPresets.bouncy,
  tag: "title",
});

engine.addSystem(createCursorRepelSystem({
  radius: 120,
  force: 400,
  tag: "title",
}));
```

**Combined with ambient drift for a full interactive scene:**
```ts
engine.addSystem(createCursorRepelSystem({ radius: 100, tag: "title" }));
engine.addSystem(createAmbientDriftSystem({ amplitude: 0.3, tag: "title" }));
```

## Execution Order

The system uses the default priority (0), so it runs before all built-in systems. Repulsion forces are applied to velocity before `_spring` (15) adds restoring force and `_physics` (20) integrates the result into position.

## See Also

- [[interactive-text]] -- `spawnText` / `spawnSprite` that create the spring entities this system acts on
- [[input-system]] -- `engine.mouse` state that provides cursor coordinates
- [[spring-system]] -- the restoring force that pulls entities back after repulsion
