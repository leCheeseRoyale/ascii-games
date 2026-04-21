---
title: Interactive Text
created: 2026-04-21
updated: 2026-04-21
type: pattern
tags: [pretext, physics, spring, text, pattern]
sources: [engine/core/engine.ts, engine/render/measure-entity.ts, engine/utils/spring-presets.ts]
---

# Interactive Text

The engine can decompose text and multi-line ASCII sprites into individual per-character entities, each with its own position, velocity, collider, and spring-to-home physics. This turns static text into a physically interactive element -- characters scatter on impact and spring back to their home positions.

## How It Works

1. Pretext measures each character's pixel width in the target font.
2. Home positions are computed using `measureCharacterPositions()` (single-line text with word wrap) or `measureSpriteCharacterPositions()` (multi-line sprites centered on a point).
3. Each non-space character becomes an independent entity with `ascii`, `position`, `velocity`, `spring`, and optionally `collider: "auto"`.
4. The built-in `_spring` system pulls each character back toward its home coordinate every frame.

See [[pretext-integration]] for how Pretext drives text measurement.

## spawnText

Spawns a text string as per-character entities with spring physics and word wrapping.

```ts
engine.spawnText({
  text: "HELLO WORLD",
  font: '24px "Fira Code", monospace',
  position: { x: 100, y: 200 },
  color: "#00ff88",
  spring: { strength: 0.08, damping: 0.93 },
  maxWidth: 400,       // word-wrap width in pixels (default Infinity)
  lineHeight: 31.2,    // defaults to fontSize * 1.3
  layer: 0,
  tags: ["title"],
  collider: true,      // default true; gives each char collider: "auto"
})
```

Returns `Partial<Entity>[]` -- one entity per visible character (spaces are skipped).

## spawnSprite

Same concept for multi-line ASCII art. Lines are centered around the given position.

```ts
engine.spawnSprite({
  lines: ["/\\", "/  \\", "----"],
  font: '16px "Fira Code", monospace',
  position: { x: 200, y: 300 },
  color: "#e0e0e0",
  spring: { strength: 0.06, damping: 0.93 },
})
```

## spawnArt / spawnInteractiveArt

Higher-level helpers that accept an `ArtAsset` object (see [[art-assets]]).

**`spawnArt`** creates a single static sprite entity (no decomposition):

```ts
engine.spawnArt(dragon, { position: { x: 100, y: 200 }, layer: 2 })
```

**`spawnInteractiveArt`** decomposes the art into per-character physics entities via `spawnSprite`:

```ts
engine.spawnInteractiveArt(dragon, {
  position: { x: 100, y: 200 },
  spring: SpringPresets.bouncy,
  tags: ["dragon"],
})
```

## Spring Presets

Named spring configs from `SpringPresets` for common feels:

| Preset    | Strength | Damping | Feel                      |
|-----------|----------|---------|---------------------------|
| `stiff`   | 0.12     | 0.90    | Snaps back fast           |
| `snappy`  | 0.10     | 0.91    | Quick with slight overshoot |
| `bouncy`  | 0.08     | 0.88    | Visible bounce            |
| `smooth`  | 0.06     | 0.93    | Gentle pull               |
| `floaty`  | 0.04     | 0.95    | Slow, dreamy              |
| `gentle`  | 0.02     | 0.97    | Barely perceptible        |

## Complete Example

Combine `spawnText` with cursor repel and ambient drift for an interactive title screen:

```ts
import { createCursorRepelSystem, createAmbientDriftSystem, SpringPresets } from '@engine'

const scene = defineScene({
  name: 'title',
  setup(engine) {
    engine.spawnText({
      text: "ASTEROID FIELD",
      font: '32px "Fira Code", monospace',
      position: { x: engine.width / 2 - 200, y: engine.height / 2 },
      spring: SpringPresets.bouncy,
      tags: ["title"],
    })
    engine.addSystem(createCursorRepelSystem({ radius: 120 }))
    engine.addSystem(createAmbientDriftSystem({ strength: 0.3 }))
  },
})
```

Characters drift gently and scatter away from the mouse cursor, then spring back home. See [[spring-system]] for how the spring integrator works internally.
