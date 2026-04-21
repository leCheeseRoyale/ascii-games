---
title: Trail System
created: 2026-04-21
updated: 2026-04-21
type: system
tags: [system, rendering, particles, trail]
sources: [engine/ecs/trail-system.ts, shared/types.ts]
---

# Trail System

The trail system (`_trail`) spawns fading afterimage entities behind any moving entity that has a `trail` component. It auto-registers on scene load at `SystemPriority.emitter + 1` (51), running right after the emitter system.

## Trail Component Interface

```ts
export interface Trail {
  /** Spawn interval in seconds. Default 0.05. */
  interval?: number;
  /** Lifetime of each trail entity in seconds. Default 0.3. */
  lifetime?: number;
  /** Trail color. If omitted, uses the entity's ascii/sprite color. */
  color?: string;
  /** Opacity of trail when spawned (fades to 0). Default 0.5. */
  opacity?: number;
  /** Internal accumulator -- do not set manually. */
  _acc?: number;
}
```

## How It Works

Each frame the system iterates all entities with `trail` and `position`. It accumulates delta-time in an internal counter (`_acc`). When the accumulator exceeds the configured `interval`, the system spawns a ghost entity at the current position of the source entity.

The ghost entity is created with:
- The same `ascii` or `sprite` visual as the source, rendered one layer behind (`layer - 1`)
- A `lifetime` component set to the trail's configured lifetime
- A `tween` that fades opacity from `startOpacity` to 0 over the lifetime duration

The ghost self-destructs when its lifetime expires (handled by the built-in `_lifetime` system).

## Supported Visuals

The system checks the source entity for visual components in priority order:
1. `ascii` -- single-character or short text entities
2. `sprite` -- multi-line ASCII art entities

If neither is present on the entity, no trail ghost is spawned for that tick.

## Usage Example

**Bullet with a fading trail:**
```ts
engine.spawn({
  position: { x: 100, y: 200 },
  velocity: { x: 300, y: 0 },
  ascii: { char: "-", color: "#ff0" },
  collider: { type: "rect", width: 8, height: 4 },
  trail: { interval: 0.03, lifetime: 0.4, color: "#ff0", opacity: 0.6 },
  tags: { values: new Set(["bullet"]) },
});
```

**Player ship with subtle afterimages:**
```ts
engine.spawn({
  position: { x: 400, y: 500 },
  velocity: { x: 0, y: 0 },
  sprite: { lines: [" ^ ", "/|\\"], font: "16px monospace", color: "#0ff" },
  trail: { interval: 0.05, lifetime: 0.2, opacity: 0.3 },
  tags: { values: new Set(["player"]) },
});
```

## Performance Considerations

Trails spawn new entities every `interval` seconds. At the default interval of 0.05s, that is 20 ghosts per second per trailed entity. Each ghost lives for `lifetime` seconds before being cleaned up. Keep `interval` reasonable (>= 0.03) and `lifetime` short (<= 0.5) to avoid entity count bloat.

## See Also

- [[component-reference]] -- full Trail component shape and all other component types
- [[particles]] -- the emitter system that runs just before trails
- [[renderer]] -- how trail ghosts are rendered with layer ordering and opacity
