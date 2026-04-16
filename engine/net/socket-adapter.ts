/**
 * SocketAdapter — browser-side WebSocket client implementing `NetworkAdapter`.
 *
 * Pairs with `GameServer`. Opens a WebSocket to the given URL, sends a
 * `join` frame, then multiplexes subsequent messages through the shared
 * NetworkAdapter API. Auto-reconnects by default (linear backoff, capped).
 *
 * Usage:
 *
 * ```ts
 * const net = new SocketAdapter({ url: "wss://my-server.com", roomId: "abc123" });
 * await net.connect();
 * net.onMessage((from, msg) => console.log("got", msg, "from", from));
 * net.broadcast({ hello: "world" });
 * ```
 *
 * The adapter is transport-only — higher-level sync helpers (e.g. TurnSync)
 * compose on top of this.
 */
import {
  NetEmitter,
  type NetLifecycleHandler,
  type NetMessageHandler,
  type NetPeerHandler,
  type NetworkAdapter,
  type Unsubscribe,
} from "./network-adapter";

/**
 * Room creation options. Mirrors `RoomCreationOptions` from `game-server.ts`.
 * Duplicated here so client and server files stay decoupled.
 */
export interface SocketRoomOptions {
  name?: string;
  gameType?: string;
  isPublic?: boolean;
  maxPeers?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Filter passed to `listRooms()`. Private rooms are never returned regardless
 * of this filter — only public rooms appear in listings.
 */
export interface RoomListingFilter {
  /** Case-sensitive exact match on `gameType`. */
  gameType?: string;
}

/** Shape returned by the server for each listable room. */
export interface PublicRoomInfo {
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

// Wire protocol — kept local so client and server files don't couple via imports.
type ClientFrame =
  | {
      type: "join";
      roomId: string;
      clientName?: string;
      roomOpts?: SocketRoomOptions;
      previousPeerId?: string;
    }
  | { type: "leave" }
  | { type: "send"; to: string | "all"; data: unknown }
  | { type: "ping"; t: number }
  | { type: "list-rooms"; filter?: RoomListingFilter };

type ServerFrame =
  | { type: "welcome"; peerId: string; isHost: boolean; peers: string[]; resumed?: boolean }
  | { type: "peer-join"; peerId: string }
  | { type: "peer-leave"; peerId: string }
  | { type: "message"; from: string; data: unknown }
  | { type: "error"; code: string; message: string }
  | { type: "pong"; t: number }
  | { type: "ping"; t: number }
  | { type: "rooms"; rooms: PublicRoomInfo[] };

export interface SocketAdapterOptions {
  /** ws:// or wss:// URL of the GameServer. */
  url: string;
  /** Room identifier to join on connect. */
  roomId: string;
  /** Optional display name hint — server doesn't treat this as authoritative. */
  clientName?: string;
  /**
   * Options applied when this peer creates the room (i.e. is first to join).
   * Ignored if the room already exists.
   */
  roomOpts?: SocketRoomOptions;
  /** Enable auto-reconnection on unexpected closure. Default true. */
  autoReconnect?: boolean;
  /** Base delay between reconnect attempts, in ms. Default 1500. */
  reconnectDelay?: number;
  /** Stop reconnecting after N attempts. Default Infinity. */
  maxReconnectAttempts?: number;
  /**
   * Ask the server to reuse this peer's previous `peerId` when auto-reconnect
   * fires. Makes state-by-peerId maps on other peers survive the gap.
   * Off by default — existing games that rely on a fresh id per connection
   * keep working. Set true for stateful turn-based games.
   */
  resumeOnReconnect?: boolean;
  /**
   * Optional WebSocket constructor override. Used by tests and environments
   * that don't have `globalThis.WebSocket`. Defaults to `globalThis.WebSocket`.
   */
  WebSocket?: typeof WebSocket;
}

export class SocketAdapter implements NetworkAdapter {
  // NetworkAdapter state
  private _id = "";
  private _isHost = false;
  private _peers: string[] = [];
  private _connected = false;

  // Config
  private opts: Required<Omit<SocketAdapterOptions, "clientName" | "WebSocket" | "roomOpts">> & {
    clientName?: string;
    roomOpts?: SocketRoomOptions;
    WebSocket: typeof WebSocket;
  };

