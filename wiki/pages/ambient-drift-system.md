---
title: Ambient Drift System
created: 2026-04-21
updated: 2026-04-21
type: system
tags: [system, animation, text]
sources: [engine/ecs/ambient-drift.ts]
---

# Ambient Drift System

The ambient drift system adds gentle sinusoidal motion to spring-based entities, giving idle text or objects a subtle breathing or floating appearance. It is a factory-created system (not auto-registered) commonly paired with `spawnText` / `spawnSprite` for interactive title screens and menus.

## Factory Function

```ts
function createAmbientDriftSystem(opts?: AmbientDriftOpts): System
```

### Options

```ts
export interface AmbientDriftOpts {
  /** Drift amplitude. Default 0.3. */
  amplitude?: number;
  /** Drift speed multiplier. Default 0.5. */
  speed?: number;
  /** Only affect entities with this tag. Optional. */
  tag?: string;
}
```

## How It Works

Each frame the system iterates all entities with `position`, `velocity`, and `spring`. For each entity it computes a sinusoidal offset and applies it as a velocity impulse:

```ts
const phase = spring.targetX * 0.01 + spring.targetY * 0.013;
velocity.vx += Math.sin(time * speed + phase) * amplitude;
velocity.vy += Math.cos(time * speed * 0.7 + phase * 1.3) * amplitude;
```

The phase is derived from each entity's spring target position, ensuring nearby characters drift in similar patterns while distant ones move independently. The X and Y axes use different frequency multipliers (1.0 and 0.7) to avoid perfectly circular motion, producing a more organic feel.

The drift nudges entities away from their home positions; the spring component pulls them back. The interplay creates a gentle oscillation around each character's layout position.

## Tag Filtering

When `tag` is specified, only entities whose `tags.values` set contains the given tag are affected. This allows multiple text groups on screen with different drift behaviors (or no drift at all).

## Usage Example

**Title screen with drifting text:**
```ts
import { createAmbientDriftSystem } from "@engine/ecs/ambient-drift";
import { SpringPresets } from "@engine/utils/spring-presets";

engine.spawnText({
  text: "ASTEROID FIELD",
  x: 400, y: 200,
  font: "32px monospace",
  spring: SpringPresets.smooth,
  tag: "title",
});

engine.addSystem(createAmbientDriftSystem({
  amplitude: 0.4,
  speed: 0.6,
  tag: "title",
}));
```

**Subtle background drift with defaults:**
```ts
engine.addSystem(createAmbientDriftSystem());
```

## Tuning Guide

| amplitude | speed | Effect                              |
|-----------|-------|-------------------------------------|
| 0.1-0.3   | 0.3   | Barely perceptible idle shimmer     |
| 0.3-0.5   | 0.5   | Gentle breathing (default range)    |
| 0.5-1.0   | 0.8   | Noticeable floating / hovering      |
| 1.0+      | 1.0+  | Dramatic wave, borderline chaotic   |

The spring preset also matters. A `stiff` spring pulls characters back quickly, dampening the visible drift. A `floaty` spring lets characters wander further before returning.

## Execution Order

The system uses the default priority (0), so it runs before all built-in systems. This means drift forces are applied to velocity before `_spring` (15) adds its restoring force and `_physics` (20) integrates velocity into position.

## See Also

- [[interactive-text]] -- `spawnText` / `spawnSprite` that create the spring-based entities drift acts on
- [[spring-system]] -- the restoring force that balances drift and keeps characters near home
