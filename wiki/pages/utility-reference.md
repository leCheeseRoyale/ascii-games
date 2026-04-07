---
title: Utility Reference
created: 2026-04-07
updated: 2026-04-07
type: reference
tags: [utilities, math, timer, color, constants]
sources: [engine/utils/math.ts, engine/utils/timer.ts, engine/utils/color.ts, shared/constants.ts]
---

# Utility Reference

Complete reference for all utility modules in the ASCII Game Engine: math, timers, colors, and constants.

See also: [[engine-overview]], [[component-reference]]

## Math Utilities

Source: `engine/utils/math.ts`

### Vector Operations

```typescript
export interface Vec2 { x: number; y: number }

export const vec2 = (x = 0, y = 0): Vec2 => ({ x, y })

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
export const scale = (v: Vec2, s: number): Vec2 => ({ x: v.x * s, y: v.y * s })
export const len = (v: Vec2): number => Math.sqrt(v.x * v.x + v.y * v.y)
export const normalize = (v: Vec2): Vec2 => {
  const l = len(v)
  return l > 0 ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 }
}
export const dist = (a: Vec2, b: Vec2): number => len(sub(a, b))
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y
```

| Function | Signature | Description |
|----------|-----------|-------------|
| `vec2` | `(x?, y?) → Vec2` | Create a vector (defaults to origin) |
| `add` | `(a, b) → Vec2` | Component-wise addition |
| `sub` | `(a, b) → Vec2` | Component-wise subtraction |
| `scale` | `(v, s) → Vec2` | Scalar multiplication |
| `len` | `(v) → number` | Vector magnitude |
| `normalize` | `(v) → Vec2` | Unit vector (returns zero for zero-length) |
| `dist` | `(a, b) → number` | Distance between two points |
| `dot` | `(a, b) → number` | Dot product |

All vector functions return **new objects** — no mutation.

### Scalar Utilities

```typescript
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
export const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v))
```

| Function | Signature | Description |
|----------|-----------|-------------|
| `lerp` | `(a, b, t) → number` | Linear interpolation (t=0→a, t=1→b) |
| `clamp` | `(v, min, max) → number` | Constrain value to range |

### Random Utilities

```typescript
export const rng = (min: number, max: number): number =>
  Math.random() * (max - min) + min
export const rngInt = (min: number, max: number): number =>
  Math.floor(rng(min, max + 1))
export const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]
export const chance = (p: number): boolean => Math.random() < p
```

| Function | Signature | Description |
|----------|-----------|-------------|
| `rng` | `(min, max) → number` | Random float in [min, max) |
| `rngInt` | `(min, max) → number` | Random integer in [min, max] inclusive |
| `pick` | `(arr) → T` | Random element from array |
| `chance` | `(p) → boolean` | True with probability p (0-1) |

## Timer Utilities

Source: `engine/utils/timer.ts`

### Cooldown

Rate-limiter for game actions (shooting, dashing, spawning):

```typescript
export class Cooldown {
  private remaining = 0
  constructor(public duration: number) {}

  /** Try to fire. Returns true if the cooldown was ready. */
  fire(): boolean {
    if (this.remaining <= 0) {
      this.remaining = this.duration
      return true
    }
    return false
  }

  /** Tick the cooldown. Call once per frame. */
  update(dt: number): void {
    if (this.remaining > 0) this.remaining -= dt
  }

  get ready(): boolean { return this.remaining <= 0 }
  reset(): void { this.remaining = 0 }
}
```

Usage:

```typescript
const shootCooldown = new Cooldown(0.2) // 200ms between shots

// In update:
shootCooldown.update(dt)
if (keyboard.held('Space') && shootCooldown.fire()) {
  spawnBullet()
}
```

| Method | Returns | Description |
|--------|---------|-------------|
| `fire()` | boolean | Try to activate — returns true if ready, starts cooldown |
| `update(dt)` | void | Tick the timer — call once per frame |
| `ready` | boolean | Is the cooldown finished? |
| `reset()` | void | Immediately reset to ready state |

### Tween Functions

```typescript
/** Linear tween from a to b over duration seconds. */
export function tween(elapsed: number, a: number, b: number, duration: number): number {
  const t = Math.min(elapsed / duration, 1)
  return a + (b - a) * t
}

/** Ease-out quadratic. */
export function easeOut(elapsed: number, a: number, b: number, duration: number): number {
  const t = Math.min(elapsed / duration, 1)
  return a + (b - a) * (1 - (1 - t) * (1 - t))
}
```

| Function | Curve | Description |
|----------|-------|-------------|
| `tween` | Linear | Constant speed from a to b |
| `easeOut` | Quadratic ease-out | Fast start, slow finish — `1-(1-t)²` |

Both clamp `t` to [0, 1] so values past `duration` stay at `b`.

## Color Utilities

Source: `engine/utils/color.ts`

```typescript
export function hsl(h: number, s: number, l: number): string {
  return `hsl(${h}, ${s}%, ${l}%)`
}

export function hsla(h: number, s: number, l: number, a: number): string {
  return `hsla(${h}, ${s}%, ${l}%, ${a})`
}

/** Cycle hue over time. */
export function rainbow(elapsed: number, speed = 1, s = 80, l = 60): string {
  return hsl((elapsed * speed * 360) % 360, s, l)
}

/** Lerp between two hex colors. */
export function lerpColor(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16)
  const br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16)
  const r = Math.round(ar + (br - ar) * t)
  const g = Math.round(ag + (bg - ag) * t)
  const bl = Math.round(ab + (bb - ab) * t)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`
}
```

| Function | Signature | Description |
|----------|-----------|-------------|
| `hsl` | `(h, s, l) → string` | CSS hsl() string |
| `hsla` | `(h, s, l, a) → string` | CSS hsla() string with alpha |
| `rainbow` | `(elapsed, speed?, s?, l?) → string` | Time-based hue cycling (rainbow effect) |
| `lerpColor` | `(hexA, hexB, t) → string` | Interpolate between two hex colors |

`rainbow()` is perfect for title screens and power-up effects — just pass `engine.time.elapsed`.

## Constants

Source: `shared/constants.ts`

### COLORS

```typescript
export const COLORS = {
  bg: '#0a0a0a',
  fg: '#e0e0e0',
  dim: '#666666',
  accent: '#00ff88',
  warning: '#ffaa00',
  danger: '#ff4444',
  info: '#44aaff',
  purple: '#aa44ff',
  pink: '#ff44aa',
} as const
```

9 named colors for consistent game-wide theming. Use these instead of hardcoded hex values.

### FONTS

```typescript
export const FONTS = {
  normal: '16px "Fira Code", monospace',
  large: '24px "Fira Code", monospace',
  huge: '48px "Fira Code", monospace',
  small: '12px "Fira Code", monospace',
  bold: '700 16px "Fira Code", monospace',
  boldLarge: '700 24px "Fira Code", monospace',
} as const
```

6 pre-defined CSS font strings. All use Fira Code monospace. Use these instead of writing font strings inline — they match the Pretext cache keys.
