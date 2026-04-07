# ASCII Game Engine — Architecture Plan

## Vision

A **template repository** for building ASCII-art-styled browser games using Pretext for text measurement/layout, a lightweight ECS, optional physics, and React for UI chrome. Clone it, run one command, start building a game.

The key differentiator: **text is the rendering primitive, not pixels or sprites.** Every visual element — terrain, characters, particles, UI — is a positioned text character measured and laid out by Pretext. This enables text-flow-around-obstacles, proportional font rendering, shrinkwrap layouts, and effects that are impossible with monospace grids.

---

## Tech Stack

### Decided

| Layer | Choice | Why |
|-------|--------|-----|
| **Runtime** | Bun | Fast, native TS, great DX |
| **Bundler** | Vite | Hot reload, Bun-compatible, React plugin, WASM support |
| **UI** | React 19 | Menus, HUD, overlays — not the game canvas |
| **Text engine** | @chenglou/pretext | The whole point — DOM-free text measurement at 60fps |
| **Language** | TypeScript (strict) | Type safety for ECS components, engine API |

### Needs Decision

#### ECS: miniplex vs bitECS vs hand-rolled

| Option | Pros | Cons |
|--------|------|------|
| **miniplex** | TypeScript-first, object components, React bindings, gentle API | Slower than bitECS at >50K entities |
| **bitECS** | Fastest (TypedArrays/SoA), ~5KB | Awkward TS ergonomics, number-only components |
| **Hand-rolled** | Zero deps, tailored to our needs | More code to maintain, reinventing the wheel |

**Recommendation: miniplex.** ASCII games won't push 50K+ entities. The TypeScript ergonomics and React bindings (`useEntities` for HUD) make it the clear DX winner. bitECS is overkill optimization for a text-rendering game.

#### Physics: Rapier2D vs Matter.js vs none-by-default

| Option | Pros | Cons |
|--------|------|------|
| **Rapier2D** | WASM-fast, deterministic, 2D+3D | ~200KB WASM blob, async init |
| **Matter.js** | Pure JS, simple API, smaller | Maintenance stalled, slower |
| **None by default** | Smaller bundle, simpler scaffold | Games that need physics must add it |

**Recommendation: Optional Rapier2D.** Ship a `withPhysics()` plugin that lazy-loads the WASM. The base scaffold has zero physics overhead. A game opts in by importing the plugin. Include a simple built-in AABB collision system for games that just need overlap detection without full rigid-body simulation.

#### ASCII toolkit: rot.js vs custom

| Option | Pros | Cons |
|--------|------|------|
| **rot.js** | Pathfinding, FOV, map gen, RNG, scheduler | Its display system competes with our Pretext renderer |
| **rot.js (algorithms only)** | Cherry-pick the good parts | Still a dep, some unused code |
| **Custom utilities** | Exactly what we need | Must write pathfinding, FOV, etc. |

**Recommendation: rot.js as an optional utility import.** Use ONLY its algorithmic modules (RNG, pathfinding, FOV, map generation, scheduler). Ignore its Display class entirely — our Pretext-based renderer replaces it. Expose as `@engine/roguelike` re-exports.

#### React state bridge: zustand vs context vs signals

| Option | Pros | Cons |
|--------|------|------|
| **zustand** | Tiny, works outside React, subscribe from game loop | Extra dep |
| **React context** | Zero deps | Re-render storms, can't read from game loop |
| **Custom event bus** | Zero deps, decoupled | More boilerplate |

**Recommendation: zustand.** The game loop writes to a zustand store (score, health, state), React reads it reactively. Zustand works outside React components which is essential — the game loop runs in requestAnimationFrame, not in React's render cycle.

---

## Project Structure

