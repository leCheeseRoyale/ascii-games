---
title: Measure System
created: 2026-04-21
updated: 2026-04-21
type: system
tags: [system, rendering, pretext, collision]
sources: [engine/ecs/measure-system.ts, engine/render/measure-entity.ts, shared/types.ts]
---

# Measure System

The measure system (`_measure`) keeps `visualBounds` and auto-colliders in sync with an entity's text content. It auto-registers on scene load at `SystemPriority.measure` (5), making it the very first built-in system to run each frame.

## VisualBounds Component

```ts
export interface VisualBounds {
  width: number;
  height: number;
  halfW: number;
  halfH: number;
  /** Dirty-tracking key -- hash of (text + font + scale). Internal use. */
  _key: string;
}
```

VisualBounds stores the pixel dimensions derived from Pretext text measurement. It is attached automatically by `engine.spawn()` when `collider: "auto"` is used, and can also be added manually.

## Dirty-Tracking

The system avoids redundant measurement by computing a dirty key from the entity's text content. The key encodes the relevant visual properties:

- **ascii:** `char`, `font`, `scale`
- **sprite:** `lines` (joined), `font`
- **textBlock:** `text`, `font`, `maxWidth`, `lineHeight`

If the key matches the stored `_key` on `visualBounds`, the entity is skipped. This means measurement only runs when text, font, or scale actually changes.

## Auto-Collider Resolution

When an entity is spawned with `collider: "auto"`, `engine.spawn()` calls `resolveAutoCollider()` at spawn time. This function:

1. Measures the entity's text dimensions via Pretext
2. Attaches a `visualBounds` component
3. Replaces `"auto"` with a concrete `Collider` object (marked with `_auto: true`)

The collider shape depends on the entity type:
- **Single character** (`ascii` with 1 char) -- `type: "circle"` with diameter = max(width, height)
- **Multi-line or text block** -- `type: "rect"` with measured width and height
- **Single-line text** -- `type: "rect"` with measured width and height

If measurement fails (no canvas context), a fallback collider of 16x16 pixels is used.

## Runtime Updates

After spawn, the `_measure` system keeps dimensions current each frame. For every entity with `visualBounds`, it:

1. Builds a dirty key from current text content
2. Skips if the key matches the cached `_key`
3. Re-measures and updates `width`, `height`, `halfW`, `halfH`
4. Propagates new dimensions to the collider if it has `_auto: true`

This handles cases where an entity's text changes at runtime (e.g., a score display updating, an animation frame changing).

## Usage Example

**Entity with auto-sized collider:**
```ts
engine.spawn({
  position: { x: 200, y: 150 },
  ascii: { char: "@", font: "24px monospace" },
  collider: "auto",  // resolved to circle collider at spawn
});
```

**Sprite with auto-collider that updates on text change:**
```ts
const entity = engine.spawn({
  position: { x: 300, y: 200 },
  sprite: { lines: ["<=>", " | "], font: "16px monospace" },
  collider: "auto",  // resolved to rect collider at spawn
});

// Later, changing sprite lines triggers re-measurement next frame
entity.sprite!.lines = ["<==>", " || "];
```

## Execution Order

Running at priority 5, `_measure` is the first built-in system. This ensures all visual bounds are up-to-date before `_parent` (10) resolves hierarchies and `_spring` (15) / `_physics` (20) apply forces that depend on collider sizes.

## See Also

- [[pretext-integration]] -- the Pretext rendering pipeline that provides text measurement
- [[collision-detection]] -- how colliders (including auto-sized ones) are used for overlap checks
- [[component-reference]] -- VisualBounds, Collider, and all other component shapes
