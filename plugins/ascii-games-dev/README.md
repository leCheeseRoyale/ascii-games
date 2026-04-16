# ascii-games-dev

A Claude Code plugin for building games with the ascii-games engine. Ships in-repo at `plugins/ascii-games-dev/` so it co-evolves with the engine.

## What's inside

| Component | Kind | Invocation |
|---|---|---|
| `ascii-games-dev` | Auto-loaded skill | Loads whenever Claude is working in this repo or on code that imports `@engine`. Carries the decision matrix, the 6 don'ts, and an anchor to `docs/API-generated.md`. |
| `ascii-games-dev:new-game` | User-invoked | `/ascii-games-dev:new-game "space shooter with waves and upgrades"` — scaffolds scenes + systems + entities + UI + save. |
| `ascii-games-dev:mechanic` | User-invoked | `/ascii-games-dev:mechanic "enemy that patrols then charges when player is near"` — composes entity factory + state machine + damage + feedback. |
| `ascii-games-dev:juice` | User-invoked | `/ascii-games-dev:juice <file:line \| event>` — layers particles + camera shake + floating text + sfx in the right combo. |
| `ascii-games-dev:multiplayer` | User-invoked | `/ascii-games-dev:multiplayer turnbased\|realtime` — scaffolds GameServer binary + adapter + (TurnSync or raw) + desync checksum + session resume. |
| `ascii-games-dev:persist` | User-invoked | `/ascii-games-dev:persist single\|slots\|export` — wires save/load with a versioned migration stub. |
| `ecs-reviewer` | Reactive agent | Scans engine/ or game/ edits for the 6 common ECS footguns and reports findings with fix suggestions. |

## Install

Recommended: run `/plugin` inside Claude Code and install from a local path pointing at `plugins/ascii-games-dev/` in this repo. Alternatively, add the repo as a marketplace and install via the marketplace browser.

Once installed, the root skill auto-loads when you work on anything importing `@engine`, and the task skills are available as `/ascii-games-dev:<skill>`.

## Authoritative references (skills anchor here)

- `docs/API-generated.md` — auto-regenerated via `bun run gen:api`. Every public `@engine` export. **Source of truth.**
- `docs/PROJECT-GUIDE.md` — architecture, boundaries, gotchas.
- `docs/COOKBOOK.md` — recipes.
- `games/roguelike/`, `games/asteroid-field/` — idiomatic references.

## Philosophy

- Skills read authoritative docs at invocation time instead of embedding API lists that drift.
- Every skill cites actual source files (`engine/...`) so Claude can grep further.
- The root skill carries shared knowledge so task skills stay lean.
- Composition over re-implementation: skills wire together existing engine APIs, never invent new ones.
