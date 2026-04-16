---
name: multiplayer
description: Activates when the user invokes `/ascii-games-dev:multiplayer` or asks to "add multiplayer", "wire a game server", "set up lockstep", "set up WebSocket sync", or mentions `GameServer`/`SocketAdapter`/`TurnSync` in the ascii-games engine. Scaffolds server binary + client adapter + TurnSync (turn-based) or raw relay (real-time), with optional desync checksum and session resume.
argument-hint: [turnbased | realtime]
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Scaffold multiplayer

User input in `$ARGUMENTS`: `turnbased` or `realtime`. If missing or ambiguous, ask which.

## Workflow

### 1. Ground in references

- `docs/API-generated.md` — confirm net exports
- `engine/net/game-server.ts` — server options and wire protocol
- `engine/net/socket-adapter.ts` — client options (`resumeOnReconnect`, etc.)
- `engine/net/turn-sync.ts` — lockstep, `submitStateHash`, `onDesync`
- `engine/__tests__/net/` — the tests double as reference usage

### 2. Generate files

#### Server binary at `server/index.ts`

```ts
import { GameServer } from '@engine'

const server = new GameServer({
  port: Number(process.env.PORT ?? 8080),
  hostname: process.env.HOSTNAME ?? '127.0.0.1',   // 0.0.0.0 for LAN/internet; document the risk
  maxClientsPerRoom: 4,
  maxRooms: 50,
  httpRateLimit: 60,                                 // per-IP on /rooms
  wsRateViolationLimit: 50,                          // disconnect persistent abusers
})

await server.start()
console.log(`GameServer listening on ${server.port}`)

server.onMessage((room, peerId, data) => {
  // Most games don't need server-side logic — the server is a relay.
})

process.on('SIGINT', () => server.stop())
```

Run with `bun run server/index.ts`. Add a script to `package.json`:

```json
"server": "bun run server/index.ts"
```

**Security defaults** in `GameServer` are already safe: 127.0.0.1 bind, 64KB msg cap, 100 msg/s per client, 200 max connections. Don't override these unless the user asks. If they ask to "expose on LAN", set `hostname: '0.0.0.0'` and warn that this is an internet-reachable socket.

#### Client wiring in `game/net/` (new folder)

**`game/net/adapter.ts`:**

```ts
import { SocketAdapter } from '@engine'

export function connectToRoom(url: string, roomId: string, clientName: string) {
  return new SocketAdapter({
    url,
    roomId,
    clientName,
    autoReconnect: true,
    reconnectDelay: 1500,
    resumeOnReconnect: true,   // preserves peerId across drops — state-by-peerId maps survive
  })
}
```

For local dev, the user can also use `MockAdapter` to test multiplayer logic in-process before running the server — note this in the skill output.

#### Mode-specific wiring

##### For `turnbased`:

```ts
// game/net/sync.ts
import { TurnSync } from '@engine'

export function createSync<TMove>(adapter: SocketAdapter, playerIds: string[]) {
  const sync = new TurnSync<TMove>({
    adapter,
    playerIds,
    turnTimeout: 20_000,   // auto-complete turn with null for missing players after 20s
  })

  sync.onTurnComplete(({ turn, moves }) => {
    // Apply moves deterministically. Game state must be a pure function of (prev state, moves).
    applyMoves(moves)

    // Optional: hash post-turn state and broadcast for desync detection.
    sync.submitStateHash(hashGameState())
  })

  sync.onDesync(({ turn, hashes }) => {
    console.error(`DESYNC at turn ${turn}`, hashes)
    // Your choice: refuse to proceed, show a reconcile UI, or use the host as source of truth.
  })

  return sync
}
```

Emphasize: **game logic must be deterministic** — no `Math.random()` without a seeded RNG, no wall-clock time in simulation, no Set iteration order assumptions. Point the user at `createSeededRandom` from `@engine` for deterministic randomness inside turn logic.

##### For `realtime`:

Skip `TurnSync`. Broadcast inputs or state snapshots directly:

```ts
// game/net/realtime.ts
import type { SocketAdapter } from '@engine'

export function startRealtime(adapter: SocketAdapter) {
  adapter.onMessage((from, data) => {
    // Apply remote input to the entity belonging to `from`.
    applyRemoteInput(from, data)
  })

  // In your player-input system:
  // adapter.broadcast({ up: keyboard.held('ArrowUp'), ... })  // ~60Hz — keep the payload tiny
}
```

Warn the user: real-time netcode via this engine is **pure relay**. No interpolation, prediction, or rollback is provided. For competitive real-time games, this is probably insufficient — suggest they add client-side prediction at minimum.

### 3. Wire room discovery (optional but useful)

In a lobby scene:

```ts
import { SocketAdapter } from '@engine'

const rooms = await SocketAdapter.listRooms('http://localhost:8080', { gameType: 'my-game' })
// Render rooms list; user picks one → connectToRoom(url, roomId, name).
```

### 4. Verify

- `bun run check` — typecheck
- `bun run test` — regressions (net tests run in-process)
- Start server: `bun run server`
- In another terminal: `bun dev` — open two browser tabs, both should connect to the same room

### 5. Report to user

- Files created (paths)
- How to run (`bun run server` + `bun dev`)
- Security note if they set a non-loopback hostname
- Determinism reminder if turn-based
- Client-prediction reminder if real-time

## Things NOT to do

- Don't build your own WebSocket layer. `SocketAdapter` + `GameServer` are it.
- Don't assume `TurnSync` works for real-time — it's lockstep, designed for turn-based.
- Don't skip `resumeOnReconnect` for games that care about peer identity across drops.
- Don't put the server binary in `engine/` — it's game code. `server/` at the repo root.
- Don't override the security defaults without explicit user intent.
- Don't forget to mention that `GameServer` must run in Bun (uses `Bun.serve`), not in the browser bundle.
