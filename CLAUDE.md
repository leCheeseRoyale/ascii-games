# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Deep reference: [`docs/PROJECT-GUIDE.md`](docs/PROJECT-GUIDE.md). Agent quick-reference: [`AGENTS.md`](AGENTS.md). Full API: [`docs/API-generated.md`](docs/API-generated.md) (auto-generated — regenerate via `bun run gen:api`, do not hand-edit).

## What This Is

ASCII game engine + framework. `engine/` is the reusable library; `game/` is per-project game code (gitignored, generated from a `games/<template>/` via `bun run init:game`). Rendering = canvas text via [Pretext](https://github.com/chenglou/pretext); entities = [miniplex](https://github.com/hmans/miniplex) ECS; overlay UI = React + zustand.

## Commands

```bash
bun dev                 # Dev server (auto-runs template picker if game/ missing)
bun dev:fast            # Vite directly (skip auto-detect)
bun run check           # tsc --noEmit
bun test                # Full suite (bun:test, 1140+ tests in engine/__tests__/)
bun test <path>         # Single file: bun test engine/__tests__/physics.test.ts
bun test -t "<name>"    # Filter by test name
bun run lint            # Biome            |  bun run lint:fix   # auto-fix
bun run knip            # Unused deps/exports/files
bun run build           # Production build |  bun run export     # single-file dist/game.html
bun run bench           # engine/__bench__/run.ts
bun run gen:api         # Regenerate docs/API-generated.md
bun run new:scene|new:system|new:entity <name>    # Scaffold
bun run init:game [blank|asteroid-field|platformer|roguelike]
```

**Verification loop** before declaring work done: `bun run check` → `bun test` (or targeted `bun test <path>`) → `bun run lint`. Type-check + tests are the mechanical contract. UI/render correctness is **not** verifiable headlessly — state that limitation explicitly instead of claiming success.

## Architecture

Four layers, strict boundaries enforced via path aliases (`@engine`, `@game`, `@ui`, `@shared`):

```
engine/   Framework: core, ecs, render, input, physics, audio, behaviors, net, storage, tiles, utils.
game/     Per-project game code (gitignored). Derived from games/<template>/.
games/    Source-of-truth templates (blank, asteroid-field, platformer, roguelike).
          Edit THESE to change template content — `game/` is a working copy.
ui/       React overlay. zustand store is the ONLY bridge between engine/game and UI.
shared/   Types (shared/types.ts = Entity + every component shape), constants, events (shared/events.ts).
```

- **Never** import `ui/` from `engine/` or `game/` except the zustand store. **Never** import `engine/` or `game/` from `ui/` components.
- **Entry point:** `game/index.ts` exports `setupGame(engine)` → returns a scene name or `{ startScene, screens?, hud?, store? }`. Canvas-only games suppress the React overlay by returning `screens: { menu: Empty, playing: Empty, gameOver: Empty }, hud: []` where `const Empty = () => null` (see `games/roguelike/index.ts`).

## ECS Rules

- World: miniplex `World<Entity>` at `engine.world`. Entities are plain objects with optional component fields — **no classes, no decorators**. Component shapes live in `shared/types.ts`.
- **Spawn:** `engine.spawn({...})` (validates, surfaces warnings in the debug overlay). **Not** `engine.world.add(...)`.
- **Remove:** `engine.destroy(entity)`, `engine.destroyAll('tag')`, `engine.destroyWithChildren(entity)`.
- **Query:** `engine.world.with('position', 'velocity')`, `.without('health')`, `.where(e => ...)`, `engine.findByTag('player')`, `engine.findAllByTag('enemy')`.
- **Entity factories return `Partial<Entity>`**, not full entities — `engine.spawn()` fills the rest.
- **8 built-in systems auto-register on scene load — do NOT add manually:** `_parent`, `_physics`, `_tween`, `_animation`, `_lifetime`, `_screenBounds`, `_emitter`, `_stateMachine`.
- **System ordering:** custom systems default to `priority: 0` and run before all built-ins. `SystemPriority` constants expose built-in slots (`parent=10, physics=20, tween=30, animation=40, emitter=50, stateMachine=60, lifetime=70, screenBounds=80`). Set e.g. `priority: SystemPriority.physics + 1` to run between physics and tweens. See `engine/ecs/systems.ts`.
- **Scenes:** `defineScene({ name, setup, update, cleanup })`. Optional `phase` on systems gates them to a turn phase in turn-based games; no phase = always runs.
- **Store bridge:** game code writes with `useStore.getState().setScore(10)`; React reads with `useStore(s => s.score)`.

## Critical Gotchas

These cause the highest-frequency bugs in AI-generated code in this repo:

- **Don't integrate velocity manually.** `_physics` already runs `position += velocity * dt`. Writing it again in a custom system causes double-speed movement.
- **Don't mutate the world during iteration.** Materialize first: `const list = [...engine.world.with(...)]`, then iterate/destroy.
- **Don't call Pretext `prepare()` directly.** The renderer caches it; bypassing the cache kills perf. Set component data and let the engine render.
- **Don't use `setInterval`/`setTimeout`.** Use `engine.after(sec, fn)`, `engine.every(sec, fn)`, `engine.spawnEvery(sec, factory)`, `engine.sequence([...])`, or the `Cooldown` class (advance with `dt`).
- **Don't put game logic in `engine/`.** It's a reusable framework — belongs in `game/` (or `games/<template>/` for template changes).
- **Don't re-register built-in systems.** They run automatically on scene load.
- **Don't create classes for entities.** Plain objects only.
- **Don't edit `docs/API-generated.md` by hand** — it's regenerated from source via `bun run gen:api`.

Engine defensiveness you can rely on (don't reinvent): `engine.spawn()` validates components, systems are try/catch-wrapped (one broken system logs but doesn't crash the loop), physics auto-recovers from `NaN` positions/velocities, scene load failures list available scene names. Warnings surface in the debug overlay (backtick `` ` `` key) and the browser console.

## Where to Look for Depth

- `docs/PROJECT-GUIDE.md` — full architecture, every major API, design rationale.
- `AGENTS.md` — terse API cheat sheet organized for agents.
- `docs/API-generated.md` — auto-generated API reference (regenerate, don't edit).
- `docs/COOKBOOK.md` — patterns and recipes.
- `docs/QUICKSTART.md`, `docs/TUTORIAL.md` — hands-on walkthroughs.
- `docs/PERF.md` — performance notes.
- `shared/types.ts` — `Entity` + every component shape.
- `shared/events.ts` — full typed event catalog.
- `engine/index.ts` — the entire public export surface.
- `engine/ecs/systems.ts` — built-in system priorities + ordering model.
- `games/<template>/` — working reference games to mimic.
