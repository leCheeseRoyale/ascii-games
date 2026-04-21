/**
 * GameServer — a Bun-based WebSocket server with room management for multiplayer.
 *
 * This is the counterpart to `SocketAdapter`. It hosts arbitrary rooms, each
 * holding up to N peers, and routes messages between them. The wire protocol
 * is JSON frames (see `ClientFrame` / `ServerFrame` below).
 *
 * Usage (server-side, typically a separate Node-like process):
 *
 * ```ts
 * const server = new GameServer({ port: 8080 });
 * await server.start();
 * server.onMessage((room, peerId, data) => {
 *   console.log(`[${room.id}] ${peerId}:`, data);
 * });
 * ```
 *
 * The server never imports anything from the browser-facing engine code —
 * it's self-contained.
 */
import { generatePeerId, type Unsubscribe } from "./network-adapter";

// ---- Wire protocol ----

/**
 * Options honored only when the first peer creates a room. Subsequent joiners'
 * `roomOpts` are ignored — settings are locked at creation time.
 */
export interface RoomCreationOptions {
  /** Display name for the room. Defaults to the roomId. */
  name?: string;
  /** Free-form game type tag (e.g. "roguelike") used for filtering. */
  gameType?: string;
  /** If false, the room is hidden from public listings. Defaults to true. */
  isPublic?: boolean;
  /** Max peers for this room. Capped at the server's `maxClientsPerRoom`. */
  maxPeers?: number;
  /** Arbitrary user-controlled fields surfaced in public listings. */
  metadata?: Record<string, unknown>;
}

/** Filter passed with a `list-rooms` frame. */
export interface RoomListFilter {
  /** Case-sensitive exact match on `gameType`. */
  gameType?: string;
  /**
   * Default true. Private rooms are always excluded from listings regardless of
   * this flag — the field is reserved for future use and currently a no-op.
   */
  publicOnly?: boolean;
}

export type ClientFrame =
  | {
      type: "join";
      roomId: string;
      clientName?: string;
      roomOpts?: RoomCreationOptions;
      /**
       * Previous peerId from a recent session. If the id is not currently in
       * use by another socket, the server reuses it so game logic keeping
       * state keyed by peerId survives reconnects.
       */
      previousPeerId?: string;
    }
  | { type: "leave" }
  | { type: "send"; to: string | "all"; data: unknown }
  | { type: "ping"; t: number }
  | { type: "pong"; t: number }
  | { type: "list-rooms"; filter?: RoomListFilter };

export type ServerFrame =
  | { type: "welcome"; peerId: string; isHost: boolean; peers: string[]; resumed?: boolean }
  | { type: "peer-join"; peerId: string }
  | { type: "peer-leave"; peerId: string }
  | { type: "message"; from: string; data: unknown }
  | { type: "error"; code: string; message: string }
  | { type: "pong"; t: number }
  | { type: "ping"; t: number }
  | { type: "rooms"; rooms: PublicRoomInfo[] };

/**
 * Public-facing room summary used by room discovery listings. Private rooms
 * (`isPublic: false`) are excluded from listings even though this interface
 * still exposes the field.
 */
export interface PublicRoomInfo {
  /** Room id — unique within the server. */
  id: string;
  /** Display name for the room. Defaults to `id` when not provided. */
  name: string;
  /** Current peer count. */
  peerCount: number;
  /** Max peers allowed in this room. */
  maxPeers: number;
  /** Game type tag used for filtering. Optional. */
  gameType?: string;
  /** True if the room accepts public listing. Private rooms are not listed. */
  isPublic: boolean;
  /** True when `peerCount === maxPeers`. */
  isFull: boolean;
  /** Room creation time (ms since epoch). */
  createdAt: number;
  /** Room-level metadata set by the host peer at creation. */
  metadata?: Record<string, unknown>;
}

// ---- Public types ----

