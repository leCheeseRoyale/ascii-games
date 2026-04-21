/**
 * Network adapter — the transport abstraction for all multiplayer games.
 *
 * A `NetworkAdapter` is a thin wrapper over any messaging channel (in-memory,
 * local same-screen, WebRTC data channel, WebSocket, etc.). Higher-level
 * helpers like `TurnSync` are implemented against this interface — they work
 * identically across every transport.
 *
 * ### Lifecycle
 *
 *   1. `new MyAdapter(opts)` — construct, not yet connected.
 *   2. `await adapter.connect()` — establish transport. Host adapters may
 *      start listening here; client adapters may perform the handshake.
 *   3. Send/receive via `send()` and `onMessage()`.
 *   4. `adapter.disconnect()` — tear down cleanly.
 *
 * ### Messaging model
 *
 * - `send(to, msg)` — unicast to a peer (or `"all"` for broadcast).
 * - `broadcast(msg)` — convenience for `send("all", msg)`.
 * - Messages are JSON-serializable `unknown`. The adapter is responsible for
 *   serialization; callers can pass plain objects.
 * - `onMessage(fn)` — register a handler. Returns an unsubscribe function.
 *
 * ### Peer lifecycle
 *
 * - `onPeerJoin(fn)` — fired when a new peer becomes reachable.
 * - `onPeerLeave(fn)` — fired when a peer disconnects or times out.
 * - `peers` — snapshot of currently connected peer IDs (NOT including self).
 *
 * ### Implementation notes
 *
 * - Adapters MUST NOT deliver a peer's own broadcasts back to itself.
 * - Adapters SHOULD deduplicate join/leave events (idempotent).
 * - `send()` with an unknown peer id is a silent no-op (do NOT throw) —
 *   games frequently race this against a disconnect.
 * - `connect()` is idempotent: calling twice resolves to the same state.
 */

/** Handler registered via `onMessage`. Receives the sender's peer id and the message. */
export type NetMessageHandler = (from: string, message: unknown) => void;

/** Handler registered via `onPeerJoin` / `onPeerLeave`. Receives the peer id. */
export type NetPeerHandler = (peerId: string) => void;

/** Handler registered via `onConnect` / `onDisconnect`. */
export type NetLifecycleHandler = () => void;

/** Unsubscribe function returned by `on*` registrations. */
export type Unsubscribe = () => void;

/** The core networking abstraction — all adapters implement this shape. */
export interface NetworkAdapter {
  /** This peer's ID. Stable for the adapter's lifetime. */
  readonly id: string;

  /**
   * Whether this adapter considers itself the host/authority.
   * Games can use this to gate authoritative logic (e.g., spawning enemies,
   * resolving physics) to a single peer.
   */
  readonly isHost: boolean;

  /** Snapshot of connected peer IDs (excluding self). */
  readonly peers: readonly string[];

  /** Whether the transport is currently connected. */
  readonly connected: boolean;

  /**
   * Establish the underlying transport. Idempotent — calling twice is a
   * no-op after the first resolution.
   */
  connect(): Promise<void>;

  /**
   * Disconnect and release all resources. After this, `connected` is false
   * and all `on*` handlers stop firing. Safe to call even if never connected.
   */
  disconnect(): void;

  /**
   * Send a message to a specific peer, or `"all"` for broadcast.
   * Unknown peer ids are a silent no-op (the peer may have just left).
   */
  send(to: string | "all", message: unknown): void;

  /** Convenience for `send("all", message)`. */
  broadcast(message: unknown): void;

  /** Subscribe to incoming messages. Returns an unsubscribe fn. */
  onMessage(handler: NetMessageHandler): Unsubscribe;

  /** Subscribe to peer-join events (new peer reachable). */
  onPeerJoin(handler: NetPeerHandler): Unsubscribe;

  /** Subscribe to peer-leave events (peer disconnected). */
  onPeerLeave(handler: NetPeerHandler): Unsubscribe;

  /** Subscribe to the adapter's own connect event. */
  onConnect(handler: NetLifecycleHandler): Unsubscribe;

  /** Subscribe to the adapter's own disconnect event. */
  onDisconnect(handler: NetLifecycleHandler): Unsubscribe;
}

/**
 * Shared helper — minimal event emitter so adapter implementations don't have
 * to roll their own subscription bookkeeping. Each adapter composes one of
 * these per event type.
 */
export class NetEmitter<T extends (...args: never[]) => void> {
  private handlers = new Set<T>();

  on(handler: T): Unsubscribe {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  emit(...args: Parameters<T>): void {
    // Copy to snapshot — handler may unsubscribe mid-iteration
    for (const h of Array.from(this.handlers)) {
      try {
        h(...args);
      } catch (err) {
        // Never let a single handler break the adapter
        console.error("[NetEmitter] handler threw:", err);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }

  get size(): number {
    return this.handlers.size;
  }
}

/**
 * Generate a short random peer id. Adapters are free to use a fixed id
 * (from the user) instead. Default format: 8-char hex string.
 */
export function generatePeerId(): string {
  const bytes = new Uint8Array(4);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 4; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
