---
name: new-game
description: Activates when the user invokes `/ascii-games-dev:new-game` or asks to "start a new game", "scaffold a game", "create a new game from scratch", or "build me a <genre> game" in the ascii-games engine. Scaffolds scenes + systems + entities + UI + save system from a free-text description.
argument-hint: [game description]
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Scaffold a new game from a description

User input lives in `$ARGUMENTS`. If empty, ask: "What game? Describe it in one sentence."

## Workflow

### 1. Read authoritative references first

Before writing any file:

- Read `AGENTS.md` — component shapes, API cheat sheet, don'ts
- Read `docs/API-generated.md` — list of `@engine` exports
- Read `games/tic-tac-toe/index.ts` — minimal `defineGame` reference
- Read `games/roguelike/index.ts` — ECS canvas-only reference
- Read `games/asteroid-field/scenes/play.ts` — ECS + React HUD reference

### 2. Classify the game from the description

Map the user's description to these axes:

| Axis | Options | How to pick |
|---|---|---|
| **API** | `defineGame` / `defineScene` | Board/puzzle/card/hotseat → `defineGame`. Physics/grid/roguelike/shooter → `defineScene`. |
| **Pacing** | `real-time` / `turn-based` | Keywords: "dodge/shoot/chase" → real-time; "moves/grid/dungeon/cards" → turn-based |
| **Genre** | `shmup` / `platformer` / `roguelike` / `puzzle` / `arena` / `board` / `other` | Keyword match; ask if ambiguous |
| **UI** | `canvas-only` / `react-hud` | `defineGame` → always canvas-only. Turn-based with complex UI → canvas-only. Real-time with simple score → react-hud. |
| **Persistence** | `none` / `score-only` / `slots` | Arcade → score-only; RPG-ish → slots; minigame → none |
| **Multiplayer** | `no` / `turn-sync` / `realtime-relay` | Default no unless user says otherwise |

**API decision flowchart:**

- Is it a board game, card game, puzzle, or 2-player hotseat? → `defineGame`
- Does it need physics, real-time input, or more than 2 scenes of game logic? → `defineScene`
- Is it a turn-based roguelike with tilemaps, FOV, pathfinding? → `defineScene` (too complex for `defineGame`'s `render()`)

Confirm the classification with the user in one line: "Reading your description as: `turn-based board game via defineGame, canvas-only UI, score-only save, 2-player hotseat`. Correct? (yes / change: ...)"

### 3A. If `defineGame` — produce a single-file game module

Follow the `games/tic-tac-toe/index.ts` shape. Single file with:

1. Type definitions for `State` and `Player`
2. `defineGame<State, Player>({ ... })` with `setup`, `moves`, `turns`, `endIf`, `render`
3. Input handler using `MoveInputCtx` (mouse clicks → `ctx.moves.*()`)
4. `export function setupGame(engine)` returning `{ startScene: engine.runGame(myGame), screens: { ... }, hud: [] }`

Key `defineGame` rules:
- `setup` returns initial state (pure function of `{ numPlayers, random, engine }`)
- Moves mutate `ctx.state` directly; return `"invalid"` to reject (no state change, no turn advance)
- `turns.order` rotates after each successful move (set `autoEnd: false` for multi-action turns)
- `render(ctx)` is called every frame — draw with `ctx.engine.ui.*`, dispatch with `ctx.moves.*`
- `endIf(ctx)` returns `{ winner }` or `{ draw: true }` to end the game
- Phases: `phases: { order: [...], name: { onEnter, endIf, moves: [...] } }`
- `ctx.random()` is a seeded RNG — use it instead of `Math.random()` for determinism
- Single-player: omit `turns` and `players`; use `render()` for the game loop

### 3B. If `defineScene` — pick a starting template

Pick the **starting template**:

- `roguelike` → for turn-based grid games (has BSP, FOV, pathfinding, canvas UI)
- `asteroid-field` → for real-time shooter/arena (physics, particles, waves, React HUD)
- `platformer` → for gravity-based games (has platform collision system)
- `blank` → fall-back for anything else (minimal)

Either run `bun run init:game <template>` if the user is in a fresh project, or edit files in place if they've already scaffolded.

If editing in place, keep changes surgical:

- Update `game/game.config.ts` — title + description
- Rewrite `game/scenes/play.ts` to match the described mechanics
- Add/remove entities per description (e.g., description mentions "enemies" → entity factory + spawner system)
- Wire UI: canvas-only → return `{ screens: { menu: Empty, playing: Empty, gameOver: Empty }, hud: [] }` from `setupGame`. React HUD → write to `useStore.getState().setScore(...)` from game code.

### 4. Wire persistence if requested

- `score-only` → add `submitScore('my-game', finalScore, { playerName })` on game-over
- `slots` → `new SaveSlotManager({ maxSlots: 3 })`, expose via `@ui/store`

### 5. Wire multiplayer if requested

Defer to `/ascii-games-dev:multiplayer turnbased|realtime` — don't duplicate that skill's logic. State: "For multiplayer, run `/ascii-games-dev:multiplayer <mode>` next."

### 6. Verify

```bash
bun run check
bun run test
```

Both must pass. If typecheck fails, it's usually a stale template import or a missing component field — grep the error, fix the referenced file.

### 7. Report to user

One sentence per:
- What API (defineGame or defineScene) and template you used and why
- Which files you created/edited (paths only)
- How to run (`bun dev`)
- Any follow-ups (multiplayer, save-slots, juice) they can invoke with other slash commands

## Things NOT to do

- Don't invent APIs. If `docs/API-generated.md` doesn't list it, it doesn't exist.
- Don't add built-in systems manually. The 8 auto-register.
- Don't write game logic in `engine/`.
- Don't skip the classification confirmation — assumption mismatches compound.
- Don't produce a pitch deck. Produce code.
- Don't use `defineGame` for games that need tilemaps, pathfinding, camera follow, or complex scene data — use `defineScene` instead.
- Don't use `defineScene` for simple board/puzzle games when `defineGame` would be cleaner and shorter.

## Example

User: `/ascii-games-dev:new-game "2-player strategy where you place walls to maze a runner"`

Classification: `defineGame`, `turn-based`, `board`, `canvas-only`, `score-only`, 2-player hotseat.

Output: single file `game/maze-runner.ts` using `defineGame` with grid state, `placeWall` move, `moveRunner` move, `endIf` for when runner reaches goal or is boxed in.

User: `/ascii-games-dev:new-game "zelda-like dungeon crawler with keys, doors, and a boss"`

Classification: `defineScene`, `real-time`, `roguelike`, `canvas-only`, `slots` persistence, single-player.

Template: `roguelike` — pull dungeon-gen + combat + FOV, strip the turn-based phases, add real-time movement + keys/doors/boss entities.
