# Tooling and Maintenance Guide

Operations manual for the ASCII game engine project. Covers every build script, configuration file, dependency, and maintenance workflow.

---

## Project Structure

### Directory tree

```
ascii-games/
  .github/workflows/       CI (ci.yml) and release (release.yml) pipelines
  docs/                    Project documentation
    guides/                Topic guides (this file lives here)
    API-generated.md       Auto-generated API reference (do not hand-edit)
    COOKBOOK.md             Patterns and recipes
    PERF.md                Benchmark baselines and analysis
    PROJECT-GUIDE.md       Full architecture deep dive
    QUICKSTART.md          Hands-on quickstart
    RELEASE.md             Release process
    TODO.md                Roadmap and backlog
    TUTORIAL.md            Step-by-step tutorial
    WIRING.md              Wiring guide for defineGame and defineScene
  engine/                  Reusable framework library
    __bench__/             Performance benchmarks (bun run bench)
    __tests__/             Test suite (1140+ tests)
    audio/                 Sound effects (zzfx) and music
    behaviors/             Reusable game logic (inventory, crafting, AI, etc.)
    core/                  Engine, scenes, defineGame, turn manager
    data/                  Sprite library and ASCII art utilities
    ecs/                   Entity-component-system: world, systems, pools
    input/                 Keyboard, mouse, gamepad, touch
    net/                   Networking: adapters, turn sync, game server
    package.json           Engine-specific package metadata
    physics/               Collision detection, physics system, spatial hash
    render/                ASCII renderer, camera, canvas UI, text layout
    storage/               Save/load, save slots, serialization
    tiles/                 Tilemap creation and queries
    utils/                 Math, pathfinding, dungeon gen, color, noise, timers
    index.ts               Public API barrel export (every public symbol)
  game/                    Per-project working copy (GITIGNORED)
  games/                   Source-of-truth templates
    asteroid-field/        Real-time ECS: physics, shooting, waves
    blank/                 Minimal starting point
    connect-four/          defineGame: grid strategy, 2-player
    platformer/            ECS: gravity, jumping, platforms
    roguelike/             ECS: turn phases, FOV, BSP dungeon, save/load
    tic-tac-toe/           defineGame: board game, 2-player
  plugins/                 Claude Code plugin (skills, agents)
  scripts/                 All CLI tooling scripts
  shared/                  Cross-layer types, constants, events
    constants.ts           COLORS, FONTS, PALETTES
    events.ts              Typed event catalog
    types.ts               Entity type and every component shape
  src/                     Vite entry point
    main.tsx               React root mount
    styles.css             Global styles
  ui/                      React overlay layer
    App.tsx                Root React component
    GameCanvas.tsx         Canvas element wrapper
    store.ts               Zustand store (only bridge between engine and UI)
    screen-registry.ts     Screen component registry
    defaults.tsx           Default screen registrations
    hud/                   HUD components
    screens/               Menu, playing, game-over screens
    shared/                Shared UI utilities
  AGENTS.md                Agent quick-reference
  CLAUDE.md                Project instructions for AI agents
  biome.json               Linter/formatter configuration
  index.html               Vite HTML entry point
  knip.json                Dead code detection configuration
  package.json             Root package: scripts, dependencies
  tsconfig.json            TypeScript configuration
  vite.config.ts           Vite build configuration
  vite-env.d.ts            Vite + zzfx type declarations
```

### The four layers

The codebase enforces a strict four-layer architecture:

| Layer | Directory | Purpose |
|---|---|---|
| **engine** | `engine/` | Reusable framework. Never contains game-specific logic. |
| **game** | `game/` (gitignored), `games/` (templates) | Per-project game code. `game/` is a working copy derived from a template in `games/`. |
| **ui** | `ui/` | React overlay. The zustand store (`ui/store.ts`) is the only bridge to the engine/game layer. |
| **shared** | `shared/` | Types, constants, events. Zero dependencies on other layers. |

### Path aliases

Four path aliases provide clean imports and enable boundary enforcement. They are configured in two places that must stay in sync:

**tsconfig.json** (TypeScript resolution):

```json
{
  "compilerOptions": {
    "paths": {
      "@engine/*": ["./engine/*"],
      "@engine": ["./engine/index.ts"],
      "@game/*": ["./game/*"],
      "@ui/*": ["./ui/*"],
      "@shared/*": ["./shared/*"]
    }
  }
}
```