```
ascii-game-engine/
├── .hermes/                    # Hermes agent context
│   └── plans/
├── CLAUDE.md                   # AI agent instructions (Claude Code)
├── AGENTS.md                   # AI agent instructions (generic)
├── README.md                   # User-facing docs
├── package.json
├── tsconfig.json
├── vite.config.ts
├── bun.lock
├── index.html                  # Single entry point
│
├── engine/                     # 🎮 GAME ENGINE (framework code, don't edit per-game)
│   ├── index.ts                #   Public API barrel export
│   ├── core/
│   │   ├── game-loop.ts        #   requestAnimationFrame loop, fixed timestep
│   │   ├── engine.ts           #   Engine class — owns world, canvas, loop, input
│   │   └── scene.ts            #   Scene manager — load, transition, cleanup
│   ├── ecs/
│   │   ├── world.ts            #   miniplex world setup + typed archetype queries
│   │   ├── components.ts       #   All component type definitions
│   │   └── systems.ts          #   System type definition + system runner
│   ├── render/
│   │   ├── ascii-renderer.ts   #   Core: draw ASCII entities via Canvas fillText
│   │   ├── text-layout.ts      #   Pretext integration: measure, layout, flow-around
│   │   ├── camera.ts           #   2D camera: pan, zoom, shake, follow
│   │   ├── particles.ts        #   ASCII particle system
│   │   └── effects.ts          #   Glow, fade, flash, trail effects
│   ├── input/
│   │   ├── keyboard.ts         #   Keyboard state per frame
│   │   ├── mouse.ts            #   Mouse/touch state per frame
│   │   └── gamepad.ts          #   Gamepad API (optional)
│   ├── audio/
│   │   └── audio.ts            #   Web Audio API wrapper (beeps, tones for ASCII aesthetic)
│   ├── physics/
│   │   ├── plugin.ts           #   withPhysics() — lazy Rapier2D loader
│   │   ├── collision.ts        #   Built-in simple AABB overlap detection
│   │   └── bodies.ts           #   Rapier body/collider helpers
│   └── utils/
│       ├── math.ts             #   Vec2, lerp, clamp, random ranges
│       ├── color.ts            #   HSL/RGB helpers, palettes
│       ├── timer.ts            #   Cooldowns, intervals, tweens
│       └── pool.ts             #   Object pool for particles/bullets
│
├── game/                       # 🕹️ YOUR GAME (edit this!)
│   ├── index.ts                #   Game entry: register scenes, set config
│   ├── config.ts               #   Game-specific config (title, fonts, colors)
│   ├── scenes/
│   │   ├── title.ts            #   Example: title screen scene
│   │   ├── play.ts             #   Example: main gameplay scene
│   │   └── game-over.ts        #   Example: game over scene
│   ├── systems/
│   │   ├── movement.ts         #   Example: movement system
│   │   ├── player-input.ts     #   Example: player input → velocity
│   │   └── spawner.ts          #   Example: enemy/item spawner
│   ├── entities/
│   │   ├── player.ts           #   Entity factory: createPlayer()
│   │   ├── enemy.ts            #   Entity factory: createEnemy()
│   │   └── projectile.ts       #   Entity factory: createProjectile()
│   └── data/
│       ├── levels.ts           #   Level definitions, ASCII maps
│       └── sprites.ts          #   ASCII "sprite" definitions (multi-char art)
│
├── ui/                         # ⚛️ REACT UI (menus, HUD, overlays)
│   ├── App.tsx                 #   Root: mounts canvas + UI overlay
│   ├── GameCanvas.tsx          #   Canvas ref, engine lifecycle hook
│   ├── store.ts                #   zustand store: game↔React bridge
│   ├── screens/
│   │   ├── MainMenu.tsx        #   Start screen
│   │   ├── PauseMenu.tsx       #   Pause overlay
│   │   └── GameOverScreen.tsx  #   Results / retry
│   ├── hud/
│   │   ├── HUD.tsx             #   In-game HUD container
│   │   ├── HealthBar.tsx       #   ASCII-styled health display
│   │   ├── Score.tsx           #   Score counter
│   │   └── Debug.tsx           #   FPS, entity count, render stats
│   └── shared/
│       ├── AsciiText.tsx       #   Pretext-measured React text component
│       └── AsciiButton.tsx     #   Keyboard-navigable ASCII button
│
├── shared/                     # 📦 SHARED between engine, game, and UI
│   ├── types.ts                #   Game-wide type definitions
│   ├── constants.ts            #   Magic numbers, tuning values
│   └── events.ts               #   Typed event bus (engine↔UI)
│
├── public/
│   └── fonts/                  #   Self-hosted fonts (Berkeley Mono, etc.)
│
├── scripts/
│   ├── new-scene.ts            #   $ bun run new:scene <name>
│   ├── new-system.ts           #   $ bun run new:system <name>
│   ├── new-entity.ts           #   $ bun run new:entity <name>
│   └── templates/              #   .ts.hbs templates for scaffolding
│       ├── scene.ts.hbs
│       ├── system.ts.hbs
│       └── entity.ts.hbs
│
└── games/                      # 🎲 EXAMPLE GAMES (each self-contained)
    ├── asteroid-field/         #   Complete example: dodge ASCII asteroids
    │   ├── scenes/
    │   ├── systems/
    │   └── entities/
    ├── text-flow-demo/         #   Pretext showcase: drag obstacles, text reflows
    │   └── ...
    └── roguelike-starter/      #   rot.js integration: FOV, pathfinding, dungeon gen
        └── ...
```

