# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Declarative games** — `defineGame({ setup, moves, turns, phases, endIf, render })` wraps scenes, turn rotation, and game-over detection in one object. `engine.runGame(def)` registers the generated scene. See [`docs/cookbook/define-game.md`](docs/cookbook/define-game.md) and the `tic-tac-toe` template.
- **One-line multiplayer** — `createMultiplayerGame(def, { transport, engineFactory, ... })` wraps any `defineGame` definition with lockstep sync + desync detection via `TurnSync`. Transports: `local` (N `MockAdapter` peers for dev) and `socket` (`SocketAdapter` against `GameServer`). See [`docs/cookbook/define-game.md`](docs/cookbook/define-game.md#multiplayer-games-in-one-line).
- **AI CLI scripts** — `bun run ai:sprite`, `ai:mechanic`, `ai:juice` generate entity factories, systems, and juice helpers via Claude. Setup in [`docs/AI-WORKFLOWS.md`](docs/AI-WORKFLOWS.md).
- **AI CLI** — `ai:game` generates a complete `defineGame<TState>({...})` module from a natural-language pitch. Fourth command in the AI suite.
- **AI CLI** — `ai:scene` generates a complete `defineScene`-based ECS game (real-time, physics, shooters) from a pitch. Fifth command in the AI suite.
- **`--smoke` flag** — all `ai:*` scripts support `--smoke` for headless validation: instantiates the engine without a canvas, ticks 60 frames, and checks for runtime errors.
- **Auto-wiring** — `new:scene` auto-adds import + `registerScene` to `game/index.ts`. `ai:game`/`ai:scene` auto-rewrite `game/index.ts` to re-export `setupGame`. No manual wiring needed.
- **GameCanvas validation** — `setupGame()` errors are now caught and shown visually on the canvas instead of a silent blank screen.
- **Game-builder agent** — orchestrating agent that takes a pitch, classifies it, generates or scaffolds, wires, validates, and reports.
- **`MoveInputCtx<TState, TPlayer>`** — convenience type alias exported from `@engine` for render/input helpers; `Pick<GameContext, 'engine' | 'moves' | 'state' | 'result' | 'currentPlayer'>`.

### Fixed

- **`defineGame` turn ops after game-over** — `endTurn()`, `endPhase()`, `goToPhase()` called inside a move are now deferred until after `endIf`; discarded if the game ends. Post-game-over calls are no-ops.
- **Physics grounded reset** — `grounded` now resets each frame for bouncing entities, clearing correctly when the entity leaves the ground.
- **Input bindings `capture()` cancellation** — accepts an optional `AbortSignal` for external cancellation; cleans up the polling interval on abort or completion.
- **Store `extendStore()` HMR** — a different slice now correctly re-registers its actions after hot-module replacement.

### Changed

- **`defineGame` type inference** — infers `TPlayer` from `turns.order` via `const` type parameter, narrowing `ctx.currentPlayer` to the literal player ids (e.g., `'X' | 'O'` instead of `string | number`). Removes 3 casts from both the tic-tac-toe and connect-four templates. No breaking changes: callers without `turns` or with explicit `<State>` generic retain today's wider types.
- **Template** — `tic-tac-toe` showcasing `defineGame` with canvas-only UI.
- **Template** — connect-four second declarative showcase, stress-tests the defineGame API on a 7x6 grid game with gravity + 4-in-a-row detection.

## [0.1.0] - 2026-04-16

Initial public release. A browser-based engine for building ASCII-art games, supporting both real-time and turn-based gameplay.

### Added

- **Rendering** — canvas ASCII renderer built on [Pretext](https://github.com/chenglou/pretext) for pixel-perfect font metrics; camera with shake and follow; layered draw order; tweens, frame animation, floating text, and screen transitions; image rendering alongside text.
- **ECS** — [miniplex](https://github.com/hmans/miniplex) world with a system runner, per-system phase gating, and state-machine support. Built-in systems for physics, parenting, tweens, animation, lifetime, and screen bounds.
- **Input** — keyboard, mouse, and gamepad handling with `held` / `pressed` / `released` queries; touch and virtual on-screen controls; configurable bindings.
- **Physics** — velocity / acceleration integration, gravity, friction, drag, bounce, max-speed clamping; circle and rect colliders with `overlaps` / `overlapAll` helpers; spatial hash for broad-phase queries.
- **Audio** — procedural SFX via [ZzFX](https://github.com/KilledByAPixel/ZzFX) (`shoot`, `hit`, `explode`, `pickup`, `menu`, `death`); background music loop with volume control and mute.
- **Behaviors** — reusable behavior helpers layered on top of ECS for common gameplay patterns.
- **Networking** — scaffolding for multiplayer / net-sync under `engine/net/`.
- **Storage** — save slots and game-state persistence under `engine/storage/`.
- **Tiles** — tilemap rendering and pathfinding support for grid-based games.
- **Turn management** — opt-in phase-based turn system (`engine.turns`); systems declare a `phase` to run only in that phase; real-time systems are unaffected.
- **Utilities** — `rng` / `rngInt` / `pick` / `chance`, `clamp` / `lerp` / `vec2` / `dist`, `Cooldown`, dungeon generation, noise, asset preloader, and scene helpers (`after`, `every`, `spawnEvery`).
- **Dev tooling** — `bun dev` auto-detects missing `game/` and launches a template picker; scaffolding scripts (`new:scene`, `new:system`, `new:entity`); single-file HTML export (`bun run export`); debug overlays; Biome lint, TypeScript check, `bun test`, and bench runner.
- **Templates** — `blank`, `asteroid-field`, `platformer`, `roguelike` shipped under `games/` as source-of-truth starters.
- **CLI** — `npx create-ascii-game <name>` scaffolder with optional `--template` flag.
- **Docs** — comprehensive README, project guide, quickstart, tutorial, cookbook, performance notes, generated API reference.

[Unreleased]: https://github.com/leCheeseRoyale/ascii-games/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/leCheeseRoyale/ascii-games/releases/tag/v0.1.0