**vite.config.ts** (Vite bundler resolution):

```ts
resolve: {
  alias: {
    '@engine': resolve(__dirname, 'engine'),
    '@game': resolve(__dirname, 'game'),
    '@ui': resolve(__dirname, 'ui'),
    '@shared': resolve(__dirname, 'shared'),
  },
},
```

Usage in code:

```ts
import { Engine, defineScene } from '@engine'
import type { Entity } from '@shared/types'
import { useStore } from '@ui/store'
```

### What is gitignored and why

Key entries from `.gitignore`:

| Pattern | Reason |
|---|---|
| `game/` | Working copy created from templates via `bun run init:game`. Source of truth is `games/`. |
| `dist/`, `out/` | Build output. Regenerated by `bun run build` / `bun run export`. |
| `.api-tmp/` | Temporary directory used by `gen:api` for declaration emission. |
| `.env`, `.env.local` | Environment variables (API keys). Never committed. |
| `.claude/` | Claude Code local state. |
| `node_modules/` | Dependencies. Restored by `bun install`. |

---

## Build System

### Vite configuration

The project uses Vite 6 with the React plugin. Configuration in `vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@engine': resolve(__dirname, 'engine'),
      '@game': resolve(__dirname, 'game'),
      '@ui': resolve(__dirname, 'ui'),
      '@shared': resolve(__dirname, 'shared'),
    },
  },
  build: {
    target: 'esnext',
  },
})
```

The `esnext` build target means no transpilation of modern JS features. Path aliases are duplicated here from `tsconfig.json` because Vite resolves imports at bundle time independently of TypeScript.

The HTML entry point is `index.html` at project root, which loads `src/main.tsx` as a module script. Google Fonts (Fira Code, JetBrains Mono) are preconnected in the HTML head.

### bun dev -- dev server with template auto-detection

```bash
bun dev
```

Runs `scripts/dev.ts`, which:

1. Checks if `game/index.ts` exists.
2. If not, runs the interactive template picker (`scripts/init-game.ts`).
3. Starts the Vite dev server with HMR.

This means a fresh clone can run `bun dev` and immediately get a working game.

### bun dev:fast -- skip auto-detection

```bash
bun dev:fast
```

Runs `bunx vite` directly, skipping the template existence check. Use this when you know `game/` already exists and want a faster startup.

### bun run build -- production build

```bash
bun run build
```

Runs `bunx vite build`. Output goes to `dist/`. Target is `esnext`. Assets are hashed and placed in `dist/assets/`.

### bun run export -- single-file HTML

```bash
bun run export
```

Runs `scripts/export.ts`, which:

1. Executes `bun run build`.
2. Reads the built JS and CSS from `dist/assets/`.
3. Inlines both into a single self-contained HTML file.
4. Writes to `dist/game.html`.

The resulting file can be opened in any browser with no server required. Output size is reported in KB.

### Environment variables

The project reads environment variables from `.env.local` (not committed):

| Variable | Used by | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | `ai:game`, `ai:sprite`, `ai:mechanic`, `ai:juice` | Anthropic API authentication for AI-assisted code generation. |

The `scripts/ai-shared.ts` module handles loading: it parses `.env.local` with a simple `KEY=VALUE` parser, falls back to `process.env`, and throws a clear error with setup instructions if the key is missing.

---

## CLI Commands Reference

Every command from `package.json` scripts:

### Development

| Command | Implementation | Description |
|---|---|---|
| `bun dev` | `scripts/dev.ts` | Smart dev server. Auto-detects missing `game/` and runs template picker. Then starts Vite. |
| `bun dev:fast` | `bunx vite` | Vite dev server directly. Faster startup, no template check. |
| `bun run preview` | `bunx vite preview` | Preview production build locally. |

### Quality checks

| Command | Implementation | Description |
|---|---|---|
| `bun run check` | `bunx tsc --noEmit` | TypeScript type checking. No output files emitted. |
| `bun run check:bounds` | `scripts/check-boundaries.ts` | Import boundary enforcement across all four layers. |
| `bun run check:all` | `check && check:bounds && lint` | Full verification: typecheck + boundaries + lint. All three must pass. |
| `bun run lint` | `bunx biome check .` | Biome linter and formatter check. |
| `bun run lint:fix` | `bunx biome check --fix .` | Auto-fix lint and formatting issues. |
| `bun run knip` | `bunx knip` | Detect unused dependencies, exports, and files. |

