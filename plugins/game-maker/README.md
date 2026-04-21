# game-maker

A Claude Code plugin for game creators using the ascii-games engine. Provides goal-oriented guidance with copy-paste patterns -- ask "how do I make X" and get working code for `game/`.

## What's inside

| Skill | Invocation | What it does |
|---|---|---|
| `game-maker` | Auto-loaded | Router skill: detects what you're building and points you to the right sub-skill. |
| `player-controls` | `/game-maker:player-controls` | WASD, platformer jumping, grid movement, click-to-move, shooting, gamepad. |
| `enemies-and-npcs` | `/game-maker:enemies-and-npcs` | Patrol routes, chasing, fleeing, wave spawning, boss patterns, NPC dialog. |
| `combat-system` | `/game-maker:combat-system` | Health, damage, death, respawning, i-frames, loot drops, XP, leveling. |
| `world-building` | `/game-maker:world-building` | Tilemaps, procedural dungeons, camera follow, scene transitions, multiple levels. |
| `game-ui` | `/game-maker:game-ui` | Menus, title screens, HUD, health bars, pause screen, dialog boxes, settings. |
| `game-feel` | `/game-maker:game-feel` | Screen shake, particles, sound effects, slow motion, trails, floating text. |
| `board-game` | `/game-maker:board-game` | `defineGame` API: state design, moves, turns, phases, win conditions, hotseat. |
| `progression` | `/game-maker:progression` | Save/load, high scores, save slots, auto-save, HTML export. |
| `sprite-art` | `/game-maker:sprite-art` | ASCII art, multi-frame animation, color maps, art assets, interactive physics text. |

## How it differs from ascii-games-dev

- **game-maker** is for game creators. It answers "how do I make enemies chase the player?" with ready-to-paste `game/` code. It never touches `engine/`.
- **ascii-games-dev** is for engine developers. It scaffolds full projects, adds multiplayer/persistence wiring, and includes an ECS reviewer agent that checks for engine-level footguns.

Use both together: `game-maker` for gameplay features, `ascii-games-dev` for project scaffolding and engine-level concerns.

## Install

Run `/install-plugin` inside Claude Code and point it at the local path `plugins/game-maker/` in this repo. Once installed, the root skill auto-loads when you work on game code (files under `game/` or `games/` that import `@engine`), and sub-skills are available as `/game-maker:<skill>`.

## Authoritative references (skills anchor here)

- `docs/API-generated.md` -- auto-regenerated via `bun run gen:api`. Source of truth for engine API.
- `docs/COOKBOOK.md` -- patterns and recipes.
- `games/` -- working reference games (templates) to study and mimic.
