---
title: Particle System
created: 2026-04-07
updated: 2026-04-07
type: subsystem
tags: [rendering, particles, pooling, performance]
sources: [engine/render/particles.ts]
---

# Particle System

ASCII particle effects — bursts of characters with velocity, lifetime, color, and fade. Particles are lightweight objects managed in a flat array, completely separate from the ECS.

See also: [[renderer]], [[collision-system]]

## Architecture: Not ECS Entities

Particles are **NOT** ECS entities. They live in a flat array managed by `ParticlePool`. This is a deliberate performance decision:

- No entity overhead (no component maps, no queries)
- Object pooling eliminates GC pressure
- Swap-remove for O(1) particle death
- Simple iteration for update and render

```typescript
export interface Particle {
  x: number; y: number
  vx: number; vy: number
  char: string
  color: string
  life: number      // remaining seconds
  maxLife: number
  font: string
}
```

## ParticlePool

```typescript
export class ParticlePool {
  particles: Particle[] = []
  private pool: Particle[] = []
  // ...
}
```

- `particles[]` — active particles being updated/rendered
- `pool[]` — recycled dead particle objects, reused to avoid allocation

## API

### burst(opts)

Spawns N particles at a position with random angle, speed, and character selection:

```typescript
burst(opts: {
  x: number; y: number
  count: number
  chars: string | string[]
  color: string
  speed?: number       // default: 100
  spread?: number      // default: Math.PI * 2 (full circle)
  lifetime?: number    // default: 1 second
  font?: string        // default: '16px "Fira Code", monospace'
}): void {
  const charArr = Array.isArray(chars) ? chars : chars.split('')

  for (let i = 0; i < count; i++) {
    const angle = rng(-spread / 2, spread / 2) - Math.PI / 2
    const spd = rng(speed * 0.3, speed)
    const p = this.pool.pop() || {} as Particle
    p.x = x
    p.y = y
    p.vx = Math.cos(angle) * spd
    p.vy = Math.sin(angle) * spd
    p.char = charArr[Math.floor(Math.random() * charArr.length)]
    p.color = color
    p.life = rng(lifetime * 0.5, lifetime)
    p.maxLife = p.life
    p.font = font
    this.particles.push(p)
  }
}
```

Key details:
- Each particle gets a random speed between 30%-100% of the specified speed
- Each particle gets a random lifetime between 50%-100% of the specified lifetime
- Characters are randomly picked from the `chars` array/string
- `spread` controls the angular range — `Math.PI * 2` for full circle, smaller for directional

### update(dt)

Moves particles, applies gravity, removes dead particles via swap-remove:

```typescript
update(dt: number): void {
  for (let i = this.particles.length - 1; i >= 0; i--) {
    const p = this.particles[i]
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.vy += 50 * dt // slight gravity
    p.life -= dt
    if (p.life <= 0) {
      this.pool.push(p)
      this.particles[i] = this.particles[this.particles.length - 1]
      this.particles.pop()
    }
  }
}
```

- Iterates backwards so swap-remove doesn't skip elements
- Dead particles are returned to `pool[]` for reuse
- Gravity constant is `50` units/sec² (subtle downward drift)

### render(ctx)

Draws each particle with alpha fade based on remaining life:

```typescript
render(ctx: CanvasRenderingContext2D): void {
  for (const p of this.particles) {
    const alpha = Math.max(0, p.life / p.maxLife)
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.font = p.font
    ctx.fillStyle = p.color
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.fillText(p.char, p.x, p.y)
    ctx.restore()
  }
}
```

Alpha fades linearly from 1.0 (just spawned) to 0.0 (about to die).

### clear()

Immediately kills all particles, returning them to the pool:

```typescript
clear(): void {
  this.pool.push(...this.particles)
  this.particles.length = 0
}
```

## IMPORTANT: Manual Rendering Required

Particles are **NOT** auto-rendered by the engine. You must call `particles.render(ctx)` manually in your scene's update function. This gives you control over render order (particles behind or in front of entities).

```typescript
// In your scene update:
update(engine, dt) {
  myParticles.update(dt)
  // ... other game logic ...
  myParticles.render(engine.ctx)  // You must call this!
}
```

## Usage Example

```typescript
const particles = new ParticlePool()

// Explosion effect
particles.burst({
  x: enemy.position.x,
  y: enemy.position.y,
  count: 20,
  chars: '*+#@!',
  color: COLORS.danger,
  speed: 150,
  lifetime: 0.8,
})
```