### Testing

| Command | Description |
|---|---|
| `bun test` | Run the full test suite (1140+ tests in `engine/__tests__/`). |
| `bun test <path>` | Run a single test file. Example: `bun test engine/__tests__/physics.test.ts` |
| `bun test -t "<name>"` | Filter tests by name substring. |

Tests use `bun:test` (Bun's built-in test runner). No separate test framework dependency.

### Building

| Command | Implementation | Description |
|---|---|---|
| `bun run build` | `bunx vite build` | Production build to `dist/`. |
| `bun run export` | `scripts/export.ts` | Build + inline JS/CSS into single `dist/game.html`. |

### Scaffolding

| Command | Implementation | Creates |
|---|---|---|
| `bun run init:game [template]` | `scripts/init-game.ts` | Copies a template from `games/<template>/` to `game/`. Interactive picker if no argument. |
| `bun run new:scene <name>` | `scripts/new-scene.ts` | `game/scenes/<name>.ts` with `defineScene` boilerplate. |
| `bun run new:system <name>` | `scripts/new-system.ts` | `game/systems/<name>.ts` with `defineSystem` boilerplate. |
| `bun run new:entity <name>` | `scripts/new-entity.ts` | `game/entities/<name>.ts` with entity factory boilerplate. |
| `bun run list:games` | `scripts/list-games.ts` | Print available templates from `games/` with descriptions. |

All scaffold scripts accept a name argument in kebab-case (e.g., `boss-fight`). They auto-convert to camelCase for variable names and PascalCase for type names. They refuse to overwrite existing files.

Available templates for `init:game`:

| Template | Style | Description |
|---|---|---|
| `blank` | ECS + React HUD | Minimal starting point with title + play scene |
| `asteroid-field` | ECS + React HUD | Real-time action with physics, shooting, waves |
| `platformer` | ECS + React HUD | Gravity, jumping, platforms, collectibles |
| `roguelike` | ECS + canvas-only | Turn phases, FOV, BSP dungeon, pathfinding, save/load |
| `tic-tac-toe` | `defineGame` | Mouse-driven board game, 2-player |
| `connect-four` | `defineGame` | Grid strategy with gravity, 2-player |

### AI-assisted generation

All AI tools require `ANTHROPIC_API_KEY` in `.env.local` or environment.

| Command | Implementation | Creates |
|---|---|---|
| `bun run ai:game "<pitch>"` | `scripts/ai-game.ts` | `game/<slug>.ts` -- complete `defineGame` module from natural language |
| `bun run ai:sprite "<prompt>"` | `scripts/ai-sprite.ts` | `game/entities/<slug>.ts` -- ASCII sprite entity factory |
| `bun run ai:mechanic "<desc>"` | `scripts/ai-mechanic.ts` | `game/systems/<slug>.ts` -- gameplay system via `defineSystem` |
| `bun run ai:juice "<event>"` | `scripts/ai-juice.ts` | `game/helpers/<slug>.ts` -- particles + sfx + shake helper |

Common flags (all four tools):

| Flag | Description |
|---|---|
| `--model=opus\|sonnet\|haiku` | Claude model to use. Default: `sonnet`. |
| `--out=<path>` | Override output file path. |
| `--force` | Overwrite existing file (default: refuse). |
| `--dry-run` | Print prompts without calling the API. |

The AI tools share infrastructure in `scripts/ai-shared.ts`:

- **Model aliases**: `opus` maps to `claude-opus-4-7`, `sonnet` to `claude-sonnet-4-6`, `haiku` to `claude-haiku-4-5-20251001`.
- **Skill loading**: Each tool loads SKILL.md files from `plugins/ascii-games-dev/skills/` to provide engine context to the model.
- **Code extraction**: Responses are parsed for fenced code blocks. The output is validated (e.g., `ai:game` checks for both `defineGame` and `setupGame`).
- **Safe file writing**: Existing files are not overwritten without `--force`.

### Documentation generation

| Command | Implementation | Description |
|---|---|---|
| `bun run gen:api` | `scripts/gen-api.ts` | Regenerate `docs/API-generated.md` from TypeScript declarations. |

How it works:

1. Emits TypeScript declarations to `.api-tmp/` using `tsc --declaration --emitDeclarationOnly`.
2. Reads the engine barrel declaration (`engine/index.d.ts`).
3. Parses export lines and groups them by section comments.
4. Extracts component type definitions from `shared/types.d.ts`.
5. Writes the combined output to `docs/API-generated.md`.
6. Cleans up `.api-tmp/`.

### Benchmarking

| Command | Implementation | Description |
|---|---|---|
| `bun run bench` | `engine/__bench__/run.ts` | Run all performance benchmarks. |

The benchmark suite in `engine/__bench__/` includes:

| Bench file | Measures |
|---|---|
| `text-block-heavy.bench.ts` | Entities with `position + ascii` (single-char renderables) |
| `particle-heavy.bench.ts` | Entities with `position + velocity + ascii + lifetime` |
| `physics-heavy.bench.ts` | Entities with physics, gravity, drag, bounce, colliders |
| `styled-text-heavy.bench.ts` | Entities with `textBlock` and inline styled tags |

Each benchmark:

- Tests at 100, 1000, and 5000 entities.
- Runs 100 iterations with 10 warmup iterations.
- Reports median and p95 for both `tick` and `render`.
- Asserts generous regression gates (roughly 3x baseline) to catch order-of-magnitude slowdowns.

Infrastructure lives in `harness.ts` (creates a lightweight engine with stubbed canvas) and `setup.ts` (canvas stubs).

Baseline numbers are recorded in `docs/PERF.md`.

---

## Import Boundary System

### Rules

| Layer | May import | Must NOT import |
|---|---|---|
| `engine/` | `@shared`, `@engine` | `@game`, `@ui` |
| `game/`, `games/` | `@engine`, `@shared`, `@ui/store` | `@ui/*` (except `@ui/store`) |
| `ui/` | `@engine`, `@shared`, `@ui/*`, `@game/index` | `@game/*` (except `@game/index`) |
| `shared/` | (nothing from other layers) | `@engine`, `@game`, `@ui` |

Special cases:

- `game/` can import `@ui/store` but nothing else from `@ui/`.
- `ui/` can import `@game/index` (the single entry point) but nothing else from `@game/`.

### How check:bounds works

`scripts/check-boundaries.ts` walks every `.ts` and `.tsx` file in the four layer directories. For each file:

1. Determines which rule applies based on the file's relative path.
2. Scans every `import ... from '...'` statement using a regex.
3. Checks `@`-prefixed imports against the denied list first (denied overrides allowed).
4. If the rule has an explicit allowed list, verifies the import matches.
5. Collects violations with file path, line number, import path, and rule description.

The script exits with code 0 on clean, code 1 on violations. Output groups violations by rule for easy scanning.

Directories skipped: `node_modules`, `dist`, `.git`, `__bench__`, `packages`, `scripts`, `plugins`, `plans`, `wiki`.

### Common boundary violations and fixes

**Engine importing game code**:

```
engine/ must not import @game*
  engine/core/foo.ts:5 — import '@game/something'
```

Fix: Move the shared logic to `shared/` or make the engine accept it via dependency injection.

**Game importing UI components directly**:

```
game/ may only import @engine, @shared, @ui/store
  game/scenes/play.ts:3 — import '@ui/screens/GameOver'
```

Fix: Use the zustand store (`@ui/store`) as the bridge. Set state in game code, read it in UI.

**Shared importing engine**:

```
shared/ must not import @engine*
  shared/types.ts:2 — import '@engine/ecs/world'
```

Fix: The type or constant belongs in `shared/` with no engine dependency, or the import direction is reversed.

---

## Code Generation

### API documentation generation

```bash
bun run gen:api
```

Regenerates `docs/API-generated.md` from the actual TypeScript declarations emitted by `tsc`. The header warns:

```
> Generated from actual TypeScript declarations. Do not edit manually.
> Last generated: YYYY-MM-DD
```

When to regenerate:

- After adding, removing, or renaming any export in `engine/index.ts`.
- After changing type signatures in `shared/types.ts`.
- After modifying section comments in `engine/index.ts` (they become section headers).

### Scaffolding scripts

Each scaffold script generates a single file with appropriate boilerplate:

**`bun run new:scene <name>`** generates `game/scenes/<name>.ts`:

```ts
import { defineScene, FONTS, COLORS } from '@engine'
import type { Engine } from '@engine'
import { useStore } from '@ui/store'

export const <camelName>Scene = defineScene({
  name: '<kebab-name>',
  setup(engine: Engine) { /* ... */ },
  update(engine: Engine, dt: number) { /* ... */ },
  cleanup(engine: Engine) { /* ... */ },
})
```

**`bun run new:system <name>`** generates `game/systems/<name>.ts`:

```ts
import { defineSystem } from '@engine'
import type { Engine } from '@engine'

export const <camelName>System = defineSystem({
  name: '<kebab-name>',
  update(engine: Engine, dt: number) { /* ... */ },
})
```

**`bun run new:entity <name>`** generates `game/entities/<name>.ts`:

```ts
import type { Entity } from '@engine'
import { FONTS, COLORS } from '@engine'

export function create<PascalName>(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    ascii: { char: '?', font: FONTS.normal, color: COLORS.accent },
    collider: { type: 'circle', width: 16, height: 16 },
  }
}
```

### AI generation tools

All four AI tools follow the same pattern:

1. Parse positional arguments and flags from `process.argv`.
2. Slugify the prompt to derive a file name.
3. Load SKILL.md files from `plugins/ascii-games-dev/skills/` for engine context.
4. Build a system prompt (API reference + skill content + output rules) and a user prompt.
5. Call the Claude API via `scripts/ai-shared.ts`.
6. Extract the fenced code block from the response.
7. Validate the output (e.g., contains `defineGame`, contains `export function create`).
8. Write the file (refuse overwrite without `--force`).

The `--dry-run` flag prints the full system and user prompts without making an API call, which is useful for debugging prompt content.

---

## Dependency Management

### Key dependencies and their roles

**Runtime dependencies** (in `package.json` `dependencies`):

| Package | Version | Role |
|---|---|---|
| `@chenglou/pretext` | `^0.0.4` | Text measurement and layout engine. Powers all text rendering: line breaking, width calculation, shrinkwrap. |
| `miniplex` | `^2.0.0` | Entity-component-system. The `World<Entity>` that stores all game entities and supports archetype queries. |
| `zustand` | `^5.0.12` | Lightweight state management. The store at `ui/store.ts` bridges engine/game state to React UI. |
| `react` | `^19.1.0` | Overlay UI rendering. Screens (menu, playing, game-over) and HUD components. |
| `react-dom` | `^19.1.0` | React DOM renderer. |
| `mitt` | `^3.0.1` | Tiny event emitter. Powers the typed event bus at `shared/events.ts`. |
| `zzfx` | `^1.3.2` | Micro sound effect synthesizer. All `sfx.*()` calls use this. |
| `@anthropic-ai/sdk` | `^0.90.0` | Anthropic API client. Used only by AI generation scripts, not the engine runtime. |
| `@vitejs/plugin-react` | `^4.5.2` | Vite plugin for React JSX transform. |
| `vite` | `^6.3.1` | Build tool and dev server. |

**Dev dependencies** (in `package.json` `devDependencies`):

| Package | Version | Role |
|---|---|---|
| `@biomejs/biome` | `^2.4.10` | Linter and formatter. Replaces ESLint + Prettier. |
| `@types/react` | `^19.1.2` | TypeScript types for React. |
| `@types/react-dom` | `^19.2.3` | TypeScript types for ReactDOM. |
| `bun-types` | `^1.3.12` | TypeScript types for Bun runtime APIs. |
| `knip` | `^6.3.0` | Dead code detector. Finds unused deps, exports, files. |
| `typescript` | `^5.9.3` | TypeScript compiler (used for type checking only; Vite handles bundling). |

**Engine package** (`engine/package.json`) declares its own dependency set for future npm publishing:

- Direct dependencies: `@chenglou/pretext`, `miniplex`, `mitt`, `zustand`, `zzfx`
- Peer dependencies (optional): `react`, `react-dom`

### How to update dependencies safely

1. Run `bun update` to update all packages within their semver ranges.
2. For a major version bump, update the version in `package.json` manually, then run `bun install`.
3. After updating, run the full verification:

   ```bash
   bun run check:all && bun test
   ```

4. Pay special attention to:
   - **miniplex**: Query API changes could break entity iteration patterns across the codebase.
   - **@chenglou/pretext**: Text layout changes could affect rendering. Run `bun run bench` to check for regressions.
   - **zustand**: Store API changes affect the `ui/store.ts` bridge.
   - **biome**: New lint rules may surface new warnings/errors.

5. Run `bun run knip` after updates to check if any dependencies became unused.

### What knip catches

Knip (`bun run knip`) detects:

- **Unused dependencies**: Packages in `package.json` that no code imports.
- **Unused exports**: Functions, types, or constants exported but never imported elsewhere.
- **Unused files**: Source files that no entry point reaches.

Knip configuration in `knip.json`:

```json
{
  "entry": [
    "engine/index.ts",
    "games/*/index.ts",
    "scripts/*.ts",
    "engine/__bench__/*.bench.ts",
    "engine/__bench__/harness.ts",
    "engine/__bench__/setup.ts",
    "ui/GameCanvas.tsx",
    "ui/store.ts",
    "ui/screen-registry.ts"
  ],
  "project": [
    "engine/**/*.ts",
    "games/**/*.ts",
    "ui/**/*.tsx",
    "ui/**/*.ts",
    "shared/**/*.ts",
    "scripts/**/*.ts",
    "src/**/*.tsx"
  ],
  "ignore": ["games/*/game.config.ts"],
  "ignoreExportsUsedInFile": true,
  "rules": {
    "types": "warn",
    "exports": "warn",
    "files": "warn"
  }
}
```

Key decisions:

- `game.config.ts` files in templates are ignored (read dynamically by `init-game.ts`).
- `ignoreExportsUsedInFile: true` means an export used within its own file is not flagged.
- All rules are set to `warn` (not `error`) to avoid blocking CI on marginal findings.

---

## Configuration Files

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["bun-types"],
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "paths": {
      "@engine/*": ["./engine/*"],
      "@engine": ["./engine/index.ts"],
      "@game/*": ["./game/*"],
      "@ui/*": ["./ui/*"],
      "@shared/*": ["./shared/*"]
    }
  },
  "include": ["src", "engine", "game", "ui", "shared", "vite-env.d.ts"]
}
```

Key settings:

| Setting | Value | Why |
|---|---|---|
| `target` / `module` | `ESNext` | No downlevel transpilation. Vite handles bundling. |
| `moduleResolution` | `bundler` | Matches Vite's resolution algorithm (not Node's). |
| `jsx` | `react-jsx` | Automatic JSX runtime (no `import React` needed). |
| `strict` | `true` | Full strict mode: `strictNullChecks`, `noImplicitAny`, etc. |
| `noEmit` | `true` | TypeScript is used only for checking. Vite emits output. |
| `types` | `["bun-types"]` | Bun runtime API types (for scripts and tests). |
| `isolatedModules` | `true` | Required by Vite for correct tree-shaking. |
| `paths` | (see above) | Path aliases for the four layers. |
| `include` | `["src", "engine", "game", "ui", "shared", "vite-env.d.ts"]` | Only type-check project source. `scripts/` and `games/` are excluded (games are type-checked indirectly when copied to `game/`). |

Note: `vite-env.d.ts` declares the `zzfx` module and references Vite's client types.

### biome.json

```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.10/schema.json",
  "files": {
    "includes": ["engine/**", "game/**", "games/**", "ui/**", "shared/**", "src/**"]
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedImports": "error",
        "noUnusedVariables": "warn"
      },
      "suspicious": {
        "noDoubleEquals": "error",
        "noExplicitAny": "warn",
        "noAssignInExpressions": "warn"
      },
      "style": {
        "useConst": "error",
        "noNonNullAssertion": "warn"
      }
    }
  },
  "overrides": [
    {
      "includes": ["**/__tests__/**", "**/*.test.ts", "**/__bench__/**"],
      "linter": {
        "rules": {
          "suspicious": { "noExplicitAny": "off" },
          "style": { "noNonNullAssertion": "off" },
          "complexity": { "useLiteralKeys": "off" }
        }
      }
    }
  ],
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  }
}
```

Key rules:

| Rule | Level | Rationale |
|---|---|---|
| `noUnusedImports` | error | Dead imports add noise and break tree-shaking. |
| `noDoubleEquals` | error | Always use `===` / `!==`. |
| `useConst` | error | Prefer `const` over `let` when the binding is never reassigned. |
| `noExplicitAny` | warn | Discourages `any` but does not block (some ECS patterns need escape hatches). |
| `noNonNullAssertion` | warn | Discourages `!` but does not block. |

Test and benchmark files relax `noExplicitAny`, `noNonNullAssertion`, and `useLiteralKeys` because test code legitimately needs these patterns.

Formatter: 2-space indentation, 100-character line width.

### knip.json

See the [Dependency Management](#what-knip-catches) section above for the full configuration and explanation.

### vite.config.ts

See the [Build System](#vite-configuration) section above for the full configuration.

---

## CI/CD

### ci.yml -- continuous integration

Runs on every push to `main` and every pull request:

```yaml
jobs:
  smoke-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - uses: actions/cache@v4  # Cache ~/.bun/install/cache
      - run: bun install --frozen-lockfile
      - run: bun run init:game blank  # game/ is gitignored, need a template to check
      - run: bun run check
      - run: bun run test
      - run: bun run lint
      - run: bun run knip
      - run: bun run build
      - run: bun run export
