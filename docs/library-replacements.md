# Open Source Library Replacement Recommendations

Analysis of all 28 custom subsystems. Recommendations sorted by impact.
Constraint: **@chenglou/pretext must be kept**.

---

## Strong Replacements (Clear Wins)

### 1. Event Bus (29 LOC) -> **mitt**
**Current:** `shared/events.ts` — stringly-typed pub/sub with no type safety.
**Replace with:** [mitt](https://github.com/developit/mitt) (~200 bytes gzipped)
**Why:**
- Typed event maps out of the box (`Emitter<Events>`) — solves issue S4 for free
- Battle-tested (12k+ stars), zero dependencies
- API is nearly identical: `on(type, handler)`, `emit(type, data)`
- Smaller than the custom code it replaces
- Drop-in replacement with minimal refactoring

```ts
import mitt from 'mitt'
type Events = { 'scene:loaded': string; 'engine:started': void }
const emitter = mitt<Events>()
```

---

### 2. Tween System (79 LOC + 36 LOC helpers) -> **@tweenjs/tween.js**
**Current:** `engine/ecs/tween-system.ts` + `engine/utils/timer.ts` — 4 easing functions, dot-notation property paths, manual integration.
**Replace with:** [@tweenjs/tween.js](https://github.com/tweenjs/tween.js) (~5KB gzipped)
**Why:**
- 30+ easing functions vs. your 4
- Tween chaining, grouping, repeat, yoyo, onComplete callbacks
- Well-maintained (7k+ stars), used in Three.js ecosystem
- Eliminates the documented API mismatch (CLAUDE.md shows object API, code uses positional args) — tween.js uses the object API natively
- Removes ~115 LOC of custom code

```ts
new TWEEN.Tween(entity.position)
  .to({ x: 200 }, 500)
  .easing(TWEEN.Easing.Quadratic.Out)
  .start()
```

---

### 3. Audio/SFX (50 LOC) -> **zzfx**
**Current:** `engine/audio/audio.ts` — manual oscillator creation with 6 preset sounds.
**Replace with:** [ZzFX](https://github.com/KilledByAPixel/ZzFX) (~1KB)
**Why:**
- Purpose-built for procedural game SFX (exactly your use case)
- Hundreds of sound variations via parameter tweaking
- Has a visual sound designer tool (zzfx.3d2k.com)
- Used widely in js13kGames and game jams
- Smaller footprint, vastly more capable
- Your current 6 presets can be replicated with zzfx parameter arrays

```ts
zzfx(...[,,925,.04,.3,.6,1,.3,,6.27,-184,.09,.17]); // explosion
```

---

### 4. Drop **rot-js** (only used for RNG)
**Current:** `rot-js` (v2.2.1) is a full roguelike toolkit (~50KB), but the codebase only uses it for random number generation — and even then, `Math.random()` is used directly in several places (title.ts:59, asteroid-spawner.ts:34).
**Action:** Remove `rot-js` entirely. The custom `rng()`, `rngInt()`, `pick()`, `chance()` in `engine/utils/math.ts` already use `Math.random()` and are sufficient. If seeded RNG is ever needed, add [seedrandom](https://github.com/davidbau/seedrandom) (~1KB) instead of carrying a 50KB roguelike toolkit.

---

## Moderate Replacements (Worth Considering)

### 5. Collision Detection (64 LOC) -> **detect-collisions**
**Current:** `engine/physics/collision.ts` — AABB and circle overlap, no spatial partitioning.
**Replace with:** [detect-collisions](https://github.com/nickreese/detect-collisions) (~8KB)
**Why:**
- Adds spatial hashing (BVH tree) for O(log n) broad-phase vs your O(n^2)
- Supports polygons, lines, points, circles, AABBs
- SAT-based narrow phase with collision response vectors
- Will matter when entity count grows beyond ~100
- Solves the ghost-collision issue (G1) by design

**Alternative:** [rbush](https://github.com/mourner/rbush) for spatial indexing only, keeping your overlap functions.

---

### 6. Color Utilities (25 LOC) -> **colord**
**Current:** `engine/utils/color.ts` — HSL generation, hex lerping, rainbow.
**Replace with:** [colord](https://github.com/omgovich/colord) (~1.7KB gzipped)
**Why:**
- Full color space support (HSL, RGB, HEX, LAB, LCH)
- Parsing from any format
- Manipulation: lighten, darken, saturate, mix, contrast
- Plugin system for extended functionality
- Your `lerpColor` hex parsing is fragile; colord handles all edge cases

---

### 7. Physics System (103 LOC) -> **rapier2d-compat** (future)
**Current:** `engine/physics/physics-system.ts` — velocity integration, gravity, friction, drag, bounce.
**Replace with:** [rapier2d-compat](https://github.com/dimforge/rapier) (WASM, ~200KB)
**Why:**
- Real rigid body physics with constraints, joints, continuous collision detection
- Deterministic simulation (important for replays/netcode)
- WASM performance far exceeds JS for physics
- The collision.ts code already has a comment about future Rapier integration

**Caveat:** Significant integration effort. Only recommended if the engine needs real physics (platformers, ragdolls, etc.). Current simple integration is fine for Asteroids-style games.

---

## Keep Custom (Not Worth Replacing)

| Subsystem | LOC | Why Keep |
|-----------|-----|----------|
| Game Loop | 89 | Fundamental, simple, tuned to your fixed-timestep needs |
| System Runner | 57 | Trivial, tightly coupled to your ECS |
| Camera | 94 | Tightly coupled to your renderer |
| Particle System | 100 | Canvas 2D specific, object pooling is custom |
| Scheduler | 80 | Game-time aware, pause-respecting — generic libs don't do this |
| Input (KB+Mouse) | 108 | Game-specific frame tracking (held/pressed/released) |
| Spatial Grid | 114 | Tile-based, different purpose than spatial indexing |
| Screen Transitions | 95 | Tightly coupled to renderer |
| Image Loader | 58 | Trivial async cache, not worth a dependency |
| Text Layout | 160 | Pretext integration layer — must keep |
| Math Utilities | 27 | Too small to justify a dependency |
| ASCII Renderer | 218+ | Core of the engine, no equivalent library |
| Parent-Child System | 28 | Trivial ECS system |
| Animation System | 49 | Frame-based, coupled to sprite component |
| ECS World | 22 | Already uses miniplex — keep |
| Zustand Store | 61 | Already uses zustand — keep |

---

## Summary

| Priority | Replace | With | LOC Removed | Size Added |
|----------|---------|------|-------------|------------|
| 1 | Event Bus | mitt | 29 | ~200B |
| 2 | Tween System + helpers | @tweenjs/tween.js | 115 | ~5KB |
| 3 | Audio/SFX | zzfx | 50 | ~1KB |
| 4 | rot-js (remove) | nothing (or seedrandom) | 0 | -50KB |
| 5 | Collision | detect-collisions | 64 | ~8KB |
| 6 | Color Utils | colord | 25 | ~1.7KB |
| 7 | Physics | rapier2d-compat | 103 | ~200KB |

**Net effect of top 4:** Remove ~194 LOC of custom code, remove ~50KB dependency (rot-js), add ~6.2KB of battle-tested libraries. Gain typed events, 30+ easing functions, procedural audio designer, and eliminate several documented bugs.