export interface GameServerOptions {
  /** Port to bind. Use `0` for an ephemeral port (tests read back `server.port`). */
  port?: number;
  /**
   * Hostname to bind. Default **"127.0.0.1"** (loopback only) — the server is
   * reachable only from the same machine. Set to `"0.0.0.0"` to expose on the
   * LAN, or a specific interface IP to limit scope. **Only change this if you
   * understand the exposure** — binding 0.0.0.0 on an untrusted network means
   * any device that can reach this machine can connect to the game server.
   */
  hostname?: string;
  /** Max clients per room. Default 8. */
  maxClientsPerRoom?: number;
  /** Max rooms the server will host simultaneously. Default 100. */
  maxRooms?: number;
  /**
   * Max TOTAL concurrent WebSocket connections (across all rooms, including
   * clients that haven't joined a room yet). Default 200. Protects against
   * connection flooding.
   */
  maxConnections?: number;
  /**
   * Max size in bytes of a single incoming message. Default 64 * 1024 (64 KB).
   * Larger messages cause the connection to be closed with error. Prevents
   * memory-exhaustion attacks via huge JSON payloads.
   */
  maxMessageSize?: number;
  /**
   * Rate limit: max messages per second per client. Default 100. Clients
   * exceeding this are temporarily ignored (messages dropped) rather than
   * disconnected, so legitimate bursts don't break the connection. Set to 0
   * to disable.
   */
  maxMessagesPerSecond?: number;
  /** If true (default), the first peer to join a room is marked host. */
  firstPeerIsHost?: boolean;
  /**
   * Interval at which the server sends server-initiated pings, in ms.
   * Default 30_000. Set to 0 to disable keepalive pings.
   */
  pingInterval?: number;
  /**
   * Kick clients that haven't responded for this long, in ms.
   * Default 60_000. Set to 0 to disable.
   */
  clientTimeout?: number;
  /**
   * Enable the GET /rooms HTTP endpoint and the `list-rooms` WebSocket frame
   * for room discovery. Default **true**. When disabled, the HTTP endpoint
   * returns 404 and the WebSocket frame returns a `listing-disabled` error.
   */
  enableRoomListing?: boolean;
  /**
   * `Access-Control-Allow-Origin` header value for the /rooms endpoint.
   * Default `"*"`. Set to a specific origin for stricter CORS, or to `""` to
   * omit the header entirely (browser cross-origin fetches will fail).
   */
  corsAllowOrigin?: string;
  /**
   * Per-IP rate limit for HTTP requests (the /rooms endpoint). Requests per
   * `httpRateLimitWindowMs`. Default **60** — plenty for legit lobby polling,
   * tight enough to cap scanners. Set to 0 to disable.
   */
  httpRateLimit?: number;
  /**
   * Sliding window duration for `httpRateLimit`, in ms. Default 60_000 (1 min).
   */
  httpRateLimitWindowMs?: number;
  /**
   * How many consecutive WebSocket rate-limit violations are tolerated before
   * the offending client is disconnected. Default **50**. Set to 0 to disable
   * the circuit breaker (legacy behavior: drop silently forever).
   */
  wsRateViolationLimit?: number;
  /**
   * Allow clients to resume a previous peer identity by sending `previousPeerId`
   * in the join frame. Default **false**. When disabled, the `previousPeerId`
   * field is ignored and every connection receives a fresh peer id.
   *
   * Enable only when your game logic needs reconnect-resume and you accept the
   * spoofing risk (any client can claim any disconnected peer id).
   */
  enablePeerResume?: boolean;
}

/** Live handle to a connected peer. Internal, but exported for tests. */
export interface PeerHandle {
  readonly id: string;
  readonly roomId: string;
  readonly name?: string;
  readonly joinedAt: number;
  /** Last time a pong or any client frame was received (ms since epoch). */
  lastSeen: number;
}

/** Live handle to a room. Games can attach state via `metadata`. */
export interface Room {
  readonly id: string;
  readonly peers: readonly string[];
  readonly hostPeerId: string | null;
  readonly createdAt: number;
  readonly metadata: Record<string, unknown>;
  /** Display name set at creation. Falls back to `id` when absent. */
  readonly name: string;
  /** Game type tag for filtering. */
  readonly gameType?: string;
  /** Whether the room appears in public listings. */
  readonly isPublic: boolean;
  /** Max peers for this room (always <= server's maxClientsPerRoom). */
  readonly maxPeers: number;
}

// ---- Internal types ----

interface InternalRoom {
  id: string;
  peers: Map<string, PeerHandle>;
  hostPeerId: string | null;
  createdAt: number;
  metadata: Record<string, unknown>;
  name: string;
  gameType?: string;
  isPublic: boolean;
  maxPeers: number;
}

