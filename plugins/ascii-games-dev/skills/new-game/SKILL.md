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

- Read `docs/API-generated.md` — list of `@engine` exports
- Read `games/roguelike/index.ts` and `games/asteroid-field/index.ts` — two contrasting idioms
- Read `scripts/init-game.ts` — how templates are copied

### 2. Classify the game from the description

Map the user's description to these axes:

| Axis | Options | How to pick |
|---|---|---|
| **Pacing** | `real-time` / `turn-based` | Keywords: "dodge/shoot/chase" → real-time; "moves/grid/dungeon/cards" → turn-based |
| **Genre** | `shmup` / `platformer` / `roguelike` / `puzzle` / `arena` / `other` | Keyword match; ask if ambiguous |
| **UI** | `canvas-only` / `react-hud` | Turn-based/roguelike → canvas-only. Real-time action with a score bar → react-hud. |
| **Persistence** | `none` / `score-only` / `slots` | Arcade → score-only; RPG-ish → slots; minigame → none |
| **Multiplayer** | `no` / `turn-sync` / `realtime-relay` | Default no unless user says otherwise |

Pick the **starting template**:

- `roguelike` → for turn-based grid games (has BSP, FOV, pathfinding, canvas UI)
- `asteroid-field` → for real-time shooter/arena (physics, particles, waves, React HUD)
- `platformer` → for gravity-based games (has platform collision system)
- `blank` → fall-back for anything else (minimal)

Confirm the classification with the user in one line: "Reading your description as: `real-time arena shmup, React HUD, score-only save, single-player`. Correct? (yes / change: ...)"

### 3. Copy template + adjust

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
- What template you used and why
- Which files you created/edited (paths only)
- How to run (`bun dev`)
- Any follow-ups (multiplayer, save-slots, juice) they can invoke with other slash commands

## Things NOT to do

- Don't invent APIs. If `docs/API-generated.md` doesn't list it, it doesn't exist.
- Don't add built-in systems manually. The 8 auto-register.
- Don't write game logic in `engine/`.
- Don't skip the classification confirmation — assumption mismatches compound.
- Don't produce a pitch deck. Produce code.

## Example

User: `/ascii-games-dev:new-game "zelda-like dungeon crawler with keys, doors, and a boss"`

Classification to confirm: `turn-based` (if grid) or `real-time` (ask — default real-time for "zelda-like"), `react-hud` (health bar, key count), `slots` persistence, single-player.

Template: `roguelike` if turn-based, else start from `blank` and pull the dungeon-gen + combat hookup from roguelike.

Files to produce: `game/entities/{player,enemy,boss,key,door,chest}.ts`, `game/systems/{player-input,enemy-ai,combat,door-interaction}.ts`, `game/scenes/{title,play,game-over,victory}.ts`, `game/index.ts`.
