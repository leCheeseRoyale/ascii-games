---
name: game-feel
description: Use when the user wants to make their game feel better, add screen shake, particles, sound effects, visual polish, scene transitions, slow motion, text effects, floating text, damage flash, explosion effects, trail afterimages, or asks "make hits feel punchier", "add particles", "screen shake", "add sound", "juice", "polish", "game feel flat". For text effects and per-character animation, also invoke the globally installed `pretext` skill.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Game feel (juice)

The difference between "it works" and "it feels good." Every snippet here adds one layer of feedback. **For per-character text animation and physics text effects, also use the globally installed `pretext` skill.**

## Screen shake

```ts
engine.camera.shake(4)    // light hit
engine.camera.shake(8)    // heavy hit
engine.camera.shake(12)   // explosion
engine.camera.shake(16)   // boss death only — anything higher feels broken
```

## Particles

```ts
// Generic burst
engine.particles.burst({
  x, y, count: 12,
  chars: ['*', '.', '·'],
  color: '#ffcc00',
  speed: 120,
  lifetime: 0.6,
  spread: Math.PI * 2,  // full circle
})

// Pre-made effects
engine.particles.explosion(x, y, '#ff4444')   // big circle burst
engine.particles.sparkle(x, y, '#ffcc00')     // small upward shimmer
engine.particles.smoke(x, y, '#888888')       // slow fading puff
```

## Sound effects

```ts
import { sfx, beep } from '@engine'

sfx.shoot()    // pew pew
sfx.hit()      // thwack
sfx.pickup()   // bright chime
sfx.explode()  // bass boom
sfx.menu()     // soft click
sfx.death()    // descending warble

// Custom tone
beep({ freq: 880, duration: 0.05, volume: 0.1 })
```

## Floating text

```ts
engine.floatingText(x, y - 10, '+100', '#ffcc00')    // score
engine.floatingText(x, y - 10, '-5 HP', '#ff4444')   // damage
engine.floatingText(x, y - 10, 'MISS', '#888888')    // miss
```

Text floats upward and fades automatically.

## Toast notifications

```ts
engine.toast.show('Wave 3 incoming!', { color: '#ffcc00' })
engine.toast.show('Achievement unlocked!', { color: '#aa44ff' })
```

Shows briefly at top of screen, fades out.

## Screen flash

```ts
engine.flash('#ff0000', 0.15)  // red damage flash
engine.flash('#ffffff', 0.1)   // white hit flash
engine.flash('#ffcc00', 0.2)   // gold pickup flash
```

## Damage flash (entity-specific)

```ts
import { createDamageFlash } from '@engine'

// Red flash on entity + camera shake + particles — all in one call
createDamageFlash(entity, engine)

// With options
createDamageFlash(entity, engine, {
  color: '#ff4444',
  duration: 0.15,
  shakeMagnitude: 4,
  particles: true,
})
```

## Invincibility blink

```ts
engine.blink(entity, 0.5, 0.1)  // blink for 0.5s, toggle every 0.1s
```

## Knockback

```ts
engine.knockback(entity, fromX, fromY, 300)  // push away from point
```

## Slow motion

```ts
engine.timeScale = 0.3  // everything runs at 30% speed
engine.after(0.5, () => { engine.timeScale = 1 })  // restore after half second
```

## Tweens (smooth property animation)

```ts
// Slide entity across screen
engine.tweenEntity(entity, 'position.x', 0, 400, 1.0, 'easeOut')

// Fade out
engine.tweenEntity(entity, 'ascii.opacity', 1, 0, 0.5, 'easeInOut')

// Scale punch (grow then shrink back)
engine.tweenEntity(entity, 'ascii.scale', 1, 1.5, 0.1, 'easeOut')
engine.after(0.1, () => engine.tweenEntity(entity, 'ascii.scale', 1.5, 1, 0.2, 'easeOut'))
```

Easing options: `linear`, `easeIn`, `easeOut`, `easeInOut`, `easeInQuad`, `easeOutQuad`, `easeInCubic`, `easeOutCubic`.

## Frame animation

```ts
engine.playAnimation(entity, [
  { char: '○' },
  { char: '◐' },
  { char: '●' },
  { char: '◑' },
], 0.1, true)  // 0.1s per frame, loop
```

## Trail afterimages

Add to any moving entity:

```ts
entity.trail = {
  interval: 0.05,    // spawn afterimage every 50ms
  lifetime: 0.3,     // each afterimage fades over 0.3s
  color: '#4444ff',
  opacity: 0.5,
}
```

## Text effects (per-character animation)

```ts
engine.ui.effectText(x, y, 'GAME OVER', (charIndex, total, time) => ({
  offsetY: Math.sin(time * 3 + charIndex * 0.5) * 4,  // wave
  color: `hsl(${(charIndex / total) * 360 + time * 60}, 80%, 60%)`,  // rainbow
}), { font: FONTS.huge })
```

**For advanced text effects (physics-driven text, scatter/reform, flee cursor), use the globally installed `pretext` skill.**

## Scene transitions

```ts
engine.loadScene('play', { transition: 'fade', duration: 0.5 })
engine.loadScene('play', { transition: 'dissolve', duration: 0.8 })
engine.loadScene('play', { transition: 'wipe', duration: 0.6 })
engine.loadScene('play', { transition: 'scanline', duration: 0.5 })
```

## Pre-tuned combos by event type

Don't stack everything — these combos are balanced:

| Event | Recipe |
|---|---|
| **Light hit** | `sfx.hit()` + `engine.camera.shake(3)` + floating text |
| **Heavy hit** | `createDamageFlash(entity, engine)` + `engine.camera.shake(6)` + floating text |
| **Enemy dies** | `engine.particles.explosion(x, y)` + `sfx.explode()` + `engine.camera.shake(6)` + toast |
| **Player hurt** | `createDamageFlash(player, engine)` + `engine.flash('#ff0000')` + `sfx.hit()` |
| **Pickup** | `engine.particles.sparkle(x, y)` + `sfx.pickup()` + floating text |
| **Level up** | Burst with `['★','✦']` + `engine.camera.shake(6)` + `sfx.menu()` + toast |
| **Boss death** | 3× explosion at offsets + `engine.camera.shake(16)` + slow-mo |
| **UI confirm** | `sfx.menu()` only — don't juice menus into noise |

## AI shortcut

```bash
bun run ai:juice "player picks up a health potion"
```

Generates a ready-to-use feedback helper function.
