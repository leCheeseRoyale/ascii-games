# Multiplayer Autobattler — Architecture Plan

## Why This Engine Is Already 80% There

The existing codebase has three properties that make multiplayer autobattlers surprisingly natural:

1. **ECS entities are plain objects** — Position, Velocity, Ascii, Health... all JSON-serializable interfaces. No classes, no prototypes, no circular refs. Serialize the entire world state with `JSON.stringify`.

2. **Fixed timestep game loop** — The accumulator pattern with `fixedDt = 1/60` means two clients running the same systems in the same order on the same state produce the same result. This is deterministic simulation — the foundation of netcode.

3. **Game logic is separated from rendering** — Systems are pure `(engine, dt) => void` functions. You can run them headless (no canvas, no React) on a server. The engine just needs a mock renderer for server-side simulation.

## Autobattler Game Phases

```
┌─────────┐     ┌──────────┐     ┌────────┐     ┌─────────┐
│  LOBBY   │────►│  BUILD   │────►│ BATTLE │────►│ RESULTS │
│ (async)  │     │ (async)  │     │ (sync)  │     │ (async) │
│          │     │          │     │         │     │         │
│ Match-   │     │ Draft    │     │ Both    │     │ Show    │
│ making   │     │ units,   │     │ teams   │     │ winner, │
│ queue    │     │ position │     │ fight   │     │ stats,  │
│          │     │ on grid  │     │ auto-   │     │ next    │
│          │     │          │     │ matically│    │ round   │
└─────────┘     └──────────┘     └────────┘     └─────────┘
     │                │                │               │
     │   REST/WS      │   REST/WS     │  Deterministic │   REST
     │   matchmake    │   submit team  │  simulation   │   save
     ▼                ▼                ▼               ▼
              ┌─────────────────────────────────┐
              │           BUN SERVER             │
              │  HTTP + WebSocket + SQLite/Redis │
              └─────────────────────────────────┘
```

The key insight: **the battle phase doesn't need real-time networking**. Both clients receive the same two team compositions + a shared RNG seed, then run the deterministic battle simulation locally. The server also runs it to validate the result. This eliminates latency, cheating, and desync — the three hardest multiplayer problems.

## What Needs to Change

### 1. Seeded RNG (replace Math.random)

The engine's `rng()`, `rngInt()`, `pick()`, `chance()` all use `Math.random()`. For deterministic battles, we need a seedable PRNG that both clients and server use.

```ts
// engine/utils/rng.ts
export class SeededRng {
  private state: number

  constructor(seed: number) {
    this.state = seed
  }

  /** Returns [0, 1) — drop-in replacement for Math.random() */
  next(): number {
    // Mulberry32 — fast, good distribution, 32-bit state
    this.state |= 0
    this.state = (this.state + 0x6d2b79f5) | 0
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  float(min: number, max: number): number { return this.next() * (max - min) + min }
  int(min: number, max: number): number { return Math.floor(this.float(min, max + 1)) }
  pick<T>(arr: T[]): T { return arr[Math.floor(this.next() * arr.length)] }
  chance(p: number): boolean { return this.next() < p }
}
```

The existing math utils stay for non-deterministic use (particles, UI). Battle systems use the seeded RNG passed via engine context.

### 2. World State Serialization

```ts
// engine/net/serialize.ts
import type { Entity } from '@shared/types'

/** Serialize the ECS world to a plain JSON-safe array. */
export function serializeWorld(world: GameWorld): SerializedEntity[] {
  const entities: SerializedEntity[] = []
  for (const entity of world.entities) {
    const s: any = {}
    // Only serialize components that exist on this entity
    if (entity.position) s.position = { ...entity.position }
    if (entity.velocity) s.velocity = { ...entity.velocity }
    if (entity.ascii) s.ascii = { ...entity.ascii }
    if (entity.health) s.health = { ...entity.health }
    if (entity.collider) s.collider = { ...entity.collider }
    if (entity.tags) s.tags = { values: [...entity.tags.values] } // Set → array
    // ... other components
    entities.push(s)
  }
  return entities
}

/** Deserialize back into the world. */
export function deserializeWorld(world: GameWorld, entities: SerializedEntity[]): void {
  world.clear()
  for (const s of entities) {
    if (s.tags?.values) s.tags.values = new Set(s.tags.values) // array → Set
    world.add(s as Entity)
  }
}

type SerializedEntity = Record<string, unknown>
```

### 3. Headless Engine (server-side simulation)

The battle needs to run on the server without a canvas. Create a lightweight headless mode:

```ts
// engine/core/headless.ts
export class HeadlessEngine {
  readonly world: GameWorld
  readonly systems: SystemRunner
  private rng: SeededRng

  constructor(seed: number) {
    this.world = createWorld()
    this.systems = new SystemRunner()
    this.rng = new SeededRng(seed)
  }

  /** Run N fixed-timestep ticks. Returns final world state. */
  simulate(ticks: number, dt = 1/60): SerializedEntity[] {
    for (let i = 0; i < ticks; i++) {
      this.systems.update(this as any, dt)
    }
    return serializeWorld(this.world)
  }
}
```