### Why this separation

**`engine/`** — Framework code. Rarely touched per-game. Could eventually be extracted to an npm package. No game-specific logic.

**`game/`** — Where you build YOUR game. Scenes, systems, entity factories, level data. This is what changes between games. When scaffolding a new game, you clear this directory and start fresh (or copy from `games/` examples).

**`ui/`** — React lives here and ONLY here. The game loop never imports from `ui/`. Communication is one-way: game loop → zustand store → React reads. React can dispatch actions back via the event bus.

**`shared/`** — The glue. Types and events that both engine and UI need. Kept minimal.

**`games/`** — Complete example games showing different genres/patterns. Users copy one into `game/` to start.

**`scripts/`** — Scaffolding generators so you never write boilerplate.

---

## How Someone Uses This

### First time setup
```sh
# Clone the template
git clone https://github.com/yourorg/ascii-game-engine my-game
cd my-game
bun install

# Start dev server with hot reload
bun dev

# Opens browser → sees the example game running
```

### Starting a new game from scratch
```sh
# Pick an example game as your starting point
bun run init:game asteroid-field
# Copies games/asteroid-field/ into game/, sets up config

# Or start blank
bun run init:game blank
# Gives you empty scenes/systems/entities with one title scene
```

### Adding game elements
```sh
# Scaffold a new scene
bun run new:scene boss-fight
# Creates game/scenes/boss-fight.ts with setup/update/cleanup stubs

# Scaffold a new system
bun run new:system gravity
# Creates game/systems/gravity.ts with typed query + update function

# Scaffold a new entity factory
bun run new:entity power-up
# Creates game/entities/power-up.ts with component defaults
```

### Day-to-day development
```sh
bun dev          # Vite dev server with HMR
bun run check    # TypeScript check
bun run build    # Production build
bun run preview  # Preview production build
```

### The scene lifecycle
```ts
// game/scenes/play.ts
import { defineScene } from '@engine'

export default defineScene({
  name: 'play',

  setup(engine) {
    // Spawn entities, register systems
    const player = engine.spawn(createPlayer(400, 300))
    
    engine.addSystem(playerInputSystem)
    engine.addSystem(movementSystem)
    engine.addSystem(collisionSystem)
    
    // React UI knows we're in gameplay
    engine.store.setState({ screen: 'playing' })
  },

  update(engine, dt) {
    // Per-frame logic that doesn't fit in a system
    if (engine.input.justPressed('Escape')) {
      engine.store.setState({ screen: 'paused' })
      engine.pause()
    }
  },

  cleanup(engine) {
    // Remove all entities, unregister systems
    engine.clearSystems()
    engine.world.clear()
  },
})
```

### The system pattern
```ts
// game/systems/movement.ts
import { defineSystem } from '@engine'

export default defineSystem({
  name: 'movement',
  query: ['position', 'velocity'],

  update(entities, engine, dt) {
    for (const e of entities) {
      e.position.x += e.velocity.vx * dt
      e.position.y += e.velocity.vy * dt
    }
  },
})
```

### The entity factory pattern
```ts
// game/entities/player.ts
import type { Entity } from '@engine'

export function createPlayer(x: number, y: number): Partial<Entity> {
  return {
    position: { x, y },
    velocity: { vx: 0, vy: 0 },
    ascii: {
      char: '@',
      font: '20px "Berkeley Mono"',
      color: '#00ff88',
      glow: '#00ff8844',
    },
    player: { index: 0 },
    collider: { type: 'circle', width: 16, height: 16 },
    health: { current: 100, max: 100 },
  }
}
```

---

## AI Agent Files

### CLAUDE.md (for Claude Code)

Purpose: When a developer opens this project in Claude Code, Claude immediately understands the architecture, conventions, and how to make changes without breaking things.

