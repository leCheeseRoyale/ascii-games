---
title: Image System
created: 2026-04-07
updated: 2026-04-07
type: component
tags: [rendering, images, engine]
sources: [engine/render/image-loader.ts, shared/types.ts]
---

# Image System

The image system allows entities to render bitmap images on the canvas alongside ascii and sprite content. It provides async image loading with caching and integrates with the [[renderer]] layer sorting pipeline.

## ImageComponent Interface

```ts
export interface ImageComponent {
  image: HTMLImageElement
  width: number
  height: number
  opacity?: number
  layer?: number
  anchor?: 'center' | 'topLeft'
  rotation?: number
  tint?: string
}
```

Attach an `image` component to any entity with a `position` to render a bitmap. The `layer` field participates in the same draw-order sorting used by ascii and sprite entities (see [[renderer]]). The `anchor` field controls whether the image is drawn from its center or top-left corner. `rotation` is in radians and `tint` applies a color overlay.

## Image Loader API

All loading goes through a shared cache backed by two Maps — one for resolved images and one for in-flight promises. Duplicate requests for the same `src` deduplicate automatically.

```ts
loadImage(src: string): Promise<HTMLImageElement>
```
Returns a cached image if available, otherwise creates an `HTMLImageElement`, sets its `src`, and resolves on `onload`. The result is stored in the cache for future calls.

```ts
preloadImages(srcs: string[]): Promise<HTMLImageElement[]>
```
Convenience wrapper — calls `loadImage` for every source in parallel via `Promise.all`. Use this in a scene's `setup()` to ensure all assets are ready before the first frame.

```ts
getCachedImage(src: string): HTMLImageElement | null
```
Synchronous lookup. Returns the image if it has already been loaded and cached, otherwise `null`. Useful inside render or update loops where you cannot await.

```ts
clearImageCache(): void
```
Clears both the resolved cache and pending promises. Call during [[scene-lifecycle]] cleanup to free memory between scenes.

## Rendering Pipeline

The renderer draws image entities using `ctx.drawImage`. It applies transformations in this order:

1. Translate to entity position (adjusted by [[camera]] offset and zoom)
2. Apply rotation if set
3. Adjust for anchor point — `'center'` offsets by half width/height, `'topLeft'` draws at position directly
4. Set `globalAlpha` to `opacity` (default 1)
5. Draw the image at the computed width and height

Image entities participate in the same layer-sorting pass as ascii and sprite entities. An entity can have both an `image` component and an `ascii` component — the renderer draws them in layer order, which lets you overlay text on top of images or vice versa.

## Usage Example

```ts
import { loadImage } from '@engine/render/image-loader'

async function setup(engine: Engine) {
  const img = await loadImage('/assets/ship.png')
  engine.world.add({
    position: { x: 100, y: 100 },
    image: {
      image: img,
      width: 64,
      height: 64,
      anchor: 'center',
      layer: 0
    }
  })
}
```

## Related

- [[component-reference]] — Full list of all ECS components including ImageComponent
- [[renderer]] — Canvas rendering pipeline and layer sorting
- [[scene-lifecycle]] — Scene setup/cleanup where preloading and cache clearing happen
