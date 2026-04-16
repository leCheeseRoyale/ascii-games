---
name: juice
description: Activates when the user invokes `/ascii-games-dev:juice` or asks to "add juice", "polish feedback", "add camera shake", "make hits feel better", "add particles to <event>", or "game feels flat" in the ascii-games engine. Layers particles + camera shake + floating text + sfx onto an existing gameplay event with pre-tuned combos per event type.
argument-hint: [file:line or event description]
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Add juice to a gameplay event

User input in `$ARGUMENTS`. Either a `file:line` pointer or an event description ("when player picks up a key"). If empty, ask.

## Workflow

### 1. Locate the event

If given `file:line`, read that file around the cited line. If given an event description, grep for likely sites:

- `engine.destroy(` — something dying
- `engine.spawn(` — something being born
- `overlaps(` — a collision resolution
- `health.current -= ` — manual damage (prefer switching to `createDamageSystem` if they rolled their own)
- `events.on('combat:entity-defeated'` — listener for death (good place to listen for juice)

Prefer wiring juice through the **event bus** when possible:

```ts
events.on('combat:damage-taken', ({ entity, amount }) => {
  createDamageFlash(entity, engine)
  engine.floatingText(entity.position.x, entity.position.y, `-${amount}`, '#ff4444')
})
```

This decouples feedback from the mechanic and makes it easy to remove or swap.

### 2. Pick the juice combo for the event type

| Event | Combo |
|---|---|
| **Hit / damage taken** | `createDamageFlash(entity, engine)` + `engine.camera.shake(4)` + `sfx.hit()` + `floatingText(x, y, '-N', '#ff4444')` |
| **Kill / enemy defeated** | `engine.particles.explosion(x, y)` + `engine.camera.shake(8)` + `sfx.explode()` + `engine.toast.show('+N score', { color: '#ffcc00' })` |
| **Pickup** | `engine.particles.sparkle(x, y)` + `sfx.pickup()` + `floatingText(x, y, '+item', '#00ff88')` |
| **Level-up / milestone** | `engine.particles.burst({ count: 30, chars: ['★','✦','✧'], color: '#ffcc00', speed: 180, lifetime: 1, spread: Math.PI*2 })` + `engine.camera.shake(6)` + `sfx.menu()` + `engine.toast.show('Level up!', { color: '#ffcc00' })` |
| **Player damage (distinct from enemy hit)** | `engine.camera.shake(12)` + flash the whole screen red via a short tween on a full-screen `ascii` overlay, or use `engine.ui.panel` with a red bg fading out |
| **Big explosion / boss death** | `engine.particles.explosion(x, y)` × 3 at slight offsets + `engine.camera.shake(16)` + `sfx.explode()` + scene transition or slow-mo via `engine.loop.pause()` for 200ms |
| **UI confirm** | `sfx.menu()` only (tiny, ubiquitous — don't juice menus into noise) |

Don't just stack everything. The juice combos above are *tuned* — extra stacking produces noise.

### 3. Reach for advanced effects only when justified

- **Tween a numeric property** (opacity fade, scale punch): `engine.tweenEntity(entity, 'ascii.opacity', 1, 0, 0.8, 'easeOut')`
- **Frame animation swap**: `engine.playAnimation(entity, [{char:'◯'},{char:'◎'}], 0.1)`
- **Screen-wide flash**: short-lived fullscreen entity with `ascii.opacity` tween to 0
- **Chromatic-aberration-style**: spawn 2-3 transient entities at small offsets with different colors, tweened to fade out
- **Text effects**: `engine.ui.effectText(x, y, text, fn)` with effects from `@engine/render/text-effects` (shake, wave, glitch, rainbow, pulse…)

### 4. Don't overshadow the mechanic

After adding juice, play the feature. If the feedback outshines the action, dial back. Common overshoot:

- Camera shake > 12 for anything that isn't a bomb
- Particles count > 30 on routine hits
- More than 2 simultaneous sfx layers
- Floating text every frame instead of per-event

### 5. Verify

`bun run check` (typecheck). No test needed for pure feedback — it's cosmetic.

## Source files to reference

- `engine/render/particles.ts` — particle API
- `engine/render/camera.ts` — `shake()`
- `engine/core/engine.ts` — `floatingText`, `toast`
- `engine/audio/audio.ts` — `sfx.*`
- `engine/behaviors/damage.ts` — `createDamageFlash`
- `engine/render/text-effects.ts` — text effect primitives
- `games/asteroid-field/systems/collision.ts` — idiomatic hit feedback example

## Things NOT to do

- Don't inline juice into a game-logic function — wire through events.
- Don't use `setTimeout` for timed effects — use `engine.after(sec, fn)` or tweens.
- Don't emit particles every frame. Emit on the event edge.
- Don't mute existing feedback without asking — the user might be tuning.