interface WSData {
  peerId: string | null;
  roomId: string | null;
  joinedAt: number;
  /** Number of messages received in the current rate-limit window. */
  rateWindowCount: number;
  /** Start-of-window timestamp (ms). */
  rateWindowStart: number;
  /** Running count of consecutive rate-limit violations (for circuit breaker). */
  rateViolations: number;
}

// Minimal surface we use from Bun's ServerWebSocket. Declared as a
// structural type so the file type-checks even without bun-types loaded.
interface BunWSLike {
  data: WSData;
  readyState: number;
  send(msg: string): number;
  close(code?: number, reason?: string): void;
}

// Server handle returned by Bun.serve. Structural so we don't rely on bun-types.
interface BunServerLike {
  port: number;
  hostname: string;
  stop(closeActiveConnections?: boolean): Promise<void> | void;
}

type NetServerMessageHandler = (room: Room, peerId: string, data: unknown) => void;
type NetServerPeerHandler = (room: Room, peerId: string) => void;
type NetServerRoomHandler = (room: Room) => void;

// ---- Implementation ----

export class GameServer {
  private opts: Required<GameServerOptions>;
  private server: BunServerLike | null = null;
  private internalRooms = new Map<string, InternalRoom>();
  private sockets = new Map<string, BunWSLike>(); // peerId -> socket
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  private messageHandlers = new Set<NetServerMessageHandler>();
  private peerJoinHandlers = new Set<NetServerPeerHandler>();
  private peerLeaveHandlers = new Set<NetServerPeerHandler>();
  private roomCreateHandlers = new Set<NetServerRoomHandler>();
  private roomDestroyHandlers = new Set<NetServerRoomHandler>();

  /** Total concurrent open sockets — tracked separately from rooms. */
  private totalConnections = 0;

  constructor(opts: GameServerOptions = {}) {
    this.opts = {
      port: opts.port ?? 8080,
      // Safe default: loopback only. Explicit opt-in required for LAN exposure.
      hostname: opts.hostname ?? "127.0.0.1",
      maxClientsPerRoom: opts.maxClientsPerRoom ?? 8,
      maxRooms: opts.maxRooms ?? 100,
      maxConnections: opts.maxConnections ?? 200,
      maxMessageSize: opts.maxMessageSize ?? 64 * 1024,
      maxMessagesPerSecond: opts.maxMessagesPerSecond ?? 100,
      firstPeerIsHost: opts.firstPeerIsHost ?? true,
      pingInterval: opts.pingInterval ?? 30_000,
      clientTimeout: opts.clientTimeout ?? 60_000,
      enableRoomListing: opts.enableRoomListing ?? true,
      corsAllowOrigin: opts.corsAllowOrigin ?? "*",
      httpRateLimit: opts.httpRateLimit ?? 60,
      httpRateLimitWindowMs: opts.httpRateLimitWindowMs ?? 60_000,
      wsRateViolationLimit: opts.wsRateViolationLimit ?? 50,
      enablePeerResume: opts.enablePeerResume ?? false,
    };
  }

  /** Per-IP sliding-window HTTP rate limiter state (resets by window). */
  private httpRateBuckets = new Map<string, { count: number; windowStart: number }>();

  get port(): number {
    if (!this.server) return this.opts.port;
    return this.server.port;
  }

  get rooms(): ReadonlyMap<string, Room> {
    const view = new Map<string, Room>();
    for (const [id, r] of this.internalRooms) {
      view.set(id, this.toPublicRoom(r));
    }
    return view;
  }

