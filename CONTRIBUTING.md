# Contributing

Thanks for your interest. This is a terse reference — for deep architecture, read [`docs/PROJECT-GUIDE.md`](docs/PROJECT-GUIDE.md). For the LLM-agent ruleset, read [`CLAUDE.md`](CLAUDE.md).

## Prerequisites

- [Node.js](https://nodejs.org) (for `npx`)
- [Bun](https://bun.sh) — runtime, package manager, test runner

## Setup

```bash
git clone https://github.com/leCheeseRoyale/ascii-games
cd ascii-games
bun install
bun dev
```

First `bun dev` shows a template picker if `game/` is missing. Pick one and hit Enter.

## Verification Gate

Before opening a PR, all three must pass:

```bash
bun run check    # TypeScript type-check
bun test         # Unit tests
bun run lint     # Biome linter
```

## Running Single Tests

```bash
bun test engine/__tests__/ecs.test.ts       # By path
bun test -t "spawns entity with components"  # By name
```

## Project Layout

- `engine/` — framework source (rendering, ECS, input, physics, audio, behaviors, net, storage, tiles, utils). Changes here affect every game.
- `games/` — source-of-truth templates (`blank`, `asteroid-field`, `platformer`, `roguelike`). These ship with the engine.
- `game/` — user's active game code. **Gitignored**, derived from `games/<template>/` via `bun run init:game`.
- `ui/` — React overlay (HUD, menus) wired to the engine via the zustand store.
- `shared/` — types, constants, events shared across layers.
- `packages/create-ascii-game/` — the `npx create-ascii-game` CLI.
- `scripts/` — dev and scaffolding scripts.

## Scaffolding

```bash
bun run new:scene <name>    # game/scenes/<name>.ts
bun run new:system <name>   # game/systems/<name>.ts
bun run new:entity <name>   # game/entities/<name>.ts
```

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/) prefixes. Match the style in `git log --oneline`:

- `feat:` — new functionality
- `fix:` — bug fix
- `docs:` — docs-only change
- `chore:` — tooling, config, non-code maintenance

Example:

```
feat: add turn management, tilemaps, pathfinding, interaction, and create-ascii-game CLI
```

Keep the first line concise. Use the body for rationale when non-obvious.

## Warnings

- **Do not edit [`docs/API-generated.md`](docs/API-generated.md)** — it is regenerated via `bun run gen:api`.
- **Do not edit `game/`** — it is gitignored and derived from `games/<template>/`. Edit the template in `games/` instead.
- Don't "improve" adjacent code, comments, or formatting that isn't part of your change — see [`CLAUDE.md`](CLAUDE.md) §3.

## Pull Requests

1. Fork and branch from `main`.
2. Keep changes surgical — every changed line should trace to the PR's stated goal.
3. Run the verification gate locally.
4. Describe what changed and why in the PR body.
