# AGENTS.md — Quick Reference for AI Agents

## Commands

- `bun dev` — dev server
- `bun run check` — typecheck
- `bun run build` — production build
- `bun run new:scene|new:system|new:entity <name>` — scaffold

## Architecture

- `engine/` = framework (don't add game logic here)
- `game/` = user code: scenes, systems, entities, data
- `ui/` = React UI (zustand store is ONLY bridge to engine/game)
- `shared/` = types, constants, events
- Path aliases: `@engine`, `@game`, `@ui`, `@shared`

## ECS

- miniplex World at `engine.world`
- Entities are plain objects with optional components: `position`, `velocity`, `ascii`, `textBlock`, `collider`, `health`, `lifetime`, `tags`
- Query: `engine.world.with('position', 'velocity')`, `.without()`, `.where()`, `.first`
- Spawn: `engine.world.add({ position: {x,y}, ascii: {char,font,color} })`
- Remove: `engine.world.remove(entity)`

## Patterns

**Scene:** `defineScene({ name, setup(engine), update(engine, dt), cleanup(engine) })`
**System:** `defineSystem({ name, update(engine, dt) })` — add via `engine.addSystem()`
**Entity factory:** `function createX(x,y): Partial<Entity> { return { position, ascii, ... } }`
**Scene switch:** `engine.switchScene('name')`
**Input:** `engine.keyboard.isDown('ArrowLeft')`, `engine.keyboard.justPressed('Enter')`

## React Boundary

- Store: `useStore.getState().setScore(10)` from game code
- Hook: `useStore(s => s.score)` in React components
- NEVER import ui/ from engine/game or vice versa (except store)

## Rendering

- Entities auto-render if they have `position` + `ascii` or `position` + `textBlock`
- Pretext `prepare()` is cached — never re-prepare same text+font
- Engine handles all rendering; just set component data

## Utils

`rng, rngInt, pick, chance, clamp, lerp, vec2, dist, Cooldown, overlaps, overlapAll, COLORS, FONTS, sfx`

## Don'ts

- No game logic in engine/
- No React imports in game code (use zustand store)
- No classes for entities (plain objects only)
- No setInterval/setTimeout (use Cooldown + dt)
- No direct Pretext prepare() calls (renderer handles it)
- No mutating world during iteration without collecting first