  async start(): Promise<void> {
    if (this.server) return;

    const bunGlobal = (globalThis as any).Bun;
    if (!bunGlobal || typeof bunGlobal.serve !== "function") {
      throw new Error("GameServer requires the Bun runtime (Bun.serve)");
    }

    const self = this;
    this.server = bunGlobal.serve({
      port: this.opts.port,
      hostname: this.opts.hostname,
      fetch(
        req: Request,
        srv: {
          upgrade(r: Request, opts?: unknown): boolean;
          requestIP?(r: Request): { address: string } | null;
        },
      ) {
        // Handle HTTP room listing before attempting to upgrade.
        const url = new URL(req.url);
        if (url.pathname === "/rooms") {
          const ip = srv.requestIP?.(req)?.address ?? "unknown";
          if (!self.allowHttpRequest(ip)) {
            return new Response("Too many requests", {
              status: 429,
              headers: { "Retry-After": String(Math.ceil(self.opts.httpRateLimitWindowMs / 1000)) },
            });
          }
          return self.handleRoomListingHttp(req, url);
        }

        // Connection-flood protection: reject upgrades once we're at capacity.
        if (self.totalConnections >= self.opts.maxConnections) {
          return new Response("GameServer: too many connections", { status: 503 });
        }
        const success = srv.upgrade(req, {
          data: {
            peerId: null,
            roomId: null,
            joinedAt: 0,
            rateWindowCount: 0,
            rateWindowStart: 0,
            rateViolations: 0,
          } as WSData,
        });
        if (success) return undefined;
        return new Response("GameServer: WebSocket upgrade required", { status: 426 });
      },
      websocket: {
        // Cap per-message size at the socket level as a first line of defense.
        // Bun's ws supports `maxPayloadLength` as a number of bytes.
        maxPayloadLength: this.opts.maxMessageSize,
        open(ws: BunWSLike) {
          self.totalConnections += 1;
          ws.data.joinedAt = Date.now();
          ws.data.rateWindowStart = Date.now();
        },
        message(ws: BunWSLike, raw: string | Buffer) {
          self.handleRawMessage(ws, raw);
        },
        close(ws: BunWSLike) {
          self.totalConnections = Math.max(0, self.totalConnections - 1);
          self.handleDisconnect(ws);
        },
      },
    }) as BunServerLike;

    if (this.opts.pingInterval > 0) {
      this.pingTimer = setInterval(() => this.tickKeepalive(), this.opts.pingInterval);
    }
  }

  async stop(): Promise<void> {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    // Snapshot sockets to close — we'll let Bun.serve.stop(true) force-close
    // anything still hanging around, but send a polite close first.
    const socketsToClose = Array.from(this.sockets.values());
    for (const ws of socketsToClose) {
      try {
        ws.close(1001, "server shutting down");
      } catch {
        // ignore
      }
    }
    this.sockets.clear();
    // Destroy remaining rooms (fire handlers)
    for (const room of Array.from(this.internalRooms.values())) {
      this.destroyRoom(room);
    }
    if (this.server) {
      // Bun's server.stop(true) force-closes active connections. On some
      // platforms the returned promise can hang waiting for WebSocket
      // close handshakes; race with a short timeout for safety.
      const srv = this.server;
      this.server = null;
      await Promise.race([
        Promise.resolve(srv.stop(true)),
        new Promise<void>((resolve) => setTimeout(resolve, 250)),
      ]);
    }
  }

  // ---- Event registration ----

  onMessage(handler: NetServerMessageHandler): Unsubscribe {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }
  onPeerJoin(handler: NetServerPeerHandler): Unsubscribe {
    this.peerJoinHandlers.add(handler);
    return () => this.peerJoinHandlers.delete(handler);
  }
  onPeerLeave(handler: NetServerPeerHandler): Unsubscribe {
    this.peerLeaveHandlers.add(handler);
    return () => this.peerLeaveHandlers.delete(handler);
  }
  onRoomCreate(handler: NetServerRoomHandler): Unsubscribe {
    this.roomCreateHandlers.add(handler);
    return () => this.roomCreateHandlers.delete(handler);
  }
  onRoomDestroy(handler: NetServerRoomHandler): Unsubscribe {
    this.roomDestroyHandlers.add(handler);
    return () => this.roomDestroyHandlers.delete(handler);
  }

  // ---- Server-initiated actions ----

  broadcastToRoom(roomId: string, data: unknown, except?: string): void {
    const room = this.internalRooms.get(roomId);
    if (!room) return;
    const frame: ServerFrame = { type: "message", from: "server", data };
    const payload = JSON.stringify(frame);
    for (const peerId of room.peers.keys()) {
      if (except && peerId === except) continue;
      const ws = this.sockets.get(peerId);
      if (ws) this.safeSend(ws, payload);
    }
  }

  sendToPeer(roomId: string, peerId: string, data: unknown): boolean {
    const room = this.internalRooms.get(roomId);
    if (!room?.peers.has(peerId)) return false;
    const ws = this.sockets.get(peerId);
    if (!ws) return false;
    const frame: ServerFrame = { type: "message", from: "server", data };
    return this.safeSend(ws, JSON.stringify(frame));
  }

