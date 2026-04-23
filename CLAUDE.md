# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Engine internals: [`wiki/_index.md`](wiki/_index.md). Agent quick-reference: [`AGENTS.md`](AGENTS.md). Full API: [`docs/API-generated.md`](docs/API-generated.md) (auto-generated — regenerate via `bun run gen:api`, do not hand-edit).

## What This Is

ASCII game engine + framework. `engine/` is the reusable library; `game/` is per-project game code (gitignored, generated from a `games/<template>/` via `bun run init:game`). Rendering = canvas text via [Pretext](https://github.com/chenglou/pretext); entities = [miniplex](https://github.com/hmans/miniplex) ECS; overlay UI = React + zustand.

## Commands

```bash
bun dev                 # Dev server (auto-runs template picker if game/ missing)
bun dev:fast            # Vite directly (skip auto-detect)
bun run check           # tsc --noEmit
bun run check:bounds    # Enforce import boundaries between engine/game/ui/shared
bun run check:all       # check + check:bounds + lint (full verification)
bun test                # Full suite (bun:test, 1140+ tests in engine/__tests__/)
bun test <path>         # Single file: bun test engine/__tests__/physics.test.ts
bun test -t "<name>"    # Filter by test name
bun run lint            # Biome            |  bun run lint:fix   # auto-fix
bun run knip            # Unused deps/exports/files
bun run build           # Production build |  bun run export     # single-file dist/game.html
bun run bench           # engine/__bench__/run.ts
bun run gen:api         # Regenerate docs/API-generated.md
bun run new:scene|new:system|new:entity <name>    # Scaffold
bun run init:game [blank|asteroid-field|platformer|roguelike|physics-text|tic-tac-toe|connect-four]
bun run ai:game "<pitch>"      # AI-generated defineGame module (turn-based/board)
bun run ai:scene "<pitch>"     # AI-generated defineScene game (real-time/ECS)
bun run ai:sprite "<prompt>"   # AI-generated sprite factory
bun run ai:mechanic "<desc>"   # AI-generated behavior system
bun run ai:juice "<event>"     # AI-generated juice/feedback helper
# All ai:* scripts support --help, --dry-run, --verify, --smoke (headless 60-frame test)
```

**Verification loop** before declaring work done: `bun run check:all` → `bun test` (or targeted `bun test <path>`). This runs typecheck + boundary enforcement + lint. Type-check + tests are the mechanical contract. UI/render correctness is **not** verifiable headlessly — state that limitation explicitly instead of claiming success.

## Architecture

Four layers, strict boundaries enforced via path aliases (`@engine`, `@game`, `@ui`, `@shared`) and verified by `bun run check:bounds`:

```
engine/   Framework: core, ecs, render, input, physics, audio, behaviors, net, storage, tiles, utils.
game/     Per-project game code (gitignored). Derived from games/<template>/.
games/    Source-of-truth templates (blank, asteroid-field, platformer, roguelike, tic-tac-toe, connect-four).
          Edit THESE to change template content — `game/` is a working copy.
          tic-tac-toe & connect-four use `defineGame` (declarative); others use `defineScene` (ECS).
ui/       React overlay. zustand store is the ONLY bridge between engine/game and UI.
shared/   Types (shared/types.ts = Entity + every component shape), constants, events (shared/events.ts).
```

- **Import boundaries** (enforced by `bun run check:bounds`):
  - `engine/` → may import `@shared`, `@engine`. NEVER `@game` or `@ui`.
  - `game/`, `games/` → may import `@engine`, `@shared`, `@ui/store` ONLY. NEVER `@ui/*` (except store).
  - `ui/` → may import `@engine`, `@shared`, `@ui/*`, `@game/index` (entry point only). NEVER `@game/*`.
  - `shared/` → may NOT import `@engine`, `@game`, `@ui`. Zero dependencies on other layers.
- **Entry point:** `game/index.ts` exports `setupGame(engine)` → returns a scene name or `{ startScene, screens?, hud?, store? }`. Canvas-only games suppress the React overlay by returning `screens: { menu: Empty, playing: Empty, gameOver: Empty }, hud: []` where `const Empty = () => null` (see `games/roguelike/index.ts`).

## Two Game APIs: `defineGame` vs `defineScene`

**`defineGame`** — declarative, boardgame.io-style. Best for turn-based, board games, puzzles, hotseat. Single file, 30–80 lines. Engine handles turn rotation, phase transitions, game-over. Wire with `engine.runGame(def)` → returns scene name. See `games/tic-tac-toe/` and `games/connect-four/`.

**`defineScene` + `defineSystem`** — ECS, full control. Best for real-time, physics-heavy, or complex games (roguelikes, platformers, shooters). See `games/asteroid-field/`, `games/platformer/`, `games/roguelike/`.

When `defineGame` games need canvas-only UI (no React), `setupGame` returns `{ startScene: engine.runGame(def), screens: { menu: Empty, playing: Empty, gameOver: Empty }, hud: [] }`.

## Image Mesh System

Text characters as deformable image vertices. Load an image, subdivide it across a grid of character entities with spring physics -- Canvas 2D mesh deformation at 60fps without WebGL. Each cell is a normal ECS entity (position, velocity, spring, collider) that renders its slice of the source image via `ctx.drawImage`. See `docs/IMAGE-MESH.md` for architecture deep-dive and usage examples.

### Basic usage

```ts
const mesh = engine.spawnImageMesh({
  image: imgElement,       // HTMLImageElement (preloaded)
  cols: 8, rows: 6,
  position: { x: 200, y: 200 },
  spring: SpringPresets.bouncy,
  showLines: true,
  lineColor: '#444',
});
// mesh is Partial<Entity>[] — all spawned cell entities
engine.addSystem(createCursorRepelSystem({ radius: 120 }));
```

### `SpawnImageMeshOpts` reference

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `image` | `string \| HTMLImageElement` | **required** | URL string or preloaded image element |
| `cols` | `number` | — | Grid columns. Optional if `density` provided |
| `rows` | `number` | — | Grid rows. Optional if `density` provided |
| `density` | `number` (0–1) | — | Auto-computes cols/rows from image size + char cell size |
| `letterSpacing` | `number` | auto from density | Px spacing passed to Pretext measurement (density mode) |
| `position` | `{ x, y }` | **required** | Top-left of the mesh in world space |
| `char` | `string` | `'█'` | Character per cell (invisible, used for measurement) |
| `font` | `string` | `'12px monospace'` | Font for character cell measurement |
| `spring` | `{ strength, damping }` | `{ 0.08, 0.93 }` | Spring preset for home-pull. Use `SpringPresets.*` |
| `showLines` | `boolean` | `false` | Draw lines between adjacent cells |
| `lineColor` | `string` | `'#333'` | Color of mesh lines |
| `lineWidth` | `number` | `1` | Width of mesh lines in px |
| `tags` | `string[]` | — | Tags on every cell entity |
| `layer` | `number` | — | Render layer for the cells |
| `shape` | `MeshShape` | — | Shape mask (see below) |

### Shape parameter

- **`shape: 'circle'`** — elliptical mask, cells outside the ellipse are not spawned
- **`shape: 'diamond'`** — diamond/rhombus mask
- **`shape: 'triangle'`** — triangle widening from top to bottom
- **Custom:** `shape: (row, rows) => ({ startCol, endCol })` — return which columns are active per row

Type: `MeshShape = 'circle' | 'diamond' | 'triangle' | MeshShapeFn`. Lines between cells stop at shape boundaries naturally (missing neighbors are skipped).

### Density parameter

- **`density: 0.5`** — auto-computes `cols`/`rows` from image natural dimensions + Pretext character cell measurement
- Range 0–1: higher = more vertices = smoother deformation but heavier. Clamped to `[0.05, 1]`
- Uses `(1 - density) * 20` as letter spacing under the hood
- Provide **either** `cols`+`rows` **or** `density`, not both needed. Omitting all three throws

### SoA fast path (500+ cells)

Meshes with **500+ cells** (`SOA_THRESHOLD`) automatically use Float32Array typed arrays instead of individual ECS entities. This is transparent to callers:

- **`spawnImageMesh()`** returns `Partial<Entity>[]` either way -- a single proxy entity with `soaMeshProxy: { meshId, count }` for SoA meshes
- **SoA cells have no colliders** -- per-cell collision only works for sub-500 ECS meshes
- **`createCursorRepelSystem`** automatically applies radial forces to SoA meshes via `applySoAMeshForce()`
- **`destroySoAMeshCell(mesh, index)`** — mark individual cells as dead (skipped by spring, physics, render). Import from `@engine`
- **`engine.soaMeshes`** — `Map<string, SoAMesh>` of active SoA meshes, keyed by meshId
- Built-in **`_soaMesh`** system runs spring + physics in tight typed-array loops at `SystemPriority.spring`

### Interactions with existing systems

- **`_spring`** — pulls ECS mesh cells back to home positions (image reforms after deformation)
- **`_soaMesh`** — runs spring + physics for SoA meshes in typed-array loops
- **`_meshRender`** — draws image slices + lines for ECS cells; renders SoA meshes via `renderSoAMesh()`
- **`createCursorRepelSystem`** — cursor warps both ECS and SoA meshes automatically
- **`engine.destroy(cell)`** — cell's image slice disappears, neighbor lines skip it (ECS meshes only)
- **`engine.particles.burst`** — particles at cell position for destruction effects
- **`engine.onCollide`** — other entities collide with mesh cells (ECS meshes only, not SoA)
- **`_lifetime`** / **`_tween`** — cells can auto-destroy or fade (ECS meshes only)

### Gotchas

- **Image must be loaded before spawning** when using `density` mode -- `naturalWidth`/`naturalHeight` are 0 for unloaded images. Pass a preloaded `HTMLImageElement`, not a URL string, if using density. URL strings work with explicit `cols`+`rows` (falls back to `cols*16` sizing)
- **SoA meshes return a single proxy entity**, not individual cell entities -- don't iterate the return array expecting N entities
- **`meshCell`** component is on individual cells (ECS path); **`soaMeshProxy`** is on the proxy entity (SoA path)
- **Don't register `_meshRender` or `_soaMesh` manually** -- they are built-in systems (see list above)
- **Component types:** `MeshCell` and `SoAMeshProxy` interfaces are in `shared/types.ts`. `SoAMesh` (the typed-array struct) and `MeshShape`/`MeshShapeFn` are exported from `@engine`

## ECS Rules

- World: miniplex `World<Entity>` at `engine.world`. Entities are plain objects with optional component fields — **no classes, no decorators**. Component shapes live in `shared/types.ts`.
- **Spawn:** `engine.spawn({...})` (validates, surfaces warnings in the debug overlay). **Not** `engine.world.add(...)`.
- **Remove:** `engine.destroy(entity)`, `engine.destroyAll('tag')`, `engine.destroyWithChildren(entity)`.
- **Query:** `engine.world.with('position', 'velocity')`, `.without('health')`, `.where(e => ...)`, `engine.findByTag('player')`, `engine.findAllByTag('enemy')`.
- **Entity factories return `Partial<Entity>`**, not full entities — `engine.spawn()` fills the rest.
- **13 built-in systems auto-register on scene load — do NOT add manually:** `_measure`, `_parent`, `_spring`, `_physics`, `_tween`, `_animation`, `_lifetime`, `_screenBounds`, `_emitter`, `_stateMachine`, `_trail`, `_meshRender`, `_soaMesh`. The `_collisionEvents` system is lazy-registered on first `engine.onCollide()` call.
- **System ordering:** custom systems default to `priority: 0` and run before all built-ins. `SystemPriority` constants expose built-in slots (`measure=5, parent=10, spring=15, physics=20, tween=30, animation=40, emitter=50, stateMachine=60, lifetime=70, screenBounds=80`). Set e.g. `priority: SystemPriority.physics + 1` to run between physics and tweens. See `engine/ecs/systems.ts`.
- **Scenes:** `defineScene({ name, setup, update, cleanup })`. Optional `phase` on systems gates them to a turn phase in turn-based games; no phase = always runs.
- **Store bridge:** game code writes with `useStore.getState().setScore(10)`; React reads with `useStore(s => s.score)`.
- **`collider: "auto"`** — auto-sizes the collider from Pretext text measurement at spawn time. Updated each frame by `_measure` if text changes.
- **`engine.spawnText(opts)`** / **`engine.spawnSprite(opts)`** — decompose text into per-character entities with spring-to-home physics. Each character is a normal entity with position, velocity, collider, and spring. `spawnText` supports `align: "left" | "center" | "right"`.
- **Spring presets:** `SpringPresets.stiff`, `.snappy`, `.bouncy`, `.smooth`, `.floaty`, `.gentle` — named spring configs for `engine.spawnText()` / `engine.spawnSprite()`.
- **`engine.spawnImageMesh(opts)`** — deformable image mesh. Full details in the **Image Mesh System** section above.
- **`createCursorRepelSystem(opts?)`** / **`createAmbientDriftSystem(opts?)`** — one-line helpers for interactive text. Add via `engine.addSystem(createCursorRepelSystem({ radius: 120 }))`. Cursor repel also affects SoA meshes automatically.
- **Collision groups:** `collider: { ..., group: 1, mask: 0b11 }` -- bitmask filtering. Default group=1, mask=all.
- **`engine.onCollide(tagA, tagB, callback)`** -- fires callback on first overlap frame between tagged entities. Returns unsubscribe function. Lazy-creates `_collisionEvents` system on first call.
- **`engine.flash(color?, duration?)`** -- full-screen flash for damage/powerup feedback.
- **`engine.restartScene(freshData?)`** -- reload current scene with same or new data.
- **`engine.clearWorld()`** -- remove all entities without changing scene.
- **`engine.getEntityById(id)`** -- look up entity by miniplex ID.
- **`engine.cloneEntity(entity)`** -- shallow-clone an entity and spawn it.
- **`engine.touch`** -- touch/gesture input (tap, swipe, pinch). Only available when canvas is present.
- **`engine.blink(entity, duration?, interval?)`** -- oscillates opacity for i-frames.
- **`engine.knockback(entity, fromX, fromY, force)`** -- impulse away from a point.
- **`engine.timeScale`** -- multiplies dt for all systems. Set to 0.3 for slowmo, 1 for normal.
- **Trail component:** `trail: { interval: 0.05, lifetime: 0.3, color: "#fff", opacity: 0.5 }` -- auto-spawns fading afterimages. Built-in `_trail` system handles it.
- **Auto-stop music on scene change:** `stopMusic()` is called automatically when leaving a scene. Scenes that want continuous music re-start it in `setup()`.
- **Art assets:** Define reusable ASCII art with `ArtAsset` type. Spawn static art with `engine.spawnArt(asset, opts)`. Spawn interactive physics art with `engine.spawnInteractiveArt(asset, opts)`.
- **Art files convention:** Store art in `game/art/*.ts` exporting `ArtAsset` objects. Import in scenes.
- **Input:** `engine.keyboard.typedChars` / `engine.keyboard.typedString` capture printable characters per frame. `engine.keyboard.compositionText` / `.compositionActive` support IME input. `engine.mouse.held(button)`, `.pressed(button)`, `.released(button)` track per-button state (0=left, 1=middle, 2=right). `engine.touch` exposes `.touches`, `.primary`, `.gestures` (tap/swipe/pinch) on mobile.
- **Timers/schedulers:** `engine.after(sec, fn)` (one-shot), `engine.every(sec, fn)` (repeating), `engine.spawnEvery(sec, factory)` (repeating spawn). `engine.sequence([...])` chains timed callbacks. `Cooldown` class: advance with `cd.update(dt)`, fire with `if (cd.fire()) { ... }`, check `cd.ready`.
- **Debug overlay:** Toggle with backtick (`` ` ``) or `engine.debug.toggle()`. Shows collider bounds, entity counts, per-system timing, and errors. Warnings from `engine.spawn()` validation and system errors surface here and in the browser console.

## Critical Gotchas

These cause the highest-frequency bugs in AI-generated code in this repo:

- **Don't integrate velocity manually.** `_physics` already runs `position += velocity * dt`. Writing it again in a custom system causes double-speed movement.
- **Don't mutate the world during iteration.** Materialize first: `const list = [...engine.world.with(...)]`, then iterate/destroy.
- **Don't call Pretext `prepare()` directly.** The renderer caches it; bypassing the cache kills perf. Set component data and let the engine render.
- **Don't use non-null assertions (`!`).** Biome forbids them. Use runtime checks or guard clauses instead.
- **Don't use `setInterval`/`setTimeout`.** Use `engine.after(sec, fn)`, `engine.every(sec, fn)`, `engine.spawnEvery(sec, factory)`, `engine.sequence([...])`, or the `Cooldown` class (advance with `dt`).
- **Don't put game logic in `engine/`.** It's a reusable framework — belongs in `game/` (or `games/<template>/` for template changes).
- **Don't re-register built-in systems.** They run automatically on scene load.
- **Don't create classes for entities.** Plain objects only.
- **Don't edit `docs/API-generated.md` by hand** — it's regenerated from source via `bun run gen:api`.

Engine defensiveness you can rely on (don't reinvent): `engine.spawn()` validates components, systems are try/catch-wrapped (one broken system logs but doesn't crash the loop), physics auto-recovers from `NaN` positions/velocities, scene load failures list available scene names. Warnings surface in the debug overlay (backtick `` ` `` key) and the browser console.

## Documentation Split

Two audiences, two locations:

- **`docs/`** — user-facing guides for game developers: QUICKSTART, TUTORIAL, COOKBOOK, WIRING, API-generated, AI-WORKFLOWS. Ships with scaffolded projects.
- **`wiki/`** — engine internals and architecture (45 pages). Single source of truth for how systems work, design decisions, implementation details. Structured with frontmatter, wikilinks, and schema (`wiki/_schema.md`).

## Where to Look for Depth

- **`docs/IMAGE-MESH.md`** — Image Mesh system: text characters as deformable image vertices. Read this before implementing `spawnImageMesh()`, `MeshCell` component, or `_meshRender` system. Covers architecture, spawn helper API, render system, line physics, and usage examples.
- `wiki/_index.md` — engine architecture and internals (45 pages).
- `AGENTS.md` — terse API cheat sheet organized for agents.
- `docs/API-generated.md` — auto-generated API reference (regenerate, don't edit).
- `docs/COOKBOOK.md` — recipe index; split into `docs/cookbook/` topic files.
- `docs/WIRING.md` — step-by-step wiring for `defineGame` and `defineScene` games.
- `docs/QUICKSTART.md`, `docs/TUTORIAL.md` — hands-on walkthroughs.
- `shared/types.ts` — `Entity` + every component shape.
- `shared/events.ts` — full typed event catalog.
- `engine/index.ts` — the entire public export surface.
- `engine/ecs/systems.ts` — built-in system priorities + ordering model.
- `games/<template>/` — working reference games to mimic. Use `tic-tac-toe`/`connect-four` for `defineGame` patterns; `asteroid-field`/`platformer` for real-time ECS; `roguelike` for turn-based ECS with phases + FOV.
- `engine/core/define-game.ts` — `defineGame` API, `GameContext`, `GameRuntime`, phase/move/turn types.
- `plugins/ascii-games-dev/` — Claude plugin skills + ECS reviewer agent.
