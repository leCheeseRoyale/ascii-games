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

The `AsciiRenderer` draws the entire game world as text on an HTML Canvas 2D context. Every visible entity is rendered as a text character or text block — there are no sprites or images.

## Render Pipeline

Each frame, `renderer.render(world, config, camera)` executes this exact sequence:

```
1. Clear canvas (fill with bgColor)
2. Save context state
3. Apply camera transform (translate, shake, zoom)
4. Collect obstacles for text flow
5. Render text blocks (with/without obstacle flow-around)
6. Render ASCII entities (single characters)
7. Restore context state
```

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

## Auto-Rendering

A key design principle: **entities render automatically.** You never call a draw function. The renderer queries the ECS world each frame and draws everything it finds. To make something visible, give it `position` + `ascii`. To hide it, remove the `ascii` component. To make it invisible, set `opacity: 0`.

## Related Pages

- [[pretext-integration]] — Text measurement and layout for text blocks
- [[camera]] — Camera transform applied before rendering
- [[particles]] — Particle entities use the same ASCII rendering
- [[engine-overview]] — Where rendering fits in the frame lifecycle