```

Because `game/` is gitignored, CI initializes with the `blank` template before running checks. This ensures the type checker has a valid `game/` directory to resolve `@game` imports against.

### release.yml -- publishing

Triggered by pushing a `v*` tag:

1. Runs the full gate (check + test + lint + build + export).
2. Publishes `packages/create-ascii-game` to npm with provenance.
3. Creates a GitHub Release from the tag with changelog body.

Required secret: `NPM_TOKEN` (npm automation token with publish rights).

---

## Maintenance Workflows

### 1. Adding a new engine export

1. Implement the feature in the appropriate `engine/` subdirectory.
2. Add the export to `engine/index.ts` in the correct section (follow the existing grouping by subsystem).
3. If adding a new type, add it to `shared/types.ts` and re-export it from `engine/index.ts`.
4. Run verification:

   ```bash
   bun run check:all && bun test
   ```

5. Regenerate the API docs:

   ```bash
   bun run gen:api
   ```

6. Verify the new export appears in `docs/API-generated.md`.

### 2. Updating the API documentation

```bash
bun run gen:api
```

This overwrites `docs/API-generated.md`. Do not edit that file by hand -- your edits will be lost on the next generation. If the section organization looks wrong, fix the comments in `engine/index.ts` (the generator uses `//` comment lines as section headers).

