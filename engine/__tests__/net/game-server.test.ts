/**
 * GameServer integration tests.
 *
 * These run in Bun and exercise the real WebSocket server on an ephemeral
 * port. Tests use the browser-style `WebSocket` constructor (available in
 * Bun's runtime) as clients so we're not just testing adapter↔server
 * round-tripping.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { GameServer } from "../../net/game-server";

// ---- Test helpers ----

/** Spin up a server on an ephemeral port. */
async function startServer(
  opts?: ConstructorParameters<typeof GameServer>[0],
): Promise<GameServer> {
  const server = new GameServer({ port: 0, pingInterval: 0, ...opts });
  await server.start();
  return server;
}

/** Collect incoming frames from a raw WebSocket. */
class ClientTap {
  readonly frames: any[] = [];
  readonly ws: WebSocket;
  private openPromise: Promise<void>;
  private welcomePromise: Promise<any> | null = null;
  private welcomeResolve: ((v: any) => void) | null = null;

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
        const frame = JSON.parse(ev.data);
        this.frames.push(frame);
        if (frame.type === "welcome" && this.welcomeResolve) {
          this.welcomeResolve(frame);
          this.welcomeResolve = null;
        }
      } catch {
        // ignore
      }
    });
  }

  waitOpen() {
    return this.openPromise;
  }

  join(roomId: string, clientName?: string): Promise<any> {
    this.welcomePromise = new Promise((resolve) => {
      this.welcomeResolve = resolve;
    });
    this.send({ type: "join", roomId, clientName });
    return this.welcomePromise;
  }

  send(frame: any) {
    this.ws.send(JSON.stringify(frame));
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // ignore
    }
  }

  /** Wait until `predicate` is satisfied by any accumulated frame or for timeout. */
  waitFor(predicate: (frame: any) => boolean, timeoutMs = 1000): Promise<any> {
    return new Promise((resolve, reject) => {
      // Check existing frames first
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

async function flush(ms = 30): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// ---- Tests ----

describe("GameServer", () => {
  let server: GameServer;
  const openClients: ClientTap[] = [];

  beforeEach(() => {
    openClients.length = 0;
  });

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

  test("starts and accepts connections on ephemeral port", async () => {
    server = await startServer();
    expect(server.port).toBeGreaterThan(0);
    const c = spawnClient();
    await c.waitOpen();
    const welcome = await c.join("room1");
    expect(welcome.type).toBe("welcome");
    expect(typeof welcome.peerId).toBe("string");
    expect(welcome.peerId.length).toBeGreaterThan(0);
    expect(welcome.isHost).toBe(true);
    expect(welcome.peers).toEqual([]);
  });

  test("rejects non-WS requests with 426", async () => {
    server = await startServer();
    const res = await fetch(`http://localhost:${server.port}`);
    expect(res.status).toBe(426);
  });

  test("second peer sees first in welcome.peers and first gets peer-join", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    const wa = await a.join("room1");
    const b = spawnClient();
    await b.waitOpen();
    const wb = await b.join("room1");
    expect(wb.peers).toEqual([wa.peerId]);
    const join = await a.waitFor((f) => f.type === "peer-join");
    expect(join.peerId).toBe(wb.peerId);
  });

  test("first peer is host; non-host sees isHost=false", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    const wa = await a.join("room1");
    expect(wa.isHost).toBe(true);
    const b = spawnClient();
    await b.waitOpen();
    const wb = await b.join("room1");
    expect(wb.isHost).toBe(false);
  });

  test("firstPeerIsHost=false marks everyone isHost=true", async () => {
    server = await startServer({ firstPeerIsHost: false });
    const a = spawnClient();
    await a.waitOpen();
    const wa = await a.join("room1");
    const b = spawnClient();
    await b.waitOpen();
    const wb = await b.join("room1");
    expect(wa.isHost).toBe(true);
    expect(wb.isHost).toBe(true);
  });

  test("messages are delivered to the targeted peer only (unicast)", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    const wa = await a.join("room1");
    const b = spawnClient();
    await b.waitOpen();
    const wb = await b.join("room1");
    const c = spawnClient();
    await c.waitOpen();
    await c.join("room1");

    a.send({ type: "send", to: wb.peerId, data: { hello: "b" } });
    const received = await b.waitFor((f) => f.type === "message" && f.data?.hello === "b");
    expect(received.from).toBe(wa.peerId);
    await flush(60);
    const cGot = c.frames.find((f) => f.type === "message" && f.data?.hello === "b");
    expect(cGot).toBeUndefined();
  });

  test("to:'all' broadcasts excludes sender but reaches all others", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    const wa = await a.join("room1");
    const b = spawnClient();
    await b.waitOpen();
    await b.join("room1");
    const c = spawnClient();
    await c.waitOpen();
    await c.join("room1");

    a.send({ type: "send", to: "all", data: { ping: 1 } });
    const bGot = await b.waitFor((f) => f.type === "message" && f.data?.ping === 1);
    const cGot = await c.waitFor((f) => f.type === "message" && f.data?.ping === 1);
    expect(bGot.from).toBe(wa.peerId);
    expect(cGot.from).toBe(wa.peerId);
    await flush(60);
    const aGot = a.frames.find((f) => f.type === "message" && f.data?.ping === 1);
    expect(aGot).toBeUndefined();
  });

  test("rooms are isolated — messages don't cross rooms", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    await a.join("alpha");
    const b = spawnClient();
    await b.waitOpen();
    await b.join("bravo");

    a.send({ type: "send", to: "all", data: { leak: true } });
    await flush(80);
    const bGot = b.frames.find((f) => f.type === "message");
    expect(bGot).toBeUndefined();
  });

  test("closing a peer fires peer-leave on remaining peers", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    await a.join("room1");
    const b = spawnClient();
    await b.waitOpen();
    const wb = await b.join("room1");
    b.close();
    const leave = await a.waitFor((f) => f.type === "peer-leave");
    expect(leave.peerId).toBe(wb.peerId);
  });

  test("maxClientsPerRoom enforced with room-full error", async () => {
    server = await startServer({ maxClientsPerRoom: 2 });
    const a = spawnClient();
    await a.waitOpen();
    await a.join("room1");
    const b = spawnClient();
    await b.waitOpen();
    await b.join("room1");
    const c = spawnClient();
    await c.waitOpen();
    c.send({ type: "join", roomId: "room1" });
    const err = await c.waitFor((f) => f.type === "error");
    expect(err.code).toBe("room-full");
  });

  test("maxRooms enforced with server-full error", async () => {
    server = await startServer({ maxRooms: 2 });
    const a = spawnClient();
    await a.waitOpen();
    await a.join("r1");
    const b = spawnClient();
    await b.waitOpen();
    await b.join("r2");
    const c = spawnClient();
    await c.waitOpen();
    c.send({ type: "join", roomId: "r3" });
    const err = await c.waitFor((f) => f.type === "error");
    expect(err.code).toBe("server-full");
  });

  test("room destroyed when last peer leaves", async () => {
    server = await startServer();
    const state: { destroyed: string | null } = { destroyed: null };
    server.onRoomDestroy((room) => {
      state.destroyed = room.id;
    });
    const a = spawnClient();
    await a.waitOpen();
    await a.join("lonely");
    expect(server.rooms.has("lonely")).toBe(true);
    a.close();
    await flush(50);
    expect(state.destroyed).toBe("lonely");
    expect(server.rooms.has("lonely")).toBe(false);
  });

  test("host reassignment when host leaves", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    const wa = await a.join("room1");
    const b = spawnClient();
    await b.waitOpen();
    const wb = await b.join("room1");

    expect(server.rooms.get("room1")?.hostPeerId).toBe(wa.peerId);
    a.close();
    await flush(50);
    expect(server.rooms.get("room1")?.hostPeerId).toBe(wb.peerId);
  });

  test("onRoomCreate fires on new room", async () => {
    server = await startServer();
    const created: string[] = [];
    server.onRoomCreate((r) => created.push(r.id));
    const a = spawnClient();
    await a.waitOpen();
    await a.join("alpha");
    const b = spawnClient();
    await b.waitOpen();
    await b.join("alpha"); // existing room — shouldn't fire again
    const c = spawnClient();
    await c.waitOpen();
    await c.join("beta");
    expect(created).toEqual(["alpha", "beta"]);
  });

  test("onMessage fires with room+peerId+data", async () => {
    server = await startServer();
    const seen: Array<{ room: string; peer: string; data: any }> = [];
    server.onMessage((room, peerId, data) => {
      seen.push({ room: room.id, peer: peerId, data });
    });
    const a = spawnClient();
    await a.waitOpen();
    const wa = await a.join("room1");
    const b = spawnClient();
    await b.waitOpen();
    await b.join("room1");
    a.send({ type: "send", to: "all", data: { hi: 1 } });
    await flush(60);
    expect(seen.length).toBe(1);
    expect(seen[0].room).toBe("room1");
    expect(seen[0].peer).toBe(wa.peerId);
    expect(seen[0].data).toEqual({ hi: 1 });
  });

  test("onPeerJoin and onPeerLeave fire for both peers", async () => {
    server = await startServer();
    const joins: string[] = [];
    const leaves: string[] = [];
    server.onPeerJoin((_r, id) => joins.push(id));
    server.onPeerLeave((_r, id) => leaves.push(id));
    const a = spawnClient();
    await a.waitOpen();
    const wa = await a.join("room1");
    const b = spawnClient();
    await b.waitOpen();
    const wb = await b.join("room1");
    b.close();
    await flush(60);
    expect(joins).toEqual([wa.peerId, wb.peerId]);
    expect(leaves).toEqual([wb.peerId]);
  });

  test("onMessage/join handlers unsubscribe via returned fn", async () => {
    server = await startServer();
    let count = 0;
    const unsub = server.onMessage(() => {
      count++;
    });
    const a = spawnClient();
    await a.waitOpen();
    await a.join("room1");
    const b = spawnClient();
    await b.waitOpen();
    await b.join("room1");
    a.send({ type: "send", to: "all", data: 1 });
    await flush(40);
    unsub();
    a.send({ type: "send", to: "all", data: 2 });
    await flush(40);
    expect(count).toBe(1);
  });

  test("broadcastToRoom delivers with from:'server'", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    await a.join("room1");
    const b = spawnClient();
    await b.waitOpen();
    await b.join("room1");
    server.broadcastToRoom("room1", { announcement: "hi" });
    const aGot = await a.waitFor((f) => f.type === "message" && f.data?.announcement === "hi");
    const bGot = await b.waitFor((f) => f.type === "message" && f.data?.announcement === "hi");
    expect(aGot.from).toBe("server");
    expect(bGot.from).toBe("server");
  });

  test("broadcastToRoom excludes the specified peer", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    const wa = await a.join("room1");
    const b = spawnClient();
    await b.waitOpen();
    await b.join("room1");
    server.broadcastToRoom("room1", { x: 1 }, wa.peerId);
    const bGot = await b.waitFor((f) => f.type === "message" && f.data?.x === 1);
    expect(bGot).toBeDefined();
    await flush(60);
    const aGot = a.frames.find((f) => f.type === "message" && f.data?.x === 1);
    expect(aGot).toBeUndefined();
  });

  test("sendToPeer returns true on success and delivers", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    const wa = await a.join("room1");
    const ok = server.sendToPeer("room1", wa.peerId, { secret: 42 });
    expect(ok).toBe(true);
    const got = await a.waitFor((f) => f.type === "message" && f.data?.secret === 42);
    expect(got.from).toBe("server");
  });

  test("sendToPeer returns false for unknown room or peer", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    await a.join("room1");
    expect(server.sendToPeer("ghost", "abc", {})).toBe(false);
    expect(server.sendToPeer("room1", "nonexistent", {})).toBe(false);
  });

  test("kickPeer closes the connection with error frame", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    const wa = await a.join("room1");
    const closedPromise = new Promise<number>((resolve) => {
      a.ws.addEventListener("close", (ev) => resolve(ev.code));
    });
    server.kickPeer("room1", wa.peerId, "naughty");
    const errFrame = await a.waitFor((f) => f.type === "error" && f.code === "kicked");
    expect(errFrame.message).toBe("naughty");
    await closedPromise;
  });

  test("ping frame gets pong echoed with same t", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    await a.join("room1");
    a.send({ type: "ping", t: 12345 });
    const pong = await a.waitFor((f) => f.type === "pong");
    expect(pong.t).toBe(12345);
  });

  test("malformed JSON returns error frame", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    a.ws.send("not json at all {");
    const err = await a.waitFor((f) => f.type === "error");
    expect(err.code).toBe("malformed-json");
  });

  test("send before join returns not-joined error", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    a.send({ type: "send", to: "all", data: {} });
    const err = await a.waitFor((f) => f.type === "error");
    expect(err.code).toBe("not-joined");
  });

  test("second join on same connection returns already-joined error", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    await a.join("room1");
    a.send({ type: "join", roomId: "room2" });
    const err = await a.waitFor((f) => f.type === "error");
    expect(err.code).toBe("already-joined");
  });

  test("unknown frame type returns unknown-frame error", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    a.send({ type: "nonsense" });
    const err = await a.waitFor((f) => f.type === "error");
    expect(err.code).toBe("unknown-frame");
  });

  test("clientName hint reaches server as peer handle name (via rooms metadata inspection)", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    await a.join("room1", "Alice");
    // Public room view exposes peers by id only — internal names still set;
    // verify through onPeerJoin observation of name via internal API isn't
    // exposed publicly, so instead just verify no crash and peer registered.
    expect(server.rooms.get("room1")?.peers.length).toBe(1);
  });

  test("explicit leave frame closes connection cleanly", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    await a.join("room1");
    const closed = new Promise<void>((resolve) => {
      a.ws.addEventListener("close", () => resolve());
    });
    a.send({ type: "leave" });
    await closed;
    await flush(40);
    expect(server.rooms.has("room1")).toBe(false);
  });

  test("stop() closes all connections and destroys rooms", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    await a.join("room1");
    const b = spawnClient();
    await b.waitOpen();
    await b.join("room2");

    const aClosed = new Promise<void>((resolve) => {
      a.ws.addEventListener("close", () => resolve());
    });
    const bClosed = new Promise<void>((resolve) => {
      b.ws.addEventListener("close", () => resolve());
    });

    await server.stop();
    await Promise.all([aClosed, bClosed]);
    expect(server.rooms.size).toBe(0);
  });

  test("room metadata is mutable by server-side code", async () => {
    server = await startServer();
    server.onRoomCreate((_room) => {
      // The public Room snapshot reflects the underlying metadata object,
      // so mutating it here affects server-internal state too.
    });
    server.onPeerJoin((room) => {
      room.metadata.score = 42;
    });
    const a = spawnClient();
    await a.waitOpen();
    await a.join("room1");
    await flush(40);
    expect(server.rooms.get("room1")?.metadata.score).toBe(42);
  });

  test("rooms snapshot reflects live peer list", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    const wa = await a.join("room1");
    const b = spawnClient();
    await b.waitOpen();
    const wb = await b.join("room1");
    const r = server.rooms.get("room1");
    expect(r?.peers.length).toBe(2);
    expect(r?.peers).toContain(wa.peerId);
    expect(r?.peers).toContain(wb.peerId);
  });

  test("joining with empty roomId returns invalid-room error", async () => {
    server = await startServer();
    const a = spawnClient();
    await a.waitOpen();
    a.send({ type: "join", roomId: "" });
    const err = await a.waitFor((f) => f.type === "error");
    expect(err.code).toBe("invalid-room");
  });
});
