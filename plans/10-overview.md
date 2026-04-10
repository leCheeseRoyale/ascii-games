# Engine Improvements — Parallel Execution Plan

## Goal
Make the engine significantly easier to use out of the box by adding convenience APIs, built-in systems, audio, persistence, debug tools, and more templates.

## Six parallel workstreams + integration

| Agent | Scope | Key files |
|-------|-------|-----------|
| [A: Engine Convenience API](./A2-engine-convenience.md) | Helper methods on Engine class | `engine/core/engine.ts` |
| [B: Built-in Gameplay Systems](./B2-builtin-systems.md) | Lifetime, screen bounds, off-screen cleanup | New files in `engine/ecs/`, additions to `shared/types.ts` |
| [C: Audio Expansion](./C2-audio.md) | Music, custom SFX, volume, mute | `engine/audio/` |
| [D: Save & Persistence](./D2-persistence.md) | Save/load, persistent high scores | New `engine/storage/` directory |
| [E: Debug & Visual Polish](./E2-debug-polish.md) | Collider outlines, entity inspector, toast system | `engine/render/debug.ts` (new), `engine/render/toast.ts` (new) |
| [F: Templates & Constants](./F2-templates.md) | Platformer template, color palettes, export script | `scripts/`, `games/`, `shared/constants.ts` |

## After all 6: [Integration](./Z-integration.md)
Wire all new modules into `engine/core/engine.ts` (loadScene, constructor), `engine/index.ts` (re-exports), and update CLAUDE.md + tutorial.

## Dependency graph

```
A (Convenience) ──┐
B (Systems)    ──┤
C (Audio)      ──┤
D (Persistence)──┼──> Z (Integration) ──> Update docs
E (Debug)      ──┤
F (Templates)  ──┘
```

All 6 agents run in parallel. They create new files or modify ONLY their designated files. None of them touch `engine/index.ts` or the auto-registration block in `engine/core/engine.ts:loadScene` — that's reserved for the integration step.

## File ownership rules

| File | Owner | Others must NOT touch |
|------|-------|-----------------------|
| `engine/core/engine.ts` | Agent A (methods only, NOT loadScene or constructor) | B, C, D, E, F |
| `engine/ecs/*.ts` (new files) | Agent B | A, C, D, E, F |
| `shared/types.ts` | Agent B (new component interfaces) | A, C, D, E, F |
| `engine/audio/` | Agent C | A, B, D, E, F |
| `engine/storage/` (new) | Agent D | A, B, C, E, F |
| `engine/render/debug.ts` (new) | Agent E | A, B, C, D, F |
| `engine/render/toast.ts` (new) | Agent E | A, B, C, D, F |
| `shared/constants.ts` | Agent F | A, B, C, D, E |
| `scripts/`, `games/` | Agent F | A, B, C, D, E |
| `engine/index.ts` | Z (Integration) | A, B, C, D, E, F |
