# Multiplayer & Networking Guide

Comprehensive reference for the multiplayer layer of the ASCII game engine. Covers the architecture, every networking primitive, step-by-step integration, testing patterns, and deployment considerations.

File paths are relative to the repository root.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [NetworkAdapter Interface](#networkadapter-interface)
3. [MockAdapter (In-Memory)](#mockadapter-in-memory)
4. [SocketAdapter (WebSocket Client)](#socketadapter-websocket-client)
5. [GameServer (WebSocket Server)](#gameserver-websocket-server)
6. [TurnSync (Lockstep Coordination)](#turnsync-lockstep-coordination)
7. [Desync Detection and State Hashing](#desync-detection-and-state-hashing)
8. [createMultiplayerGame (One-Line Wrapper)](#createmultiplayergame-one-line-wrapper)
9. [Converting a Single-Player Game to Multiplayer](#converting-a-single-player-game-to-multiplayer)
10. [Wire Protocol Reference](#wire-protocol-reference)
11. [Room Discovery and Lobbies](#room-discovery-and-lobbies)
12. [Reconnection and Session Resume](#reconnection-and-session-resume)
13. [Testing Multiplayer Games](#testing-multiplayer-games)
14. [Deployment and Security](#deployment-and-security)
15. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

The multiplayer system is a layered stack, each layer composable independently:

```
 createMultiplayerGame()        <-- highest level: one-line wrapper
        |
   GameRuntime (defineGame)     <-- game logic + state
        |
     TurnSync<TMove>            <-- lockstep turn coordination
        |
     NetworkAdapter             <-- transport abstraction
      /         \
 MockAdapter   SocketAdapter    <-- concrete transports
                   |
              GameServer         <-- Bun WebSocket server (separate process)
```

**Key design decisions:**

- **Lockstep, not server-authoritative.** Every peer runs the same deterministic game logic with the same inputs. There is no authoritative server rewriting state. The `GameServer` is a relay (message router + room manager), not a game logic host. This keeps the server thin and latency low for turn-based games.
- **Transport-agnostic.** All game networking code programs against `NetworkAdapter`. Swapping `MockAdapter` for `SocketAdapter` requires zero game code changes.
- **Room-based.** Players join named rooms. The server manages room lifecycle, peer tracking, and host assignment. Rooms are isolated; messages never cross room boundaries.
- **Asymmetric turn model.** `TurnSync` supports both symmetric mode (all players must submit each turn) and asymmetric mode (only the active player's move is needed to complete a turn). `createMultiplayerGame` uses asymmetric mode to match `defineGame`'s turn rotation.

### What lives where

| Module | Runs in | Purpose |
|--------|---------|---------|
| `engine/net/network-adapter.ts` | Both | `NetworkAdapter` interface + `NetEmitter` utility |
| `engine/net/mock-adapter.ts` | Both | In-memory adapter for tests and hotseat |
| `engine/net/socket-adapter.ts` | Browser | WebSocket client implementing `NetworkAdapter` |
| `engine/net/game-server.ts` | Server (Bun) | WebSocket relay server with rooms |
| `engine/net/turn-sync.ts` | Both | Lockstep turn coordinator over any adapter |
| `engine/core/create-multiplayer-game.ts` | Both | One-line wrapper composing all of the above |
| `engine/core/state-hash.ts` | Both | Deterministic hashing utilities for desync detection |

---

## NetworkAdapter Interface

Defined in `engine/net/network-adapter.ts`. Every transport implements this shape:

```ts
interface NetworkAdapter {
  readonly id: string;          // This peer's stable ID
  readonly isHost: boolean;     // Whether this peer is the room host
  readonly peers: readonly string[];  // Connected peer IDs (excluding self)
  readonly connected: boolean;

  connect(): Promise<void>;     // Establish transport (idempotent)
  disconnect(): void;           // Tear down cleanly

  send(to: string | "all", message: unknown): void;
  broadcast(message: unknown): void;  // Convenience for send("all", ...)

  onMessage(handler: (from: string, message: unknown) => void): Unsubscribe;
  onPeerJoin(handler: (peerId: string) => void): Unsubscribe;
  onPeerLeave(handler: (peerId: string) => void): Unsubscribe;
  onConnect(handler: () => void): Unsubscribe;
  onDisconnect(handler: () => void): Unsubscribe;
}
```

**Contract rules for adapters:**

- Adapters must NOT deliver a peer's own broadcasts back to itself.
- `send()` to an unknown peer ID is a silent no-op (no throw) -- games frequently race this against disconnects.
- `connect()` is idempotent; calling it twice resolves to the same state.
- All `on*` methods return an `Unsubscribe` function (a no-arg callable that removes the handler).

**Helper classes:**

- `NetEmitter<T>` -- a minimal typed event emitter that adapter implementations compose internally. Handlers that throw are caught and logged (one broken handler does not break the adapter).
- `generatePeerId()` -- produces an 8-character hex string using `crypto.getRandomValues` when available.

---

## MockAdapter (In-Memory)

Defined in `engine/net/mock-adapter.ts`. Used for tests and local hotseat play.

### MockBus

Multiple `MockAdapter` instances communicate through a shared `MockBus`:

```ts
import { MockAdapter, MockBus } from "@engine";

const bus = MockBus.create();
const host   = new MockAdapter({ bus, id: "alice", isHost: true });
const client = new MockAdapter({ bus, id: "bob" });

await host.connect();
await client.connect();

host.broadcast({ hello: "world" });
// client receives { hello: "world" } synchronously
```

### Options

```ts
interface MockAdapterOptions {
  bus: MockBus;          // Required: shared bus
  id?: string;           // Peer ID (auto-generated if omitted)
  isHost?: boolean;      // Default false
  latency?: number;      // Simulated network delay in ms. Default 0 (synchronous)
  dropRate?: number;     // Probability 0..1 that a message is silently dropped. Default 0
}
```

### Behavior details

- **Synchronous delivery (latency=0).** `send()` completes before it returns. Tests do not need `await` pumps. This is the default and keeps tests deterministic.
- **Async delivery (latency>0).** Messages are scheduled on `setTimeout`. Useful for verifying async-safe behavior.
- **Serialization simulation.** Messages are deep-cloned via `JSON.parse(JSON.stringify(msg))` before delivery, catching shared-reference bugs that would manifest on a real transport.
- **Drop simulation.** `dropRate: 1` drops all messages; useful for testing reconnect/retry logic.
- **Peer events.** On `connect()`, existing adapters on the bus each receive `onPeerJoin(newId)`, and the new adapter receives `onPeerJoin(existingId)` for each existing peer. Symmetric.
- **`bus.clear()`** disconnects every registered adapter, firing `onDisconnect` and `onPeerLeave` events.

---

## SocketAdapter (WebSocket Client)

Defined in `engine/net/socket-adapter.ts`. Browser-side WebSocket client that pairs with `GameServer`.

### Basic usage

```ts
import { SocketAdapter } from "@engine";

const adapter = new SocketAdapter({
  url: "wss://my-server.com",
  roomId: "game-lobby-42",
  clientName: "Alice",
  roomOpts: {
    name: "Alice's Game",
    gameType: "tic-tac-toe",
    isPublic: true,
    maxPeers: 2,
    metadata: { difficulty: "hard" },
  },
});

await adapter.connect();
adapter.onMessage((from, msg) => console.log("got", msg, "from", from));
adapter.broadcast({ move: "center" });
```

### Options

```ts
interface SocketAdapterOptions {
  url: string;                    // ws:// or wss:// URL of the GameServer
  roomId: string;                 // Room to join on connect
  clientName?: string;            // Display name hint (not authoritative)
  roomOpts?: SocketRoomOptions;   // Applied only when this peer creates the room
  autoReconnect?: boolean;        // Default true
  reconnectDelay?: number;        // Base delay in ms. Default 1500
  maxReconnectAttempts?: number;  // Default Infinity
  resumeOnReconnect?: boolean;    // Reuse previous peerId on reconnect. Default false
  WebSocket?: typeof WebSocket;   // Constructor override for non-browser environments
}
```

### Connection lifecycle

1. `connect()` opens a WebSocket to `opts.url`.
2. On socket open, the adapter sends a `join` frame with the `roomId`, `clientName`, `roomOpts`, and optionally `previousPeerId`.
3. The server responds with a `welcome` frame containing `peerId`, `isHost`, and the list of existing `peers`.
4. `connect()` resolves. `adapter.id`, `adapter.isHost`, and `adapter.peers` are now populated.
5. Subsequent `peer-join` and `peer-leave` frames update `adapter.peers` and fire the corresponding events.
6. `disconnect()` sends a polite `leave` frame, closes the socket, fires `onDisconnect`, and clears peer state.

### Auto-reconnect

When the connection drops unexpectedly:

1. The adapter waits `reconnectDelay * min(attempt, 10)` ms (linear backoff, capped at 10x base).
2. It opens a new socket and re-sends the `join` frame.
3. If `resumeOnReconnect` is true and the adapter already has an `id`, it sends `previousPeerId` so the server can reuse the same peer identity.
4. After `maxReconnectAttempts`, the adapter gives up and rejects the original `connect()` promise.
5. Close code `1013` (server full / room full) is treated as terminal -- no reconnect attempt.

### Room discovery

```ts
// Static method -- HTTP GET, no WebSocket needed
const rooms = await SocketAdapter.listRooms("wss://server.example.com", {
  gameType: "roguelike",
});

// Instance method -- uses the live WebSocket (requires connect() first)
const rooms = await adapter.listRooms({ gameType: "roguelike" });
```

The static method rewrites `ws://` to `http://` and hits `GET /rooms`. The instance method sends a `list-rooms` WebSocket frame and resolves when the server replies with a `rooms` frame. Multiple in-flight `listRooms()` calls are resolved FIFO.

---

## GameServer (WebSocket Server)

Defined in `engine/net/game-server.ts`. A Bun-based WebSocket relay server with room management. Runs as a separate process -- it never imports browser-facing engine code.

### Basic usage

```ts
import { GameServer } from "@engine";

const server = new GameServer({
  port: 8080,
  hostname: "0.0.0.0",  // expose on LAN (default is 127.0.0.1)
  maxClientsPerRoom: 4,
});

await server.start();

server.onMessage((room, peerId, data) => {
  console.log(`[${room.id}] ${peerId}:`, data);
});

server.onPeerJoin((room, peerId) => {
  console.log(`${peerId} joined ${room.id}`);
});
```

### Configuration

```ts
interface GameServerOptions {
  port?: number;              // Default 8080. Use 0 for ephemeral (tests)
  hostname?: string;          // Default "127.0.0.1" (loopback only)
  maxClientsPerRoom?: number; // Default 8
  maxRooms?: number;          // Default 100
  maxConnections?: number;    // Total concurrent sockets. Default 200
  maxMessageSize?: number;    // Bytes per frame. Default 64KB
  maxMessagesPerSecond?: number;  // Per-client rate limit. Default 100
  firstPeerIsHost?: boolean;  // Default true
  pingInterval?: number;      // Server-initiated keepalive, ms. Default 30000
  clientTimeout?: number;     // Kick unresponsive clients after ms. Default 60000
  enableRoomListing?: boolean;    // HTTP /rooms + WS list-rooms. Default true
  corsAllowOrigin?: string;       // CORS header for /rooms. Default "*"
  httpRateLimit?: number;         // /rooms requests per window. Default 60
  httpRateLimitWindowMs?: number; // Rate limit window. Default 60000
  wsRateViolationLimit?: number;  // Consecutive violations before disconnect. Default 50
  enablePeerResume?: boolean;     // Allow previousPeerId reuse. Default false
}
```

### Room lifecycle

1. **Creation.** When the first peer sends a `join` frame for a room ID that does not exist, the server creates the room. `roomOpts` from this first peer configure the room (name, gameType, isPublic, maxPeers, metadata). Subsequent joiners' `roomOpts` are ignored.
2. **Joining.** Each peer gets a `welcome` frame. Existing peers in the room receive `peer-join`. The first peer is marked as host (unless `firstPeerIsHost: false`).
3. **Messaging.** Peers send `send` frames with `to: "all"` (broadcast) or `to: peerId` (unicast). The server routes accordingly, never echoing back to the sender.
4. **Leaving.** A peer sends `leave` or disconnects. Remaining peers get `peer-leave`. If the host leaves, the next peer is promoted.
5. **Destruction.** When the last peer leaves, the room is destroyed and `onRoomDestroy` fires.

### Server-side API

```ts
// Broadcast to all peers in a room (from: "server"). Optional exclusion.
server.broadcastToRoom(roomId: string, data: unknown, except?: string): void;

// Unicast to a specific peer. Returns false if room/peer not found.
server.sendToPeer(roomId: string, peerId: string, data: unknown): boolean;

// Disconnect a peer with an error frame.
server.kickPeer(roomId: string, peerId: string, reason?: string): void;

// Read-only snapshot of all rooms.
server.rooms: ReadonlyMap<string, Room>;

// List public rooms (for server-side admin).
server.listPublicRooms(filter?: RoomListFilter): PublicRoomInfo[];

// Event handlers -- all return Unsubscribe.
server.onMessage((room, peerId, data) => { ... });
server.onPeerJoin((room, peerId) => { ... });
server.onPeerLeave((room, peerId) => { ... });
server.onRoomCreate((room) => { ... });
server.onRoomDestroy((room) => { ... });
```

The `Room` object exposed to handlers:

```ts
interface Room {
  readonly id: string;
  readonly peers: readonly string[];
  readonly hostPeerId: string | null;
  readonly createdAt: number;
  readonly metadata: Record<string, unknown>;
  readonly name: string;
  readonly gameType?: string;
  readonly isPublic: boolean;
  readonly maxPeers: number;
}
```

### HTTP Endpoints

- `GET /rooms` -- returns `{ rooms: PublicRoomInfo[] }` as JSON. Supports `?gameType=X` query filter. CORS headers configured via `corsAllowOrigin`. Rate-limited per IP.
- `OPTIONS /rooms` -- CORS preflight.
- All other paths attempt a WebSocket upgrade; non-WS requests get `426`.

---

## TurnSync (Lockstep Coordination)

Defined in `engine/net/turn-sync.ts`. Sits on top of any `NetworkAdapter` and coordinates lockstep turns.

### How it works

1. Each peer calls `submitMove(move)` when the local player acts.
2. TurnSync broadcasts the move (tagged with the current turn number) to all peers via the adapter.
3. When moves from all required players for the current turn are collected, `onTurnComplete` fires with the full `{ playerId: move }` map and the turn counter advances.
4. Every peer receives the same set of moves and can apply them deterministically.

### Symmetric mode (default)

All players must submit for the turn to complete. Used when every player acts simultaneously each turn (e.g., simultaneous-action strategy).

```ts
const sync = new TurnSync<MyMove>({
  adapter,
  playerIds: ["alice", "bob", "carol"],
  turnTimeout: 15000,  // ms; 0 = no timeout
});

sync.onTurnComplete(({ turn, moves }) => {
  // moves: { alice: MyMove|null, bob: MyMove|null, carol: MyMove|null }
  applyMoves(gameState, moves);
});

sync.submitMove(myMove);
```

### Asymmetric mode

Only the active player's move is needed to complete the turn. Used by `createMultiplayerGame` for standard turn-rotation games.

```ts
const sync = new TurnSync<MyMove>({
  adapter,
  playerIds: ["alice", "bob"],
  asymmetric: true,
  activePlayerId: "alice",  // required in asymmetric mode
});

sync.onTurnComplete(({ turn, moves }) => {
  // Apply the active player's move
  applyMoves(gameState, moves);
  // Rotate to next player
  sync.setActivePlayer("bob");
});
```

### Options

```ts
interface TurnSyncOptions {
  adapter: NetworkAdapter;
  playerIds: string[];         // Must include adapter.id
  turnTimeout?: number;        // Auto-complete after ms. Default 0 (disabled)
  autoStart?: boolean;         // Default true. False to wire handlers first
  initialTurn?: number;        // Default 0. For mid-game resume
  asymmetric?: boolean;        // Default false
  activePlayerId?: string;     // Required when asymmetric: true
}
```

### State queries

```ts
sync.currentTurn;              // Current turn number (0-indexed)
sync.waitingFor;               // Player IDs that haven't submitted
sync.isComplete;               // True when all required moves are in
sync.hasSubmitted(playerId);   // Check a specific player
sync.getMove(playerId);        // undefined (not yet), null (timed out), or TMove
sync.activePlayerId;           // In asymmetric mode; null in symmetric
```

### Control methods

```ts
sync.start();                  // Begin listening (called automatically unless autoStart: false)
sync.stop();                   // Stop listening; pending moves preserved
sync.reset();                  // Back to turn 0, drop all moves
sync.advance();                // Force-complete current turn (missing = null)
sync.rebase(turn, moves?);     // Jump to a turn state (for reconnect replay)
sync.setActivePlayer(id);      // Asymmetric mode only -- change active player
```

### Timeout behavior

If `turnTimeout > 0`, the timer starts when the FIRST submission for a turn arrives. When it expires, missing players get `null` moves and `onTurnComplete` fires. Games decide how to handle null moves (skip the player, kick them, apply a default action, etc.).

---

## Desync Detection and State Hashing

Desync detection is opt-in. After each turn completes, each peer hashes its post-turn state and broadcasts the hash via `submitStateHash`. When all hashes arrive, TurnSync compares them and fires `onDesync` if any differ.

### Using submitStateHash

```ts
sync.onTurnComplete(({ turn, moves }) => {
  applyMoves(gameState, moves);
  // Hash AFTER applying the turn's moves
  sync.submitStateHash(hashMyState(gameState));
});

sync.onDesync(({ turn, hashes }) => {
  console.error("DESYNC at turn", turn, hashes);
  // hashes: { alice: "abc123", bob: "def456" }
});
```

### Built-in hashing utilities

Defined in `engine/core/state-hash.ts`:

```ts
import { defaultHashState, stableStringify, fnv1a32 } from "@engine";

// stableStringify: JSON with recursively sorted keys
// fnv1a32: FNV-1a 32-bit hash, returns unsigned int
// defaultHashState: stableStringify + fnv1a32, returns 8-char hex string

const hash = defaultHashState(gameState); // "a1b2c3d4"
```

`stableStringify` sorts object keys recursively so two logically-equal objects always produce the same string regardless of property insertion order. This is critical because JavaScript objects do not guarantee key order consistency across engines or after serialization round-trips.

`createMultiplayerGame` uses `defaultHashState` by default but accepts a custom `hashState` function for games that need to exclude cosmetic state from comparison.

### Wire protocol for state hashes

TurnSync sends state frames tagged with `__turnsync: true` and `kind: "state"`:

```ts
{
  __turnsync: true,
  kind: "state",
  turn: number,
  playerId: string,
  hash: string | number,
}
```

Games can share an adapter between TurnSync and custom messages -- anything without the `__turnsync: true` tag is ignored by TurnSync.

---

## createMultiplayerGame (One-Line Wrapper)

Defined in `engine/core/create-multiplayer-game.ts`. Turns any `defineGame` definition into a fully-wired multiplayer session.

### What it does

1. Creates adapters (MockAdapter or SocketAdapter) based on the chosen transport.
2. Runs `engine.runGame(def)` on each peer to create a `GameRuntime`.
3. Creates a `TurnSync<GameMove>` in asymmetric mode.
4. Monkey-patches `runtime.dispatch` so local moves flow through TurnSync instead of being applied directly.
5. On `onTurnComplete`, applies the move on every peer via the original dispatch, then rotates the active player.
6. After each turn, hashes the game state and submits it for desync detection.

### Local transport (in-process)

Runs N peers on a single `MockBus`. Ideal for tests, hotseat mode, or AI opponents.

```ts
import { createMultiplayerGame, defineGame, Engine } from "@engine";

const handle = await createMultiplayerGame(myGame, {
  transport: { kind: "local", players: 2 },
  engineFactory: () => new Engine(document.querySelector("canvas")!),
  onDesync: (e) => console.warn("desync", e),
});

// handle.allPeers gives access to every peer's handle
const [peerA, peerB] = handle.allPeers!;

// Dispatch a move on the active peer
peerA.runtime.dispatch("place", [4]);
```

### Socket transport (real network)

Connects to a GameServer. Waits for the expected number of players before starting.

```ts
const handle = await createMultiplayerGame(myGame, {
  transport: { kind: "socket", url: "wss://server.example.com", resumeOnReconnect: true },
  roomId: "game-abc-123",
  roomOpts: { name: "My Game", gameType: "tic-tac-toe", isPublic: true },
  engineFactory: () => new Engine(canvas),
  onDesync: (e) => showDesyncWarning(e),
  onPeerJoin: (id) => console.log("player joined:", id),
  onPeerLeave: (id) => console.log("player left:", id),
  onMove: (move) => console.log("move applied:", move),
});
```

### The handle object

```ts
interface MultiplayerGameHandle<TState> {
  engine: Engine;
  adapter: NetworkAdapter;
  turnSync: TurnSync<GameMove>;
  playerId: string;
  runtime: GameRuntime<TState>;
  disconnect(): Promise<void>;
  readonly allPeers?: ReadonlyArray<MultiplayerGameHandle<TState>>; // local only
}
```

### Configuration

```ts
interface MultiplayerOpts<TState> {
  transport: { kind: "local"; players: number } | { kind: "socket"; url: string; resumeOnReconnect?: boolean };
  engineFactory: () => Engine;
  roomId?: string;             // Socket only; auto-generated if omitted
  roomOpts?: { name?; isPublic?; gameType?; metadata? };
  playerId?: string;           // Override; auto-generated if omitted
  hashState?: (state: TState) => string | number;
  onDesync?: (e: DesyncEvent) => void;
  onPeerJoin?: (peerId: string) => void;
  onPeerLeave?: (peerId: string) => void;
  onMove?: (move: GameMove) => void;
}
```

### How dispatch is hooked

The wrapper replaces `runtime.dispatch` with a function that:

1. Checks if the game is over (returns `"game-over"` if so).
2. Checks if this peer is the active player (returns `"invalid"` if not).
3. Creates a `GameMove { kind, args, playerId }` and calls `turnSync.submitMove(move)`.
4. Returns `undefined` (success) -- the actual state mutation happens when `onTurnComplete` fires.

On `onTurnComplete`, the wrapper calls the original `runtime.dispatch` inside a guard flag (`applyingFromNetwork = true`) so the patched dispatch does not re-enter TurnSync.

### Player ID resolution

Games using `defineGame` with `turns: { order: ["X", "O"] }` have symbolic player IDs, while multiplayer peers have `player-1`, `player-2` IDs. The wrapper resolves this by position: `runtime.playerIndex` maps to `playerIds[index]`. If the game uses peer IDs directly in `turns.order`, they match verbatim.

---

## Converting a Single-Player Game to Multiplayer

### Step 1: Ensure determinism

Every operation that mutates game state must be deterministic given the same inputs.

- Use `ctx.random()` (the seeded RNG from `def.seed`) instead of `Math.random()`.
- Do not use wall-clock time (`Date.now()`, `performance.now()`) in game logic.
- Avoid iteration over `Set` or `Map` where insertion order might differ across peers.

Set a seed in the game definition:

```ts
const myGame = defineGame<MyState>({
  name: "my-game",
  seed: 42,  // Required for deterministic RNG
  // ...
});
```

### Step 2: Use peer IDs in turn order

```ts
turns: { order: ["player-1", "player-2"] },
```

Or use numeric/symbolic IDs and let the wrapper map by position.

### Step 3: Moves must be pure state mutations

Every move function should mutate `ctx.state` only. No hidden side effects, no reading from external sources, no async operations.

```ts
moves: {
  place(ctx, idx: number) {
    if (ctx.state.board[idx] !== null) return "invalid";
    ctx.state.board[idx] = ctx.currentPlayer === "player-1" ? "X" : "O";
  },
},
```

### Step 4: Wrap with createMultiplayerGame

```ts
const handle = await createMultiplayerGame(myGame, {
  transport: { kind: "local", players: 2 },
  engineFactory: () => new Engine(canvas),
});

// Use handle.runtime.dispatch("moveName", [args]) to submit moves.
// Only the active player's dispatch will succeed.
```

### Step 5: Set up the server (for online play)

Create a server script:

```ts
// server.ts -- run with: bun run server.ts
import { GameServer } from "@engine";

const server = new GameServer({
  port: 8080,
  hostname: "0.0.0.0",
  maxClientsPerRoom: 2,
  enableRoomListing: true,
});

await server.start();
console.log(`GameServer listening on port ${server.port}`);
```

Switch the client to socket transport:

```ts
const handle = await createMultiplayerGame(myGame, {
  transport: { kind: "socket", url: "wss://your-server:8080" },
  roomId: "my-room",
  engineFactory: () => new Engine(canvas),
});
```

---

## Wire Protocol Reference

Client and server communicate via JSON frames over WebSocket.

### Client frames (sent by SocketAdapter)

| Frame | Fields | Purpose |
|-------|--------|---------|
| `join` | `roomId`, `clientName?`, `roomOpts?`, `previousPeerId?` | Join/create a room |
| `leave` | -- | Leave current room |
| `send` | `to: string \| "all"`, `data: unknown` | Send a message |
| `ping` | `t: number` | Latency measurement |
| `list-rooms` | `filter?: { gameType? }` | Request room listing |

### Server frames (sent by GameServer)

| Frame | Fields | Purpose |
|-------|--------|---------|
| `welcome` | `peerId`, `isHost`, `peers: string[]`, `resumed?` | Join acknowledgement |
| `peer-join` | `peerId` | New peer entered the room |
| `peer-leave` | `peerId` | Peer left the room |
| `message` | `from: string`, `data: unknown` | Routed message |
| `error` | `code: string`, `message: string` | Error notification |
| `pong` | `t: number` | Ping response |
| `ping` | `t: number` | Server-initiated keepalive |
| `rooms` | `rooms: PublicRoomInfo[]` | Room listing response |

### Error codes

| Code | Trigger |
|------|---------|
| `already-joined` | Sending a second `join` on the same connection |
| `invalid-room` | Empty `roomId` |
| `room-full` | Room at `maxPeers` capacity |
| `server-full` | Server at `maxRooms` capacity |
| `not-joined` | Sending a message before joining a room |
| `malformed-json` | Unparseable JSON |
| `malformed-frame` | Missing `type` field |
| `unknown-frame` | Unrecognized frame type |
| `kicked` | `server.kickPeer()` was called |
| `listing-disabled` | `enableRoomListing: false` |
| `message-too-large` | Frame exceeds `maxMessageSize` |

### TurnSync frames (sent over the adapter)

TurnSync messages are regular adapter messages with a `__turnsync: true` tag:

```ts
// Move frame
{ __turnsync: true, kind: "move", turn: number, playerId: string, move: TMove }

// State hash frame (for desync detection)
{ __turnsync: true, kind: "state", turn: number, playerId: string, hash: string | number }
```

Non-TurnSync messages (anything without `__turnsync: true`) are ignored by TurnSync, so games can mix TurnSync traffic with custom messages on the same adapter.

---

## Room Discovery and Lobbies

### HTTP discovery (pre-connect)

```ts
const rooms = await SocketAdapter.listRooms("wss://server.example.com", {
  gameType: "tic-tac-toe",
});
// rooms: PublicRoomInfo[]
```

This converts the WebSocket URL to HTTP and hits `GET /rooms?gameType=tic-tac-toe`.

### WebSocket discovery (post-connect)

```ts
const adapter = new SocketAdapter({ url, roomId: "lobby" });
await adapter.connect();
const rooms = await adapter.listRooms({ gameType: "tic-tac-toe" });
```

### PublicRoomInfo shape

```ts
interface PublicRoomInfo {
  id: string;
  name: string;
  peerCount: number;
  maxPeers: number;
  gameType?: string;
  isPublic: boolean;
  isFull: boolean;
  createdAt: number;
  metadata?: Record<string, unknown>;
}
```

### Private rooms

Rooms created with `isPublic: false` are excluded from all listings (HTTP and WebSocket). They are still joinable if the client knows the room ID.

### Room creation options

Only the first peer to join a room has their `roomOpts` honored. Subsequent joiners' options are ignored. `maxPeers` is clamped to the server's `maxClientsPerRoom`.

```ts
const adapter = new SocketAdapter({
  url: "wss://server",
  roomId: "secret-game",
  roomOpts: {
    name: "Private Match",
    gameType: "chess",
    isPublic: false,
    maxPeers: 2,
    metadata: { rated: true, timeControl: "5+3" },
  },
});
```

---

## Reconnection and Session Resume

### Auto-reconnect (SocketAdapter)

Enabled by default. On unexpected disconnection:

1. Waits with linear backoff: `reconnectDelay * min(attempt, 10)`.
2. Opens a new socket and re-sends the `join` frame.
3. Stops after `maxReconnectAttempts` or on a terminal close code (1013).

### Session resume

By default, every reconnect gets a fresh `peerId`. Enable session resume for stateful games:

```ts
// Client
const adapter = new SocketAdapter({
  url: "wss://server",
  roomId: "game-room",
  resumeOnReconnect: true,  // sends previousPeerId on reconnect
});

// Server
const server = new GameServer({
  enablePeerResume: true,  // allows reuse of previousPeerId
});
```

When resume succeeds, the `welcome` frame has `resumed: true` and the peer ID is the same as before. Game state keyed by peer ID survives the reconnect gap. When resume fails (another socket already holds the ID), a fresh ID is assigned.

**Security note:** With `enablePeerResume: true`, any client can claim any disconnected peer ID. Only enable this when your game logic needs it and you accept the spoofing risk.

### TurnSync rebase (manual reconnect recovery)

If a peer reconnects mid-game and needs to catch up:

```ts
sync.rebase(currentTurn, pendingMoves);
```

This jumps the turn counter and optionally seeds moves that other peers already submitted. If the seeded moves complete the turn, `onTurnComplete` fires immediately.

---

## Testing Multiplayer Games

The test suite at `engine/__tests__/net/` and `engine/__tests__/core/create-multiplayer-game.test.ts` demonstrates every testing pattern.

### Pattern 1: MockAdapter for unit-level TurnSync tests

No server, no async. Everything is synchronous with `latency: 0`.

```ts
import { MockAdapter, MockBus, TurnSync } from "@engine";

const bus = MockBus.create();
const alice = new MockAdapter({ bus, id: "alice" });
const bob = new MockAdapter({ bus, id: "bob" });
await alice.connect();
await bob.connect();

const syncA = new TurnSync<string>({ adapter: alice, playerIds: ["alice", "bob"] });
const syncB = new TurnSync<string>({ adapter: bob, playerIds: ["alice", "bob"] });

const completed: TurnCompleteEvent<string>[] = [];
syncA.onTurnComplete((e) => completed.push(e));

syncA.submitMove("alice-move");
syncB.submitMove("bob-move");

expect(completed).toHaveLength(1);
expect(completed[0].moves).toEqual({ alice: "alice-move", bob: "bob-move" });
```

### Pattern 2: stubEngine for createMultiplayerGame tests

A minimal engine stub that provides `world`, `systems`, `scenes`, `turns`, and `runGame` without a canvas. See `engine/__tests__/core/create-multiplayer-game.test.ts` for the full `stubEngine()` implementation.

```ts
function stubEngine(): Engine {
  const world = createWorld();
  const systems = new SystemRunner();
  const scenes = new SceneManager();
  const turns = new TurnManager();
  let gameRuntime = null;
  const engine = {
    world, systems, scenes, turns,
    registerScene: (s) => scenes.register(s),
    addSystem: (sys) => systems.add(sys, engine),
    removeSystem: (name) => systems.remove(name, engine),
    spawn: (data) => world.add(data),
    destroy: (e) => world.remove(e),
    get game() { return gameRuntime; },
    runGame(def) {
      const rt = new GameRuntime(def, engine);
      gameRuntime = rt;
      const scene = buildGameScene(def, rt);
      scenes.register(scene);
      return scene.name;
    },
    stop() {},
  };
  return engine as unknown as Engine;
}

const handle = await createMultiplayerGame(myGame, {
  transport: { kind: "local", players: 2 },
  engineFactory: stubEngine,
});
```

### Pattern 3: Real GameServer integration tests

Spin up a server on an ephemeral port (`port: 0`) and connect real `SocketAdapter` clients.

```ts
const server = new GameServer({ port: 0, pingInterval: 0 });
await server.start();

const clientA = new SocketAdapter({
  url: `ws://localhost:${server.port}`,
  roomId: "test-room",
});
await clientA.connect();

// ... test ...

clientA.disconnect();
await server.stop();
```

### Pattern 4: Determinism soak tests

Run many turns across many seeds and verify post-turn state hashes match between peers. See `engine/__tests__/net/soak.test.ts` and `engine/__tests__/net/determinism-soak.test.ts`.

The soak tests:
- Run 100 turns across 10+ seeds.
- Hash the entire world state after each turn on each peer.
- Assert every per-turn hash matches between peers.
- Include a corruption scenario (deliberately mutate one peer's state) to verify the detection mechanism works.

### Pattern 5: Verifying desync detection

```ts
const [a, b] = handle.allPeers!;
const desyncs: DesyncEvent[] = [];
a.turnSync.onDesync((e) => desyncs.push(e));

// Corrupt one peer's state out-of-band
b.runtime.gameState.total = 999;

// Submit a move -- desync fires after the turn completes
a.runtime.dispatch("inc", []);
expect(desyncs.length).toBeGreaterThan(0);
```

### Test files reference

| File | Covers |
|------|--------|
| `engine/__tests__/net/mock-adapter.test.ts` | MockAdapter + MockBus behavior |
| `engine/__tests__/net/socket-adapter.test.ts` | SocketAdapter + GameServer integration |
| `engine/__tests__/net/game-server.test.ts` | GameServer room management, messaging, errors |
| `engine/__tests__/net/room-listing.test.ts` | HTTP /rooms, WS list-rooms, roomOpts, discovery |
| `engine/__tests__/net/turn-sync.test.ts` | TurnSync symmetric/asymmetric, timeouts, rebase |
| `engine/__tests__/net/soak.test.ts` | ECS world determinism over 100+ turns |
| `engine/__tests__/net/determinism-soak.test.ts` | Card-draw determinism + corruption detection |
| `engine/__tests__/core/create-multiplayer-game.test.ts` | Full wrapper: moves, turns, desync, disconnect |

---

## Deployment and Security

### Server defaults (safe by default)

The `GameServer` ships with conservative defaults:

| Setting | Default | Purpose |
|---------|---------|---------|
| `hostname` | `"127.0.0.1"` | Loopback only; must opt-in to `"0.0.0.0"` for LAN |
| `maxConnections` | 200 | Total concurrent sockets |
| `maxMessageSize` | 64 KB | Per-frame size limit |
| `maxMessagesPerSecond` | 100 | Per-client rate limit |
| `wsRateViolationLimit` | 50 | Consecutive violations before disconnect |
| `httpRateLimit` | 60 | /rooms requests per minute per IP |
| `maxRooms` | 100 | Total simultaneous rooms |
| `maxClientsPerRoom` | 8 | Peers per room |
| `clientTimeout` | 60000 ms | Kick unresponsive clients |
| `pingInterval` | 30000 ms | Server-initiated keepalive |
| `enablePeerResume` | false | Spoofing-safe default |

### Rate limiting

**WebSocket messages:** Sliding 1-second window. Excess messages are silently dropped (gentler than disconnecting). After `wsRateViolationLimit` consecutive violations in a single window, the socket is closed.

**HTTP /rooms:** Sliding window per IP. Returns `429 Too Many Requests` with `Retry-After` header when exceeded. The bucket map is pruned opportunistically to prevent unbounded growth.

### CORS

The `/rooms` endpoint sets `Access-Control-Allow-Origin` to `corsAllowOrigin` (default `"*"`). Set to a specific origin for stricter control, or `""` to omit the header entirely.

### Production checklist

1. **Bind to a specific interface.** Use `hostname: "0.0.0.0"` only on trusted networks. In production, put the GameServer behind a reverse proxy (nginx, Caddy) that terminates TLS and forwards WebSocket upgrades.

2. **Use wss:// in production.** The `SocketAdapter` accepts `wss://` URLs. TLS termination should happen at the proxy.

3. **Tune limits.** Adjust `maxMessagesPerSecond`, `maxConnections`, and `maxRooms` based on expected load. The defaults are conservative for single-machine deployment.

4. **Monitor room lifecycle.** Use `server.onRoomCreate/onRoomDestroy` for logging and metrics.

5. **Handle game-over state.** The server is a relay; it does not know when a game ends. Use `server.onMessage` to watch for game-over signals and clean up rooms, or let rooms self-destruct when peers leave.

6. **Validate on the server.** For competitive games, add server-side validation in `server.onMessage` to reject illegal moves before relaying. The default relay model trusts clients.

### Scaling considerations

The current `GameServer` is a single-process Bun server. For scaling beyond a single machine:

- **Horizontal partitioning by room.** Route room IDs to specific server instances via consistent hashing at the load balancer.
- **Room listing aggregation.** Aggregate `/rooms` responses from multiple server instances behind a gateway.
- **Shared state.** The server is stateless beyond in-memory room/peer maps. For multi-server deployments, consider Redis-backed room state or a coordination layer.
- **Connection limits.** Each `GameServer` instance handles up to `maxConnections` sockets. Scale by adding instances, not by raising the limit unboundedly.

---

## Troubleshooting

### "GameServer requires the Bun runtime"

`GameServer` uses `Bun.serve()` internally. It must run in a Bun process, not Node.js or the browser. Import it only in your server script.

### SocketAdapter connect() never resolves

- Verify the server is running and the URL is correct.
- Check that the port is not firewalled.
- If `maxReconnectAttempts` is reached, `connect()` rejects with an error. Wrap in try/catch.

### Moves desync immediately

- Ensure `def.seed` is set so `ctx.random()` is deterministic.
- Verify no `Math.random()` calls in game logic.
- Check that moves only mutate `ctx.state` -- no external side effects.
- Use `defaultHashState` or a custom `hashState` that covers all mutable state.

### "adapter.id not in playerIds"

`TurnSync` requires that the adapter's own ID appears in the `playerIds` array. Spectators should use the raw adapter, not TurnSync.

### Room discovery returns empty array

- Verify `enableRoomListing` is true on the server (it is by default).
- Check that rooms are created with `isPublic: true` (or no `isPublic` field, which defaults to true).
- Verify the `gameType` filter matches exactly (case-sensitive).

### Peer resume not working

Both sides must opt in:
- Client: `resumeOnReconnect: true` on the `SocketAdapter`.
- Server: `enablePeerResume: true` on the `GameServer`.
- The previous peer ID must not be held by another active connection.

### "setActivePlayer only valid in asymmetric mode"

`setActivePlayer()` only works when TurnSync was constructed with `asymmetric: true`. In symmetric mode, all players must submit every turn.