### 3. Adding a new game template

1. Create a new directory under `games/`:

   ```
   games/my-template/
     index.ts          # Must export setupGame(engine: Engine)
     game.config.ts    # Optional: { name, description } for the template picker
     scenes/           # Scene files
     entities/         # Entity factories
     systems/          # Custom systems
   ```

2. The `index.ts` must export a `setupGame` function that returns either a scene name string or a `{ startScene, screens?, hud?, store? }` object.

3. Add a `game.config.ts` for the template picker:

   ```ts
   export default {
     name: 'My Template',
     description: 'Short description for the picker',
   }
   ```

4. Verify the template works:

   ```bash
   bun run init:game my-template
   bun dev
   ```

5. Add a smoke test at `engine/__tests__/templates/my-template.smoke.test.ts`.

6. Run:

   ```bash
   bun run check:all && bun test
   ```

### 4. Updating dependencies

1. Update version ranges in `package.json`.
2. Run `bun install`.
3. Run the full verification:

   ```bash
   bun run check:all && bun test
   ```

4. Run benchmarks to check for performance regressions:

   ```bash
   bun run bench
   ```

5. Run dead code detection:

   ```bash
   bun run knip
   ```

6. If updating `engine/package.json` peer/direct dependencies, keep them in sync with the root `package.json`.