This runs in Bun on the server — no DOM, no canvas, no React. Pure ECS + systems.

### 4. Backend Server

Bun has built-in HTTP + WebSocket. No Express, no Socket.io needed.

```
server/
├── index.ts          # Bun.serve() with HTTP + WS
├── matchmaker.ts     # Queue players, pair them
├── rooms.ts          # Active match rooms
├── simulation.ts     # Run battles server-side (validate)
├── db.ts             # SQLite via bun:sqlite (player data, history)
└── protocol.ts       # Message types for client ↔ server
```

```ts
// server/index.ts
Bun.serve({
  port: 3001,
  fetch(req, server) {
    // Upgrade WebSocket connections
    if (req.url.endsWith('/ws')) {
      server.upgrade(req)
      return
    }
    // REST endpoints
    if (req.url.endsWith('/api/queue')) return handleQueue(req)
    if (req.url.endsWith('/api/submit-team')) return handleSubmitTeam(req)
    // ...
  },
  websocket: {
    open(ws) { /* player connected */ },
    message(ws, msg) { /* handle protocol messages */ },
    close(ws) { /* cleanup */ },
  },
})
```

### 5. Protocol Messages

```ts
// shared/protocol.ts (shared between client + server)

type ClientMessage =
  | { type: 'queue'; playerId: string }
  | { type: 'submit-team'; team: SerializedEntity[] }
  | { type: 'ready' }
  | { type: 'forfeit' }

type ServerMessage =
  | { type: 'matched'; opponent: string; matchId: string }
  | { type: 'build-phase'; duration: number }
  | { type: 'battle-start'; teams: [SerializedEntity[], SerializedEntity[]]; seed: number }
  | { type: 'battle-result'; winner: 0 | 1 | 'draw'; validated: boolean }
  | { type: 'error'; message: string }
```

### 6. New Game Scenes for Autobattler

```
game/
├── scenes/
│   ├── lobby.ts          # Matchmaking queue, "searching..."
│   ├── build.ts          # Draft/place units on grid (the main creative phase)
│   ├── battle.ts         # Watch the deterministic fight play out
│   └── results.ts        # Winner, stats, XP, next round
├── systems/
│   ├── unit-ai.ts        # Autobattler AI: target selection, attack, ability use
│   ├── combat.ts         # Damage calculation, death, effects
│   ├── grid.ts           # Grid-based positioning (snap to cells)
│   ├── status-effects.ts # Buffs, debuffs, auras
│   └── net-sync.ts       # Send/receive state over WebSocket
├── entities/
│   ├── unit.ts           # Battle unit factory (type, stats, abilities)
│   ├── projectile.ts     # Ranged attack visuals
│   └── effect.ts         # Visual effects (heal, buff, damage numbers)
└── data/
    ├── units.ts          # Unit catalog (stats, costs, ASCII chars)
    ├── abilities.ts      # Ability definitions
    └── synergies.ts      # Team composition bonuses
```

## Sync vs Async — The Difference Is Tiny

### Async Autobattler (like Super Auto Pets)

- Player builds team offline (or on their own time)
- Submits team via REST: `POST /api/submit-team`
- Server matchmakes when ready, runs battle, stores result
- Player checks results later (or gets push notification)
- **No WebSocket needed for battles** — just REST + optional polling/SSE
- Battle playback: server stores the RNG seed + both teams. Client replays deterministically.

```
Client                          Server
  │                               │
  ├─── POST /submit-team ────────►│
  │                               ├── matchmake
  │                               ├── simulate battle
  │                               ├── store result
  │◄── { result, seed, teams } ───┤
  │                                │
  ├── replay battle locally ──►   │
```

### Sync Autobattler (like TFT/Underlords)

- Real-time lobby + draft phase via WebSocket
- Shared timer for build phase
- Battle phase is still deterministic — both clients simulate locally
- Server validates results match

```
Client A                    Server                    Client B
  │                           │                           │
  ├── ws: queue ─────────────►│◄── ws: queue ─────────────┤
  │◄── ws: matched ───────────┤──── ws: matched ─────────►│
  │                           │                           │
  │   (build phase timer)     │   (build phase timer)     │
  │                           │                           │
  ├── ws: submit-team ───────►│◄── ws: submit-team ───────┤
  │◄── ws: battle-start ──────┤──── ws: battle-start ────►│
  │   { teams, seed }         │   { teams, seed }         │
  │                           │                           │
  │   (both simulate locally) │   (server also simulates) │
  │                           │                           │
  ├── ws: my-result ─────────►│◄── ws: my-result ─────────┤
  │◄── ws: validated-result ──┤──── ws: validated-result ─►│
```

The **only** networking difference between sync and async is whether the build phase happens in real-time (WebSocket with timer) or at-your-own-pace (REST). The battle simulation is identical.

## The Grid

Autobattlers use a grid (typically hex or square). Add a Grid component:

