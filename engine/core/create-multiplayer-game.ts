/**
 * createMultiplayerGame — one-line wrapper that turns a defineGame
 * GameDefinition into a fully-wired multiplayer session with lockstep
 * sync + desync detection.
 *
 * Composes MockAdapter / SocketAdapter + TurnSync + the existing
 * GameRuntime from defineGame. Moves that the local player dispatches
 * (via ctx.moves.xxx() or engine.game.dispatch(name, ...args)) are
 * intercepted and shipped through TurnSync; when a turn completes every
 * peer applies the move(s) in the same order, giving identical state.
 *
 * After each applied turn, every peer hashes its post-turn state (default:
 * stable JSON + FNV-1a 32). TurnSync's onDesync event fires when peers
 * disagree.
 *
 * ### Hook mechanism
 *
 * The wrapper monkey-patches runtime.dispatch on the GameRuntime returned
 * by engine.runGame(def). The original dispatch is retained and called
 * only from the TurnSync onTurnComplete handler, so the network path is
 * authoritative while single-player semantics for games that don't use
 * the wrapper remain untouched.
 *
 * ### Turn model
 *
 * Uses TurnSync's asymmetric mode — only the active player must submit
 * for a turn to complete. The wrapper rotates the active player id in
 * lockstep with the runtime's currentPlayer. Off-turn moves return
 * "invalid" without hitting the network.
 */

import { MockAdapter, MockBus } from "../net/mock-adapter";
import type { NetworkAdapter, Unsubscribe } from "../net/network-adapter";
import { SocketAdapter } from "../net/socket-adapter";
import { type DesyncEvent, TurnSync } from "../net/turn-sync";
import type { GameDefinition, GameRuntime, MoveResult } from "./define-game";
import type { Engine } from "./engine";
import { defaultHashState } from "./state-hash";

// Public types

/** The wire format for a move. */
export interface GameMove {
  readonly kind: string;
  readonly args: unknown[];
  readonly playerId: string;
}

/** Transport selection. */
export type MultiplayerTransport =
  | {
      /** N MockAdapters wired to a single in-memory bus. Meant for tests. */
      kind: "local";
      players: number;
    }
  | {
      /** WebSocket connection to a GameServer. */
      kind: "socket";
      url: string;
      token?: string;
      resumeOnReconnect?: boolean;
    };

/** Handle returned from createMultiplayerGame. */
export interface MultiplayerGameHandle<TState> {
  /** The engine driving this peer's copy of the game. */
  engine: Engine;
  /** The active network adapter. */
  adapter: NetworkAdapter;
  /** TurnSync instance wiring moves through the adapter. */
  turnSync: TurnSync<GameMove>;
  /** Stable peer id for this handle. */
  playerId: string;
  /** Disconnect cleanly — stops the engine loop and tears down network. */
  disconnect(): Promise<void>;
  /** Current game runtime (for advanced introspection). */
  runtime: GameRuntime<TState>;
  /** For local transport: every peer's handle including this one. */
  readonly allPeers?: ReadonlyArray<MultiplayerGameHandle<TState>>;
}

/** Configuration options. */
export interface MultiplayerOpts<TState> {
  /** Transport to use. */
  transport: MultiplayerTransport;
  /**
   * Build an Engine instance for each peer. Required — lets tests pass a
   * canvas-less stub; real games pass `() => new Engine(canvas)`.
   */
  engineFactory: () => Engine;
  /** Socket only. If omitted on first join, a uuid is generated. */
  roomId?: string;
  /** Socket only — forwarded to SocketAdapter's roomOpts. */
  roomOpts?: {
    name?: string;
    isPublic?: boolean;
    gameType?: string;
    metadata?: Record<string, unknown>;
  };
  /** Stable player id override. One is generated otherwise. */
  playerId?: string;
  /** Override the default hash function used for desync detection. */
  hashState?: (state: TState) => string | number;
  /** Fired when peers report different post-turn state hashes. */
  onDesync?: (e: DesyncEvent) => void;
  /** Peer lifecycle callbacks (proxy the adapter events). */
  onPeerJoin?: (peerId: string) => void;
  onPeerLeave?: (peerId: string) => void;
  /** Called with every applied move (after TurnSync completion). */
  onMove?: (move: GameMove) => void;
}

// Implementation

/**
 * Wrap a defineGame definition with multiplayer networking. Returns a
 * handle per peer for local transport, or a single handle for socket.
 *
 * For local transport the returned handle is the first peer; every peer's
 * handle is available via `handle.allPeers`.
 */
export async function createMultiplayerGame<TState>(
  game: GameDefinition<TState>,
  opts: MultiplayerOpts<TState>,
): Promise<MultiplayerGameHandle<TState>> {
  if (opts.transport.kind === "local") {
    const handles = await createLocalMultiplayerGame(game, opts, opts.transport.players);
    const readonly: ReadonlyArray<MultiplayerGameHandle<TState>> = handles;
    for (const h of handles) {
      (h as { allPeers?: ReadonlyArray<MultiplayerGameHandle<TState>> }).allPeers = readonly;
    }
    return handles[0] as MultiplayerGameHandle<TState>;
  }
  return await createSocketMultiplayerGame(game, opts, opts.transport);
}

