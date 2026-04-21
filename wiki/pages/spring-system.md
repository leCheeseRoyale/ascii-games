---
title: Spring System
created: 2026-04-21
updated: 2026-04-21
type: system
tags: [physics, spring, system, animation]
sources: [engine/ecs/spring-system.ts, engine/utils/spring-presets.ts, shared/types.ts]
---

# Spring System

The spring system (`_spring`) applies spring forces that pull entities toward a target position. It auto-registers on scene load at `SystemPriority.spring` (15), running after `_parent` (10) and before `_physics` (20).

## Spring Component Interface

```ts
export interface Spring {
  targetX: number;
  targetY: number;
  strength: number;  // how strongly the entity is pulled toward the target
  damping: number;   // 0-1, velocity damping per frame (lower = more oscillation)
}
```

## Force Model

Each frame the system queries all entities with `position`, `velocity`, and `spring`. For each entity it computes the displacement from current position to the spring target, then applies the spring force and damping:

```ts
const dx = spring.targetX - position.x;
const dy = spring.targetY - position.y;

velocity.vx += dx * spring.strength;
velocity.vy += dy * spring.strength;
velocity.vx *= spring.damping;
velocity.vy *= spring.damping;
```

Higher `strength` pulls harder toward the target. Higher `damping` (closer to 1) preserves more velocity, producing slower settling. Lower `damping` dissipates energy faster but can feel stiff.

## Spring Presets

`SpringPresets` provides six named configurations exported from `engine/utils/spring-presets.ts`:

| Preset    | Strength | Damping | Character                     |
|-----------|----------|---------|-------------------------------|
| `stiff`   | 0.12     | 0.90    | Snaps quickly, minimal bounce |
| `snappy`  | 0.10     | 0.91    | Fast return, slight bounce    |
| `bouncy`  | 0.08     | 0.88    | Visible oscillation           |
| `smooth`  | 0.06     | 0.93    | Gradual, buttery return       |
| `floaty`  | 0.04     | 0.95    | Slow, dreamy drift            |
| `gentle`  | 0.02     | 0.97    | Very slow, almost lazy        |

## Usage with spawnText

The primary use case for springs is interactive text. `engine.spawnText()` decomposes a string into per-character entities, each with a spring pulling it back to its "home" position:

```ts
engine.spawnText({
  text: "Hello World",
  x: 400, y: 300,
  font: "24px monospace",
  spring: SpringPresets.bouncy,
  tag: "title",
});
```

Each character entity gets `position`, `velocity`, `spring` (with `targetX`/`targetY` set to its layout home), and a collider. External forces (cursor repel, ambient drift) push characters away; the spring pulls them back.

## Standalone Spring Entity

Springs work on any entity with the required components -- not just text:

```ts
engine.spawn({
  position: { x: 100, y: 100 },
  velocity: { x: 0, y: 0 },
  spring: { targetX: 200, targetY: 200, ...SpringPresets.stiff },
  ascii: { char: "*" },
});
```

## Execution Order

The spring system runs at priority 15, between `_parent` (10) and `_physics` (20). This means spring forces are applied to velocity before physics integrates velocity into position, ensuring a single clean update per frame.

## See Also

- [[physics-system]] -- velocity integration that moves spring-driven entities
- [[interactive-text]] -- `spawnText` / `spawnSprite` that create spring-based character entities
- [[component-reference]] -- full list of component shapes including Spring
