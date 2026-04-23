<div align="center">

```
 █████╗ ██████╗ ███████╗ ██████╗██╗██╗
██╔══██╗██╔══██╗██╔════╝██╔════╝██║██║
███████║██████╔╝█████╗  ██║     ██║██║
██╔══██║██╔══██╗██╔══╝  ██║     ██║██║
██║  ██║██║  ██║███████╗╚██████╗██║██║
╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝╚═╝
               G A M E   E N G I N E
```

### Build ASCII-art games in the browser. Board games, platformers, RPGs, shooters, roguelikes — all rendered as text on a canvas.

[![npm](https://img.shields.io/badge/npm-ascii--game--engine@0.2.0-red.svg)](https://www.npmjs.com/package/ascii-game-engine)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-1249+-green.svg)](#)

[Quick Start](#-quick-start) · [Declarative API](#-declarative-api-definegame) · [ECS API](#-ecs-api-definescene--definesystem) · [AI Authoring](#-ai-assisted-authoring) · [Multiplayer](#-multiplayer-in-one-line) · [Docs](#-learn-more)

</div>

---

## 📦 Install

```bash
npm install ascii-game-engine
```

**Two entry points:**

- `ascii-game-engine` — the full engine: `Engine`, `defineScene`, `defineSystem`, `defineGame`, ECS, physics, rendering, input, audio, behaviors, networking, tiles, and more.
- `ascii-game-engine/store` — the [zustand](https://github.com/pmndrs/zustand) store bridge between the game loop and React UI: `useStore`, `extendStore`, `typedStore`.

Everything renders to a `<canvas>` as monospaced text. Ships as a single HTML file if you need it. No backend required.

---

## 🚀 Quick Start

```bash
npx create-ascii-game my-game --template blank
cd my-game && bun dev
```

`create-ascii-game` scaffolds a fresh project from one of 7 templates. First `bun dev` opens an interactive picker if you don't specify a template.

For a step-by-step walkthrough, see [`docs/QUICKSTART.md`](docs/QUICKSTART.md) or [`docs/TUTORIAL.md`](docs/TUTORIAL.md).

---

## 🎮 Two APIs for two kinds of games

### Declarative API — `defineGame`

Boardgame.io-style declarative API for turn-based, board, puzzle, and card games. State, moves, turn order, phases, and game-over detection live in **one object**. The engine handles turn rotation, phase transitions, and win/loss detection.

```ts
import { defineGame, type Engine } from 'ascii-game-engine'

type State = { board: ('X' | 'O' | null)[] }
type Player = 'X' | 'O'

export const ticTacToe = defineGame<State, Player>({
  name: 'tic-tac-toe',
  players: { min: 2, max: 2, default: 2 },
  setup: () => ({ board: Array(9).fill(null) }),
  turns: { order: ['X', 'O'], autoEnd: true },
  moves: {
    place(ctx, idx: number) {
      if (ctx.state.board[idx] !== null) return 'invalid'
      ctx.state.board[idx] = ctx.currentPlayer
    },
  },
  endIf(ctx) {
    const w = checkWinner(ctx.state.board)
    if (w) return { winner: w }
    if (ctx.state.board.every((c) => c !== null)) return { draw: true }
  },
  render(ctx) {
    // Called every frame. Draw with ctx.engine.ui.* and read input.
    // Call ctx.moves.place(idx) on a click to play.
  },
})

export function setupGame(engine: Engine) {
  return { startScene: engine.runGame(ticTacToe) }
}
```

**Best for:** tic-tac-toe, connect-four, card games, Hearthstone-style games, puzzles, hotseat multiplayer.

### ECS API — `defineScene` + `defineSystem`

Full Entity-Component-System control for real-time, physics-heavy, or complex games. Entities are plain objects, systems run every frame, and scenes manage lifecycle.

```ts
import { defineScene, defineSystem, type Engine } from 'ascii-game-engine'

export const playScene = defineScene({
  name: 'play',
  setup(engine: Engine) {
    engine.spawn({
      position: { x: engine.centerX, y: engine.centerY },
      ascii: { char: '@', font: '16px monospace', color: '#fff' },
      velocity: { vx: 0, vy: 0 },
      collider: { type: 'circle', width: 12, height: 12 },
      tags: { values: new Set(['player']) },
    })
    engine.addSystem(playerInputSystem)
    engine.addSystem(collisionSystem)
  },
  update(engine: Engine, dt: number) {
    // Per-frame logic
  },
})

export const playerInputSystem = defineSystem({
  name: 'playerInput',
  update(engine: Engine, dt: number) {
    const speed = 200
    for (const e of engine.world.with('position', 'velocity', 'tags')) {
      if (!e.tags.values.has('player')) continue
      e.velocity.vx = (engine.keyboard.held('KeyD') ? speed : 0)
                    - (engine.keyboard.held('KeyA') ? speed : 0)
      e.velocity.vy = (engine.keyboard.held('KeyS') ? speed : 0)
                    - (engine.keyboard.held('KeyW') ? speed : 0)
    }
  },
})
```

**Best for:** shooters, platformers, roguelikes, RPGs, side-scrollers, physics sandboxes.

Both APIs share the same engine: particles, camera, audio, tweens, transitions, canvas UI primitives, save/load, procedural generation, and networking all work regardless of which API you choose.

---

## 🤖 AI-assisted authoring

Set `ANTHROPIC_API_KEY` once, then generate games, scenes, sprites, mechanics, and juice from a prompt:

```bash
bun run ai:game    "deck-building roguelike with 3 card types"
bun run ai:scene   "space shooter with asteroid waves and power-ups"
bun run ai:sprite  "space invader, 2 frames, green"
bun run ai:mechanic "enemy patrols then chases player when close"
bun run ai:juice   "player takes damage"
```

| Command | What it generates | Where it goes |
|---------|-------------------|---------------|
| `ai:game` | Complete `defineGame` module (turn-based / board) | `game/<slug>.ts` |
| `ai:scene` | Complete `defineScene` game (real-time / ECS) | `game/<slug>.ts` |
| `ai:sprite` | Entity factory with multi-frame ASCII art | `game/entities/` |
| `ai:mechanic` | `defineSystem(...)` behavior module | `game/systems/` |
| `ai:juice` | Particles + sfx + shake + floating text helper | `game/helpers/` |

`ai:game` and `ai:scene` auto-wire `game/index.ts` — no manual setup needed.

All commands support `--verify` (typecheck), `--smoke` (headless 60-frame test), `--model=opus|sonnet|haiku`, `--dry-run`, and `--force`. Full guide: [`docs/AI-WORKFLOWS.md`](docs/AI-WORKFLOWS.md).

---

## 🏗 Scaffolding

```bash
# New project from a template (7 available)
npx create-ascii-game my-game

# Inside a project — scaffold individual pieces
bun run new:scene  <name>   # Auto-wires into game/index.ts
bun run new:system <name>
bun run new:entity <name>
```

Available templates: `blank`, `tic-tac-toe`, `connect-four`, `asteroid-field`, `platformer`, `roguelike`, `physics-text`.

---

## 🌐 Multiplayer in one line

```ts
import { createMultiplayerGame, Engine } from 'ascii-game-engine'

const handle = await createMultiplayerGame(ticTacToe, {
  transport: { kind: 'local', players: 2 },
  engineFactory: () => new Engine(canvas),
  onDesync: (e) => console.warn('desync', e),
})

handle.runtime.dispatch('place', [4]) // player 1 plays center
```

Wraps any `defineGame` definition with lockstep transport (local / WebSocket) and desync detection, built on `TurnSync`, `MockAdapter`, `SocketAdapter`, and `GameServer`. Full example: [`docs/cookbook/define-game.md`](docs/cookbook/define-game.md#multiplayer-games-in-one-line).

---

## 🧩 What's inside

| Layer | What you get |
|:------|:-------------|
| **Core engine** | Pretext text layout, miniplex ECS, physics, audio (ZzFX), input (keyboard / mouse / gamepad / touch), particles, tweens, camera, transitions, canvas UI primitives |
| **Declarative layer** | `defineGame`, seeded RNG, phase-gated systems, auto turn rotation |
| **Behaviors** | Opt-in helpers: inventory, equipment, currency, crafting, loot, quests, dialog trees, stats + modifiers, achievements, AI state machines |
| **Networking** | `MockAdapter` / `SocketAdapter` / `GameServer` / `TurnSync` — desync detection & session resume |
| **Tiles & dungeons** | Tilemaps, FOV, BSP/cave/walker dungeon generation, pathfinding |
| **Scaffolding** | `create-ascii-game` CLI, `new:scene` / `new:system` / `new:entity` scripts, AI content generators |
| **Dev loop** | Vite + hot reload, Biome lint, TypeScript type-check, 1249+ unit tests via `bun:test` |
| **Static export** | `bun run export` → single-file `dist/game.html` |

<sup>Full API reference: [`docs/PROJECT-GUIDE.md`](docs/PROJECT-GUIDE.md) · [`docs/API-generated.md`](docs/API-generated.md)</sup>

---

## 🔧 Monorepo workflow (contributors & power users)

If you're contributing to the engine or working from the monorepo directly:

```bash
bun dev              # Dev server (auto-runs template picker if game/ is missing)
bun run init:game [blank|asteroid-field|platformer|roguelike|physics-text|tic-tac-toe|connect-four]
bun run check:all    # TypeScript + boundary enforcement + lint
bun test             # 1249 tests
bun run build:pkg    # Build npm package to packages/ascii-game-engine/dist/
bun run export       # Single-file dist/game.html
```

### Architecture

Four layers with enforced import boundaries:

| Layer | Role | Published? |
|:------|:-----|:-----------|
| `engine/` | Framework — ECS, physics, rendering, audio, networking, behaviors | ✅ `ascii-game-engine` |
| `shared/` | Types, constants, events | ✅ Bundled into the npm package |
| `ui/` | React overlay + zustand store bridge | ✅ `ascii-game-engine/store` |
| `game/` | Per-project game code (gitignored, copied from templates) | ❌ User land |
| `games/` | Source-of-truth templates (7 included) | ❌ Template source |

Path aliases used inside the monorepo: `@engine`, `@game`, `@ui`, `@shared`.

---

## 📚 Learn more

| Doc | What it covers |
|:----|:---------------|
| [`docs/QUICKSTART.md`](docs/QUICKSTART.md) | 15-minute first game |
| [`docs/TUTORIAL.md`](docs/TUTORIAL.md) | Full walkthrough |
| [`docs/COOKBOOK.md`](docs/COOKBOOK.md) | Recipe index (split into `docs/cookbook/` topic files) |
| [`docs/AI-WORKFLOWS.md`](docs/AI-WORKFLOWS.md) | AI CLI setup and guide |
| [`docs/API-generated.md`](docs/API-generated.md) | Auto-generated API reference |

---

## 🛠 Tech stack

| Library | Role |
|:--------|:-----|
| [Pretext](https://github.com/chenglou/pretext) | Font metrics & text layout on canvas |
| [miniplex](https://github.com/hmans/miniplex) | Entity Component System |
| [React](https://react.dev) | UI overlay (HUD, menus) — optional peer dependency |
| [zustand](https://github.com/pmndrs/zustand) | State bridge between engine and React |
| [Vite](https://vitejs.dev) | Build tool & dev server |
| [Bun](https://bun.sh) | Runtime, package manager, script runner |

---

<div align="center">

**MIT License**

*Think boardgame.io meets a lightweight ECS — but everything is ASCII.*

</div>