Contents:
- Build/run commands (bun dev, bun run check, bun run build)
- Architecture overview: engine/ is framework, game/ is user code, ui/ is React
- ECS conventions: components are plain objects, systems are pure functions, entities are miniplex entities
- Rendering: everything goes through engine/render/, never raw ctx calls in game code
- Pretext rules: prepare() is cached, only call layout() on resize, use prepareWithSegments() for manual layout
- React↔Game boundary: zustand store is the ONLY bridge, never import React in engine/ or game/
- How to add a scene, system, entity (point to scripts/ or manual patterns)
- Testing approach
- What NOT to do (don't put game logic in React, don't call DOM APIs from engine, don't re-prepare() every frame)

### AGENTS.md (generic AI agents)

Purpose: Same information in a format any AI agent can consume. Less Claude-specific framing.

Contents:
- Project overview
- Directory map with one-line descriptions
- Key commands
- Architecture rules
- Common tasks with step-by-step instructions
- File dependency chain

---

## Rendering Architecture

### The Pretext integration

```
Canvas 2D (ctx)
  ↑ fillText calls
  │
ASCII Renderer
  ├── Single characters: entity.ascii → ctx.fillText(char, x, y)
  ├── Text blocks: entity.textBlock → pretext prepare() + layout() → multi-line fillText
  ├── Text flow: entity.textBlock + obstacles → pretext layoutNextLineRange() per line
  └── Particles: particle pool → batch fillText with color/opacity
  │
  ↑ position data
  │
Camera transform (translate + scale the ctx before rendering)
```

### Render layers (back to front)
1. Background (fill or ASCII pattern)
2. Terrain / map tiles (ASCII characters at grid positions)
3. Text blocks (flowing paragraphs with obstacle avoidance)
4. Entities (characters, items, projectiles)
5. Particles / effects
6. Debug overlay (optional)

React UI renders as a DOM overlay on top of the canvas via CSS `pointer-events: none` on non-interactive elements.

### Pretext caching strategy
- `prepare()` results cached by `font+text` key in a Map
- Cache cleared on font change or explicit `clearRenderCache()`
- `layout()` is cheap and called every frame when width changes (e.g., camera zoom)
- For text-around-obstacles: `layoutNextLineRange()` per line per frame — this is the hot path Pretext is designed for

---

## Physics Architecture

### Built-in: Simple AABB collision
- Always available, zero overhead when unused
- `engine.overlap(entityA, entityB)` → boolean
- `engine.overlapGroup(entity, 'enemies')` → Entity[]
- Good enough for: collectibles, triggers, basic hit detection

### Plugin: Rapier2D
- Loaded via `withPhysics()` plugin in game config
- Lazy-loads WASM, async init
- Creates Rapier World alongside miniplex World
- `physicsBody` component syncs position from Rapier → miniplex each frame
- Not loaded unless a game opts in

---

## React ↔ Game Loop Boundary

This is the most important architectural decision. **They are separate worlds.**

```
┌─────────────────────────────┐     ┌─────────────────────────┐
│         GAME LOOP           │     │        REACT UI         │
│  (requestAnimationFrame)    │     │   (React render cycle)  │
│                             │     │                         │
│  engine/                    │     │  ui/                    │
│  game/                      │     │                         │
│                             │     │                         │
│  Writes to zustand store ──────────► Reads from zustand     │
│                             │     │  store reactively       │
│  Reads from event bus ◄────────────  Dispatches events      │
│                             │     │                         │
│  Owns: canvas, ECS world,   │     │  Owns: DOM overlays,   │
│  input, physics, renderer   │     │  menus, HUD, dialogs   │
└─────────────────────────────┘     └─────────────────────────┘
```

**Rules:**
1. Game loop NEVER imports from `ui/`
2. React NEVER writes to the ECS world directly
3. zustand store is the game→UI data flow (score, health, game state)
4. Event bus is the UI→game command flow (start, pause, restart, settings change)
5. Canvas is a `<canvas>` ref managed by `GameCanvas.tsx`, passed to engine on mount

---

## Example Games to Ship

### 1. Asteroid Field (simple, teaches basics)
- Player `@` dodges ASCII asteroids `*`, `◆`, `●`
- Arrow key movement
- Score increases over time
- Demonstrates: input, movement, collision, spawner, particles, HUD

### 2. Text Flow Demo (Pretext showcase)
- Flowing paragraph text on canvas
- Draggable circular obstacles
- Text reflows around obstacles in real-time at 60fps
- Performance stats overlay
- Demonstrates: Pretext layoutNextLineRange, text blocks, mouse drag, camera

### 3. Roguelike Starter (rot.js integration)
- Procedural dungeon (rot.js map gen)
- FOV (rot.js FOV)
- Turn-based movement
- Enemies with pathfinding (rot.js A*)
- Demonstrates: rot.js algorithms, tile-based ASCII map, turn system, fog of war

---

## Scaffolding Scripts

### `bun run new:scene <name>`
Creates `game/scenes/<name>.ts` from template:
- defineScene with setup/update/cleanup stubs
- Imports engine types
- Registers in scene index

### `bun run new:system <name> [--query component1,component2]`
Creates `game/systems/<name>.ts` from template:
- defineSystem with query and update stub
- Typed entity parameter based on query components

### `bun run new:entity <name> [--components position,ascii,velocity]`
Creates `game/entities/<name>.ts` from template:
- Factory function with sensible defaults for specified components
- TypeScript types inferred from component list

### `bun run init:game <template>`
Resets `game/` directory from an example:
- `blank` — empty game with title scene only
- `asteroid-field` — copies the asteroid example
- `roguelike-starter` — copies the roguelike example
- `text-flow-demo` — copies the text flow demo

---

## Open Questions

1. **Font loading strategy** — Self-host in `public/fonts/`? Use a system monospace stack? Berkeley Mono is proprietary. Fira Code / JetBrains Mono / IBM Plex Mono as defaults?

2. **Audio** — ASCII aesthetic begs for chiptune / procedural audio. Include a simple oscillator-based sound system, or keep audio out of scope and let games add their own?

3. **Multiplayer** — Out of scope for v1, but the ECS architecture should not preclude it. Consider: deterministic fixed timestep, serializable components, netcode plugin slot.

4. **Server-side rendering of game state** — Pretext works in Node/Bun without DOM. Could we offer a headless mode for game servers that need to validate/simulate layouts? Probably v2.

5. **Mobile input** — Touch events for mobile play? Virtual joystick component in `ui/`? Or desktop-only for v1?

6. **Package extraction** — Should `engine/` eventually become `@ascii-engine/core` on npm so games depend on it as a package rather than living in the same repo? Template repo pattern vs monorepo pattern.

---

## Implementation Order

### Phase 1: Core scaffold (do first)
1. Project config: package.json, tsconfig, vite.config, index.html
2. Engine core: game-loop.ts, engine.ts, scene.ts
3. ECS setup: world.ts, components.ts, systems.ts
4. Input: keyboard.ts, mouse.ts
5. Renderer: ascii-renderer.ts, text-layout.ts (Pretext integration)
6. React shell: App.tsx, GameCanvas.tsx, store.ts
7. Shared: types.ts, events.ts, constants.ts
8. CLAUDE.md + AGENTS.md

### Phase 2: Game infrastructure
9. Camera: pan, zoom, follow, shake
10. Particles: ASCII particle system
11. Effects: glow, fade, trails
12. Collision: built-in AABB
13. Utils: math, color, timer, pool
14. Audio: basic oscillator system

### Phase 3: Examples + DX
15. Scaffolding scripts: new:scene, new:system, new:entity, init:game
16. Example game: Asteroid Field
17. Example game: Text Flow Demo
18. Example game: Roguelike Starter
19. README with screenshots/gifs
20. Polish: error messages, dev overlay, HMR for scenes

### Phase 4: Plugins
21. Physics plugin (Rapier2D)
22. Roguelike utilities (rot.js re-exports)
23. Gamepad input
24. Screen recording / gif export

---

## Risks & Tradeoffs

| Risk | Mitigation |
|------|-----------|
| Pretext is young (v0.0.4) — API may change | Pin version, wrap in engine/render/text-layout.ts abstraction |
| Berkeley Mono / nice fonts are proprietary | Default to Fira Code (free), document font setup |
| miniplex React bindings may conflict with our zustand bridge | Keep ECS reads in game loop only, React reads zustand only |
| WASM Rapier2D adds bundle complexity | Make it a lazy plugin, not a default |
| rot.js Display competes with our renderer | Only import algorithm modules, never Display |
| Over-engineering for simple ASCII games | Phase 1 is deliberately minimal, examples prove the stack |
