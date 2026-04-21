---
title: Testing
created: 2026-04-21
updated: 2026-04-21
type: reference
tags: [tools, testing, bun, quality]
sources:
  - engine/__tests__/setup.ts
  - engine/__tests__/helpers.ts
---

# Testing

The project uses `bun:test` (Bun's built-in runner) with 1200+ tests across 63 files in `engine/__tests__/`. The test structure mirrors the engine source layout.

## Verification Workflow

```bash
bun run check:all    # tsc --noEmit + check:bounds + biome lint
bun test             # full suite (or: bun test <path>, bun test -t "<name>")
```

| Command | Catches |
|---------|---------|
| `bun run check` | Type errors, missing imports, interface mismatches |
| `bun run check:bounds` | Cross-layer import violations (see [[engine-overview]]) |
| `bun run lint` | Unused imports, style violations (Biome) |
| `bun test` | Logic errors, regressions, behavioral correctness |

**Not verifiable headlessly:** visual rendering, UI layout, audio playback, input feel. Tests cover data flowing into the renderer but not pixel-level output. State this limitation when changes touch render or UI code.

## Test Infrastructure

### Global Setup (`setup.ts`)

Preloaded for every test file. Provides:

1. **localStorage stub** -- in-memory `Map<string, string>` implementing `Storage`, cleared via `beforeEach`
2. **AudioContext stub** -- prevents zzfx crashes, audio is a no-op
3. **window stub** -- `addEventListener`, `removeEventListener`, `devicePixelRatio`, dimensions

### Shared Helpers (`helpers.ts`)

`mockEngine(opts?)` creates a lightweight engine stub for system tests with a real miniplex world, `spawn`/`destroy` wrappers, and stubbed turns/systems/debug.

### Template Smoke Tests (`templates/_engine.ts`)

`mockTemplateEngine` provides a comprehensive engine stub covering keyboard, mouse, particles, UI, dialog, camera, timers, scenes, and system runner. Allows booting real game templates and ticking 60+ frames without a DOM.

## Test Directory Structure

```
engine/__tests__/
  setup.ts              # Global preload
  helpers.ts            # mockEngine factory
  behaviors/            # Achievements, loot, crafting, currency, dialog, inventory
  core/                 # defineGame, scenes, turn manager, multiplayer
  ecs/                  # Systems, priorities, lifetime, state machines, pools
  input/                # Bindings, gamepad, touch
  net/                  # Socket adapter, game server, room listing
  physics/              # Collision, spatial hash
  render/               # Text layout, styled text, camera, transitions
  storage/              # Save/load, save slots
  templates/            # Smoke tests for each game template
  utils/                # Pathfinding, scheduler, grid, math, noise, dungeon
```

## Key Testing Patterns

- **Scene lifecycle tests** verify setup/cleanup/transition sequences via `SceneManager`
- **defineGame tests** use a `stubEngine` with real `SystemRunner`, `SceneManager`, and `TurnManager` to test moves, turn rotation, phase transitions, and game-over
- **System priority tests** verify execution order and phase gating
- **Behavior tests** exercise each module in isolation (achievements, inventory, crafting, etc.)
- **Template smoke tests** boot each game template, load scenes, and tick multiple frames

## Additional Quality Tools

| Tool | Command | Purpose |
|------|---------|---------|
| Biome | `bun run lint` / `bun run lint:fix` | Linting and formatting |
| Knip | `bun run knip` | Detect unused deps, exports, and files |
| Benchmarks | `bun run bench` | Performance regression detection at 100/1000/5000 entities |

See [[scaffolding-tools]] for the full CLI command reference and [[engine-overview]] for the architecture these tests verify.