// Local transport

async function createLocalMultiplayerGame<TState>(
  game: GameDefinition<TState>,
  opts: MultiplayerOpts<TState>,
  playerCount: number,
): Promise<Array<MultiplayerGameHandle<TState>>> {
  if (playerCount < 1) {
    throw new Error("createMultiplayerGame: local transport needs players >= 1");
  }

  const bus = MockBus.create();
  const playerIds = Array.from({ length: playerCount }, (_, i) => `player-${i + 1}`);

  const adapters = playerIds.map((id, i) => new MockAdapter({ bus, id, isHost: i === 0 }));

  for (const a of adapters) await a.connect();

  const handles: Array<MultiplayerGameHandle<TState>> = adapters.map((adapter) => {
    const engine = opts.engineFactory();
    engine.runGame(game);
    const runtime = engine.game as GameRuntime<TState>;
    if (!runtime) {
      throw new Error("createMultiplayerGame: engine.game is null after runGame");
    }

    runtime.start();

    const initialActive = resolveActivePlayerId(runtime, playerIds);

    const turnSync = new TurnSync<GameMove>({
      adapter,
      playerIds,
      asymmetric: true,
      activePlayerId: initialActive,
    });

    const wiring = wireRuntime<TState>({
      engine,
      runtime,
      turnSync,
      adapter,
      playerId: adapter.id,
      playerIds,
      hashState: opts.hashState ?? ((s: TState) => defaultHashState(s)),
      onDesync: opts.onDesync,
      onMove: opts.onMove,
    });

    const peerJoinOff = opts.onPeerJoin ? adapter.onPeerJoin(opts.onPeerJoin) : null;
    const peerLeaveOff = opts.onPeerLeave ? adapter.onPeerLeave(opts.onPeerLeave) : null;

    const handle: MultiplayerGameHandle<TState> = {
      engine,
      adapter,
      turnSync,
      runtime,
      playerId: adapter.id,
      async disconnect() {
        wiring.dispose();
        peerJoinOff?.();
        peerLeaveOff?.();
        turnSync.stop();
        adapter.disconnect();
        try {
          engine.stop();
        } catch {
          // engine.stop may throw if never started (no canvas)
        }
      },
    };
    return handle;
  });

  return handles;
}

// Socket transport

/** Default timeout when waiting for peers to join (ms). */
const WAIT_FOR_PLAYERS_TIMEOUT_MS = 30_000;

/**
 * Wait until `count` total peers (including self) have joined via the adapter.
 * Resolves with the sorted list of player ids. Rejects on timeout.
 */
function waitForPlayers(
  adapter: NetworkAdapter,
  count: number,
  timeout = WAIT_FOR_PLAYERS_TIMEOUT_MS,
): Promise<string[]> {
  const currentTotal = () => 1 + adapter.peers.length; // self + others
  if (currentTotal() >= count) {
    return Promise.resolve([adapter.id, ...adapter.peers].sort());
  }
  return new Promise<string[]>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      off();
      offDisconnect();
      clearTimeout(timer);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(
        new Error(
          `waitForPlayers: timed out after ${timeout}ms (have ${currentTotal()}/${count} players)`,
        ),
      );
    }, timeout);
    const off = adapter.onPeerJoin(() => {
      if (settled) return;
      if (currentTotal() >= count) {
        settled = true;
        cleanup();
        resolve([adapter.id, ...adapter.peers].sort());
      }
    });
    const offDisconnect = adapter.onDisconnect(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("adapter disconnected before all players joined"));
    });
  });
}

async function createSocketMultiplayerGame<TState>(
  game: GameDefinition<TState>,
  opts: MultiplayerOpts<TState>,
  transport: Extract<MultiplayerTransport, { kind: "socket" }>,
): Promise<MultiplayerGameHandle<TState>> {
  const roomId =
    opts.roomId ??
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `room-${Math.random().toString(36).slice(2, 10)}`);

  const adapter = new SocketAdapter({
    url: transport.url,
    roomId,
    roomOpts: opts.roomOpts,
    resumeOnReconnect: transport.resumeOnReconnect ?? false,
  });

  await adapter.connect();

  // Wait for the expected number of players before constructing TurnSync.
  // Without this, playerIds is snapshotted before all peers connect.
  const expectedPlayers = game.players?.default ?? game.players?.min ?? 2;
  const playerIds = await waitForPlayers(adapter, expectedPlayers);

  const engine = opts.engineFactory();
  engine.runGame(game);
  const runtime = engine.game as GameRuntime<TState>;
  if (!runtime) throw new Error("createMultiplayerGame: engine.game is null after runGame");

  runtime.start();

  const initialActive = resolveActivePlayerId(runtime, playerIds);
  const turnSync = new TurnSync<GameMove>({
    adapter,
    playerIds,
    asymmetric: true,
    activePlayerId: initialActive,
  });

  const wiring = wireRuntime<TState>({
    engine,
    runtime,
    turnSync,
    adapter,
    playerId: adapter.id,
    playerIds,
    hashState: opts.hashState ?? ((s: TState) => defaultHashState(s)),
    onDesync: opts.onDesync,
    onMove: opts.onMove,
  });

  const peerJoinOff = opts.onPeerJoin ? adapter.onPeerJoin(opts.onPeerJoin) : null;
  const peerLeaveOff = opts.onPeerLeave ? adapter.onPeerLeave(opts.onPeerLeave) : null;

  const handle: MultiplayerGameHandle<TState> = {
    engine,
    adapter,
    turnSync,
    runtime,
    playerId: adapter.id,
    async disconnect() {
      wiring.dispose();
      peerJoinOff?.();
      peerLeaveOff?.();
      turnSync.stop();
      adapter.disconnect();
      try {
        engine.stop();
      } catch {
        // engine.stop may throw if never started (no canvas)
      }
    },
  };
  return handle;
}

