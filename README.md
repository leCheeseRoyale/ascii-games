```
██████╗ ██████╗ ███████╗████████╗███████╗██╗  ██╗████████╗
██╔══██╗██╔══██╗██╔════╝╚══██╔══╝██╔════╝╚██╗██╔╝╚══██╔══╝
██████╔╝██████╔╝█████╗     ██║   █████╗   ╚███╔╝    ██║
██╔═══╝ ██╔══██╗██╔══╝     ██║   ██╔══╝   ██╔██╗    ██║
██║     ██║  ██║███████╗   ██║   ███████╗██╔╝ ██╗   ██║
╚═╝     ╚═╝  ╚═╝╚══════╝   ╚═╝   ╚══════╝╚═╝  ╚═╝   ╚═╝

        ██████╗  █████╗ ███╗   ███╗███████╗███████╗
       ██╔════╝ ██╔══██╗████╗ ████║██╔════╝██╔════╝
       ██║  ███╗███████║██╔████╔██║█████╗  ███████╗
       ██║   ██║██╔══██║██║╚██╔╝██║██╔══╝  ╚════██║
       ╚██████╔╝██║  ██║██║ ╚═╝ ██║███████╗███████║
        ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝╚══════╝
```

Game engine built on [Pretext](https://github.com/chenglou/pretext), where text is a first-class spatial primitive. ECS, physics, rendering, input, and audio. Canvas 2D at 60fps with zero DOM in the frame loop.

[![npm](https://img.shields.io/npm/v/pretext-games.svg)](https://www.npmjs.com/package/pretext-games)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-1249+-green.svg)](#)

---

## Install

```bash
npm install pretext-games
```

Two entry points:

```ts
import { Engine, defineScene, defineSystem, defineGame } from 'pretext-games'
import { useStore } from 'pretext-games/store'
```

---

## Quick start

```bash
npx create-ascii-game my-game
cd my-game && bun dev
```

Includes 8 templates: `blank`, `asteroid-field`, `platformer`, `roguelike`, `physics-text`, `tic-tac-toe`, `connect-four`, and `mesh-demo`. The first `bun dev` opens a picker if no template is specified.

For a walkthrough, see [`docs/QUICKSTART.md`](docs/QUICKSTART.md) or [`docs/TUTORIAL.md`](docs/TUTORIAL.md).

---

## Two game APIs

### `defineGame`

Declarative, boardgame.io-style. Turn rotation, phase transitions, and game-over detection are handled by the engine. Best for turn-based, board, and puzzle games.

```ts
import { defineGame } from 'pretext-games'

const ticTacToe = defineGame({
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
  endIf: (ctx) => checkWinner(ctx.state.board),
  render: (ctx) => { /* draw with ctx.engine.ui.* */ },
})
```

### `defineScene` + `defineSystem`

Full ECS control for real-time, physics-heavy games: shooters, platformers, roguelikes, and more.

```ts
import { defineScene, defineSystem } from 'pretext-games'

const play = defineScene({
  name: 'play',
  setup(engine) {
    engine.spawn({
      position: { x: engine.centerX, y: engine.centerY },
      ascii: { char: '@', font: '16px monospace', color: '#fff' },
      velocity: { vx: 0, vy: 0 },
      collider: { type: 'circle', width: 12, height: 12 },
      tags: { values: new Set(['player']) },
    })
    engine.addSystem(inputSystem)
  },
})
```

Both APIs use the same engine. Particles, camera, audio, tweens, canvas UI, save/load, and networking work whichever API you choose.

---

## Features

| Area | What you get |
|:-----|:-------------|
| **Two game APIs** | `defineGame` for turn-based and board games; `defineScene` + `defineSystem` for real-time ECS |
| **Pretext text layout** | Browser-accurate text measurement without DOM, 500-1200x faster than DOM measurement |
| **Image Mesh** | Map images onto deformable text-character grids with spring physics. Canvas 2D mesh deformation without WebGL |
| **Physics** | Velocity integration, gravity, friction, drag, bounce, collision groups, and spatial hashing |
| **Interactive text** | Per-character spring physics, cursor repel, and ambient drift. Text scatters and reforms |
| **ECS** | miniplex World, 13 built-in systems, system priorities, and phase gating for turn-based games |
| **Input** | Keyboard, mouse, gamepad, touch/gestures, and configurable bindings with `capture()` + AbortSignal |
| **Audio** | Procedural SFX with ZzFX and background music |
| **Canvas UI** | Immediate-mode panels, text, bars, menus, tooltips, tabs, and text fields |
| **Networking** | Multiplayer scaffolding with lockstep sync and desync detection |
| **AI CLI** | Generate games from natural language with `ai:game`, `ai:scene`, `ai:sprite`, `ai:mechanic`, and `ai:juice` |
| **Behaviors** | Inventory, equipment, stats, loot tables, quests, achievements, dialog trees, wave spawners, and AI behaviors: patrol, chase, flee, wander |

---

## Image Mesh

Map any image onto a grid of text-character vertices with spring physics. Each character is a normal ECS entity: cursor repel warps the image, explosions tear it apart, and springs pull it back together. Canvas 2D mesh deformation, no WebGL required.

```ts
const mesh = engine.spawnImageMesh({
  image: 'assets/portrait.png',
  cols: 12, rows: 10,
  position: { x: engine.centerX, y: engine.centerY },
  spring: SpringPresets.bouncy,
  shape: 'circle',
})
engine.addSystem(createCursorRepelSystem({ radius: 120 }))
```

Shape presets (`circle`, `diamond`, `triangle`) mask the grid into non-rectangular forms. For meshes with 500+ cells, a SoA typed-array fast path keeps updates at 60fps. Full details: [`docs/IMAGE-MESH.md`](docs/IMAGE-MESH.md).

---

## Architecture

Four layers with enforced import boundaries, verified by `bun run check:bounds`:

```text
engine/   -- framework, published as pretext-games on npm
game/     -- your game code, gitignored and generated from templates
games/    -- source-of-truth templates, 8 included
ui/       -- React overlay + zustand store bridge
shared/   -- types, constants, events
```

---

## Commands

| Command | Description |
|:--------|:------------|
| `bun dev` | Dev server. Auto-runs the template picker if `game/` is missing |
| `bun run check:all` | TypeScript + boundary enforcement + lint |
| `bun test` | 1249+ tests via bun:test |
| `bun run build` | Production build |
| `bun run export` | Single-file `dist/game.html` |
| `bun run build:pkg` | Build npm package |
| `bun run init:game [template]` | Initialize a game from a template |
| `bun run new:scene` / `new:system` / `new:entity` | Scaffold and auto-wire |
| `bun run ai:game "<pitch>"` | Generate a `defineGame` module from a prompt |
| `bun run ai:scene "<pitch>"` | Generate a `defineScene` game from a prompt |

---

## Links

- **npm:** [pretext-games](https://www.npmjs.com/package/pretext-games)
- **Docs:** [`docs/`](docs/) -- quickstart, tutorial, cookbook, API reference
- **Pretext:** [github.com/chenglou/pretext](https://github.com/chenglou/pretext)
- **Repo:** [github.com/leCheeseRoyale/ascii-games](https://github.com/leCheeseRoyale/ascii-games)

---

MIT License
