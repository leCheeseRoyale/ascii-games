---
title: Sprite Cache
created: 2026-04-21
updated: 2026-04-21
type: component
tags: [rendering, performance, canvas, cache]
sources: [engine/render/sprite-cache.ts]
---

# Sprite Cache

An LRU offscreen canvas cache for multi-line ASCII sprites. Static sprite art is pre-rendered once per unique visual combination, then blitted as a single `drawImage()` call per frame instead of issuing multiple `fillText()` calls for each character on every frame.

## Why It Matters

Without caching, a 10-line sprite with per-character color mapping requires dozens of individual `fillText()` calls per frame. Canvas text rendering is expensive -- font shaping, glyph rasterization, and compositing are all CPU-bound. The sprite cache pays this cost once, then reuses the rasterized result on subsequent frames.

Opacity is deliberately NOT baked into the cached bitmap. Instead, `ctx.globalAlpha` is set at draw time, so tweening or blinking opacity does not invalidate the cache.

## Cache Key

Each cached sprite is keyed by the combination of visual properties that affect rendering:

```ts
function buildCacheKey(
  lines: string[],
  font: string,
  color: string,
  colorMap?: Record<string, string>,
  glow?: string,
): string
```

The key concatenates font, color, glow, sorted colorMap entries, and line content with null-byte delimiters. Any change to visual content produces a new key and a new cached entry.

## CachedSprite

The cached entry stores the pre-rendered canvas and its dimensions:

```ts
interface CachedSprite {
  canvas: OffscreenCanvas | HTMLCanvasElement
  width: number
  height: number
  key: string
}
```

Uses `OffscreenCanvas` when available, falling back to a regular `HTMLCanvasElement` for older browsers.

## Cache Size and Eviction

The cache holds a maximum of **128 entries**. When full, the oldest entry (least recently used) is evicted. The LRU ordering leverages `Map` insertion order -- on a cache hit, the entry is deleted and re-inserted to move it to the end.

```ts
const MAX_CACHE_SIZE = 128;

// On hit: delete + re-set moves entry to end (most recently used)
cache.delete(key);
cache.set(key, existing);

// On eviction: drop the first key (oldest / least recently used)
const first = cache.keys().next().value;
cache.delete(first);
```

## Rendering Pipeline

Each character in a cached sprite is rendered individually using Pretext-measured positions. This enables:

- **Space transparency** -- space characters are skipped (no `fillText`), so the background shows through.
- **Per-character colorMap** -- each character looks up its color from the colorMap or falls back to the base color.
- **Centered lines** -- each line is horizontally centered within the bitmap for consistent layout.
- **Glow** -- when a glow color is set, `ctx.shadowColor` and `ctx.shadowBlur` are applied, with extra padding on the canvas to accommodate the blur radius.

## API

```ts
// Get or create a cached sprite (main entry point, called by the renderer)
getCachedSprite(lines, font, color, colorMap?, glow?): CachedSprite

// Clear one entry or the entire cache
invalidateSpriteCache(key?: string): void

// Current number of cached entries
spriteCacheSize(): number
```

`invalidateSpriteCache()` is useful when dynamically changing art assets at runtime and needing to force re-rendering.

For how the renderer uses the sprite cache during drawing, see [[renderer]]. For the art data structures that feed into cached sprites, see [[art-assets]].
