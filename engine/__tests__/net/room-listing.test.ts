/**
 * Room listing / discovery tests.
 *
 * Covers:
 *   - HTTP `GET /rooms` endpoint (success, filter, CORS, method gating, disable).
 *   - `list-rooms` WebSocket frame.
 *   - `SocketAdapter.listRooms()` static + instance methods.
 *   - `roomOpts` plumbing: creation-only, private-exclusion, maxPeers clamp.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { GameServer } from "../../net/game-server";
import { SocketAdapter } from "../../net/socket-adapter";

// ---- Helpers ----

async function startServer(
  opts?: ConstructorParameters<typeof GameServer>[0],
): Promise<GameServer> {
  const server = new GameServer({ port: 0, pingInterval: 0, ...opts });
  await server.start();
  return server;
}

class ClientTap {
  readonly frames: any[] = [];
  readonly ws: WebSocket;
  private openPromise: Promise<void>;

  constructor(port: number) {
    this.ws = new WebSocket(`ws://localhost:${port}`);
    this.openPromise = new Promise((resolve, reject) => {
      const onOpen = () => {
        this.ws.removeEventListener("open", onOpen);
        this.ws.removeEventListener("error", onErr);
        resolve();
      };
      const onErr = (e: Event) => {
        this.ws.removeEventListener("open", onOpen);
        this.ws.removeEventListener("error", onErr);
        reject(new Error(`WebSocket error: ${e}`));
      };
      this.ws.addEventListener("open", onOpen);
      this.ws.addEventListener("error", onErr);
    });
    this.ws.addEventListener("message", (ev) => {
      if (typeof ev.data !== "string") return;
      try {
        this.frames.push(JSON.parse(ev.data));
      } catch {
        // ignore
      }
    });
  }

  waitOpen() {
    return this.openPromise;
  }

  send(frame: any) {
    this.ws.send(JSON.stringify(frame));
  }

  join(roomId: string, extras?: { clientName?: string; roomOpts?: any }): Promise<any> {
    return new Promise((resolve) => {
      const listener = (ev: MessageEvent) => {
        if (typeof ev.data !== "string") return;
        try {
          const frame = JSON.parse(ev.data);
          if (frame.type === "welcome") {
            this.ws.removeEventListener("message", listener);
            resolve(frame);
          }
        } catch {
          // ignore
        }
      };
      this.ws.addEventListener("message", listener);
      this.send({ type: "join", roomId, ...extras });
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // ignore
    }
  }

  waitFor(predicate: (frame: any) => boolean, timeoutMs = 1000): Promise<any> {
    return new Promise((resolve, reject) => {
      const existing = this.frames.find(predicate);
      if (existing) {
        resolve(existing);
        return;
      }
      const started = Date.now();
      const onMessage = (ev: MessageEvent) => {
        if (typeof ev.data !== "string") return;
        try {
          const frame = JSON.parse(ev.data);
          if (predicate(frame)) {
            cleanup();
            resolve(frame);
          }
        } catch {
          // ignore
        }
      };
      const interval = setInterval(() => {
        if (Date.now() - started > timeoutMs) {
          cleanup();
          reject(new Error(`waitFor timeout after ${timeoutMs}ms`));
        }
      }, 20);
      const cleanup = () => {
        clearInterval(interval);
        this.ws.removeEventListener("message", onMessage);
      };
      this.ws.addEventListener("message", onMessage);
    });
  }
}

async function flush(ms = 40): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// ---- Tests ----

describe("GameServer room listing (HTTP)", () => {
  let server: GameServer;
  const openClients: ClientTap[] = [];

  afterEach(async () => {
    for (const c of openClients) c.close();
    openClients.length = 0;
    if (server) {
      await server.stop();
    }
  });

  function spawnClient(): ClientTap {
    const c = new ClientTap(server.port);
    openClients.push(c);
    return c;
  }

  test("GET /rooms returns empty array when no rooms exist", async () => {
    server = await startServer();
    const res = await fetch(`http://localhost:${server.port}/rooms`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")?.includes("application/json")).toBe(true);
    const body = (await res.json()) as { rooms: unknown[] };
    expect(body.rooms).toEqual([]);
  });

  test("GET /rooms lists one room after a client joins with roomOpts", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    await a.join("r1", {
      roomOpts: { name: "My Lobby", gameType: "roguelike", metadata: { difficulty: "hard" } },
    });
    await flush(20);
    const res = await fetch(`http://localhost:${server.port}/rooms`);
    const body = (await res.json()) as { rooms: any[] };
    expect(body.rooms.length).toBe(1);
    const info = body.rooms[0];
    expect(info.id).toBe("r1");
    expect(info.name).toBe("My Lobby");
    expect(info.gameType).toBe("roguelike");
    expect(info.peerCount).toBe(1);
    expect(info.isPublic).toBe(true);
    expect(info.isFull).toBe(false);
    expect(info.metadata).toEqual({ difficulty: "hard" });
    expect(typeof info.createdAt).toBe("number");
  });

  test("GET /rooms returns multiple rooms with correct peerCount each", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    await a.join("room-a", { roomOpts: { name: "Alpha" } });
    const b = spawnClient();
    await b.waitOpen();
    await b.join("room-a");
    const c = spawnClient();
    await c.waitOpen();
    await c.join("room-b", { roomOpts: { name: "Bravo" } });
    await flush(20);
    const res = await fetch(`http://localhost:${server.port}/rooms`);
    const body = (await res.json()) as { rooms: any[] };
    expect(body.rooms.length).toBe(2);
    const byId = new Map(body.rooms.map((r: any) => [r.id, r]));
    expect(byId.get("room-a")?.peerCount).toBe(2);
    expect(byId.get("room-b")?.peerCount).toBe(1);
  });

  test("GET /rooms filters by gameType query param", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    await a.join("rogue1", { roomOpts: { gameType: "roguelike" } });
    const b = spawnClient();
    await b.waitOpen();
    await b.join("ast1", { roomOpts: { gameType: "asteroids" } });
    await flush(20);
    const res = await fetch(`http://localhost:${server.port}/rooms?gameType=roguelike`);
    const body = (await res.json()) as { rooms: any[] };
    expect(body.rooms.length).toBe(1);
    expect(body.rooms[0].id).toBe("rogue1");
  });

  test("private rooms are excluded from GET /rooms listings", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    await a.join("secret", { roomOpts: { isPublic: false } });
    const b = spawnClient();
    await b.waitOpen();
    await b.join("public");
    await flush(20);
    const res = await fetch(`http://localhost:${server.port}/rooms`);
    const body = (await res.json()) as { rooms: any[] };
    expect(body.rooms.length).toBe(1);
    expect(body.rooms[0].id).toBe("public");
  });

  test("private rooms are still joinable when the id is known", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    const welcome = await a.join("private-id", { roomOpts: { isPublic: false } });
    expect(welcome.type).toBe("welcome");
    const b = spawnClient();
    await b.waitOpen();
    const w2 = await b.join("private-id");
    expect(w2.type).toBe("welcome");
    // Confirm the room exists and has both peers
    expect(server.rooms.get("private-id")?.peers.length).toBe(2);
  });

  test("enableRoomListing: false causes /rooms to return 404", async () => {
    server = await startServer({ enableRoomListing: false });
    const res = await fetch(`http://localhost:${server.port}/rooms`);
    expect(res.status).toBe(404);
  });

  test("CORS Access-Control-Allow-Origin defaults to '*'", async () => {
    server = await startServer();
    const res = await fetch(`http://localhost:${server.port}/rooms`);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  test("CORS header absent when corsAllowOrigin is empty string", async () => {
    server = await startServer({ corsAllowOrigin: "" });
    const res = await fetch(`http://localhost:${server.port}/rooms`);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("CORS header respects a specific origin override", async () => {
    server = await startServer({ corsAllowOrigin: "https://example.com" });
    const res = await fetch(`http://localhost:${server.port}/rooms`);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://example.com");
  });

  test("POST /rooms returns 405 Method Not Allowed", async () => {
    server = await startServer();
    const res = await fetch(`http://localhost:${server.port}/rooms`, { method: "POST" });
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toContain("GET");
    // consume body so node/undici doesn't complain
    await res.text();
  });

  test("isFull=true when room reaches maxPeers", async () => {
    server = await startServer({ maxClientsPerRoom: 2 });
    const a = spawnClient();
    await a.waitOpen();
    await a.join("r1");
    const b = spawnClient();
    await b.waitOpen();
    await b.join("r1");
    await flush(20);
    const res = await fetch(`http://localhost:${server.port}/rooms`);
    const body = (await res.json()) as { rooms: any[] };
    expect(body.rooms[0].isFull).toBe(true);
    expect(body.rooms[0].peerCount).toBe(2);
    expect(body.rooms[0].maxPeers).toBe(2);
  });

  test("room name defaults to room id when not provided", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    await a.join("no-name-room");
    await flush(20);
    const res = await fetch(`http://localhost:${server.port}/rooms`);
    const body = (await res.json()) as { rooms: any[] };
    expect(body.rooms[0].name).toBe("no-name-room");
  });
});

describe("GameServer list-rooms WebSocket frame", () => {
  let server: GameServer;
  const openClients: ClientTap[] = [];

  afterEach(async () => {
    for (const c of openClients) c.close();
    openClients.length = 0;
    if (server) {
      await server.stop();
    }
  });

  function spawnClient(): ClientTap {
    const c = new ClientTap(server.port);
    openClients.push(c);
    return c;
  }

  test("list-rooms frame returns rooms response before joining", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    await a.join("lobby-alpha", { roomOpts: { gameType: "roguelike" } });
    const b = spawnClient();
    await b.waitOpen();
    // b never joins — can still request the listing.
    b.send({ type: "list-rooms" });
    const response = await b.waitFor((f) => f.type === "rooms");
    expect(response.rooms.length).toBe(1);
    expect(response.rooms[0].id).toBe("lobby-alpha");
    expect(response.rooms[0].gameType).toBe("roguelike");
  });

  test("list-rooms frame applies gameType filter", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    await a.join("r1", { roomOpts: { gameType: "roguelike" } });
    const b = spawnClient();
    await b.waitOpen();
    await b.join("r2", { roomOpts: { gameType: "asteroids" } });
    const c = spawnClient();
    await c.waitOpen();
    c.send({ type: "list-rooms", filter: { gameType: "asteroids" } });
    const response = await c.waitFor((f) => f.type === "rooms");
    expect(response.rooms.length).toBe(1);
    expect(response.rooms[0].id).toBe("r2");
  });

  test("list-rooms frame excludes private rooms", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    await a.join("hidden", { roomOpts: { isPublic: false } });
    const b = spawnClient();
    await b.waitOpen();
    b.send({ type: "list-rooms" });
    const response = await b.waitFor((f) => f.type === "rooms");
    expect(response.rooms.length).toBe(0);
  });

  test("list-rooms when enableRoomListing=false returns listing-disabled error", async () => {
    server = await startServer({ enableRoomListing: false });
    const a = spawnClient();
    await a.waitOpen();
    a.send({ type: "list-rooms" });
    const err = await a.waitFor((f) => f.type === "error");
    expect(err.code).toBe("listing-disabled");
  });

  test("list-rooms frame works for a client already in a room", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    await a.join("myroom");
    a.send({ type: "list-rooms" });
    const response = await a.waitFor((f) => f.type === "rooms");
    expect(response.rooms.length).toBe(1);
    expect(response.rooms[0].id).toBe("myroom");
  });
});

describe("GameServer roomOpts behaviour", () => {
  let server: GameServer;
  const openClients: ClientTap[] = [];

  afterEach(async () => {
    for (const c of openClients) c.close();
    openClients.length = 0;
    if (server) {
      await server.stop();
    }
  });

  function spawnClient(): ClientTap {
    const c = new ClientTap(server.port);
    openClients.push(c);
    return c;
  }

  test("roomOpts from subsequent joiners are ignored", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    await a.join("r1", { roomOpts: { name: "First", gameType: "alpha" } });
    const b = spawnClient();
    await b.waitOpen();
    await b.join("r1", {
      roomOpts: { name: "HackedName", gameType: "hijacked" },
    });
    await flush(20);
    const res = await fetch(`http://localhost:${server.port}/rooms`);
    const body = (await res.json()) as { rooms: any[] };
    expect(body.rooms[0].name).toBe("First");
    expect(body.rooms[0].gameType).toBe("alpha");
  });

  test("roomOpts.maxPeers is clamped to server's maxClientsPerRoom", async () => {
    server = await startServer({ maxClientsPerRoom: 3 });
    const a = spawnClient();
    await a.waitOpen();
    await a.join("big", { roomOpts: { maxPeers: 999 } });
    await flush(20);
    const res = await fetch(`http://localhost:${server.port}/rooms`);
    const body = (await res.json()) as { rooms: any[] };
    expect(body.rooms[0].maxPeers).toBe(3);
  });

  test("roomOpts.maxPeers below server cap is honored and enforced", async () => {
    server = await startServer({ maxClientsPerRoom: 10 });
    const a = spawnClient();
    await a.waitOpen();
    await a.join("tiny", { roomOpts: { maxPeers: 2 } });
    const b = spawnClient();
    await b.waitOpen();
    await b.join("tiny");
    const c = spawnClient();
    await c.waitOpen();
    c.send({ type: "join", roomId: "tiny" });
    const err = await c.waitFor((f) => f.type === "error");
    expect(err.code).toBe("room-full");
  });

  test("roomOpts.metadata is exposed in listings", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    await a.join("meta", {
      roomOpts: { metadata: { level: 5, mode: "coop" } },
    });
    await flush(20);
    const res = await fetch(`http://localhost:${server.port}/rooms`);
    const body = (await res.json()) as { rooms: any[] };
    expect(body.rooms[0].metadata).toEqual({ level: 5, mode: "coop" });
  });
});

describe("SocketAdapter room discovery", () => {
  let server: GameServer;
  const openAdapters: SocketAdapter[] = [];
  const openTaps: ClientTap[] = [];

  afterEach(async () => {
    for (const a of openAdapters) {
      try {
        a.disconnect();
      } catch {
        // ignore
      }
    }
    openAdapters.length = 0;
    for (const t of openTaps) t.close();
    openTaps.length = 0;
    if (server) {
      await server.stop();
    }
  });

  function track(a: SocketAdapter): SocketAdapter {
    openAdapters.push(a);
    return a;
  }

  function spawnTap(): ClientTap {
    const t = new ClientTap(server.port);
    openTaps.push(t);
    return t;
  }

  test("SocketAdapter.listRooms static method fetches rooms via HTTP (ws:// URL)", async () => {
    server = await startServer();
    const t = spawnTap();
    await t.waitOpen();
    await t.join("static-room", { roomOpts: { gameType: "puzzle" } });
    await flush(20);
    const rooms = await SocketAdapter.listRooms(`ws://localhost:${server.port}`);
    expect(rooms.length).toBe(1);
    expect(rooms[0].id).toBe("static-room");
    expect(rooms[0].gameType).toBe("puzzle");
  });

  test("SocketAdapter.listRooms static method applies gameType filter", async () => {
    server = await startServer();
    const t1 = spawnTap();
    await t1.waitOpen();
    await t1.join("p1", { roomOpts: { gameType: "puzzle" } });
    const t2 = spawnTap();
    await t2.waitOpen();
    await t2.join("a1", { roomOpts: { gameType: "action" } });
    await flush(20);
    const rooms = await SocketAdapter.listRooms(`http://localhost:${server.port}`, {
      gameType: "action",
    });
    expect(rooms.length).toBe(1);
    expect(rooms[0].id).toBe("a1");
  });

  test("SocketAdapter.listRooms static rejects when listing is disabled (404)", async () => {
    server = await startServer({ enableRoomListing: false });
    await expect(SocketAdapter.listRooms(`ws://localhost:${server.port}`)).rejects.toThrow();
  });

  test("SocketAdapter#listRooms instance method works while connected", async () => {
    server = await startServer();
    const t = spawnTap();
    await t.waitOpen();
    await t.join("host-room", { roomOpts: { name: "Hosted" } });
    await flush(20);

    const a = track(
      new SocketAdapter({
        url: `ws://localhost:${server.port}`,
        roomId: "browser-room",
        reconnectDelay: 30,
        maxReconnectAttempts: 3,
      }),
    );
    await a.connect();
    const rooms = await a.listRooms();
    // Both rooms are public; "browser-room" was created by this adapter.
    const ids = rooms.map((r) => r.id).sort();
    expect(ids).toEqual(["browser-room", "host-room"].sort());
  });

  test("SocketAdapter#listRooms instance method applies gameType filter", async () => {
    server = await startServer();
    const t1 = spawnTap();
    await t1.waitOpen();
    await t1.join("shooter", { roomOpts: { gameType: "shooter" } });
    const t2 = spawnTap();
    await t2.waitOpen();
    await t2.join("rpg", { roomOpts: { gameType: "rpg" } });
    await flush(20);

    const a = track(
      new SocketAdapter({
        url: `ws://localhost:${server.port}`,
        roomId: "rpg",
        reconnectDelay: 30,
        maxReconnectAttempts: 3,
      }),
    );
    await a.connect();
    const filtered = await a.listRooms({ gameType: "shooter" });
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe("shooter");
  });

  test("SocketAdapter#listRooms rejects when not connected", async () => {
    const a = new SocketAdapter({
      url: "ws://localhost:1",
      roomId: "never",
      autoReconnect: false,
    });
    await expect(a.listRooms()).rejects.toThrow();
  });

  test("SocketAdapter passes roomOpts through join frame", async () => {
    server = await startServer();
    const a = track(
      new SocketAdapter({
        url: `ws://localhost:${server.port}`,
        roomId: "opts-room",
        roomOpts: { name: "AdapterOpts", gameType: "strategy", metadata: { seed: 42 } },
        reconnectDelay: 30,
        maxReconnectAttempts: 3,
      }),
    );
    await a.connect();
    await flush(20);
    const rooms = await SocketAdapter.listRooms(`ws://localhost:${server.port}`);
    expect(rooms.length).toBe(1);
    expect(rooms[0].id).toBe("opts-room");
    expect(rooms[0].name).toBe("AdapterOpts");
    expect(rooms[0].gameType).toBe("strategy");
    expect(rooms[0].metadata).toEqual({ seed: 42 });
  });

  test("SocketAdapter with isPublic:false stays hidden from listings", async () => {
    server = await startServer();
    const a = track(
      new SocketAdapter({
        url: `ws://localhost:${server.port}`,
        roomId: "hidden-adapter",
        roomOpts: { isPublic: false },
        reconnectDelay: 30,
        maxReconnectAttempts: 3,
      }),
    );
    await a.connect();
    await flush(20);
    const rooms = await SocketAdapter.listRooms(`ws://localhost:${server.port}`);
    expect(rooms.length).toBe(0);
    // Still connected though.
    expect(a.connected).toBe(true);
  });
});
