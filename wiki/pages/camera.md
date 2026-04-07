---
title: Camera
created: 2026-04-07
updated: 2026-04-07
type: architecture
tags:
  - engine
  - camera
  - rendering
  - core
sources:
  - engine/render/camera.ts
  - engine/render/ascii-renderer.ts
---

# Camera

The `Camera` class provides 2D camera functionality: panning, zooming, following targets, and screen shake. It uses linear interpolation (lerp) for smooth movement and integrates with the [[renderer]] via Canvas 2D transforms.

## State

```ts
// engine/render/camera.ts
export class Camera {
  x = 0              // current position
  y = 0
  zoom = 1           // current zoom level
  shakeX = 0         // current shake offset (read by renderer)
  shakeY = 0

  private targetX = 0
  private targetY = 0
  private targetZoom = 1
  private smoothing = 0.1
  private shakeMagnitude = 0
  private shakeDecay = 0.9
}
```

The camera has both **current** values (`x`, `y`, `zoom`) and **target** values. Each frame, current values lerp toward targets, creating smooth motion.

## Methods

### moveTo(x, y) — Instant Jump

Sets both current and target position immediately. No interpolation.

```ts
moveTo(x: number, y: number): void {
  this.x = this.targetX = x
  this.y = this.targetY = y
}
```

Use for initial positioning or hard cuts.

### panTo(x, y, smoothing?) — Smooth Pan

Sets the target position. The camera smoothly interpolates toward it over subsequent frames.

```ts
panTo(x: number, y: number, smoothing = 0.1): void {
  this.targetX = x
  this.targetY = y
  this.smoothing = smoothing
}
```

Higher smoothing = faster arrival. `0.1` is a gentle drift; `0.5` is snappy.

### follow(x, y, smoothing?) — Per-Frame Tracking

Identical to `panTo` but intended to be called every frame from a system to track a moving target:

```ts
// In a camera-follow system:
const player = engine.world.with('player', 'position').first
if (player) {
  engine.camera.follow(player.position.x, player.position.y, 0.08)
}
```

### setZoom(z) — Zoom Level

Sets the target zoom, clamped between 0.1 and 5:

```ts
setZoom(z: number): void {
  this.targetZoom = clamp(z, 0.1, 5)
}
```

Zoom `1` = normal. `2` = 2x magnification. `0.5` = zoomed out.

### shake(magnitude?) — Screen Shake

Triggers a screen shake effect that decays exponentially:

```ts
shake(magnitude = 5): void {
  this.shakeMagnitude = magnitude
}
```

Each frame, random offsets are generated from `-magnitude` to `+magnitude`, and the magnitude decays by multiplying with `shakeDecay` (0.9). The shake stops when magnitude drops below 0.1.

### screenToWorld(sx, sy) — Screen to World Coordinates

Converts screen (pixel) coordinates to world coordinates, accounting for camera position and zoom:

```ts
screenToWorld(sx: number, sy: number): { x: number; y: number }
```

Use this to convert mouse click positions to world-space positions:

```ts
const worldPos = engine.camera.screenToWorld(engine.mouse.x, engine.mouse.y)
// worldPos.x and worldPos.y are now in world coordinates
```

### worldToScreen(wx, wy) — World to Screen Coordinates

Converts world coordinates to screen (pixel) coordinates:

```ts
worldToScreen(wx: number, wy: number): { x: number; y: number }
```

Use this to position UI elements or HTML overlays at a world entity's screen location:

```ts
const screenPos = engine.camera.worldToScreen(entity.position.x, entity.position.y)
// screenPos.x and screenPos.y are pixel positions on the canvas
```

Both methods account for the camera's current position, zoom level, and viewport centering.

## Update Loop

The camera's `update(dt)` is called once per frame, after systems and scene update (see [[engine-overview]]):

```ts
// engine/render/camera.ts
update(dt: number): void {
  // Smooth pan
  this.x = lerp(this.x, this.targetX, this.smoothing)
  this.y = lerp(this.y, this.targetY, this.smoothing)
  this.zoom = lerp(this.zoom, this.targetZoom, this.smoothing)

  // Shake
  if (this.shakeMagnitude > 0.1) {
    this.shakeX = rng(-this.shakeMagnitude, this.shakeMagnitude)
    this.shakeY = rng(-this.shakeMagnitude, this.shakeMagnitude)
    this.shakeMagnitude *= this.shakeDecay
  } else {
    this.shakeX = 0
    this.shakeY = 0
    this.shakeMagnitude = 0
  }
}
```

## Renderer Integration

The renderer reads the camera's public state (`x`, `y`, `zoom`, `shakeX`, `shakeY`) and applies it as a Canvas 2D transform before drawing anything:

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
// ... draw everything in world space ...
ctx.restore()
```

The camera position is centered in the viewport (`w/2`, `h/2`), so camera position `(100, 200)` means "put world coordinate (100, 200) at the center of the screen." Zoom scales around the camera's position, not the viewport origin.

## Common Patterns

**Center on spawn point:**
```ts
engine.camera.moveTo(engine.width / 2, engine.height / 2)
```

**Follow player with lag:**
```ts
engine.camera.follow(player.position.x, player.position.y, 0.05)
```

**Impact shake:**
```ts
engine.camera.shake(10)  // strong hit
engine.camera.shake(3)   // light bump
```

**Zoom for dramatic effect:**
```ts
engine.camera.setZoom(1.5)  // zoom in
engine.camera.setZoom(1)    // back to normal
```

## Related Pages

- [[renderer]] — How the camera transform is applied during rendering
- [[engine-overview]] — Camera update happens in step 5 of the frame lifecycle
- [[scene-lifecycle]] — Scenes typically set initial camera position in setup
