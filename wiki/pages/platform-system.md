---
title: Platform System
created: 2026-04-21
updated: 2026-04-21
type: system
tags: [physics, system, platformer]
sources: [engine/behaviors/platform.ts]
---

# Platform System

The platform system provides one-way platform collision -- entities can pass through platforms from below but land on them from above. It is a factory-created system (not auto-registered) designed for platformer games.

## Factory Function

```ts
function createPlatformSystem(opts?: PlatformSystemOpts): System
```

### Options

```ts
export interface PlatformSystemOpts {
  /** Tag on entities that stand on platforms. Default "player". */
  entityTag?: string;
  /** Tag on platform entities. Default "platform". */
  platformTag?: string;
  /** Pixel tolerance for crossing-top detection. Default 14. */
  tolerance?: number;
  /** Optional ground Y position (absolute pixels). Entities are also grounded at this line. */
  groundY?: number;
}
```

## How It Works

The system runs at `SystemPriority.physics + 2` (22), just after physics integration and collision events. Each frame it:

1. **Collects platforms** -- finds all entities with `position`, `collider`, and a tag matching `platformTag`
2. **Iterates dynamic entities** -- queries entities with `position`, `velocity`, `physics`, `collider`, and a tag matching `entityTag`
3. **Checks optional ground line** -- if `groundY` is set and the entity's bottom edge has crossed it, snaps the entity above ground and zeroes vertical velocity
4. **One-way resolution** -- only when the entity is falling or stationary (`vy >= 0`):
   - Computes horizontal overlap between entity and platform
   - Checks if the entity's bottom edge is within `tolerance` pixels of the platform's top edge
   - If both conditions are met, snaps the entity on top of the platform and zeroes vertical velocity
5. **Sets grounded flag** -- `entity.physics.grounded` is set to `true` if the entity was resolved against a ground line or platform, `false` otherwise

## One-Way Behavior

The key to one-way platforms is the `vy >= 0` guard. When an entity is moving upward (jumping through a platform), no collision is resolved. Landing only occurs when the entity is descending and its bottom edge crosses into the tolerance zone near the platform's top edge.

## Usage Example

**Basic platformer setup:**
```ts
import { createPlatformSystem } from "@engine/behaviors/platform";

engine.addSystem(createPlatformSystem());

// Spawn a platform
engine.spawn({
  position: { x: 300, y: 400 },
  collider: { type: "rect", width: 200, height: 16 },
  ascii: { char: "=".repeat(20), font: "16px monospace" },
  tags: { values: new Set(["platform"]) },
});

// Spawn the player
engine.spawn({
  position: { x: 300, y: 100 },
  velocity: { x: 0, y: 0 },
  physics: { gravity: 60, grounded: false },
  collider: { type: "rect", width: 16, height: 24 },
  ascii: { char: "@", font: "24px monospace" },
  tags: { values: new Set(["player"]) },
});
```

**Custom tags and ground line:**
```ts
engine.addSystem(createPlatformSystem({
  entityTag: "character",
  platformTag: "cloud",
  tolerance: 10,
  groundY: 580,
}));
```

## Execution Order

At priority 22, this system runs after `_physics` (20) has integrated velocity into position and after `_collisionEvents` (21). This means it works on the post-physics positions, making the snap-to-platform correction a post-processing step.

## See Also

- [[physics-system]] -- gravity, friction, and velocity integration that drives the falling entities
- [[collision-detection]] -- the overlap primitives used for general collision; platform collision uses its own simplified check
