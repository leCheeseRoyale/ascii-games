import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { MockAdapter, MockBus } from "../../net/mock-adapter";

describe("MockAdapter", () => {
  let bus: MockBus;
  let adapters: MockAdapter[] = [];

  beforeEach(() => {
    bus = MockBus.create();
    adapters = [];
  });

  afterEach(() => {
    for (const a of adapters) a.disconnect();
    bus.clear();
  });

  function spawn(
    opts: Omit<ConstructorParameters<typeof MockAdapter>[0], "bus"> = {},
  ): MockAdapter {
    const a = new MockAdapter({ bus, ...opts });
    adapters.push(a);
    return a;
  }

  describe("construction", () => {
    test("auto-generates id when not provided", () => {
      const a = spawn();
      expect(a.id).toMatch(/^[0-9a-f]{8}$/);
    });

    test("uses provided id", () => {
      const a = spawn({ id: "alice" });
      expect(a.id).toBe("alice");
    });

    test("isHost defaults to false", () => {
      const a = spawn();
      expect(a.isHost).toBe(false);
    });

    test("isHost flag reflected on property", () => {
      const a = spawn({ isHost: true });
      expect(a.isHost).toBe(true);
    });

    test("not connected initially", () => {
      const a = spawn();
      expect(a.connected).toBe(false);
      expect(a.peers.length).toBe(0);
    });
  });

  describe("connect / disconnect", () => {
    test("connect sets connected = true", async () => {
      const a = spawn();
      await a.connect();
      expect(a.connected).toBe(true);
    });

    test("connect is idempotent", async () => {
      const a = spawn();
      let connectFires = 0;
      a.onConnect(() => connectFires++);
      await a.connect();
      await a.connect();
      expect(a.connected).toBe(true);
      expect(connectFires).toBe(1);
    });

    test("onConnect fires on connect", async () => {
      const a = spawn();
      let fired = false;
      a.onConnect(() => {
        fired = true;
      });
      await a.connect();
      expect(fired).toBe(true);
    });

    test("disconnect sets connected = false", async () => {
      const a = spawn();
      await a.connect();
      a.disconnect();
      expect(a.connected).toBe(false);
    });

    test("disconnect fires onDisconnect", async () => {
      const a = spawn();
      await a.connect();
      let fired = false;
      a.onDisconnect(() => {
        fired = true;
      });
      a.disconnect();
      expect(fired).toBe(true);
    });

    test("disconnect on never-connected adapter is safe no-op", () => {
      const a = spawn();
      expect(() => a.disconnect()).not.toThrow();
      expect(a.connected).toBe(false);
    });

    test("peers excludes self", async () => {
      const a = spawn({ id: "alice" });
      const b = spawn({ id: "bob" });
      await a.connect();
      await b.connect();
      expect(a.peers).toContain("bob");
      expect(a.peers).not.toContain("alice");
      expect(b.peers).toContain("alice");
      expect(b.peers).not.toContain("bob");
    });
  });

  describe("peer join/leave events", () => {
    test("existing peers see new peer join", async () => {
      const a = spawn({ id: "alice" });
      await a.connect();

      const joined: string[] = [];
      a.onPeerJoin((id) => joined.push(id));

      const b = spawn({ id: "bob" });
      await b.connect();

      expect(joined).toEqual(["bob"]);
    });

    test("new peer sees existing peers via onPeerJoin", async () => {
      const a = spawn({ id: "alice" });
      const b = spawn({ id: "bob" });
      await a.connect();
      await b.connect();

      const c = spawn({ id: "carol" });
      const seen: string[] = [];
      c.onPeerJoin((id) => seen.push(id));
      await c.connect();

      expect(seen.sort()).toEqual(["alice", "bob"]);
    });

    test("onPeerLeave fires when peer disconnects", async () => {
      const a = spawn({ id: "alice" });
      const b = spawn({ id: "bob" });
      await a.connect();
      await b.connect();

      const left: string[] = [];
      a.onPeerLeave((id) => left.push(id));

      b.disconnect();
      expect(left).toEqual(["bob"]);
    });

    test("onPeerJoin unsubscribe works", async () => {
      const a = spawn();
      let count = 0;
      const unsub = a.onPeerJoin(() => count++);
      await a.connect();
      unsub();

      const b = spawn();
      await b.connect();

      expect(count).toBe(0);
    });
  });

  describe("messaging", () => {
    test("unicast delivers to correct peer", async () => {
      const a = spawn({ id: "alice" });
      const b = spawn({ id: "bob" });
      await a.connect();
      await b.connect();

      const received: unknown[] = [];
      b.onMessage((from, msg) => received.push({ from, msg }));

      a.send("bob", { hello: "world" });
      expect(received).toEqual([{ from: "alice", msg: { hello: "world" } }]);
    });

    test("broadcast reaches all peers except sender", async () => {
      const a = spawn({ id: "alice" });
      const b = spawn({ id: "bob" });
      const c = spawn({ id: "carol" });
      await a.connect();
      await b.connect();
      await c.connect();

      const aMsgs: unknown[] = [];
      const bMsgs: unknown[] = [];
      const cMsgs: unknown[] = [];
      a.onMessage((_f, m) => aMsgs.push(m));
      b.onMessage((_f, m) => bMsgs.push(m));
      c.onMessage((_f, m) => cMsgs.push(m));

      a.broadcast({ ping: 1 });
      expect(aMsgs).toEqual([]);
      expect(bMsgs).toEqual([{ ping: 1 }]);
      expect(cMsgs).toEqual([{ ping: 1 }]);
    });

    test("send to unknown peer is a silent no-op", async () => {
      const a = spawn({ id: "alice" });
      await a.connect();
      expect(() => a.send("ghost", { x: 1 })).not.toThrow();
    });

    test("send while disconnected is no-op", () => {
      const a = spawn({ id: "alice" });
      const b = spawn({ id: "bob" });
      // a is not connected
      const received: unknown[] = [];
      b.onMessage((_f, m) => received.push(m));
      a.send("bob", { x: 1 });
      expect(received).toEqual([]);
    });

    test("messages are deep-cloned (serialization simulation)", async () => {
      const a = spawn({ id: "alice" });
      const b = spawn({ id: "bob" });
      await a.connect();
      await b.connect();

      const payload: any = { values: [1, 2, 3] };
      let received: any = null;
      b.onMessage((_f, m) => {
        received = m;
      });

      a.send("bob", payload);
      payload.values.push(4);
      expect(received.values).toEqual([1, 2, 3]); // not mutated
    });

    test("onMessage unsubscribe works", async () => {
      const a = spawn({ id: "alice" });
      const b = spawn({ id: "bob" });
      await a.connect();
      await b.connect();

      let count = 0;
      const unsub = b.onMessage(() => count++);
      a.send("bob", { x: 1 });
      expect(count).toBe(1);
      unsub();
      a.send("bob", { x: 2 });
      expect(count).toBe(1);
    });

    test("handler that throws does not break adapter", async () => {
      const a = spawn({ id: "alice" });
      const b = spawn({ id: "bob" });
      await a.connect();
      await b.connect();

      // Silence expected console.error from NetEmitter
      const origError = console.error;
      console.error = () => {};

      let received2 = false;
      b.onMessage(() => {
        throw new Error("boom");
      });
      b.onMessage(() => {
        received2 = true;
      });

      expect(() => a.send("bob", { x: 1 })).not.toThrow();
      expect(received2).toBe(true);

      console.error = origError;
    });
  });

  describe("latency simulation", () => {
    test("latency > 0 makes delivery async", async () => {
      const a = spawn({ id: "alice", latency: 20 });
      const b = spawn({ id: "bob" });
      await a.connect();
      await b.connect();

      let received = false;
      b.onMessage(() => {
        received = true;
      });

      a.send("bob", { x: 1 });
      expect(received).toBe(false); // not synchronous

      await new Promise((r) => setTimeout(r, 50));
      expect(received).toBe(true);
    });

    test("latency = 0 is synchronous (default)", async () => {
      const a = spawn({ id: "alice" });
      const b = spawn({ id: "bob" });
      await a.connect();
      await b.connect();

      let received = false;
      b.onMessage(() => {
        received = true;
      });

      a.send("bob", { x: 1 });
      expect(received).toBe(true);
    });
  });

  describe("drop rate", () => {
    test("dropRate = 1 drops all messages", async () => {
      const a = spawn({ id: "alice", dropRate: 1 });
      const b = spawn({ id: "bob" });
      await a.connect();
      await b.connect();

      let count = 0;
      b.onMessage(() => count++);

      for (let i = 0; i < 100; i++) a.send("bob", { i });
      expect(count).toBe(0);
    });

    test("dropRate = 0 delivers all messages", async () => {
      const a = spawn({ id: "alice", dropRate: 0 });
      const b = spawn({ id: "bob" });
      await a.connect();
      await b.connect();

      let count = 0;
      b.onMessage(() => count++);

      for (let i = 0; i < 100; i++) a.send("bob", { i });
      expect(count).toBe(100);
    });
  });

  describe("bus operations", () => {
    test("bus.size reflects registered adapters", async () => {
      const a = spawn();
      const b = spawn();
      expect(bus.size()).toBe(0);
      await a.connect();
      expect(bus.size()).toBe(1);
      await b.connect();
      expect(bus.size()).toBe(2);
      a.disconnect();
      expect(bus.size()).toBe(1);
    });

    test("bus.clear() disconnects all adapters", async () => {
      const a = spawn();
      const b = spawn();
      await a.connect();
      await b.connect();

      let aDisc = false;
      let bDisc = false;
      a.onDisconnect(() => {
        aDisc = true;
      });
      b.onDisconnect(() => {
        bDisc = true;
      });

      bus.clear();

      expect(aDisc).toBe(true);
      expect(bDisc).toBe(true);
      expect(bus.size()).toBe(0);
    });

    test("send does not echo back to sender via broadcast", async () => {
      const a = spawn({ id: "alice" });
      const b = spawn({ id: "bob" });
      await a.connect();
      await b.connect();

      let aCount = 0;
      a.onMessage(() => aCount++);
      a.broadcast({ x: 1 });
      expect(aCount).toBe(0);
    });

    test("unicast to self is no-op", async () => {
      const a = spawn({ id: "alice" });
      await a.connect();
      let count = 0;
      a.onMessage(() => count++);
      a.send("alice", { x: 1 });
      expect(count).toBe(0);
    });
  });
});