  // Transport
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldStayConnected = false;
  private pendingConnect: Promise<void> | null = null;
  private resolveConnect: (() => void) | null = null;
  private rejectConnect: ((err: Error) => void) | null = null;

  // Emitters
  private messageEmitter = new NetEmitter<NetMessageHandler>();
  private peerJoinEmitter = new NetEmitter<NetPeerHandler>();
  private peerLeaveEmitter = new NetEmitter<NetPeerHandler>();
  private connectEmitter = new NetEmitter<NetLifecycleHandler>();
  private disconnectEmitter = new NetEmitter<NetLifecycleHandler>();

  // Pending `listRooms()` callers — resolved on the next incoming `rooms` frame.
  // FIFO: if two calls are in flight, the server answers in order.
  private pendingListRooms: Array<{
    resolve: (rooms: PublicRoomInfo[]) => void;
    reject: (err: Error) => void;
  }> = [];

  constructor(opts: SocketAdapterOptions) {
    const WS = opts.WebSocket ?? (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
    if (!WS) {
      throw new Error(
        "SocketAdapter: no WebSocket constructor available (pass opts.WebSocket in non-browser environments)",
      );
    }
    this.opts = {
      url: opts.url,
      roomId: opts.roomId,
      clientName: opts.clientName,
      roomOpts: opts.roomOpts,
      autoReconnect: opts.autoReconnect ?? true,
      reconnectDelay: opts.reconnectDelay ?? 1500,
      maxReconnectAttempts: opts.maxReconnectAttempts ?? Number.POSITIVE_INFINITY,
      resumeOnReconnect: opts.resumeOnReconnect ?? false,
      WebSocket: WS,
    };
  }

  get id(): string {
    return this._id;
  }
  get isHost(): boolean {
    return this._isHost;
  }
  get peers(): readonly string[] {
    return this._peers;
  }
  get connected(): boolean {
    return this._connected;
  }

  connect(): Promise<void> {
    if (this._connected) return Promise.resolve();
    if (this.pendingConnect) return this.pendingConnect;

    this.shouldStayConnected = true;
    this.reconnectAttempts = 0;
    this.pendingConnect = new Promise<void>((resolve, reject) => {
      this.resolveConnect = resolve;
      this.rejectConnect = reject;
    });
    this.openSocket();
    return this.pendingConnect;
  }

  disconnect(): void {
    this.shouldStayConnected = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      // Try a polite leave frame if still open
      if (this.ws.readyState === this.opts.WebSocket.OPEN) {
        try {
          const leave: ClientFrame = { type: "leave" };
          this.ws.send(JSON.stringify(leave));
        } catch {
          // ignore
        }
      }
      try {
        this.ws.close(1000, "client disconnect");
      } catch {
        // ignore
      }
    }
    this.ws = null;
    if (this._connected) {
      this._connected = false;
      this.disconnectEmitter.emit();
    }
    // Reset peer state
    this._peers = [];
    // Reject any still-pending connect
    if (this.rejectConnect) {
      this.rejectConnect(new Error("SocketAdapter: disconnected before welcome"));
      this.resetPending();
    }
    // Reject any in-flight listRooms() callers
    this.rejectPendingListRooms(new Error("SocketAdapter: disconnected"));
  }

  send(to: string | "all", message: unknown): void {
    if (!this.ws || this.ws.readyState !== this.opts.WebSocket.OPEN) return;
    if (to !== "all" && !this._peers.includes(to)) {
      // NetworkAdapter contract: unknown peer id is a silent no-op
      return;
    }
    const frame: ClientFrame = { type: "send", to, data: message };
    try {
      this.ws.send(JSON.stringify(frame));
    } catch (err) {
      console.warn("[SocketAdapter] send failed:", err);
    }
  }

  broadcast(message: unknown): void {
    this.send("all", message);
  }

