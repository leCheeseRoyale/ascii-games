# Plan C: Game Structure, Config & Templates

## Problem
1. Only one `game/` folder — can't have multiple games side-by-side
2. `init:game asteroid-field` doesn't actually scaffold files (just prints a message)
3. The `blank` template has a bug: manually does `position += velocity * dt` which double-moves with the built-in `_physics` system
4. No game config manifest — no way for a game to declare what it needs
5. Only 2 templates for 2 genres

## Solution: Multi-game directory + game manifest + fixed templates

### Part 1: Multi-game directory structure

Add a `games/` directory where each subfolder is a self-contained game:

```
games/
  asteroid-field/     # existing game, moved here
    index.ts
    config.ts
    scenes/
    systems/
    entities/
  blank/              # template for new games
    index.ts
    scenes/
```

The active game is selected by a single import in the project root. Change `ui/GameCanvas.tsx` line 2:

```ts
// Before:
import { setupGame } from '@game/index';

// After:
import { setupGame } from '@game/index';  // unchanged — game/ is still the active game
```

The `game/` directory remains the "active game slot." The `init:game` script copies from `games/<template>/` into `game/`, replacing what's there. This keeps the engine, path aliases, and build config untouched.

### Part 2: Game config manifest

Each game gets a `game.config.ts` that declares metadata and UI needs:

```ts
// game/game.config.ts
export const gameConfig = {
  name: 'Asteroid Field',
  description: 'Dodge and shoot asteroids',
  version: '1.0',

  // UI hints — tells the engine what store fields/screens the game uses
  ui: {
    screens: ['menu', 'playing', 'paused', 'gameOver'],  // which screens to register
    hud: ['score', 'health'],  // which default HUD components to show
  },
} as const;
```

This is **informational only** in Phase 1 — it documents intent and can be read by templates/scaffolding. It becomes functional once Agent B's screen/HUD registries exist.

### Part 3: Fix the blank template

In `scripts/init-game.ts`, the blank template's `play.ts` (line 91-101) manually integrates velocity:

```ts
// BUG: _physics system already does position += velocity * dt
e.position.x += e.velocity.vx * dt
e.position.y += e.velocity.vy * dt
```

Fix: remove the manual integration, just set velocity and let `_physics` handle it:

```ts
update(engine: Engine, dt: number) {
  for (const e of engine.world.with('position', 'velocity', 'ascii')) {
    const speed = 200
    e.velocity.vx = 0
    e.velocity.vy = 0
    if (engine.keyboard.held('ArrowLeft') || engine.keyboard.held('KeyA')) e.velocity.vx = -speed
    if (engine.keyboard.held('ArrowRight') || engine.keyboard.held('KeyD')) e.velocity.vx = speed
    if (engine.keyboard.held('ArrowUp') || engine.keyboard.held('KeyW')) e.velocity.vy = -speed
    if (engine.keyboard.held('ArrowDown') || engine.keyboard.held('KeyS')) e.velocity.vy = speed
    // _physics system handles position += velocity * dt automatically
  }

  if (engine.keyboard.pressed('Escape')) {
    engine.loadScene('title')
  }
},
```

### Part 4: Make asteroid-field template actually scaffold

Replace the current "check the reference implementation" message (line 123-129) with actual file generation. Copy the current `game/` files as the template content:

- `game/index.ts` → template for asteroid-field index
- `game/config.ts` → template for asteroid-field config
- `game/scenes/title.ts`, `play.ts`, `game-over.ts` → scene templates
- `game/systems/*.ts` → system templates
- `game/entities/*.ts` → entity templates

Embed these as template strings in `scripts/init-game.ts` (same pattern as the blank template).

### Part 5: Add a `list` command

Add `bun run list:games` script that scans `games/` and prints available templates:

```ts
// scripts/list-games.ts
const dirs = await readdir('games', { withFileTypes: true });
for (const d of dirs.filter(d => d.isDirectory())) {
  // read game.config.ts if it exists, print name + description
}
```

Add to `package.json`:
```json
"list:games": "bun run scripts/list-games.ts"
```

### Part 6: Preserve current game as a reference

Move the current `game/` contents into `games/asteroid-field/` as the reference implementation. Then run `init:game asteroid-field` to copy it back into `game/` (proving the template works).

## Files touched
- `scripts/init-game.ts` — fix blank template bug, add real asteroid-field scaffolding
- `scripts/list-games.ts` — new file
- `games/asteroid-field/` — new directory, copy of current game code
- `games/blank/` — new directory, fixed blank template as actual files (not just strings in a script)
- `package.json` — add `list:games` script
- `game/game.config.ts` — new file, config manifest for active game

## Files NOT touched (important for parallelism)
- `shared/types.ts` — Agent A owns this
- `ui/` — Agent B owns this
- `engine/` — no engine changes

## Verification
- `bun run list:games` prints both templates
- `bun run init:game blank` scaffolds a working game, `bun dev` runs it without double-movement bug
- `bun run init:game asteroid-field` scaffolds the full game, `bun dev` runs identically to current
- `bun run check` passes
- `games/asteroid-field/` matches `game/` after init
