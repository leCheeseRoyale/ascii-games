/**
 * In-memory mock network adapter — test double for the `NetworkAdapter`
 * interface. Multiple adapters share a single `MockBus` and talk to each
 * other entirely in-process, so tests can exercise multiplayer helpers
 * (`TurnSync`, `StateSync`, etc.) without a real server.
 *
 * ### Bus model
 *
 * A `MockBus` is a registry of live `MockAdapter`s keyed by peer id. When
 * an adapter connects it registers itself; when it disconnects it
 * unregisters. Message delivery is routed through the bus so a single call
 * site covers unicast, broadcast, latency simulation, and drop simulation.
 *
 * ### Determinism
 *
 * With default `latency: 0`, message delivery is synchronous — a `send()`
 * completes before it returns, so tests don't need `await` pumps. Supply
 * `latency > 0` to schedule delivery on `setTimeout` (useful for verifying
 * async-safe behavior in TurnSync etc.).
 *
 * ### Serialization
 *
 * Messages are deep-cloned via `JSON.parse(JSON.stringify(msg))` before
 * delivery. This simulates wire serialization so tests catch bugs from
 * shared references across peers (the same bug you'd hit on a real
 * transport).
 *
 * @example
 * ```ts
 * const bus = MockBus.create();
 * const host = new MockAdapter({ bus, isHost: true });
 * const client = new MockAdapter({ bus });
 *
 * await host.connect();
 * await client.connect();
 *
 * host.onMessage((from, msg) => console.log('host got', msg, 'from', from));
 * client.send(host.id, { hello: 'world' });
 * ```
 */

import {
  generatePeerId,
  NetEmitter,
  type NetLifecycleHandler,
  type NetMessageHandler,
  type NetPeerHandler,
  type NetworkAdapter,
  type Unsubscribe,
} from "./network-adapter";

// ── MockBus ─────────────────────────────────────────────────────

/**
 * Shared in-memory message bus. All `MockAdapter` instances that want to
 * talk to each other must be constructed with the same bus.
 *
 * The bus does NOT enforce a single host — that is purely a per-adapter
 * flag. Games that need authoritative logic can check `adapter.isHost`.
 */
export class MockBus {
  /** Live map of connected peer id → adapter. */
  readonly adapters = new Map<string, MockAdapter>();

  /** Convenience factory — purely cosmetic, `new MockBus()` works too. */
  static create(): MockBus {
    return new MockBus();
  }

  /** Number of currently registered adapters. */
  size(): number {
    return this.adapters.size;
  }

  /**
   * Disconnect every registered adapter. After this, `size()` is 0 and each
   * adapter has fired `onDisconnect` locally + `onPeerLeave` on any
   * surviving listeners.
   */
  clear(): void {
    // Snapshot because `disconnect` mutates `adapters` during iteration.
    for (const adapter of Array.from(this.adapters.values())) {
      adapter.disconnect();
    }
  }

  // ── Internal — called by MockAdapter ──────────────────────────

  /** @internal */
  _register(adapter: MockAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  /** @internal */
  _unregister(id: string): void {
    this.adapters.delete(id);
  }

  /**
   * Route a message through the bus. Broadcasts fan out to every registered
   * adapter EXCEPT the sender; unicasts go to the single target (silently
   * dropped if the target is unknown). Latency and drop-rate are applied
   * by the calling adapter BEFORE invoking this — the bus itself is a pure
   * router.
   *
   * @internal
   */
  _deliver(from: string, to: string | "all", message: unknown): void {
    if (to === "all") {
      // Broadcast — snapshot so a handler that mutates the bus mid-delivery
      // doesn't skew iteration.
      for (const [id, adapter] of Array.from(this.adapters.entries())) {
        if (id === from) continue; // never echo back to sender
        adapter._receive(from, message);
      }
      return;
    }
    // Unicast — silent no-op for unknown peers (standard adapter contract).
    const target = this.adapters.get(to);
    if (!target) return;
    if (to === from) return; // don't deliver a direct send to self either
    target._receive(from, message);
  }
}

// ── MockAdapter ─────────────────────────────────────────────────

/** Options for constructing a `MockAdapter`. */
export interface MockAdapterOptions {
  /** Shared bus this adapter registers on. Required. */
  bus: MockBus;
  /** Stable peer id. If omitted, a random one is generated. */
  id?: string;
  /** Whether this adapter considers itself the authoritative host. Default false. */
  isHost?: boolean;
  /**
   * Simulated network latency in ms. Default 0 (synchronous delivery, for
   * test determinism). Values > 0 schedule delivery on `setTimeout`.
   */
  latency?: number;
  /**
   * Probability (0..1) that a given message is silently dropped. Default 0.
   * Useful for testing reconnect/retry logic.
   */
  dropRate?: number;
}

/**
 * In-memory `NetworkAdapter` — see file header for the full story.
 *
 * Each adapter composes a set of `NetEmitter`s (one per event type) so
 * subscription bookkeeping is uniform with future real-transport adapters.
 */
export class MockAdapter implements NetworkAdapter {
  readonly id: string;
  readonly isHost: boolean;

  private readonly bus: MockBus;
  private readonly latency: number;
  private readonly dropRate: number;

  private _connected = false;

  // Event emitters — one per event type.
  private readonly messageEmitter = new NetEmitter<NetMessageHandler>();
  private readonly peerJoinEmitter = new NetEmitter<NetPeerHandler>();
  private readonly peerLeaveEmitter = new NetEmitter<NetPeerHandler>();
  private readonly connectEmitter = new NetEmitter<NetLifecycleHandler>();
  private readonly disconnectEmitter = new NetEmitter<NetLifecycleHandler>();