```ts
// shared/types.ts — add
export interface GridPosition {
  col: number
  row: number
}

// The grid system converts GridPosition → Position for rendering
// grid.ts system: for each entity with gridPosition,
//   entity.position.x = gridPosition.col * CELL_SIZE + GRID_OFFSET_X
//   entity.position.y = gridPosition.row * CELL_SIZE + GRID_OFFSET_Y
```

During the build phase, the player drags units onto grid cells (mouse input → snap to nearest cell). During battle, units move between cells based on AI targeting.

## Unit AI (the autobattler core)

```ts
// game/systems/unit-ai.ts
defineSystem({
  name: 'unit-ai',
  update(engine, dt) {
    for (const unit of engine.world.with('position', 'unitStats', 'gridPosition')) {
      if (unit.unitStats.attackCooldown > 0) {
        unit.unitStats.attackCooldown -= dt
        continue
      }

      // Find nearest enemy
      const target = findNearestEnemy(unit, engine.world)
      if (!target) continue

      const d = gridDistance(unit.gridPosition, target.gridPosition)

      if (d <= unit.unitStats.range) {
        // Attack
        target.health.current -= unit.unitStats.damage
        unit.unitStats.attackCooldown = unit.unitStats.attackSpeed
        // Spawn damage number particle
      } else {
        // Move toward target (one grid cell per move)
        moveToward(unit.gridPosition, target.gridPosition)
      }
    }
  },
})
```

## New Component Types

```ts
// Add to shared/types.ts
export interface UnitStats {
  type: string           // 'warrior' | 'mage' | 'archer' etc.
  team: 0 | 1           // which side
  damage: number
  range: number          // grid cells
  attackSpeed: number    // seconds between attacks
  attackCooldown: number // current cooldown
  moveSpeed: number      // cells per second
  abilities: string[]    // references into abilities catalog
}

export interface GridPosition {
  col: number
  row: number
}

export interface StatusEffect {
  effects: { name: string; duration: number; magnitude: number }[]
}
```

## Directory Structure for Multiplayer

```
ascii-game-engine/
├── engine/           # (unchanged — game engine framework)
├── game/             # (autobattler game code)
│   ├── scenes/       # lobby, build, battle, results
│   ├── systems/      # unit-ai, combat, grid, status-effects, net-sync
│   ├── entities/     # unit, projectile, effect
│   └── data/         # unit catalog, abilities, synergies
├── server/           # NEW — Bun backend
│   ├── index.ts      # Bun.serve() HTTP + WebSocket
│   ├── matchmaker.ts # Pairing logic
│   ├── rooms.ts      # Active match state
│   ├── simulation.ts # Headless battle validation
│   ├── db.ts         # bun:sqlite for persistence
│   └── protocol.ts   # Message types → also used by client
├── shared/           # (expanded — protocol types shared client+server)
│   ├── types.ts      # + UnitStats, GridPosition, StatusEffect
│   ├── protocol.ts   # ClientMessage, ServerMessage (used by both)
│   ├── events.ts
│   └── constants.ts
└── ui/               # (expanded — build phase UI, match UI)
    ├── screens/
    │   ├── LobbyScreen.tsx
    │   ├── BuildScreen.tsx   # Unit shop, drag-and-drop grid
    │   └── BattleHUD.tsx     # Timer, team health bars
    └── hud/
```

## What Stays, What Changes

| Layer | Changes |
|-------|---------|
| engine/core | Add HeadlessEngine for server. SeededRng for deterministic battles. |
| engine/net | NEW — serialize.ts, client.ts (WebSocket client wrapper) |
| engine/utils/math.ts | Keep Math.random versions. SeededRng is separate. |
| shared/types.ts | Add UnitStats, GridPosition, StatusEffect components |
| shared/protocol.ts | NEW — message types for client ↔ server |
| game/ | Entirely new scenes, systems, entities for autobattler |
| server/ | NEW — Bun backend |
| ui/ | New screens for lobby, build phase, battle HUD |

The engine itself barely changes. The multiplayer layer sits on top.

## Implementation Order

1. **Seeded RNG + serialization** — foundation for deterministic simulation
2. **Grid system + unit entities** — the autobattler board
3. **Unit AI + combat systems** — the battle simulation
4. **Build phase scene** — drag units onto grid, shop UI
5. **Battle scene** — watch the fight with particles and effects
6. **Bun server** — matchmaking + WebSocket + battle validation
7. **Net sync** — connect client to server
8. **Polish** — animations, sound, juice, balance

## Open Questions

1. **Persistence** — bun:sqlite is simple and fast for single-server. For scale: Turso (SQLite edge), or Postgres.
2. **Deployment** — Single Bun process serves both static game files and WebSocket. fly.io or Railway for easy deploy.
3. **Anti-cheat** — Server runs the same deterministic simulation. If client result differs, server's is authoritative.
4. **Reconnection** — If a client disconnects during build phase, their last submitted team is used. During battle, no issue (it's deterministic, server has the result).
5. **Spectating** — Send the seed + teams to spectators. They run the simulation locally too.
