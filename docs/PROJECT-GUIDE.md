# Project Guide

Where everything lives and what to read first.

## Directory Map

```
engine/       Framework code — reusable systems, rendering, input, physics
  core/       Engine, GameLoop, SceneManager, TurnManager, defineGame, defineScene
  ecs/        World, systems runner, built-in systems (physics, tween, animation, etc.)
  render/     Canvas renderer, UI primitives, text layout, debug overlay, particles
  input/      Keyboard, Mouse, Touch, Gamepad
  behaviors/  Inventory, equipment, stats, currency, damage, AI, quests, achievements
  data/       Art assets, sprite sheets
  physics/    Physics system, spatial hash
  net/        Multiplayer adapters, turn sync, game server
  utils/      Scheduler, cooldowns, math helpers, save/load

game/         Your game code (gitignored, created from games/<template>/)
  scenes/     defineScene modules
  systems/    defineSystem modules
  entities/   Entity factory functions
  helpers/    Juice / feedback helpers

games/        Source-of-truth templates (edit THESE to change init:game output)
  blank/      Minimal ECS starter
  asteroid-field/  Real-time shooter
  platformer/ Side-scroller with gravity
  roguelike/  Turn-based dungeon crawler
  tic-tac-toe/     Board game (defineGame)
  connect-four/    Grid strategy (defineGame)
  physics-text/    Interactive ASCII art

ui/           React overlay (optional — games can be canvas-only)
  screens/    Full-screen UI states (menu, game-over)
  hud/        Heads-up display components
  store.ts    Zustand store (bridge between engine and React)

shared/       Types, constants, events
  types.ts    Entity component interfaces, EngineConfig, game types
  constants.ts Global constants
  events.ts   Event bus

docs/         Human-facing documentation
  QUICKSTART.md    15-minute onboarding
  TUTORIAL.md      Full guided build
  COOKBOOK.md      Copy-paste recipes
  WIRING.md        How to wire setupGame
  API-generated.md Auto-generated API reference
  AI-WORKFLOWS.md  AI-assisted scaffolding guide

wiki/         Engine internals (45 pages)
  _index.md        Table of contents
  pages/           Deep-dive articles on architecture, systems, components

scripts/      Dev tooling
  init-game.ts     Copy template → game/
  new-scene.ts     Scaffold a scene
  new-system.ts    Scaffold a system
  new-entity.ts    Scaffold an entity factory
  ai-*.ts          AI-assisted generators
  check-boundaries.ts  Import boundary enforcement
  gen-api.ts       Regenerate API-generated.md

plugins/ascii-games-dev/
  skills/          Skill files for AI scripts
  agents/          Agent prompts for review tasks
```

## Key Docs by Goal

| Goal | Start here |
|---|---|
| Make my first game | `docs/QUICKSTART.md` |
| Build a complete game step by step | `docs/TUTORIAL.md` |
| Understand the engine architecture | `wiki/_index.md` |
| AI agent cheat sheet | `AGENTS.md` |
| API reference | `docs/API-generated.md` |
| AI-assisted scaffolding | `docs/AI-WORKFLOWS.md` |

## Boundaries

- `engine/` never imports `game/` or `ui/*`
- `game/` imports `@engine`, `@shared`, and `@ui/store` only
- `ui/` imports `@engine`, `@shared`, `@ui/*`, and `game/index`
- Enforced by `bun run check:bounds`