  constructor(opts: MockAdapterOptions) {
    this.bus = opts.bus;
    this.id = opts.id ?? generatePeerId();
    this.isHost = opts.isHost ?? false;
    this.latency = Math.max(0, opts.latency ?? 0);
    this.dropRate = Math.min(1, Math.max(0, opts.dropRate ?? 0));
  }

  /** Whether this adapter is currently connected to the bus. */
  get connected(): boolean {
    return this._connected;
  }

  /**
   * Live snapshot of connected peer ids, excluding self. Reads directly
   * from the bus so there is no stale copy to maintain.
   */
  get peers(): readonly string[] {
    if (!this._connected) return [];
    const out: string[] = [];
    for (const id of this.bus.adapters.keys()) {
      if (id !== this.id) out.push(id);
    }
    return out;
  }

  // ── Connection lifecycle ──────────────────────────────────────

  /**
   * Register on the bus. Idempotent — calling twice is a no-op after the
   * first success. Fires `onConnect` locally, `onPeerJoin(this.id)` on each
   * already-connected peer, and `onPeerJoin(peerId)` on *this* adapter for
   * every existing peer (so both sides see a symmetric set of joins).
   */
  async connect(): Promise<void> {
    if (this._connected) return;

    // Snapshot existing peers BEFORE we register — otherwise our own id
    // would show up as a "pre-existing" peer.
    const existingPeers = Array.from(this.bus.adapters.keys());

    this.bus._register(this);
    this._connected = true;

    // Fire our own connect event first.
    this.connectEmitter.emit();

    // Announce ourselves to already-connected peers. Each of them sees a
    // new peer (us) join.
    for (const peerId of existingPeers) {
      const peer = this.bus.adapters.get(peerId);
      if (!peer || peer === this) continue;
      peer._notifyPeerJoin(this.id);
    }

    // And we see each of them join (symmetric bookkeeping — new adapters
    // get the same `onPeerJoin` stream as pre-existing ones).
    for (const peerId of existingPeers) {
      if (peerId === this.id) continue;
      this.peerJoinEmitter.emit(peerId);
    }
  }

  /**
   * Unregister from the bus. Fires `onDisconnect` locally and
   * `onPeerLeave(this.id)` on every peer that is still connected. Safe to
   * call even if never connected — becomes a no-op in that case.
   */
  disconnect(): void {
    if (!this._connected) return;

    this._connected = false;
    this.bus._unregister(this.id);

    // Notify remaining peers that we've left.
    for (const peer of Array.from(this.bus.adapters.values())) {
      if (peer === this) continue;
      peer._notifyPeerLeave(this.id);
    }

    // Local disconnect event.
    this.disconnectEmitter.emit();
  }

  // ── Messaging ─────────────────────────────────────────────────

  /**
   * Send a message to a peer (or `"all"` for broadcast). Applies the
   * adapter's configured `latency` and `dropRate` before routing through
   * the bus.
   */
  send(to: string | "all", message: unknown): void {
    if (!this._connected) return;

    // Drop simulation — roll once per send.
    if (this.dropRate > 0 && Math.random() < this.dropRate) return;

    if (this.latency > 0) {
      // Delayed delivery — schedule and return immediately.
      const fromId = this.id;
      const bus = this.bus;
      setTimeout(() => {
        bus._deliver(fromId, to, message);
      }, this.latency);
      return;
    }

    // Synchronous delivery — default, keeps tests deterministic.
    this.bus._deliver(this.id, to, message);
  }

  /** Convenience for `send("all", message)`. */
  broadcast(message: unknown): void {
    this.send("all", message);
  }

  // ── Event subscriptions ───────────────────────────────────────

  onMessage(handler: NetMessageHandler): Unsubscribe {
    return this.messageEmitter.on(handler);
  }

  onPeerJoin(handler: NetPeerHandler): Unsubscribe {
    return this.peerJoinEmitter.on(handler);
  }

  onPeerLeave(handler: NetPeerHandler): Unsubscribe {
    return this.peerLeaveEmitter.on(handler);
  }

  onConnect(handler: NetLifecycleHandler): Unsubscribe {
    return this.connectEmitter.on(handler);
  }

  onDisconnect(handler: NetLifecycleHandler): Unsubscribe {
    return this.disconnectEmitter.on(handler);
  }

  // ── Internal — called by MockBus ──────────────────────────────

  /**
   * Receive a message from the bus. Deep-clones the payload to simulate
   * wire serialization (catches bugs where callers share references).
   *
   * @internal
   */
  _receive(from: string, message: unknown): void {
    if (!this._connected) return;
    // Deep clone via JSON round-trip — matches real-wire semantics.
    let cloned: unknown;
    try {
      cloned = message === undefined ? undefined : JSON.parse(JSON.stringify(message));
    } catch {
      // Non-serializable payloads pass through as-is; real transports would
      // throw, but tests may still want to assert the behavior.
      cloned = message;
    }
    this.messageEmitter.emit(from, cloned);
  }

  /** @internal */
  _notifyPeerJoin(peerId: string): void {
    if (!this._connected) return;
    this.peerJoinEmitter.emit(peerId);
  }

  /** @internal */
  _notifyPeerLeave(peerId: string): void {
    if (!this._connected) return;
    this.peerLeaveEmitter.emit(peerId);
  }
}
