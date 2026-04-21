---
title: Scaffolding Tools
created: 2026-04-07
updated: 2026-04-21
type: guide
tags: [scaffolding, bun, tools, vite, typescript]
sources: [scripts/, package.json, vite.config.ts]
---

# Scaffolding Tools

Bun scripts that generate boilerplate files for scenes, systems, entities, and full game templates.

## Available Scripts

| Command               | What it creates                        |
|-----------------------|----------------------------------------|
| `bun run new:scene`   | A new scene file with defineScene      |
| `bun run new:system`  | A new system file with defineSystem    |
| `bun run new:entity`  | A new entity factory file              |
| `bun run init:game`   | Copies a full example game             |

## new:scene

```bash
bun run new:scene my-scene
```

Creates `game/scenes/my-scene.ts` with a defineScene template:

```ts
import { defineScene } from '@/engine/scene'

export const myScene = defineScene({
  name: 'my-scene',
  systems: [],
  setup(engine) {
    // Called when scene loads
  },
  teardown(engine) {
    // Called when scene unloads
  },
})
```

## new:system

```bash
bun run new:system my-system
```

Creates `game/systems/my-system.ts` with a defineSystem template:

```ts
import { defineSystem } from '@/engine/system'

export const mySystem = defineSystem({
  name: 'my-system',
  update(engine, dt) {
    // Called every frame
  },
})
```

## new:entity

```bash
bun run new:entity my-entity
```

Creates `game/entities/my-entity.ts` with a factory template:

```ts
import type { Entity } from '@/engine/ecs'

export function createMyEntity(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    ascii: {
      char: '?',
      color: 'white',
    },
  }
}
```

## init:game

```bash
bun run init:game asteroid-field
bun run init:game blank
bun run init:game platformer
bun run init:game roguelike
bun run init:game physics-text
bun run init:game tic-tac-toe
bun run init:game connect-four
```

Copies a complete game template from the examples directory:

- **blank** — Empty game with one scene and no systems. Starting point for a new project.
- **asteroid-field** — The full asteroid field game with 3 scenes, 5 systems, 3 entities, and config.
- **platformer** — Side-scrolling platformer with gravity, jumping, and collectibles.
- **roguelike** — Turn-based dungeon crawler with FOV, phases, and combat.
- **physics-text** — Physics-driven ASCII art that reacts to your cursor. Showcases `spawnText`, `spawnInteractiveArt`, spring physics, and cursor repel.
- **tic-tac-toe** — Two-player local tic-tac-toe built with [[define-game]]. Canvas-only UI.
- **connect-four** — Two-player local Connect Four built with [[define-game]]. Canvas-only UI.

Files are copied into `game/` and ready to run.

## AI Scaffolding Commands

These commands use an LLM (requires `ANTHROPIC_API_KEY`) to generate game code from natural language descriptions:

| Command | What it generates |
|---------|-------------------|
| `bun run ai:game "<pitch>"` | A complete `defineGame` module from a one-line game pitch |
| `bun run ai:sprite "<prompt>"` | A sprite factory function from a visual description |
| `bun run ai:mechanic "<desc>"` | A behavior system (e.g. "enemies patrol waypoints") |
| `bun run ai:juice "<event>"` | A juice/feedback helper for a game event (e.g. "player takes damage") |

Example:

```bash
bun run ai:game "memory card matching game for 2 players"
bun run ai:sprite "a dragon facing right, 5 lines tall"
bun run ai:mechanic "enemies chase the nearest player within 100px"
bun run ai:juice "coin collected — screen flash and burst particles"
```

Generated code follows engine conventions and can be used directly or as a starting point for customization. The `ai:game` command produces a [[define-game]] module suitable for turn-based and board games.

## How They Work

All scripts follow the same pattern:

1. Read `process.argv` for the name argument
2. Convert kebab-case to camelCase/PascalCase as needed
3. Build file content using template literals
4. Write using `Bun.write(path, content)`
5. Log the created file path

```ts
// Simplified example from new-system.ts
const name = process.argv[2]
if (!name) {
  console.error('Usage: bun run new:system <name>')
  process.exit(1)
}

const camel = kebabToCamel(name)
const content = `import { defineSystem } from '@/engine/system'

export const ${camel}System = defineSystem({
  name: '${name}',
  update(engine, dt) {
    //
  },
})
`

await Bun.write(`game/systems/${name}.ts`, content)
console.log(`Created game/systems/${name}.ts`)
```

No dependencies beyond Bun's built-in file API. No AST manipulation. Just string templates.

## Build and Export

| Command | Description |
|---------|-------------|
| `bun dev` | Smart dev server -- auto-runs template picker if `game/` missing, then starts Vite with HMR |
| `bun dev:fast` | Vite directly, no template check |
| `bun run build` | Production build to `dist/` (Vite, `esnext` target) |
| `bun run export` | Build + inline JS/CSS into single `dist/game.html` (no server needed) |
| `bun run gen:api` | Regenerate `docs/API-generated.md` from TypeScript declarations |

The project uses Vite 6 with the React plugin. Path aliases (`@engine`, `@game`, `@ui`, `@shared`) are configured in both `tsconfig.json` and `vite.config.ts`.

## Quality and CI Commands

| Command | Description |
|---------|-------------|
| `bun run check` | `tsc --noEmit` -- type errors, missing imports |
| `bun run check:bounds` | Import boundary enforcement across four layers |
| `bun run check:all` | `check` + `check:bounds` + `lint` chained |
| `bun run lint` / `lint:fix` | Biome linter and auto-fix |
| `bun run knip` | Detect unused deps, exports, and files |
| `bun test` | Full suite (1200+ tests). See [[testing]] |
| `bun run bench` | Performance benchmarks at 100/1000/5000 entities |

AI tools accept `--model=opus|sonnet|haiku`, `--out=<path>`, `--force`, and `--dry-run` flags. They require `ANTHROPIC_API_KEY` in `.env.local` or environment.

## See Also

- [[scene-lifecycle]] — What defineScene provides
- [[system-runner]] — What defineSystem provides
- [[entity-factory-pattern]] — The factory pattern these templates follow
- [[define-game]] — Declarative game API used by tic-tac-toe and connect-four templates
- [[testing]] — Test infrastructure and verification workflow
