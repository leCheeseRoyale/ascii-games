# Documentation Index

## Start Here

- **[QUICKSTART.md](QUICKSTART.md)** -- Zero to playable in 15 minutes. Install, run, make your first change.
- **[TUTORIAL.md](TUTORIAL.md)** -- Build a complete game step by step: entities, systems, scenes, collisions, scoring, polish.
- **[WIRING.md](WIRING.md)** -- How to connect a new game. Step-by-step for both `defineGame` and `defineScene` APIs.

## API Reference

- **[API-generated.md](API-generated.md)** -- Auto-generated from TypeScript declarations. Full export surface. (Regenerate with `bun run gen:api`; do not hand-edit.)
- **[../AGENTS.md](../AGENTS.md)** -- Terse API cheat sheet organized for AI agents.

## Recipes & Patterns

- **[COOKBOOK.md](COOKBOOK.md)** -- Recipe index linking to topic files in [`cookbook/`](cookbook/).
- **[WIRING.md](WIRING.md)** -- Step-by-step wiring for `defineGame` and `defineScene` games.
- **[AI-WORKFLOWS.md](AI-WORKFLOWS.md)** -- AI-assisted scaffolding: `ai:sprite`, `ai:mechanic`, `ai:juice`, `ai:game`.

## For AI Agents

AI coding assistants should read these files at the repo root:

- **[../CLAUDE.md](../CLAUDE.md)** -- Project instructions, architecture, critical gotchas, verification loop.
- **[../AGENTS.md](../AGENTS.md)** -- Compact API cheat sheet with commands, ECS rules, and common patterns.

Both files are designed to give agents enough context to work safely without reading every doc.

---

For engine internals and architecture, see the [wiki](../wiki/_index.md). For AI agent context, see [CLAUDE.md](../CLAUDE.md) and [AGENTS.md](../AGENTS.md).
