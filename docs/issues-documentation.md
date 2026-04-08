# Documentation Issues

Cross-referenced all docs (CLAUDE.md, README.md, wiki/, docs/API.md) against actual code.

---

## Critical — Will Break User Code

### D1. `keyboard.isDown()` / `keyboard.justPressed()` do not exist
**Docs:** CLAUDE.md:99–100, README.md:99–100, wiki scene-lifecycle.md:69, wiki system-runner.md:152
**Code:** `engine/input/keyboard.ts:44–46` — actual methods are `held(code)` and `pressed(code)`

All docs using the old API must be updated. The wiki input-system.md page is correct.

---

### D2. `mouse.position` / `mouse.isDown(0)` do not exist
**Docs:** CLAUDE.md:131–132, README.md:164–166
**Code:** `engine/input/mouse.ts` — exposes flat `x`, `y`, `down`, `justDown`, `justUp`. No `position` getter, no `isDown()` method.

---

### D3. `engine.tweenEntity()` documented with wrong signature
**Docs:** CLAUDE.md:139–140 shows `{ props: { 'position.x': 200 }, duration: 0.5, easing: 'easeOut' }`
**Code:** `engine/core/engine.ts:109–123` — actual signature: `tweenEntity(entity, property, from, to, duration, ease?, destroyOnComplete?)`

The wiki tween-system.md page is correct.

---

### D4. `engine.switchScene()` does not exist
**Docs:** CLAUDE.md:57
**Code:** `engine/core/engine.ts:257` — actual method is `engine.loadScene(name, opts?)`

---

### D5. `engine.detachChild(parent, child)` — wrong arity
**Docs:** CLAUDE.md:157
**Code:** `engine/core/engine.ts:218` — takes only `(child)`. Wiki entity-parenting.md is correct.

---

### D6. `rng()` documented as zero-arg, requires two args
**Docs:** CLAUDE.md:122, README.md:183 show `rng() // 0..1`
**Code:** `engine/utils/math.ts:21` — `rng(min, max)`. Zero args returns `NaN`. Wiki utility-reference.md is correct.

---

### D7. Audio wiki page entirely wrong — system now uses ZzFX
**Docs:** wiki/pages/audio-system.md — documents Web Audio oscillators, `getCtx()`, `AudioContext` singleton, `setTimeout` chaining for death sound
**Code:** `engine/audio/audio.ts` — all presets are single `zzfx(...)` calls. No AudioContext, no oscillators.

Entire page needs rewrite.

---

### D8. `engine.playAnimation()` documented with wrong signature
**Docs:** CLAUDE.md:162 shows `engine.playAnimation(entity, 'name')` (string name)
**Code:** `engine/core/engine.ts:128` — actual: `playAnimation(entity, frames: AnimationFrame[], frameDuration?, loop?)`

No name-based animation lookup exists.

---

### D9. `Tags` component shape documented wrong everywhere
**Docs:** CLAUDE.md:43 shows `tags: { player: true }`, README.md:90,96 same
**Code:** `shared/types.ts:76` — actual shape: `{ values: Set<string> }`

CLAUDE.md query example `e.tags?.player` should be `e.tags.values.has('player')`. Wiki entity-factory-pattern.md is correct.

---

### D10. `TextBlock` documented missing required fields, has nonexistent field
**Docs:** CLAUDE.md:55 shows `{ text, font, color, align }`
**Code:** `shared/types.ts:35–42` — actual: `{ text, font, maxWidth, lineHeight, color, layer? }`. No `align` field. `maxWidth` and `lineHeight` are required.

---

### D11. Event bus docs describe non-existent API
**Docs:** docs/API.md:1178–1214 — documents generic `on<T>()` returning unsubscribe, `emit<T>()`, `clear()`, arbitrary event names like `'playerHit'`
**Code:** `shared/events.ts` — now `mitt<EngineEvents>()`. No return-value unsubscribe (use `events.off()`), no `clear()` (use `events.all.clear()`), strictly typed to 9 event names.

---

### D12. `Cooldown.ready(dt)` — `ready` is a getter, not a method
**Docs:** CLAUDE.md:148 shows `if (cd.ready(dt)) { /* fire! */ }`
**Code:** `engine/utils/timer.ts:21` — `get ready(): boolean`. Calling `cd.ready(dt)` throws TypeError. Must call `cd.update(dt)` separately, then check `cd.ready` (getter) or use `cd.fire()`.

---

## High — Misleading

