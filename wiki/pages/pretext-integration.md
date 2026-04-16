---
title: Pretext Integration
created: 2026-04-07
updated: 2026-04-07
type: subsystem
tags: [rendering, text, pretext, layout, caching]
sources: [engine/render/text-layout.ts]
---

# Pretext Integration

The engine wraps [@chenglou/pretext](https://github.com/chenglou/pretext) for all text measurement and layout. Pretext is a canvas-native text layout library that operates without the DOM — critical for hitting 60fps in an ASCII game engine.

See also: [[renderer]], [[text-flow-pattern]], [[component-reference]]

## Architecture

Two operational modes:

1. **layoutTextBlock()** — fixed-width paragraph layout, returns lines
2. **layoutTextAroundObstacles()** — variable-width layout that flows text around circular obstacles

## Caching Strategy

Pretext's `prepare()` call is **expensive** — it measures every grapheme cluster in the text. The `layout()` call is **cheap** — it just walks the prepared data with a width constraint.

The engine maintains a single LRU cache keyed by `font + '\x00' + text`. `PreparedTextWithSegments` is a superset of `PreparedText` — both `layout()` and `walkLineRanges()` accept it — so one cache entry covers every path:

```typescript
const preparedCache = new LRUCache<PreparedTextWithSegments>(MAX_CACHE_SIZE)

function cacheKey(text: string, font: string): string {
  return font + '\x00' + text
}

function getPrepared(text: string, font: string): PreparedTextWithSegments {
  const k = cacheKey(text, font)
  let p = preparedCache.get(k)
  if (!p) {
    p = prepareWithSegments(text, font)
    preparedCache.set(k, p)
  }
  return p
}
```

- `preparedCache` is used by every path: `measureHeight`, `layoutTextBlock`, `shrinkwrap`, `getLineCount`, obstacle flow.
- A separate `widthCache` memoizes single-line widths for `measureLineWidth` and `CanvasUI.inlineRun` chunks.
- `clearTextCache()` wipes both — call when fonts change.

## Public API

### measureHeight(text, font, maxWidth, lineHeight): number

Cheapest measurement. Uses the fast cache path — `layout()` returns height without building line objects.

```typescript
export function measureHeight(text: string, font: string, maxWidth: number, lineHeight: number): number {
  return layout(getPrepared(text, font), maxWidth, lineHeight).height
}
```

### getLineCount(text, font, maxWidth): number

Counts lines via `walkLineRanges` callback invocation:

```typescript
export function getLineCount(text: string, font: string, maxWidth: number): number {
  let count = 0
  walkLineRanges(getSegments(text, font), maxWidth, () => { count++ })
  return count
}
```

### shrinkwrap(text, font, maxWidth): number

Finds the tightest bounding width — the maximum line width across all wrapped lines:

```typescript
export function shrinkwrap(text: string, font: string, maxWidth: number): number {
  const prepared = getSegments(text, font)
  let max = 0
  walkLineRanges(prepared, maxWidth, line => { if (line.width > max) max = line.width })
  return Math.ceil(max)
}
```

### layoutTextBlock(text, font, maxWidth, lineHeight): {text, width}[]

Standard fixed-width layout. Returns line objects with text content and measured width:

```typescript
export function layoutTextBlock(
  text: string, font: string, maxWidth: number, lineHeight: number
): { text: string; width: number }[] {
  const prepared = getSegments(text, font)
  const { lines } = layoutWithLines(prepared, maxWidth, lineHeight)
  return lines.map(l => ({ text: l.text, width: l.width }))
}
```

### layoutTextAroundObstacles(text, font, startX, startY, maxWidth, lineHeight, obstacles): RenderedLine[]

The most complex layout function. Flows text around circular obstacles by calculating per-line available width. This is covered in depth at [[text-flow-pattern]].

## Why prepare() is Expensive and layout() is Cheap

- `prepare()` measures every grapheme cluster by rendering to an offscreen canvas and computing widths. This is O(n) with the text length and involves canvas API calls.
- `layout()` walks the pre-measured data with simple arithmetic — just comparisons against a width constraint. No canvas calls, no DOM.

This is why the cache is essential: prepare once, layout many times with different widths (especially for obstacle flow where every line gets a different width).

## Imports from Pretext

```typescript
import {
  prepare,
  layout,
  prepareWithSegments,
  layoutWithLines,
  layoutNextLine,
  walkLineRanges,
  type PreparedText,
  type PreparedTextWithSegments,
  type LayoutCursor,
} from '@chenglou/pretext'
```