### 5. Debugging import boundary violations

When `bun run check:bounds` fails:

1. Read the violation output. It tells you the file, line number, import path, and the rule being violated.

2. Common patterns and fixes:

   | Violation | Fix |
   |---|---|
   | Engine imports game code | Move shared logic to `shared/`, or accept it via function parameter / callback. |
   | Game imports UI component | Use `@ui/store` (the zustand store) as the bridge. Set state in game, read in UI. |
   | Game imports `@ui/Something` | Only `@ui/store` is allowed. Move the needed logic or type to `shared/`. |
   | Shared imports anything | `shared/` must have zero dependencies on other layers. Move the import target into `shared/` or restructure. |
   | UI imports deep game path | Only `@game/index` is allowed. Expose what UI needs through the game's `setupGame` return value or the store. |

3. After fixing, re-run:

   ```bash
   bun run check:bounds
   ```

### 6. Performance profiling workflow

1. Run the benchmark suite:

   ```bash
   bun run bench
   ```

2. Compare results against the baselines in `docs/PERF.md`.

3. If a regression is detected (a benchmark throws), the most likely causes are:
   - A system now allocates or scans every frame where it previously cached.
   - A render path lost its Pretext cache hit (wrong key, wrong LRU, changed font string).
   - An O(n^2) pattern slipped into an iteration.
   - A new component query matches more entities than expected.

