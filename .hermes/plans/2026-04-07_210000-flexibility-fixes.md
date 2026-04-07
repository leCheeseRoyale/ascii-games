# Flexibility Fixes — Make the Engine Game-Agnostic

## Problems Found

### 1. Particles are a hack
The play scene manually calls `particles.render(ctx)` in its update function.
This means every game has to know about the render pipeline internals.
Particles should be a first-class engine feature that just works.

**Fix:** Engine owns a ParticlePool. Systems call `engine.particles.burst(...)`.
Renderer draws particles automatically after entities.

### 2. No render layers
Everything renders in one flat pass. Can't put background behind entities,
can't put UI text in front of particles. Games that need depth (platformers,
strategy, RPGs) are stuck.

**Fix:** Add a `layer` field to Ascii and TextBlock components (default 0).
Renderer sorts by layer before drawing. Negative = behind, positive = in front.

### 3. No multi-character ASCII art
Entities can only be a single character. You can't make a boss that's:
```
 /\_/\
( o.o )
 > ^ <
```
This limits visual expression severely.

**Fix:** Add a `sprite` component — array of strings rendered line by line,
centered on position. Alternative to `ascii` (one-char) for richer visuals.

### 4. No tween/animation primitives
Moving something smoothly from A to B requires manual lerp in a system.
Fading, scaling, color transitions — all manual. Every game reinvents this.

**Fix:** Add a `Tween` component + tween system. Declarative: specify target
values, duration, easing. Engine handles interpolation. Auto-removes when done.

### 5. No grid/tilemap support
Roguelikes, autobattlers, puzzle games, strategy — all need grids.
Currently you'd have to build this entirely in game code.

**Fix:** Add GridMap utility in engine — create a grid, set/get tiles,
render as ASCII characters at grid positions. Coordinate conversion helpers.

### 6. No timer/scheduler
setTimeout doesn't work with the game loop (pausing, determinism).
Every game needs delayed actions, intervals, sequences.

**Fix:** Add Timer system to engine — schedule callbacks relative to game time.
Respects pause. Used for delayed spawns, ability cooldowns, cutscene sequences.

### 7. Scaffolding only has 2 templates
"blank" and "asteroid-field" don't cover the breadth of games people want to make.

**Fix:** Add templates for common archetypes: roguelike, platformer, puzzle,
strategy. Each is minimal but runnable — shows the pattern for that genre.

### 8. No screen/world coordinate helpers
Mouse position is screen-relative. With camera zoom/pan, converting to
world coordinates requires manual math every time.

**Fix:** Add `camera.screenToWorld(x, y)` and `camera.worldToScreen(x, y)`.

## Implementation Plan

### Batch 1: Engine core fixes (most impactful)

1. **Integrate particles into engine + renderer**
   - Engine gets `particles: ParticlePool` field
   - Renderer calls `this.particles.render(ctx)` after entities
   - Systems/scenes use `engine.particles.burst(...)` — no manual render

2. **Add `layer` to rendering**
   - Ascii component gets optional `layer?: number` (default 0)
   - TextBlock gets optional `layer?: number`
   - Renderer collects all renderables, sorts by layer, draws in order

3. **Add `sprite` component**
   - `Sprite { lines: string[]; font: string; color: string; layer?: number }`
   - Renderer draws each line centered on position
   - Alternative to `ascii` for multi-line ASCII art

4. **Camera coordinate conversion**
   - `camera.screenToWorld(sx, sy): Vec2`
   - `camera.worldToScreen(wx, wy): Vec2`

### Batch 2: Game logic utilities

5. **Tween system**
   - `Tween` component: `{ props: TweenProp[]; elapsed: number }`
   - `TweenProp`: `{ target: string; from: number; to: number; duration: number; ease: string }`
   - Built-in system processes tweens, auto-removes completed ones
   - `engine.tween(entity, { x: 100 }, 0.5, 'easeOut')` helper

6. **Timer/scheduler**
   - `engine.after(seconds, callback)` — one-shot
   - `engine.every(seconds, callback)` — repeating
   - `engine.sequence([{delay, fn}, ...])` — chained delays
   - All respect pause. Cleaned up on scene transition.

7. **Grid utilities**
   - `GridMap<T>` class: create(cols, rows), get/set, neighbors, pathfind
   - `gridToWorld(col, row, cellSize, offset)` and `worldToGrid(x, y, ...)`
   - Render helper: draw grid as ASCII characters
   - Not a required component — opt-in utility

### Batch 3: Scaffolding templates

8. **More `init:game` templates**
   - `roguelike` — grid map, FOV (rot.js), turn-based movement, dungeon gen
   - `platformer` — gravity system, ground tiles, jumping, side-scroll camera
   - `puzzle` — grid, tile matching/swapping, score, levels

## Files to Change

### Engine changes:
- `engine/core/engine.ts` — add particles, timers, tween helper
- `engine/render/ascii-renderer.ts` — layer sorting, sprite rendering, auto-particles
- `engine/render/particles.ts` — no API changes, just ownership moves to engine
- `engine/render/camera.ts` — add screenToWorld/worldToScreen
- `shared/types.ts` — add Sprite, Tween components, layer to Ascii/TextBlock
- `engine/utils/grid.ts` — NEW
- `engine/utils/scheduler.ts` — NEW
- `engine/ecs/tween-system.ts` — NEW built-in system
- `engine/index.ts` — export new features

### Game changes:
- `game/scenes/play.ts` — remove manual particles.render(), use engine.particles
- `game/systems/collision.ts` — use engine.particles instead of exported pool
- `scripts/init-game.ts` — add new templates