### D13. `engine.registerScene()` documented with two-arg form
**Docs:** wiki/pages/asteroid-field-game.md:42–47 shows `engine.registerScene('title', titleScene)`
**Code:** `engine/core/engine.ts:246` — takes one arg: `registerScene(scene)`. Name comes from `scene.name`.

---

### D14. Velocity/Acceleration field names wrong in wiki examples
**Docs:** wiki/pages/ecs-architecture.md:111–116 uses `velocity.x`, `velocity.y`; wiki/pages/physics-system.md:59–65 uses `velocity: { x: 2, y: 0 }`, `acceleration: { x: 0, y: 0 }`
**Code:** `shared/types.ts` — `Velocity = { vx, vy }`, `Acceleration = { ax, ay }`

---

### D15. ECS Architecture wiki — Entity type block has invented fields
**Docs:** wiki/pages/ecs-architecture.md:47–67 — shows `layer: number` as top-level component, `collider: { width, height, layer, onCollide? }`, `image: { src, width, height }`
**Code:** `shared/types.ts` — `layer` is a field on Ascii/Sprite/TextBlock/ImageComponent, not top-level. Collider has no `layer` or `onCollide`. `ImageComponent` uses `image: HTMLImageElement`, not `src: string`.

---

### D16. `docs/API.md` — `AsciiRenderer.render()` missing `particles` parameter
**Docs:** docs/API.md:484 — `render(world, config, camera)`
**Code:** `engine/render/ascii-renderer.ts:54` — `render(world, config, camera, particles?)`

---

### D17. `docs/API.md` — `layoutTextAroundObstacles` wrong obstacle shape
**Docs:** docs/API.md:521 — `obstacles: { x, y, radius }[]`
**Code:** `engine/render/text-layout.ts` — `obstacles: { position: Position; obstacle: Obstacle }[]`

---

### D18. `wiki/pages/utility-reference.md` — `sequence()` step format wrong
**Docs:** Shows `[0, () => showText('Ready...')]` (tuple format)
**Code:** `engine/utils/scheduler.ts:41` — `{ delay: number; fn: () => void }[]` (object format). CLAUDE.md is correct.

---

### D19. `wiki/pages/collision-system.md` — `particles.burst()` wrong signature
**Docs:** Shows `particles.burst(x, y, { count: 8, color: ... })` (positional + options)
**Code:** `engine/render/particles.ts:26` — `burst(opts: { x, y, count, chars, color, ... })` (single options object). Required `chars` field missing from wiki example.

---

### D20. `wiki/pages/entity-factory-pattern.md` — wrong component fields in examples
**Docs:** Uses `fontSize`, `glow: true` (boolean), `collider: { shape: 'circle' }`
**Code:** Ascii uses `font: string`, `glow: string` (CSS color). Collider uses `type`, not `shape`.

---

### D21. `wiki/pages/zustand-store.md` — `setHealth()` and initial values wrong
**Docs:** Shows `setHealth: (health, maxHealth?) => void` (optional second arg), initial `health: 3, maxHealth: 3`
**Code:** `ui/store.ts:34,43` — both args required: `setHealth: (current, max) => void`. Initial `health: 100, maxHealth: 100`.

---

### D22. Design decisions wiki mentions Rapier2D as available
**Docs:** wiki/pages/design-decisions.md:76–83 describes "Optional Rapier2D (Lazy WASM Load)"
**Code:** No Rapier2D anywhere in the codebase. Entirely aspirational.

---

## Medium — Incomplete

### D23. CLAUDE.md missing `engine.spawn()` and `engine.destroy()`
These are first-class engine API methods (`engine/core/engine.ts:98–104`) but CLAUDE.md only shows `engine.world.add()` and `engine.world.remove()`.

---

### D24. CLAUDE.md missing `engine.pause()`, `engine.resume()`, `engine.isPaused`
Exist in `engine/core/engine.ts:305–312`, covered in wiki but absent from CLAUDE.md.

---

### D25. CLAUDE.md missing `engine.destroyWithChildren()`
Exists in `engine/core/engine.ts:232–242`, documented in wiki but not CLAUDE.md.

---

### D26. CLAUDE.md missing `engine.cancelTimer()`
Exists in `engine/core/engine.ts:165`, documented in wiki but not CLAUDE.md.

---

## Low — Style

### D27. Wiki pages use wrong import paths
- wiki/pages/scene-lifecycle.md:57 — `import { defineScene } from '@engine/core/scene'` should be `from '@engine'`
- wiki/pages/system-runner.md:47 — `import { defineSystem } from '@engine/ecs/systems'` should be `from '@engine'`
- wiki/pages/scaffolding-tools.md:24,48,66 — `import from '@/engine/scene'` should be `from '@engine'`