  kickPeer(roomId: string, peerId: string, reason = "kicked"): void {
    const room = this.internalRooms.get(roomId);
    if (!room?.peers.has(peerId)) return;
    const ws = this.sockets.get(peerId);
    if (ws) {
      this.safeSend(
        ws,
        JSON.stringify({ type: "error", code: "kicked", message: reason } satisfies ServerFrame),
      );
      try {
        ws.close(1000, reason);
      } catch {
        // ignore
      }
    }
  }

  // ---- Internal ----

  private handleRawMessage(ws: BunWSLike, raw: string | Buffer): void {
    let text: string;
    if (typeof raw === "string") text = raw;
    else text = raw.toString("utf8");

    // Defense in depth: even though Bun enforces maxPayloadLength, double-check here
    // in case the runtime provides a string bigger than the limit for any reason.
    if (text.length > this.opts.maxMessageSize) {
      this.sendError(ws, "message-too-large", "Frame exceeds maxMessageSize");
      try {
        ws.close(1009, "message too large");
      } catch {
        // ignore
      }
      return;
    }

    // Rate limit: sliding 1-second window, drop excess messages silently.
    // Dropping is gentler than disconnecting — legitimate bursts recover.
    // Persistent abusers trip the circuit breaker below.
    if (this.opts.maxMessagesPerSecond > 0) {
      const now = Date.now();
      if (now - ws.data.rateWindowStart >= 1000) {
        ws.data.rateWindowStart = now;
        ws.data.rateWindowCount = 0;
        ws.data.rateViolations = 0; // client behaved — forgive past violations
      }
      ws.data.rateWindowCount += 1;
      if (ws.data.rateWindowCount > this.opts.maxMessagesPerSecond) {
        ws.data.rateViolations += 1;
        const limit = this.opts.wsRateViolationLimit;
        if (limit > 0 && ws.data.rateViolations > limit) {
          try {
            ws.close(1008, "rate limit: too many violations");
          } catch {
            // ignore
          }
        }
        // Silent drop — don't even send an error frame (that itself costs bandwidth)
        return;
      }
    }

    let frame: ClientFrame;
    try {
      frame = JSON.parse(text) as ClientFrame;
    } catch {
      this.sendError(ws, "malformed-json", "Invalid JSON frame");
      return;
    }
    if (!frame || typeof frame !== "object" || typeof (frame as any).type !== "string") {
      this.sendError(ws, "malformed-frame", "Frame missing `type` field");
      return;
    }

    // Update lastSeen for any activity
    const peerId = ws.data.peerId;
    if (peerId) {
      const room = ws.data.roomId ? this.internalRooms.get(ws.data.roomId) : null;
      const handle = room?.peers.get(peerId);
      if (handle) handle.lastSeen = Date.now();
    }

    switch (frame.type) {
      case "join":
        this.handleJoin(ws, frame);
        break;
      case "leave":
        this.handleDisconnect(ws);
        try {
          ws.close(1000, "client requested leave");
        } catch {
          // ignore
        }
        break;
      case "send":
        this.handleSend(ws, frame);
        break;
      case "ping": {
        const pong: ServerFrame = { type: "pong", t: frame.t };
        this.safeSend(ws, JSON.stringify(pong));
        break;
      }
      case "pong":
        // Client pong in response to server ping — lastSeen already updated above.
        break;
      case "list-rooms":
        this.handleListRooms(ws, frame);
        break;
      default:
        this.sendError(ws, "unknown-frame", `Unknown frame type: ${(frame as any).type}`);
    }
  }

  private handleListRooms(
    ws: BunWSLike,
    frame: Extract<ClientFrame, { type: "list-rooms" }>,
  ): void {
    if (!this.opts.enableRoomListing) {
      this.sendError(ws, "listing-disabled", "Room listing is disabled on this server");
      return;
    }
    const rooms = this.collectPublicRooms(frame.filter);
    const response: ServerFrame = { type: "rooms", rooms };
    this.safeSend(ws, JSON.stringify(response));
  }

