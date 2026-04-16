# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
