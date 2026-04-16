# ASCII Game Engine

A declarative game framework for building ASCII-art games in the browser — rapid prototyping, AI-assisted authoring, multiplayer-native. Think boardgame.io, but for ASCII games. Built on [Pretext](https://github.com/chenglou/pretext), [miniplex](https://github.com/hmans/miniplex), and React.

Everything renders as text on a canvas. Ships as a single static HTML file. No backend required.

## Quick tour (60 seconds)

```bash
npx create-ascii-game my-game --template tic-tac-toe
cd my-game && bun dev
```

First `bun dev` with no `--template` shows a picker. Pick one, hit Enter, you're playing.

<!-- TODO: add a short GIF / screenshot here — place under docs/img/ and reference from here. -->

## Build a game declaratively

`defineGame({...})` collapses state, moves, turn order, and game-over detection
into one object. The engine wires up a scene, rotates turns, and reports results.

```ts
import { defineGame, type Engine } from '@engine'

type State = { board: ('X' | 'O' | null)[] }

export const ticTacToe = defineGame<State>({
  name: 'tic-tac-toe',
  players: { min: 2, max: 2, default: 2 },
  setup: () => ({ board: Array(9).fill(null) }),
  turns: { order: ['X', 'O'] },
  moves: {
    place(ctx, idx: number) {
      if (ctx.state.board[idx] !== null) return 'invalid'
      ctx.state.board[idx] = ctx.currentPlayer as 'X' | 'O'
    },
    reset: (ctx) => { ctx.state.board = Array(9).fill(null) },
  },
  endIf(ctx) {
    const w = checkWinner(ctx.state.board)
    if (w) return { winner: w }
    if (ctx.state.board.every((c) => c !== null)) return { draw: true }
  },
  render(ctx) {
    // Called every frame. Use ctx.engine.ui.* / ctx.engine.mouse / .keyboard.
    // Call ctx.moves.place(idx) on a click to place a mark.
  },
})

export function setupGame(engine: Engine) {
  return { startScene: engine.runGame(ticTacToe) }
}
```

Full example: [`games/tic-tac-toe/index.ts`](games/tic-tac-toe/index.ts). API reference: [`docs/COOKBOOK.md`](docs/COOKBOOK.md#declarative-games-with-definegame).

## AI-assisted authoring

Three CLI scripts use Claude to scaffold content. Set `ANTHROPIC_API_KEY` once, then:

```bash
bun run ai:sprite "space invader, 2 frames, green"
bun run ai:mechanic "enemy patrols then chases player when close"
bun run ai:juice "player takes damage"
```

- `ai:sprite` — writes an entity factory under `game/entities/`.
- `ai:mechanic` — writes a `defineSystem(...)` module under `game/systems/`.
- `ai:juice` — writes a helper layering particles, sfx, shake, and floating text.

All commands support `--dry-run`, `--model`, and `--force`. Setup and full usage: [`docs/AI-WORKFLOWS.md`](docs/AI-WORKFLOWS.md).

## Multiplayer in one line

```ts
import { createMultiplayerGame, Engine } from '@engine'

const handle = await createMultiplayerGame(ticTacToe, {
  transport: { kind: 'local', players: 2 },
  engineFactory: () => new Engine(canvas),
  onDesync: (e) => console.warn('desync', e),
})

handle.runtime.dispatch('place', [4]) // player 1 plays center
```

Wraps any `defineGame` definition with a lockstep transport (local / WebSocket) and desync detection, built on `TurnSync`, `MockAdapter`, `SocketAdapter`, and `GameServer` under `engine/net/`. Full example: [`docs/COOKBOOK.md#multiplayer-games-in-one-line`](docs/COOKBOOK.md#multiplayer-games-in-one-line).

## Templates

| Template | Description | Command |
|----------|-------------|---------|
| `blank` | Minimal starter — title screen + movable player | `--template blank` |
| `tic-tac-toe` | Declarative `defineGame` showcase, canvas-only UI | `--template tic-tac-toe` |
| `asteroid-field` | Complete real-time game — dodge, shoot, score, difficulty ramp | `--template asteroid-field` |
| `platformer` | Gravity, jumping, platforms, collectibles | `--template platformer` |
| `roguelike` | Turn-based grid game with tilemap, pathfinding, dialog | `--template roguelike` |

## What's inside

- **Engine.** Pretext text layout, miniplex ECS, physics, audio (ZzFX), input (keyboard / mouse / gamepad / touch), particles, tweens, camera, transitions, canvas UI primitives.
- **Declarative layer.** `defineGame`, seeded RNG, phase-gated systems, auto turn rotation.
- **Behaviors.** Opt-in helpers for inventory, equipment, currency, crafting, loot, quests, dialog trees, stats + modifiers, achievements, AI state machines.
- **Networking.** `MockAdapter` / `SocketAdapter` / `GameServer` / `TurnSync` with desync detection and session resume.
- **Scaffolding.** `create-ascii-game` CLI, `new:scene`, `new:system`, `new:entity` scripts, AI content generators.
- **Dev loop.** Vite + hot reload, Biome lint, TypeScript type-check, 1140+ unit tests via `bun:test`.
- **Static export.** `bun run export` → single-file `dist/game.html`.

Full component / API reference: [`docs/PROJECT-GUIDE.md`](docs/PROJECT-GUIDE.md) and [`docs/API-generated.md`](docs/API-generated.md).

## Commands

```bash
bun dev              # Start dev server (auto-runs template picker if game/ is missing)
bun dev:fast         # Start Vite directly (skip auto-detect)
bun run check        # TypeScript type-check
bun run test         # Run unit tests
bun run build        # Production build
bun run export       # Build single-file HTML (dist/game.html)
bun run lint         # Biome linter
bun run init:game    # Interactive template picker
bun run new:scene    # Scaffold a new scene
bun run new:system   # Scaffold a new system
bun run new:entity   # Scaffold an entity factory
bun run ai:sprite    # AI-generate an entity sprite
bun run ai:mechanic  # AI-generate a gameplay system
bun run ai:juice     # AI-generate a particles / sfx / shake helper
bun run list:games   # List available game templates
```

## Learn more

- [`docs/QUICKSTART.md`](docs/QUICKSTART.md) — 15-minute first game
- [`docs/TUTORIAL.md`](docs/TUTORIAL.md) — full walkthrough
- [`docs/COOKBOOK.md`](docs/COOKBOOK.md) — copy-pasteable recipes, `defineGame` section
- [`docs/PROJECT-GUIDE.md`](docs/PROJECT-GUIDE.md) — architecture, APIs, gotchas
- [`docs/AI-WORKFLOWS.md`](docs/AI-WORKFLOWS.md) — AI CLI setup and guide
- [`docs/API-generated.md`](docs/API-generated.md) — auto-generated API reference
- [`docs/PERF.md`](docs/PERF.md) — performance notes
- [`docs/DEVELOPER.md`](docs/DEVELOPER.md) — contributing to the engine

## Tech stack

| Library | Role |
|---------|------|
| [Pretext](https://github.com/chenglou/pretext) | Font metrics & text layout on canvas |
| [miniplex](https://github.com/hmans/miniplex) | Entity Component System |
| [React](https://react.dev) | UI overlay (HUD, menus) |
| [zustand](https://github.com/pmndrs/zustand) | State bridge between engine and React |
| [Vite](https://vitejs.dev) | Build tool & dev server |
| [Bun](https://bun.sh) | Runtime, package manager, script runner |

## License

MIT