  private handleJoin(ws: BunWSLike, frame: Extract<ClientFrame, { type: "join" }>): void {
    if (ws.data.peerId) {
      this.sendError(ws, "already-joined", "Already joined a room on this connection");
      return;
    }
    const MAX_ROOM_ID_LEN = 128;
    const roomId = typeof frame.roomId === "string" ? frame.roomId : "";
    if (!roomId || roomId.length > MAX_ROOM_ID_LEN) {
      this.sendError(ws, "invalid-room", "roomId is required and must be ≤128 chars");
      return;
    }

    let room = this.internalRooms.get(roomId);
    if (!room) {
      if (this.internalRooms.size >= this.opts.maxRooms) {
        this.sendError(ws, "server-full", "Server has reached maximum rooms");
        try {
          ws.close(1013, "server full");
        } catch {
          // ignore
        }
        return;
      }
      // Honor `roomOpts` only on creation. Cap `maxPeers` at the server limit
      // so a client can't request more slots than the operator allows.
      const opts = frame.roomOpts ?? {};
      const requestedMax =
        typeof opts.maxPeers === "number" && opts.maxPeers > 0
          ? Math.min(opts.maxPeers, this.opts.maxClientsPerRoom)
          : this.opts.maxClientsPerRoom;
      const MAX_NAME_LEN = 64;
      const name = typeof opts.name === "string" && opts.name.length > 0 ? opts.name.slice(0, MAX_NAME_LEN) : roomId;
      const gameType =
        typeof opts.gameType === "string" && opts.gameType.length > 0 ? opts.gameType : undefined;
      const isPublic = opts.isPublic !== false;
      const metadata =
        opts.metadata && typeof opts.metadata === "object" && !Array.isArray(opts.metadata)
          ? { ...opts.metadata }
          : {};
      room = {
        id: roomId,
        peers: new Map(),
        hostPeerId: null,
        createdAt: Date.now(),
        metadata,
        name,
        gameType,
        isPublic,
        maxPeers: requestedMax,
      };
      this.internalRooms.set(roomId, room);
      this.fire(this.roomCreateHandlers, this.toPublicRoom(room));
    }

    if (room.peers.size >= room.maxPeers) {
      this.sendError(ws, "room-full", "Room has reached maximum clients");
      try {
        ws.close(1013, "room full");
      } catch {
        // ignore
      }
      return;
    }

    // Assign peer ID. Reuse `previousPeerId` only when enablePeerResume is
    // true AND the id is not currently held by another socket — lets game
    // logic keep state keyed by peerId across a reconnect without hunting
    // for the new id.
    let peerId: string;
    let resumed = false;
    const MAX_PEER_ID_LEN = 64;
    const PEER_ID_RE = /^[a-zA-Z0-9_-]+$/;
    const candidate =
      this.opts.enablePeerResume && typeof frame.previousPeerId === "string"
        ? frame.previousPeerId.trim()
        : "";
    const validCandidate = candidate && candidate.length <= MAX_PEER_ID_LEN && PEER_ID_RE.test(candidate)
      ? candidate : "";
    if (validCandidate && !this.sockets.has(validCandidate) && !room.peers.has(validCandidate)) {
      peerId = validCandidate;
      resumed = true;
    } else {
      peerId = generatePeerId();
      while (this.sockets.has(peerId) || room.peers.has(peerId)) {
        peerId = generatePeerId();
      }
    }

    const MAX_CLIENT_NAME_LEN = 64;
    const clientName = typeof frame.clientName === "string"
      ? frame.clientName.slice(0, MAX_CLIENT_NAME_LEN)
      : undefined;

    const existingPeerIds = Array.from(room.peers.keys());
    const handle: PeerHandle = {
      id: peerId,
      roomId,
      name: clientName,
      joinedAt: Date.now(),
      lastSeen: Date.now(),
    };
    room.peers.set(peerId, handle);
    this.sockets.set(peerId, ws);

    if (this.opts.firstPeerIsHost && room.hostPeerId === null) {
      room.hostPeerId = peerId;
    }

    ws.data.peerId = peerId;
    ws.data.roomId = roomId;

    // Welcome the joiner — isHost set if we're the host (or firstPeerIsHost=false, everyone is equal)
    const welcome: ServerFrame = {
      type: "welcome",
      peerId,
      isHost: this.opts.firstPeerIsHost ? room.hostPeerId === peerId : true,
      peers: existingPeerIds,
      resumed,
    };
    this.safeSend(ws, JSON.stringify(welcome));

    // Notify other peers in room
    const joinFrame: ServerFrame = { type: "peer-join", peerId };
    const payload = JSON.stringify(joinFrame);
    for (const other of existingPeerIds) {
      const otherWs = this.sockets.get(other);
      if (otherWs) this.safeSend(otherWs, payload);
    }

    this.fire(this.peerJoinHandlers, this.toPublicRoom(room), peerId);
  }

