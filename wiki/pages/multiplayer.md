---
title: Multiplayer
created: 2026-04-21
updated: 2026-04-21
type: architecture
tags: [engine, networking, multiplayer]
sources:
  - engine/net/network-adapter.ts
  - engine/net/mock-adapter.ts
  - engine/net/socket-adapter.ts
  - engine/net/game-server.ts
  - engine/net/turn-sync.ts
  - engine/core/create-multiplayer-game.ts
  - engine/core/state-hash.ts
---

# Multiplayer

The multiplayer layer is a composable stack for turn-based networked games. It uses lockstep synchronization over a transport-agnostic adapter interface.

## Architecture

```
createMultiplayerGame()        <-- one-line wrapper
       |
  GameRuntime (defineGame)     <-- game logic + state
       |
    TurnSync<TMove>            <-- lockstep turn coordination
       |
    NetworkAdapter             <-- transport abstraction
     /         \
MockAdapter   SocketAdapter    <-- concrete transports
                  |
             GameServer         <-- Bun WebSocket relay
```

**Design decisions:** Lockstep, not server-authoritative -- every peer runs the same deterministic logic. The `GameServer` is a relay (message router + room manager), not a game logic host. Transport-agnostic -- swapping `MockAdapter` for `SocketAdapter` requires zero game code changes. Room-based with peer tracking and host assignment.

## NetworkAdapter Interface

Every transport implements this shape (defined in `engine/net/network-adapter.ts`):

| Property/Method | Description |
|-----------------|-------------|
| `id` | This peer's stable ID |
| `isHost` | Whether this peer is the room host |
| `peers` | Connected peer IDs (excluding self) |
| `connected` | Connection state |
| `connect()` / `disconnect()` | Lifecycle |
| `send(to, message)` / `broadcast(message)` | Messaging |
| `onMessage` / `onPeerJoin` / `onPeerLeave` / `onConnect` / `onDisconnect` | Event handlers returning unsubscribe functions |

Contract: adapters must not deliver a peer's own broadcasts back to itself. `send()` to an unknown peer is a silent no-op.

## MockAdapter

In-memory adapter for tests and local hotseat. Multiple instances share a `MockBus`. Supports simulated latency (`latency` option) and message dropping (`dropRate`). Messages are deep-cloned via JSON round-trip to catch shared-reference bugs.

```ts
const bus = MockBus.create();
const host = new MockAdapter({ bus, id: "alice", isHost: true });
const client = new MockAdapter({ bus, id: "bob" });
```

## SocketAdapter

Browser-side WebSocket client pairing with `GameServer`. Supports auto-reconnect, session resume via `previousPeerId`, room creation options (`isPublic`, `maxPeers`, `gameType`, `metadata`), and room listing.

## GameServer

Bun WebSocket relay server. Manages rooms, peer tracking, host assignment, and message routing. Features rate limiting, room capacity enforcement, public room listing with filtering, and reconnection support.

```ts
const server = new GameServer({ port: 3000 });
```

## TurnSync

Lockstep coordinator over any `NetworkAdapter`. Supports symmetric mode (all players submit each turn) and asymmetric mode (only active player). Includes desync detection via deterministic state hashing (`engine/core/state-hash.ts`).

## createMultiplayerGame

One-line wrapper composing all layers. Takes a [[define-game]] definition and network options, returns a `MultiplayerGameHandle` with `start()`, `stop()`, and `waitForPlayers()`.

```ts
const handle = createMultiplayerGame(gameDefinition, {
  adapter: new SocketAdapter({ url: "wss://server.com", roomId: "lobby" }),
});
await handle.waitForPlayers();
handle.start(engine);
```

## See Also

- [[define-game]] -- the declarative game API that multiplayer wraps
- [[engine-overview]] -- how networking fits into the engine
