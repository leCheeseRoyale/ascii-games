# Flexibility Overhaul — Parallel Execution Plan

## Goal
Make the engine support any game genre without editing engine/shared/ui code.

## Three parallel workstreams

| Agent | Scope | Key files touched |
|-------|-------|-------------------|
| [A: Entity Extensibility](./A-entity-extensibility.md) | Custom components without editing shared/types.ts | `shared/types.ts`, `engine/ecs/world.ts`, `engine/core/engine.ts`, `engine/index.ts` |
| [B: UI Flexibility](./B-ui-flexibility.md) | Game-defined store, screens, and HUD | `ui/store.ts`, `ui/App.tsx`, `ui/GameCanvas.tsx`, `ui/screens/`, `ui/hud/` |
| [C: Game Structure](./C-game-structure.md) | Multi-game support, game config, templates | `scripts/`, `game/`, new `games/` directory |

## Dependency graph

```
A (Entity) ──────┐
                  ├──> After all 3: update CLAUDE.md, docs, and templates
B (UI) ──────────┤
                  │
C (Game Structure)┘
```

A, B, and C are independent — they touch different files. After all three merge, a follow-up pass updates documentation and ensures templates use the new patterns.

## Shared contract (all agents must respect)

1. `engine/` must NEVER import from `game/` or `ui/` (except ui/store.ts from game code)
2. `game/` code must work identically to today — no breaking changes to the existing asteroid-field game
3. All new APIs must be optional — existing patterns still compile and run