  private handleSend(ws: BunWSLike, frame: Extract<ClientFrame, { type: "send" }>): void {
    const peerId = ws.data.peerId;
    const roomId = ws.data.roomId;
    if (!peerId || !roomId) {
      this.sendError(ws, "not-joined", "Must join a room before sending");
      return;
    }
    const room = this.internalRooms.get(roomId);
    if (!room) return;

    const msgFrame: ServerFrame = { type: "message", from: peerId, data: frame.data };
    const payload = JSON.stringify(msgFrame);

    if (frame.to === "all") {
      for (const other of room.peers.keys()) {
        if (other === peerId) continue;
        const otherWs = this.sockets.get(other);
        if (otherWs) this.safeSend(otherWs, payload);
      }
    } else if (typeof frame.to === "string") {
      if (!room.peers.has(frame.to)) {
        // Silent no-op per NetworkAdapter contract
        return;
      }
      const targetWs = this.sockets.get(frame.to);
      if (targetWs) this.safeSend(targetWs, payload);
    }

    this.fire(this.messageHandlers, this.toPublicRoom(room), peerId, frame.data);
  }

  private handleDisconnect(ws: BunWSLike): void {
    const peerId = ws.data.peerId;
    const roomId = ws.data.roomId;
    if (!peerId || !roomId) {
      // Never joined
      return;
    }

    // Clear so repeated close() calls are no-ops
    ws.data.peerId = null;
    ws.data.roomId = null;

    this.sockets.delete(peerId);
    const room = this.internalRooms.get(roomId);
    if (!room) return;
    const had = room.peers.delete(peerId);
    if (!had) return;

    // Promote new host if needed
    if (room.hostPeerId === peerId) {
      const next = room.peers.keys().next().value ?? null;
      room.hostPeerId = next;
    }

    // Notify remaining peers
    const leaveFrame: ServerFrame = { type: "peer-leave", peerId };
    const payload = JSON.stringify(leaveFrame);
    for (const other of room.peers.keys()) {
      const otherWs = this.sockets.get(other);
      if (otherWs) this.safeSend(otherWs, payload);
    }

    this.fire(this.peerLeaveHandlers, this.toPublicRoom(room), peerId);

    if (room.peers.size === 0) {
      this.destroyRoom(room);
    }
  }

  private destroyRoom(room: InternalRoom): void {
    if (!this.internalRooms.has(room.id)) return;
    this.internalRooms.delete(room.id);
    this.fire(this.roomDestroyHandlers, this.toPublicRoom(room));
  }

  private tickKeepalive(): void {
    const now = Date.now();
    // Send pings
    for (const [peerId, ws] of this.sockets) {
      const roomId = ws.data.roomId;
      if (!roomId) continue;
      const room = this.internalRooms.get(roomId);
      const handle = room?.peers.get(peerId);
      if (!handle) continue;
      // Kick if stale
      if (this.opts.clientTimeout > 0 && now - handle.lastSeen > this.opts.clientTimeout) {
        try {
          ws.close(1001, "client timeout");
        } catch {
          // ignore
        }
        continue;
      }
      // Send ping
      const ping: ServerFrame = { type: "ping", t: now };
      this.safeSend(ws, JSON.stringify(ping));
    }
  }

  private sendError(ws: BunWSLike, code: string, message: string): void {
    const frame: ServerFrame = { type: "error", code, message };
    this.safeSend(ws, JSON.stringify(frame));
  }

  private safeSend(ws: BunWSLike, payload: string): boolean {
    // Bun's ws.readyState: 0 CONNECTING, 1 OPEN, 2 CLOSING, 3 CLOSED
    if (ws.readyState !== 1) return false;
    try {
      ws.send(payload);
      return true;
    } catch (err) {
      console.warn("[GameServer] send failed:", err);
      return false;
    }
  }

