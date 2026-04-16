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
- Entities are plain objects with optional components: `position`, `velocity`, `acceleration`, `ascii`, `sprite`, `textBlock`, `collider`, `health`, `lifetime`, `physics`, `tween`, `animation`, `image`, `parent`, `child`, `emitter`, `tags`
- Built-in systems (`_parent`, `_physics`, `_tween`, `_animation`, `_lifetime`, `_screenBounds`, `_emitter`, `_stateMachine`) auto-registered on scene load
- Query: `engine.world.with('position', 'velocity')`, `.without()`, `.where()`, `.first`
- Spawn: `engine.spawn({ position: {x,y}, ascii: {char,font,color} })` (validates + adds to world)
- Remove: `engine.destroy(entity)`

## Patterns

**Scene:** `defineScene({ name, setup(engine), update(engine, dt), cleanup(engine) })`
**System:** `defineSystem({ name, update(engine, dt), priority? })` — add via `engine.addSystem()`. Custom systems default to priority 0 (runs before built-ins); use `SystemPriority.physics + 1` etc. to interleave with built-ins (engine/ecs/systems.ts).
**Entity factory:** `function createX(x,y): Partial<Entity> { return { position, ascii, ... } }`
**Scene switch:** `engine.loadScene('name', { transition?, duration?, data? })`
**Input:** `engine.keyboard.held('ArrowLeft')`, `engine.keyboard.pressed('Enter')`, `.released(k)`
**Physics:** add `physics: { gravity, friction, drag }` component — built-in system applies forces
**Animation:** `engine.playAnimation(entity, 'name')` — cycles sprite/ascii frames
**Tweens:** `engine.tweenEntity(entity, { props, duration, easing })` — animate component values
**Parenting:** `engine.attachChild(parent, child)` / `engine.detachChild(parent, child)` — hierarchical transforms
**Viewport:** `engine.viewport.{ width, height, orientation, safeArea }` — auto-tracks resize/orientation. Listens to `viewport:resized` / `viewport:orientation` events (engine/render/viewport.ts).

## React Boundary

- Store: `useStore.getState().setScore(10)` from game code
- Hook: `useStore(s => s.score)` in React components
- NEVER import ui/ from engine/game or vice versa (except store)

## Rendering

- Entities auto-render if they have `position` + (`ascii` | `textBlock` | `sprite` | `image`)
- `sprite`: multi-frame ASCII art with named animations
- `image`: render loaded images via `engine.loadImage(url)`
- Layering: set `position.z` or component layer for draw order
- Pretext `prepare()` is cached — never re-prepare same text+font
- Engine handles all rendering; just set component data

## Utils

`rng, rngInt, pick, chance, clamp, lerp, vec2, dist, Cooldown, overlaps, overlapAll, COLORS, FONTS, sfx`
`engine.after(sec, fn)`, `engine.every(sec, fn)`, `engine.sequence([...])` — timers
`engine.loadImage(url)` — async image load for `image` component
`engine.tweenEntity(entity, opts)` — property tweening
`GridMap` — spatial grid for broad-phase queries

## Save/Load

- `serializeGameState({ stats?, equipment?, inventory?, wallet?, quests?, achievements? })` → JSON-safe blob. `rehydrateGameState(data, { itemLookup, equipmentBlocks?, quests?, achievements? })` rebuilds (engine/storage/game-state.ts).
- `serializeInventory` / `deserializeInventory` (engine/behaviors/inventory.ts). `deserializeEquipment(data, itemLookup, stats?, blocks?)` — pass `stats` to re-apply modifiers, `blocks` to restore two-handed config (engine/behaviors/equipment.ts).

## Events (selected)

- Combat: `combat:damage-taken`, `combat:entity-defeated` fired by `createDamageSystem` (suppressed during i-frames). See shared/events.ts + engine/behaviors/damage.ts.
- Viewport: `viewport:resized`, `viewport:orientation`.

## Input Extras

- `new InputBindings(kb, gp?, mouse?)` — remappable actions. `findConflicts()` returns `Array<{ input, actions[] }>` using channel prefixes `key:`/`pad:`/`mouse:` (engine/input/bindings.ts).
- `Touch` scales client coords by `canvas.width / rect.width` so CSS-scaled canvases report canvas-pixel coords (engine/input/touch.ts).
- Gamepad clears button/axis state on disconnect — no ghost inputs (engine/input/gamepad.ts).

## UI / Render Extras

- `engine.ui.inlineRun(x, y, chunks, opts?)` — one-line mixed-font text (badges/chips). `UIInlineChunk = { text, font?, color?, bg?, padX? }` (engine/render/canvas-ui.ts).
- Dialog maxWidth = `min(500, floor(screenW * 0.9))`; re-lays out when viewport width changes.
- `new Transition(type, duration, midpointTimeoutMs?)` — optional midpoint timeout (default 5000ms) + promise race/catch prevent scene-loader hangs (engine/render/transitions.ts).

## Networking Extras

- `GameServer` opts: `httpRateLimit` (60/min/IP), `httpRateLimitWindowMs` (60000), `wsRateViolationLimit` (50 — disconnects persistent abusers).
- `SocketAdapter({ resumeOnReconnect: true })` sends `previousPeerId` on rejoin; server reuses if free. Welcome frame carries `resumed: boolean`.
- `TurnSync.submitStateHash(hash)` + `onDesync(handler)` — opt-in cross-peer state-hash comparison.

## Templates

- `games/platformer/` now complete: `createPlatform(x, y, widthInTiles)` + `platformCollisionSystem` (grounded/jump handling).

## Don'ts

- No game logic in engine/
- No React imports in game code (use zustand store)
- No classes for entities (plain objects only)
- No setInterval/setTimeout (use Cooldown + dt)
- No direct Pretext prepare() calls (renderer handles it)
- No mutating world during iteration without collecting first
