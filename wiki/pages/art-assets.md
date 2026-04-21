---
title: Art Assets
created: 2026-04-21
updated: 2026-04-21
type: component
tags: [rendering, data, sprite, ascii]
sources: [engine/data/art-asset.ts]
---

# Art Assets

Structured ASCII art data types and helpers. An `ArtAsset` bundles visual data (lines, colors, font, glow) into a reusable object, separate from game logic. Define art in dedicated files and import into scenes.

## ArtAsset

The core type for static ASCII art:

```ts
interface ArtAsset {
  lines: string[]                       // one string per visual line
  colorMap?: Record<string, string>     // char → CSS color override
  font?: string                         // defaults to engine default if omitted
  color?: string                        // base text color, defaults to "#e0e0e0"
  glow?: string                         // optional glow/shadow color
}
```

`colorMap` maps individual characters to colors, enabling multi-colored sprites. For example, `{ '*': '#ffcc00', '@': '#ff4444' }` renders `*` in gold and `@` in red, while all other characters use the base `color`.

## AnimatedArtAsset

A sequence of `ArtAsset` frames with timing:

```ts
interface AnimatedArtAsset {
  frames: ArtAsset[]
  frameDuration: number   // seconds per frame
  loop?: boolean          // defaults to true
}
```

Each frame is a complete `ArtAsset`, allowing per-frame color and content changes.

## SpriteSheet

A complete character sprite sheet -- all animation states for one character:

```ts
interface SpriteSheet {
  name: string                                  // character name
  width: number                                 // widest frame in characters
  height: number                                // tallest frame in lines
  color: string                                 // base color for all frames
  colorMap?: Record<string, string>             // shared colorMap for all frames
  states: Record<string, AnimatedArtAsset>      // keyed by state name
}
```

States map to animation names like `"idle"`, `"walk"`, `"attack"`, `"hurt"`. Use with `engine.playAnimation()` or the `StateMachine` component.

## spriteSheetFrames()

Extracts animation data from a `SpriteSheet` state, ready for `engine.playAnimation()`:

```ts
function spriteSheetFrames(
  sheet: SpriteSheet,
  stateName: string,
): { frames: AnimationFrame[]; frameDuration: number; loop: boolean } | null
```

Returns `null` if the state name does not exist in the sheet.

## artFromString()

Parses a multiline template string into an `ArtAsset`. Strips leading/trailing blank lines and removes common indentation, so inline art stays clean:

```ts
function artFromString(
  text: string,
  colorMap?: Record<string, string>,
): ArtAsset
```

Example:

```ts
import { artFromString, type ArtAsset } from '@engine'

const ship: ArtAsset = artFromString(`
    /\\
   /  \\
  /    \\
  ------
`, { '/': '#88ccff', '\\': '#88ccff', '-': '#666666' })
```

The dedent logic finds the smallest common whitespace prefix across non-empty lines and strips it, so the four-space indent in the template literal is removed from the output lines.

## Spawning Art

Two engine helpers consume `ArtAsset` objects:

- **`engine.spawnArt(asset, opts)`** -- spawns as a single static `sprite` entity.
- **`engine.spawnInteractiveArt(asset, opts)`** -- decomposes into per-character entities with spring physics via `spawnSprite`.

See [[interactive-text]] for the decomposition pattern. For how sprites are cached and drawn, see [[renderer]]. For animation playback, see [[animation-system]].