4. To isolate:
   - Run `bun run bench` before and after the suspected change.
   - Focus on the specific scenario that regressed.
   - The bench harness uses `performance.now()` with 100 iterations and 10 warmup; variance at sub-millisecond scale is normal.

5. Regression gates are set at roughly 3x the baseline -- they catch order-of-magnitude slowdowns, not jitter.

6. If thresholds are genuinely too tight for a slower machine, adjust `tickBudgetMs` / `renderBudgetMs` in the specific bench file.

### 7. Release checklist

Full process documented in `docs/RELEASE.md`. Summary:

1. Verify `main` is green in CI.
2. Update `CHANGELOG.md` (move Unreleased entries to a versioned section).
3. Bump version in `packages/create-ascii-game/package.json`.
4. Commit: `git commit -m "chore: release vX.Y.Z"`
5. Tag: `git tag vX.Y.Z`
6. Push: `git push origin main --tags`
7. The `release.yml` workflow handles: full gate, npm publish with provenance, GitHub Release creation.

Rollback: `npm unpublish` within 72 hours, or `npm deprecate` + patch release after.

---

## CLAUDE.md and AGENTS.md

### What they are

- **CLAUDE.md** (project root): Primary instruction file for Claude Code agents. Contains the command reference, architecture overview, import boundary rules, critical gotchas, and the verification loop. Read automatically by Claude Code when working in this repository.

