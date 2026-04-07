---
title: Input System
created: 2026-04-07
updated: 2026-04-07
type: subsystem
tags: [input, keyboard, mouse, per-frame]
sources: [engine/input/keyboard.ts, engine/input/mouse.ts]
---

# Input System

Keyboard and Mouse classes that track per-frame input state. The engine calls `update()` once per frame before systems run, flushing pending events into frame-accurate `justPressed`/`justReleased` sets.

See also: [[engine-overview]], [[player-input-system]]

## Design: Pending → Flushed Pattern

Browser events fire asynchronously between frames. The input system buffers them into `pending` sets/booleans, then flushes to `just*` state once per frame in `update()`. This ensures:

- A key pressed and released between frames is still detected
- `justPressed` is true for exactly one frame
- Multiple systems can check the same input in the same frame

## Keyboard

```typescript
export class Keyboard {
  readonly keys = new Set<string>()
  readonly justPressed = new Set<string>()
  readonly justReleased = new Set<string>()

  private pendingDown = new Set<string>()
  private pendingUp = new Set<string>()
  private onDown: (e: KeyboardEvent) => void
  private onUp: (e: KeyboardEvent) => void

  constructor() {
    this.onDown = (e: KeyboardEvent) => {
      if (!this.keys.has(e.code)) this.pendingDown.add(e.code)
      this.keys.add(e.code)
      // Prevent browser defaults for game keys
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Tab'].includes(e.code)) {
        e.preventDefault()
      }
    }
    this.onUp = (e: KeyboardEvent) => {
      this.keys.delete(e.code)
      this.pendingUp.add(e.code)
    }
    window.addEventListener('keydown', this.onDown)
    window.addEventListener('keyup', this.onUp)
  }

  /** Flush pending -> justPressed/justReleased. Call once per frame. */
  update(): void {
    this.justPressed.clear()
    this.justReleased.clear()
    for (const k of this.pendingDown) this.justPressed.add(k)
    for (const k of this.pendingUp) this.justReleased.add(k)
    this.pendingDown.clear()
    this.pendingUp.clear()
  }

  /** Is this key currently held? */
  held(code: string): boolean { return this.keys.has(code) }
  /** Was this key pressed this frame? */
  pressed(code: string): boolean { return this.justPressed.has(code) }
  /** Was this key released this frame? */
  released(code: string): boolean { return this.justReleased.has(code) }

  destroy(): void {
    window.removeEventListener('keydown', this.onDown)
    window.removeEventListener('keyup', this.onUp)
  }
}
```

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `held(code)` | boolean | True while the key is held down |
| `pressed(code)` | boolean | True for exactly one frame when key goes down |
| `released(code)` | boolean | True for exactly one frame when key goes up |
| `update()` | void | Flushes pending events — called by engine |
| `destroy()` | void | Removes event listeners |

### Prevented Defaults

Arrow keys, Space, and Tab have `preventDefault()` called to stop browser scrolling and tab-switching during gameplay.

## Mouse

```typescript
export class Mouse {
  x = 0
  y = 0
  down = false
  justDown = false
  justUp = false

  private pendingDown = false
  private pendingUp = false
  private canvas: HTMLCanvasElement
  private onMove: (e: MouseEvent) => void
  private onDown: (e: MouseEvent) => void
  private onUp: () => void

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect()
      this.x = e.clientX - r.left
      this.y = e.clientY - r.top
    }
    this.onDown = (e: MouseEvent) => {
      this.down = true
      this.pendingDown = true
      this.onMove(e)
    }
    this.onUp = () => {
      this.down = false
      this.pendingUp = true
    }
    canvas.addEventListener('mousemove', this.onMove)
    canvas.addEventListener('mousedown', this.onDown)
    window.addEventListener('mouseup', this.onUp)
  }

  update(): void {
    this.justDown = this.pendingDown
    this.justUp = this.pendingUp
    this.pendingDown = false
    this.pendingUp = false
  }

  destroy(): void {
    this.canvas.removeEventListener('mousemove', this.onMove)
    this.canvas.removeEventListener('mousedown', this.onDown)
    window.removeEventListener('mouseup', this.onUp)
  }
}
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `x` | number | Mouse X relative to canvas (via `getBoundingClientRect`) |
| `y` | number | Mouse Y relative to canvas |
| `down` | boolean | True while mouse button is held |
| `justDown` | boolean | True for one frame on mouse press |
| `justUp` | boolean | True for one frame on mouse release |

### Event Listener Binding

- `mousemove` and `mousedown` are on the **canvas** element (scoped to game area)
- `mouseup` is on **window** (catches releases even if cursor leaves canvas)

## Usage in Game Code

```typescript
// In a system update:
if (engine.keyboard.pressed('Space')) {
  // Fire weapon — only triggers once per press
}

if (engine.keyboard.held('ArrowLeft')) {
  player.position.x -= speed * dt  // Continuous movement
}

if (engine.mouse.justDown) {
  // Click at engine.mouse.x, engine.mouse.y
}
```

## Cleanup

Both classes have `destroy()` methods that remove all event listeners. The engine calls these on shutdown to prevent memory leaks.