  /**
   * Send a `list-rooms` frame and resolve with the server's response.
   * Usable at any point after the WebSocket is OPEN — the server permits room
   * listing even before the client has joined a room, so UIs can browse
   * without committing. If multiple `listRooms()` calls are in flight they
   * are answered in FIFO order.
   *
   * Rejects if the connection closes before a response arrives, or if the
   * server's `list-rooms` frame is disabled (`enableRoomListing: false`).
   */
  listRooms(filter?: RoomListingFilter): Promise<PublicRoomInfo[]> {
    if (!this.ws || this.ws.readyState !== this.opts.WebSocket.OPEN) {
      return Promise.reject(new Error("SocketAdapter: not connected"));
    }
    return new Promise<PublicRoomInfo[]>((resolve, reject) => {
      this.pendingListRooms.push({ resolve, reject });
      const frame: ClientFrame = { type: "list-rooms", filter };
      try {
        // biome-ignore lint/style/noNonNullAssertion: ws checked above
        this.ws!.send(JSON.stringify(frame));
      } catch (err) {
        // Remove the pending entry we just pushed before rejecting.
        const idx = this.pendingListRooms.findIndex((p) => p.resolve === resolve);
        if (idx >= 0) this.pendingListRooms.splice(idx, 1);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /**
   * Static room discovery — fetches via HTTP without establishing a full
   * WebSocket connection. Accepts `ws://`, `wss://`, `http://`, or `https://`
   * URLs (ws schemes are rewritten to http internally). The server must have
   * `enableRoomListing: true` (default) for this to succeed.
   */
  static async listRooms(baseUrl: string, filter?: RoomListingFilter): Promise<PublicRoomInfo[]> {
    const url = new URL(baseUrl);
    if (url.protocol === "ws:") url.protocol = "http:";
    else if (url.protocol === "wss:") url.protocol = "https:";
    // Strip any existing path — always hit /rooms.
    url.pathname = "/rooms";
    url.hash = "";
    url.search = "";
    if (filter?.gameType) {
      url.searchParams.set("gameType", filter.gameType);
    }
    const fetchFn = (globalThis as { fetch?: typeof fetch }).fetch;
    if (!fetchFn) {
      throw new Error("SocketAdapter.listRooms: no global `fetch` available");
    }
    const res = await fetchFn(url.toString(), { method: "GET" });
    if (!res.ok) {
      throw new Error(`SocketAdapter.listRooms: HTTP ${res.status}`);
    }
    const body = (await res.json()) as { rooms?: PublicRoomInfo[] };
    return Array.isArray(body?.rooms) ? body.rooms : [];
  }

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

  // ---- Internal ----

  private openSocket(): void {
    let ws: WebSocket;
    try {
      ws = new this.opts.WebSocket(this.opts.url);
    } catch (err) {
      this.failConnect(err instanceof Error ? err : new Error(String(err)));
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.addEventListener("open", () => {
      const join: ClientFrame = {
        type: "join",
        roomId: this.opts.roomId,
        clientName: this.opts.clientName,
        roomOpts: this.opts.roomOpts,
      };
      // Opt-in session resume: ask the server to reuse our previous peerId
      // across a reconnect so the game's state-by-peerId maps survive.
      if (this.opts.resumeOnReconnect && this._id) join.previousPeerId = this._id;
      try {
        ws.send(JSON.stringify(join));
      } catch (err) {
        console.warn("[SocketAdapter] join send failed:", err);
      }
    });

    ws.addEventListener("message", (ev: MessageEvent) => {
      this.handleIncoming(ev.data);
    });

    ws.addEventListener("error", () => {
      // Errors here are typically followed by close — don't reject connect
      // until we see close, so reconnect logic is centralized.
    });

    ws.addEventListener("close", (ev: CloseEvent) => {
      const wasConnected = this._connected;
      const wasPending = this.pendingConnect !== null;
      this._connected = false;
      this._peers = [];
      this.ws = null;

      if (wasConnected) {
        this.disconnectEmitter.emit();
      }

      // Any listRooms() calls that didn't get a response are now unfulfillable.
      this.rejectPendingListRooms(
        new Error(`SocketAdapter: connection closed before rooms response (${ev.code})`),
      );

      // 1000 with intent to stay disconnected → stop
      if (!this.shouldStayConnected) {
        if (wasPending) {
          this.failConnect(new Error(`SocketAdapter: closed during connect (${ev.code})`));
        }
        return;
      }

      // Certain close codes should NOT trigger auto-reconnect (room/server full)
      // Server sends an error frame then closes 1013 — treat that as terminal.
      if (ev.code === 1013) {
        this.shouldStayConnected = false;
        if (wasPending) {
          this.failConnect(new Error(`SocketAdapter: server rejected connection (${ev.reason})`));
        }
        return;
      }

      this.scheduleReconnect();
    });
  }

  private handleIncoming(raw: unknown): void {
    if (typeof raw !== "string") return;
    let frame: ServerFrame;
    try {
      frame = JSON.parse(raw) as ServerFrame;
    } catch {
      console.warn("[SocketAdapter] malformed frame:", raw);
      return;
    }
    if (
      !frame ||
      typeof frame !== "object" ||
      typeof (frame as { type?: unknown }).type !== "string"
    ) {
      console.warn("[SocketAdapter] frame missing type:", frame);
      return;
    }

    switch (frame.type) {
      case "welcome": {
        this._id = frame.peerId;
        this._isHost = frame.isHost;
        this._peers = Array.isArray(frame.peers) ? [...frame.peers] : [];
        this._connected = true;
        this.reconnectAttempts = 0;
        this.connectEmitter.emit();
        if (this.resolveConnect) {
          this.resolveConnect();
          this.resetPending();
        }
        break;
      }
      case "peer-join": {
        if (!this._peers.includes(frame.peerId)) {
          this._peers = [...this._peers, frame.peerId];
        }
        this.peerJoinEmitter.emit(frame.peerId);
        break;
      }
      case "peer-leave": {
        if (this._peers.includes(frame.peerId)) {
          this._peers = this._peers.filter((p) => p !== frame.peerId);
        }
        this.peerLeaveEmitter.emit(frame.peerId);
        break;
      }
      case "message": {
        this.messageEmitter.emit(frame.from, frame.data);
        break;
      }
      case "error": {
        console.warn(`[SocketAdapter] server error [${frame.code}]: ${frame.message}`);
        // Terminal errors will be followed by a close frame; no need to
        // act here beyond logging.
        if (this.pendingConnect) {
          // Don't reject yet — the close handler will, with the code.
        }
        break;
      }
      case "ping": {
        // Respond to server ping with pong echo
        const pong: ClientFrame = { type: "ping", t: frame.t };
        if (this.ws && this.ws.readyState === this.opts.WebSocket.OPEN) {
          try {
            this.ws.send(JSON.stringify(pong));
          } catch {
            // ignore
          }
        }
        break;
      }
      case "pong": {
        // Nothing for now — RTT tracking could live here.
        break;
      }
      case "rooms": {
        const pending = this.pendingListRooms.shift();
        if (pending) {
          pending.resolve(Array.isArray(frame.rooms) ? frame.rooms : []);
        }
        break;
      }
      default: {
        console.warn("[SocketAdapter] unknown frame:", frame);
      }
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldStayConnected) return;
    if (!this.opts.autoReconnect) {
      this.shouldStayConnected = false;
      if (this.pendingConnect) {
        this.failConnect(new Error("SocketAdapter: connection failed (autoReconnect=false)"));
      }
      return;
    }
    if (this.reconnectAttempts >= this.opts.maxReconnectAttempts) {
      this.shouldStayConnected = false;
      if (this.pendingConnect) {
        this.failConnect(
          new Error(`SocketAdapter: giving up after ${this.reconnectAttempts} reconnect attempts`),
        );
      }
      return;
    }
    this.reconnectAttempts += 1;
    const backoff = this.opts.reconnectDelay * Math.min(this.reconnectAttempts, 10);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldStayConnected) this.openSocket();
    }, backoff);
  }

  private failConnect(err: Error): void {
    if (this.rejectConnect) {
      this.rejectConnect(err);
    }
    this.resetPending();
  }

  private resetPending(): void {
    this.pendingConnect = null;
    this.resolveConnect = null;
    this.rejectConnect = null;
  }

  private rejectPendingListRooms(err: Error): void {
    if (this.pendingListRooms.length === 0) return;
    const pending = this.pendingListRooms.splice(0, this.pendingListRooms.length);
    for (const p of pending) {
      try {
        p.reject(err);
      } catch {
        // ignore
      }
    }
  }
}