- **AGENTS.md** (project root): Terse quick-reference formatted for AI agent consumption. Contains the same information as CLAUDE.md but organized as tables and code blocks for rapid parsing. Includes the full ECS component reference, behavior API table, and common patterns.

### How they are used

When Claude Code opens this project, it reads `CLAUDE.md` automatically and follows its instructions. Key conventions encoded:

- **Verification loop**: Always run `bun run check:all` then `bun test` before declaring work done.
- **Critical gotchas**: Do not integrate velocity manually, do not mutate the world during iteration, do not use `setInterval`/`setTimeout`, do not put game logic in `engine/`, do not re-register built-in systems.
- **Import boundaries**: Which layer can import what.
- **Two game APIs**: When to use `defineGame` vs `defineScene`.
- **ECS rules**: Spawn via `engine.spawn()`, destroy via `engine.destroy()`, entity factories return `Partial<Entity>`.

### Keeping them up to date

Update CLAUDE.md and AGENTS.md when:

- A new script is added to `package.json`.
- Import boundary rules change.
- A new template is added to `games/`.
- A new built-in system is added or system priorities change.
- New critical gotchas are discovered.
- The public API surface changes significantly.

Both files should reflect the current state of `engine/index.ts` (the public API surface) and `package.json` (the command reference). When in doubt, regenerate `docs/API-generated.md` and verify consistency.

---

## Quick Reference: The Verification Loop

Before declaring any work done:

```bash
# Full check: typecheck + boundary enforcement + lint
bun run check:all

# Tests
bun test

# Optional but recommended for engine changes:
bun run bench          # Performance regression check
bun run knip           # Dead code check
bun run gen:api        # Regenerate API docs if exports changed
```

All must pass. UI/render correctness is not verifiable headlessly -- state that limitation explicitly instead of claiming success.