// Wiring

interface WireRuntimeArgs<TState> {
  engine: Engine;
  runtime: GameRuntime<TState>;
  turnSync: TurnSync<GameMove>;
  adapter: NetworkAdapter;
  playerId: string;
  playerIds: string[];
  hashState: (state: TState) => string | number;
  onDesync?: (e: DesyncEvent) => void;
  onMove?: (move: GameMove) => void;
}

/**
 * Hook runtime.dispatch so local dispatches flow through TurnSync while
 * network-applied moves call the original dispatch directly.
 *
 * Returns a dispose() that restores the original dispatch.
 */
function wireRuntime<TState>(args: WireRuntimeArgs<TState>): { dispose: () => void } {
  const { runtime, turnSync, playerId, playerIds, hashState, onDesync, onMove } = args;

  const originalDispatch = runtime.dispatch.bind(runtime);

  // Guard to avoid infinite recursion when applying a move from the network.
  let applyingFromNetwork = false;

  runtime.dispatch = (name: string, argList: unknown[]): MoveResult | "game-over" => {
    if (applyingFromNetwork) {
      return originalDispatch(name, argList);
    }

    if (runtime.result !== null) return "game-over";

    // Only the active player may submit a move. In asymmetric TurnSync an
    // off-turn submission would be accepted but not complete the turn —
    // so instead we reject locally, keeping the contract "moves on your
    // turn only" clear.
    if (turnSync.activePlayerId !== playerId) {
      return "invalid";
    }

    const move: GameMove = { kind: name, args: argList, playerId };
    turnSync.submitMove(move);
    return undefined;
  };

  const offDesync = turnSync.onDesync((e) => {
    try {
      onDesync?.(e);
    } catch (err) {
      console.error("[createMultiplayerGame] onDesync handler threw:", err);
    }
  });

  // Apply the active player's move, then rotate the active player id to
  // whoever the runtime says is next. Using asymmetric TurnSync, only the
  // active player's move is in the event.
  const offTurnComplete = turnSync.onTurnComplete((event) => {
    applyingFromNetwork = true;
    try {
      for (const maybeMove of Object.values(event.moves)) {
        if (maybeMove == null) continue;
        const move = maybeMove as GameMove;
        const res = originalDispatch(move.kind, move.args);
        if (res === "invalid" || res === "game-over") continue;
        try {
          onMove?.(move);
        } catch (err) {
          console.error("[createMultiplayerGame] onMove handler threw:", err);
        }
      }
    } finally {
      applyingFromNetwork = false;
    }

    // Rotate the active player to match runtime.currentPlayer.
    const next = resolveActivePlayerId(runtime, playerIds);
    if (turnSync.activePlayerId !== next) {
      turnSync.setActivePlayer(next);
    }

    // Submit the post-turn state hash. TurnSync tags it with the turn that
    // just completed; peers compare and onDesync fires on mismatch.
    try {
      const hash = hashState(runtime.gameState);
      turnSync.submitStateHash(hash);
    } catch (err) {
      console.error("[createMultiplayerGame] hashState threw:", err);
    }
  });

  const unsubs: Unsubscribe[] = [offDesync, offTurnComplete];

  return {
    dispose() {
      for (const u of unsubs) {
        try {
          u();
        } catch {
          // ignore
        }
      }
      runtime.dispatch = originalDispatch;
    },
  };
}

/**
 * Map the runtime's currentPlayer to a peer id. Works for two conventions:
 *
 *   1. Game uses peer ids directly in turns.order (e.g. ["player-1", "player-2"])
 *      — the active player id matches verbatim.
 *   2. Game uses symbolic or numeric ids ("X", "O", 1, 2) — we match by
 *      position, using the runtime's playerIndex to pick from playerIds.
 */
function resolveActivePlayerId<TState>(runtime: GameRuntime<TState>, playerIds: string[]): string {
  const current = String(runtime.currentPlayer);
  if (playerIds.includes(current)) return current;
  // Fall back to playerIndex — the numeric position is always defined.
  const ctx = runtime.buildCtx();
  const idx = Math.max(0, Math.min(playerIds.length - 1, ctx.playerIndex));
  return playerIds[idx] as string;
}