  private toPublicRoom(r: InternalRoom): Room {
    return {
      id: r.id,
      peers: Array.from(r.peers.keys()),
      hostPeerId: r.hostPeerId,
      createdAt: r.createdAt,
      metadata: r.metadata,
      name: r.name,
      gameType: r.gameType,
      isPublic: r.isPublic,
      maxPeers: r.maxPeers,
    };
  }

  /** Build a `PublicRoomInfo` snapshot suitable for external listings. */
  private toRoomInfo(r: InternalRoom): PublicRoomInfo {
    const peerCount = r.peers.size;
    return {
      id: r.id,
      name: r.name,
      peerCount,
      maxPeers: r.maxPeers,
      gameType: r.gameType,
      isPublic: r.isPublic,
      isFull: peerCount >= r.maxPeers,
      createdAt: r.createdAt,
      // Clone the metadata so callers can't mutate server-internal state.
      metadata: r.metadata && Object.keys(r.metadata).length > 0 ? { ...r.metadata } : undefined,
    };
  }

  /** Filter + snapshot all listable rooms. Private rooms are always excluded. */
  private collectPublicRooms(filter?: RoomListFilter): PublicRoomInfo[] {
    const out: PublicRoomInfo[] = [];
    const gameType = filter?.gameType;
    for (const room of this.internalRooms.values()) {
      if (!room.isPublic) continue;
      if (typeof gameType === "string" && room.gameType !== gameType) continue;
      out.push(this.toRoomInfo(room));
    }
    return out;
  }

  /**
   * Sliding-window per-IP HTTP rate check. Returns true when the request is
   * within budget; false when the IP has exceeded `httpRateLimit` in the
   * current window.
   */
  private allowHttpRequest(ip: string): boolean {
    if (this.opts.httpRateLimit <= 0) return true;
    const now = Date.now();
    const windowMs = this.opts.httpRateLimitWindowMs;
    const bucket = this.httpRateBuckets.get(ip);
    if (!bucket || now - bucket.windowStart >= windowMs) {
      this.httpRateBuckets.set(ip, { count: 1, windowStart: now });
      // Opportunistic GC so the map doesn't grow unbounded across months.
      if (this.httpRateBuckets.size > 10_000) this.pruneHttpBuckets(now, windowMs);
      return true;
    }
    bucket.count += 1;
    return bucket.count <= this.opts.httpRateLimit;
  }

  private pruneHttpBuckets(now: number, windowMs: number): void {
    for (const [ip, b] of this.httpRateBuckets) {
      if (now - b.windowStart >= windowMs) this.httpRateBuckets.delete(ip);
    }
  }

  /** Handle GET /rooms and non-GET method fallbacks. */
  private handleRoomListingHttp(req: Request, url: URL): Response {
    const corsHeaders: Record<string, string> = {};
    if (this.opts.corsAllowOrigin) {
      corsHeaders["Access-Control-Allow-Origin"] = this.opts.corsAllowOrigin;
      corsHeaders.Vary = "Origin";
    }

    // Preflight — answer OPTIONS even when listing is disabled so browsers
    // don't report misleading CORS errors instead of the real 404.
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders,
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (!this.opts.enableRoomListing) {
      return new Response("Not found", { status: 404, headers: corsHeaders });
    }

    if (req.method !== "GET") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { ...corsHeaders, Allow: "GET, OPTIONS" },
      });
    }

    const gameTypeParam = url.searchParams.get("gameType");
    const filter: RoomListFilter = {};
    if (gameTypeParam !== null && gameTypeParam.length > 0) {
      filter.gameType = gameTypeParam;
    }
    // `public` is accepted for symmetry with the WS frame but private rooms
    // are always excluded — see collectPublicRooms.
    const rooms = this.collectPublicRooms(filter);
    return new Response(JSON.stringify({ rooms }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  /** Snapshot all public rooms. Useful for server-side admin UIs. */
  listPublicRooms(filter?: RoomListFilter): PublicRoomInfo[] {
    return this.collectPublicRooms(filter);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private fire<H extends (...args: any[]) => void>(set: Set<H>, ...args: Parameters<H>): void {
    for (const h of Array.from(set)) {
      try {
        h(...args);
      } catch (err) {
        console.error("[GameServer] handler threw:", err);
      }
    }
  }
}
