---
title: Renderer
created: 2026-04-07
updated: 2026-04-07
type: architecture
tags:
  - engine
  - rendering
  - canvas
  - ascii
sources:
  - engine/render/ascii-renderer.ts
  - engine/render/text-layout.ts
  - engine/render/camera.ts
---

# Renderer

The `AsciiRenderer` draws the entire game world on an HTML Canvas 2D context. It supports four renderable types: single ASCII characters, multi-line sprites, text blocks, and images.

## Renderable Types

The renderer collects entities with any of these component pairs:

| Query | Renderable Type |
|-------|----------------|
| `position` + `ascii` | Single character (with font, color, glow, opacity, scale) |
| `position` + `sprite` | Multi-line ASCII art (centered on position) |
| `position` + `textBlock` | Reflowable text region (with obstacle avoidance) |
| `position` + `image` | Loaded image (with rotation, anchor, opacity) |

All renderables are sorted by their `layer` field before drawing, enabling front-to-back ordering.

## Render Pipeline

Each frame, `renderer.render(world, config, camera, particles?)` executes this exact sequence:

```
1. Clear canvas (fill with bgColor)
2. Save context state
3. Apply camera transform (translate, shake, zoom)
4. Collect all renderables from ECS queries (ascii, sprite, textBlock, image)
5. Sort renderables by layer (ascending)
6. Draw each renderable by type (drawAscii, drawSprite, drawTextBlock, drawImage)
7. Render particles (if passed — engine auto-passes them)
8. Restore context state
```

## Layered Rendering

Every renderable entity can have a `layer` numeric field. Before drawing, the renderer collects all renderables and sorts them:

```ts
renderables.sort((a, b) => a.layer - b.layer)
```

Lower layer values draw first (behind). Higher values draw on top. Entities without a `layer` default to 0. This allows precise control over draw order across all renderable types.

## DPR-Aware Resize

The renderer handles high-DPI displays by scaling the canvas buffer to match `devicePixelRatio`:

```ts
// engine/render/ascii-renderer.ts
resize(): void {
  const dpr = window.devicePixelRatio || 1
  const w = this.canvas.clientWidth
  const h = this.canvas.clientHeight
  if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
    this.canvas.width = w * dpr
    this.canvas.height = h * dpr
    this.ctx.scale(dpr, dpr)
  }
}
```

This is called on mount and on every window resize. The canvas CSS size stays the same; the internal buffer is scaled up so text renders crisply on Retina/HiDPI screens.

## Camera Transform

Before drawing any entities, the renderer applies the camera's position, shake, and zoom as a Canvas 2D transform:

```ts
// engine/render/ascii-renderer.ts
ctx.save()
ctx.translate(-camera.x + w / 2, -camera.y + h / 2)
ctx.translate(camera.shakeX, camera.shakeY)
if (camera.zoom !== 1) {
  ctx.translate(camera.x, camera.y)
  ctx.scale(camera.zoom, camera.zoom)
  ctx.translate(-camera.x, -camera.y)
}
```

The camera position is centered in the viewport. Zoom scales around the camera's focus point. See [[camera]] for the Camera class internals.

## Sprite Rendering

Entities with `position` + `sprite` are drawn as multi-line ASCII art. The sprite's `lines` array is drawn centered on the entity's position:

```ts
// engine/render/ascii-renderer.ts — drawSprite
ctx.save()
ctx.globalAlpha = sprite.opacity ?? 1
ctx.font = sprite.font
if (sprite.glow) {
  ctx.shadowColor = sprite.glow
  ctx.shadowBlur = 8
}
ctx.fillStyle = sprite.color
ctx.textBaseline = 'middle'
ctx.textAlign = 'center'
// Lines are drawn centered on (x, y)
for (let i = 0; i < lines.length; i++) {
  ctx.fillText(lines[i], x, y + (i - lines.length / 2) * lineHeight)
}
ctx.restore()
```

Sprites support the same visual properties as ASCII entities: font, color, glow, and opacity.

## Image Rendering

Entities with `position` + `image` render loaded HTML images onto the canvas. The `drawImage` method supports:

- **rotation** — rotates the image around its anchor point
- **anchor** — `'center'` (default) or `'topLeft'`
- **opacity** — global alpha (0-1)

Use `engine.loadImage(src)` or `engine.preloadImages(srcs)` to load images before rendering.

## Text Blocks

Text blocks are multi-line text regions. The renderer supports **obstacle flow-around**: if any entities have an `obstacle` component, text blocks will reflow their lines to avoid overlapping those obstacles.

```ts
// Obstacle-aware rendering
if (obstacles.length > 0) {
  const lines = layoutTextAroundObstacles(
    tb.text, tb.font, x, y, tb.maxWidth, tb.lineHeight, obstacles
  )
  for (const line of lines) {
    ctx.fillText(line.text, line.x, line.y)
  }
}
```

Text layout is handled by the `text-layout.ts` module which uses Pretext for text measurement. See [[pretext-integration]] for details.

## ASCII Entity Rendering

Any entity with both `position` and `ascii` components is automatically rendered. No explicit draw calls needed — just give an entity these components and it appears on screen.

```ts
// engine/render/ascii-renderer.ts
for (const e of world.with('position', 'ascii')) {
  const { x, y } = e.position
  const a = e.ascii
  ctx.save()
  ctx.globalAlpha = a.opacity ?? 1
  ctx.font = a.scale
    ? `${parseFloat(a.font) * a.scale}px ${a.font.replace(/^[\d.]+px\s*/, '')}`
    : a.font
  if (a.glow) {
    ctx.shadowColor = a.glow
    ctx.shadowBlur = 8
  }
  ctx.fillStyle = a.color
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillText(a.char, x, y)
  ctx.restore()
}
```

### Rendering Properties

Each ASCII entity supports these visual properties:

| Property | Default | Description |
|----------|---------|-------------|
| `char` | (required) | The character(s) to draw |
| `font` | (required) | CSS font string, e.g. `'24px monospace'` |
| `color` | (required) | Fill color |
| `opacity` | `1` | Global alpha (0-1) |
| `scale` | `undefined` | Multiplier on font size |
| `glow` | `undefined` | Shadow color for glow effect (shadowBlur = 8) |

Text is drawn centered on the entity's position (`textAlign: 'center'`, `textBaseline: 'middle'`), so `position` represents the center of the character.

## Particle Auto-Rendering

The engine automatically passes its `ParticlePool` to the renderer. Particles are drawn after all entities, so they appear on top. You do NOT need to manually call `particles.render()` — the engine handles this in its render loop:

```ts
// engine/core/engine.ts
private render(): void {
  this.renderer.render(this.world, this.config, this.camera, this.particles)
  if (this.transition.active) {
    this.transition.render(this.renderer.ctx, this.width, this.height)
  }
}
```

See [[particles]] for the ParticlePool API.

## Auto-Rendering

A key design principle: **entities render automatically.** You never call a draw function. The renderer queries the ECS world each frame and draws everything it finds. To make something visible, give it `position` + one of `ascii`, `sprite`, `textBlock`, or `image`. To hide it, remove the visual component. To make it invisible, set `opacity: 0`.

## Related Pages

- [[pretext-integration]] — Text measurement and layout for text blocks
- [[camera]] — Camera transform applied before rendering
- [[particles]] — Particle entities use the same ASCII rendering
- [[engine-overview]] — Where rendering fits in the frame lifecycle
