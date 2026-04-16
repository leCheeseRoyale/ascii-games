import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { MockAdapter, MockBus } from "../../net/mock-adapter";
import { type TurnCompleteEvent, TurnSync } from "../../net/turn-sync";

describe("TurnSync", () => {
  let bus: MockBus;
  const cleanup: Array<() => void> = [];

  beforeEach(() => {
    bus = MockBus.create();
  });

  afterEach(() => {
    for (const fn of cleanup) fn();
    cleanup.length = 0;
    bus.clear();
  });

  async function spawnPeer(id: string): Promise<MockAdapter> {
    const a = new MockAdapter({ bus, id });
    await a.connect();
    cleanup.push(() => a.disconnect());
    return a;
  }

  function makeSync<T>(adapter: MockAdapter, playerIds: string[], turnTimeout = 0): TurnSync<T> {
    const s = new TurnSync<T>({ adapter, playerIds, turnTimeout });
    cleanup.push(() => s.stop());
    return s;
  }

  describe("construction", () => {
    test("throws if adapter.id not in playerIds", async () => {
      const a = await spawnPeer("alice");
      expect(() => new TurnSync({ adapter: a, playerIds: ["bob", "carol"] })).toThrow();
    });

    test("accepts when adapter.id is in playerIds", async () => {
      const a = await spawnPeer("alice");
      expect(() => new TurnSync({ adapter: a, playerIds: ["alice", "bob"] })).not.toThrow();
    });

    test("initial turn defaults to 0", async () => {
      const a = await spawnPeer("alice");
      const s = makeSync(a, ["alice", "bob"]);
      expect(s.currentTurn).toBe(0);
    });

    test("initialTurn option sets starting turn", async () => {
      const a = await spawnPeer("alice");
      const s = new TurnSync({ adapter: a, playerIds: ["alice"], initialTurn: 5 });
      cleanup.push(() => s.stop());
      expect(s.currentTurn).toBe(5);
    });

    test("autoStart false defers listening", async () => {
      const a = await spawnPeer("alice");
      const b = await spawnPeer("bob");
      const sA = new TurnSync<string>({
        adapter: a,
        playerIds: ["alice", "bob"],
        autoStart: false,
      });
      cleanup.push(() => sA.stop());

      // B submits — A should not receive since not started
      const sB = makeSync<string>(b, ["alice", "bob"]);
      sB.submitMove("move-b");
      expect(sA.hasSubmitted("bob")).toBe(false);

      // Now start and resubmit — it'll be stale (wrong turn) but that's fine
      sA.start();
    });
  });

  describe("basic 2-player turn", () => {
    test("both submit, onTurnComplete fires with moves, turn advances", async () => {
      const a = await spawnPeer("alice");
      const b = await spawnPeer("bob");
      const sA = makeSync<string>(a, ["alice", "bob"]);
      const sB = makeSync<string>(b, ["alice", "bob"]);

      const events: TurnCompleteEvent<string>[] = [];
      sA.onTurnComplete((e) => events.push(e));

      sA.submitMove("alice-move");
      expect(sA.isComplete).toBe(false);
      sB.submitMove("bob-move");

      expect(events).toHaveLength(1);
      expect(events[0].turn).toBe(0);
      expect(events[0].moves).toEqual({ alice: "alice-move", bob: "bob-move" });
      expect(sA.currentTurn).toBe(1);
      expect(sA.isComplete).toBe(false);
    });

    test("3 players: 2 submit, onTurnComplete does NOT fire", async () => {
      const a = await spawnPeer("alice");
      const b = await spawnPeer("bob");
      await spawnPeer("carol");
      const sA = makeSync<string>(a, ["alice", "bob", "carol"]);
      const sB = makeSync<string>(b, ["alice", "bob", "carol"]);

      let fired = 0;
      sA.onTurnComplete(() => fired++);
      sA.submitMove("a");
      sB.submitMove("b");

      expect(fired).toBe(0);
      expect(sA.waitingFor).toEqual(["carol"]);
    });

    test("3 players: all submit in varied order, fires once", async () => {
      const a = await spawnPeer("alice");
      const b = await spawnPeer("bob");
      const c = await spawnPeer("carol");
      const sA = makeSync<string>(a, ["alice", "bob", "carol"]);
      const sB = makeSync<string>(b, ["alice", "bob", "carol"]);
      const sC = makeSync<string>(c, ["alice", "bob", "carol"]);

      let fired = 0;
      sA.onTurnComplete(() => fired++);

      sB.submitMove("b");
      sC.submitMove("c");
      sA.submitMove("a");

      expect(fired).toBe(1);
    });
  });

  describe("state queries", () => {
    test("waitingFor shows unsubmitted players", async () => {
      const a = await spawnPeer("alice");
      const b = await spawnPeer("bob");
      const sA = makeSync<string>(a, ["alice", "bob", "carol"]);
      makeSync<string>(b, ["alice", "bob", "carol"]);

      expect(sA.waitingFor).toEqual(["alice", "bob", "carol"]);
      sA.submitMove("a");
      expect(sA.waitingFor).toEqual(["bob", "carol"]);
    });

    test("hasSubmitted returns correct value", async () => {
      const a = await spawnPeer("alice");
      const sA = makeSync<string>(a, ["alice", "bob"]);

      expect(sA.hasSubmitted("alice")).toBe(false);
      sA.submitMove("a");
      expect(sA.hasSubmitted("alice")).toBe(true);
      expect(sA.hasSubmitted("bob")).toBe(false);
    });

    test("getMove returns submitted move", async () => {
      const a = await spawnPeer("alice");
      const sA = makeSync<string>(a, ["alice", "bob"]);
      sA.submitMove("my-move");
      expect(sA.getMove("alice")).toBe("my-move");
      expect(sA.getMove("bob")).toBeUndefined();
    });
  });

  describe("ignores bad input", () => {
    test("duplicate submission ignored", async () => {
      const a = await spawnPeer("alice");
      await spawnPeer("bob");
      const sA = makeSync<string>(a, ["alice", "bob"]);

      sA.submitMove("first");
      sA.submitMove("second");
      expect(sA.getMove("alice")).toBe("first");
    });

    test("move for wrong turn ignored", async () => {
      const a = await spawnPeer("alice");
      const b = await spawnPeer("bob");
      const sA = makeSync<string>(a, ["alice", "bob"]);
      const sB = makeSync<string>(b, ["alice", "bob"]);

      // Advance sA to turn 1 without B
      sA.submitMove("a");
      sA.advance(); // turn 1, B's move is null
      expect(sA.currentTurn).toBe(1);

      // B submits for turn 0 (its current) — sA should ignore since it's on turn 1
      sB.submitMove("b-old"); // this broadcasts with turn 0
      expect(sA.hasSubmitted("bob")).toBe(false);
    });

    test("move for unknown player ignored", async () => {
      const a = await spawnPeer("alice");
      const b = await spawnPeer("bob");
      const sA = makeSync<string>(a, ["alice", "bob"]); // carol not known
      // b is not even in TurnSync playerIds if we construct sA with only alice/bob
      // Test: send a raw-looking turnsync frame from some peer claiming to be carol
      await spawnPeer("carol");

      a.onMessage(() => {});
      b.broadcast({
        __turnsync: true,
        kind: "move",
        turn: 0,
        playerId: "carol",
        move: "c",
      });

      expect(sA.hasSubmitted("carol")).toBe(false);
    });

    test("non-TurnSync messages ignored", async () => {
      const a = await spawnPeer("alice");
      const b = await spawnPeer("bob");
      const sA = makeSync<string>(a, ["alice", "bob"]);

      // B sends a raw game message (no __turnsync tag)
      b.broadcast({ type: "chat", text: "hi" });
      expect(sA.hasSubmitted("bob")).toBe(false);
    });
  });

  describe("events", () => {
    test("onMoveReceived fires on each incoming move", async () => {
      const a = await spawnPeer("alice");
      const b = await spawnPeer("bob");
      const sA = makeSync<string>(a, ["alice", "bob"]);
      makeSync<string>(b, ["alice", "bob"]);

      const received: Array<{ pid: string; move: string; turn: number }> = [];
      sA.onMoveReceived((pid, move, turn) => received.push({ pid, move, turn }));

      sA.submitMove("a-move"); // own move
      // Own submissions don't fire onMoveReceived in tests — actually they DO
      // because acceptMove is called for both self and remote. Check behavior.

      // The implementation DOES call acceptMove for self — so both fire.
      expect(received).toHaveLength(1);
      expect(received[0].pid).toBe("alice");
    });

    test("onTurnComplete unsubscribe works", async () => {
      const a = await spawnPeer("alice");
      const sA = makeSync<string>(a, ["alice"]);

      let count = 0;
      const unsub = sA.onTurnComplete(() => count++);
      sA.submitMove("a");
      expect(count).toBe(1);

      unsub();
      sA.submitMove("a2"); // new turn
      expect(count).toBe(1);
    });

    test("onMoveReceived unsubscribe works", async () => {
      const a = await spawnPeer("alice");
      const sA = makeSync<string>(a, ["alice", "bob"]);

      let count = 0;
      const unsub = sA.onMoveReceived(() => count++);
      sA.submitMove("a"); // fires
      expect(count).toBe(1);
      unsub();
    });
  });

  describe("multiple turns back-to-back", () => {
    test("turn increments each completion", async () => {
      const a = await spawnPeer("alice");
      const sA = makeSync<string>(a, ["alice"]);

      const completed: number[] = [];
      sA.onTurnComplete((e) => completed.push(e.turn));

      sA.submitMove("m1");
      sA.submitMove("m2");
      sA.submitMove("m3");

      expect(completed).toEqual([0, 1, 2]);
      expect(sA.currentTurn).toBe(3);
    });

    test("moves cleared between turns", async () => {
      const a = await spawnPeer("alice");
      const sA = makeSync<string>(a, ["alice"]);

      sA.submitMove("first");
      expect(sA.getMove("alice")).toBeUndefined(); // cleared after completion
    });
  });

  describe("control methods", () => {
    test("reset clears state", async () => {
      const a = await spawnPeer("alice");
      const sA = makeSync<string>(a, ["alice", "bob"]);
      sA.submitMove("a");
      expect(sA.hasSubmitted("alice")).toBe(true);
      sA.reset();
      expect(sA.hasSubmitted("alice")).toBe(false);
      expect(sA.currentTurn).toBe(0);
    });

    test("advance force-completes with missing=null", async () => {
      const a = await spawnPeer("alice");
      const b = await spawnPeer("bob");
      const sA = makeSync<string>(a, ["alice", "bob"]);
      makeSync<string>(b, ["alice", "bob"]);

      let event: TurnCompleteEvent<string> | null = null;
      sA.onTurnComplete((e) => {
        event = e;
      });

      sA.submitMove("a");
      sA.advance();
      expect(event).not.toBeNull();
      expect(event!.moves).toEqual({ alice: "a", bob: null });
    });

    test("stop then submissions ignored", async () => {
      const a = await spawnPeer("alice");
      const sA = makeSync<string>(a, ["alice"]);
      sA.stop();

      let fired = 0;
      sA.onTurnComplete(() => fired++);
      sA.submitMove("a");
      expect(fired).toBe(0);
    });

    test("start() resumes after stop", async () => {
      const a = await spawnPeer("alice");
      const sA = makeSync<string>(a, ["alice"]);
      sA.stop();
      sA.start();

      let fired = 0;
      sA.onTurnComplete(() => fired++);
      sA.submitMove("a");
      expect(fired).toBe(1);
    });
  });

  describe("rebase", () => {
    test("rebase jumps turn number", async () => {
      const a = await spawnPeer("alice");
      const sA = makeSync<string>(a, ["alice", "bob"]);

      sA.rebase(5);
      expect(sA.currentTurn).toBe(5);
      expect(sA.isComplete).toBe(false);
    });

    test("rebase populates moves", async () => {
      const a = await spawnPeer("alice");
      const sA = makeSync<string>(a, ["alice", "bob"]);

      sA.rebase(3, { alice: "stored-a" });
      expect(sA.currentTurn).toBe(3);
      expect(sA.getMove("alice")).toBe("stored-a");
      expect(sA.hasSubmitted("bob")).toBe(false);
    });

    test("rebase with complete moves fires onTurnComplete", async () => {
      const a = await spawnPeer("alice");
      const sA = makeSync<string>(a, ["alice", "bob"]);

      let fired = false;
      sA.onTurnComplete(() => {
        fired = true;
      });

      sA.rebase(2, { alice: "a", bob: "b" });
      expect(fired).toBe(true);
      expect(sA.currentTurn).toBe(3); // auto-advanced
    });
  });

  describe("timeouts", () => {
    test("turnTimeout fills missing with null", async () => {
      const a = await spawnPeer("alice");
      await spawnPeer("bob"); // bob exists but never constructs a TurnSync
      const sA = makeSync<string>(a, ["alice", "bob"], 50);

      const events: TurnCompleteEvent<string>[] = [];
      sA.onTurnComplete((e) => events.push(e));

      sA.submitMove("a");
      await new Promise((r) => setTimeout(r, 80));

      expect(events).toHaveLength(1);
      expect(events[0].moves).toEqual({ alice: "a", bob: null });
    });

    test("no timeout when turnTimeout = 0", async () => {
      const a = await spawnPeer("alice");
      await spawnPeer("bob");
      const sA = makeSync<string>(a, ["alice", "bob"], 0);

      let fired = 0;
      sA.onTurnComplete(() => fired++);
      sA.submitMove("a");
      await new Promise((r) => setTimeout(r, 50));

      expect(fired).toBe(0);
    });
  });

  describe("4-player scenario", () => {
    test("all submit, single onTurnComplete, all moves present", async () => {
      const a = await spawnPeer("alice");
      const b = await spawnPeer("bob");
      const c = await spawnPeer("carol");
      const d = await spawnPeer("dave");
      const ids = ["alice", "bob", "carol", "dave"];
      const sA = makeSync<string>(a, ids);
      const sB = makeSync<string>(b, ids);
      const sC = makeSync<string>(c, ids);
      const sD = makeSync<string>(d, ids);

      let event: TurnCompleteEvent<string> | null = null;
      sA.onTurnComplete((e) => {
        event = e;
      });

      sA.submitMove("a");
      sB.submitMove("b");
      sC.submitMove("c");
      sD.submitMove("d");

      expect(event).not.toBeNull();
      expect(event!.moves).toEqual({ alice: "a", bob: "b", carol: "c", dave: "d" });
    });
  });

  describe("asymmetric mode", () => {
    test("symmetric default unchanged — still requires all players", async () => {
      const a = await spawnPeer("alice");
      const b = await spawnPeer("bob");
      const sA = makeSync<string>(a, ["alice", "bob"]);
      makeSync<string>(b, ["alice", "bob"]);

      let fired = 0;
      sA.onTurnComplete(() => fired++);

      sA.submitMove("a");
      expect(fired).toBe(0);
      expect(sA.isComplete).toBe(false);
      expect(sA.activePlayerId).toBeNull();
    });

    test("construction requires activePlayerId when asymmetric", async () => {
      const a = await spawnPeer("alice");
      expect(
        () => new TurnSync({ adapter: a, playerIds: ["alice", "bob"], asymmetric: true }),
      ).toThrow();
    });

    test("construction rejects activePlayerId not in playerIds", async () => {
      const a = await spawnPeer("alice");
      expect(
        () =>
          new TurnSync({
            adapter: a,
            playerIds: ["alice", "bob"],
            asymmetric: true,
            activePlayerId: "carol",
          }),
      ).toThrow();
    });

    test("completes on active player's move alone", async () => {
      const a = await spawnPeer("alice");
      const b = await spawnPeer("bob");
      const sA = new TurnSync<string>({
        adapter: a,
        playerIds: ["alice", "bob"],
        asymmetric: true,
        activePlayerId: "alice",
      });
      cleanup.push(() => sA.stop());
      const sB = new TurnSync<string>({
        adapter: b,
        playerIds: ["alice", "bob"],
        asymmetric: true,
        activePlayerId: "alice",
      });
      cleanup.push(() => sB.stop());

      const events: TurnCompleteEvent<string>[] = [];
      sA.onTurnComplete((e) => events.push(e));

      sA.submitMove("a-move");
      expect(events).toHaveLength(1);
      expect(events[0].turn).toBe(0);
      expect(events[0].moves).toEqual({ alice: "a-move", bob: null });
      expect(sA.currentTurn).toBe(1);
    });

    test("off-turn move accepted but does not complete", async () => {
      const a = await spawnPeer("alice");
      const b = await spawnPeer("bob");
      const sA = new TurnSync<string>({
        adapter: a,
        playerIds: ["alice", "bob"],
        asymmetric: true,
        activePlayerId: "alice",
      });
      cleanup.push(() => sA.stop());
      const sB = new TurnSync<string>({
        adapter: b,
        playerIds: ["alice", "bob"],
        asymmetric: true,
        activePlayerId: "alice",
      });
      cleanup.push(() => sB.stop());

      let fired = 0;
      sA.onTurnComplete(() => fired++);

      // Bob (off-turn) submits first — should not complete
      expect(() => sB.submitMove("b-off")).not.toThrow();
      expect(fired).toBe(0);
      expect(sA.isComplete).toBe(false);
      expect(sA.hasSubmitted("bob")).toBe(true);

      // Alice (active) submits — now it completes
      sA.submitMove("a-move");
      expect(fired).toBe(1);
    });

    test("activePlayerId changes between turns, new active completes next turn", async () => {
      const a = await spawnPeer("alice");
      const b = await spawnPeer("bob");
      const sA = new TurnSync<string>({
        adapter: a,
        playerIds: ["alice", "bob"],
        asymmetric: true,
        activePlayerId: "alice",
      });
      cleanup.push(() => sA.stop());
      const sB = new TurnSync<string>({
        adapter: b,
        playerIds: ["alice", "bob"],
        asymmetric: true,
        activePlayerId: "alice",
      });
      cleanup.push(() => sB.stop());

      const events: TurnCompleteEvent<string>[] = [];
      sA.onTurnComplete((e) => {
        events.push(e);
        sA.setActivePlayer("bob");
      });
      sB.onTurnComplete(() => {
        sB.setActivePlayer("bob");
      });

      // Turn 0 — alice active
      sA.submitMove("a-0");
      expect(events).toHaveLength(1);
      expect(sA.activePlayerId).toBe("bob");

      // Turn 1 — bob is now active. Alice's submit should NOT complete.
      sA.submitMove("a-1");
      expect(events).toHaveLength(1); // still only first turn completed

      // Bob submits — completes turn 1
      sB.submitMove("b-1");
      expect(events).toHaveLength(2);
      expect(events[1].turn).toBe(1);
      expect(events[1].moves.bob).toBe("b-1");
    });

    test("setActivePlayer throws in symmetric mode", async () => {
      const a = await spawnPeer("alice");
      const sA = makeSync<string>(a, ["alice", "bob"]);
      expect(() => sA.setActivePlayer("bob")).toThrow();
    });

    test("setActivePlayer rejects unknown id", async () => {
      const a = await spawnPeer("alice");
      const sA = new TurnSync<string>({
        adapter: a,
        playerIds: ["alice", "bob"],
        asymmetric: true,
        activePlayerId: "alice",
      });
      cleanup.push(() => sA.stop());
      expect(() => sA.setActivePlayer("carol")).toThrow();
    });

    test("waitingFor returns only active player in asymmetric", async () => {
      const a = await spawnPeer("alice");
      const sA = new TurnSync<string>({
        adapter: a,
        playerIds: ["alice", "bob", "carol"],
        asymmetric: true,
        activePlayerId: "bob",
      });
      cleanup.push(() => sA.stop());
      expect(sA.waitingFor).toEqual(["bob"]);
    });
  });

  describe("desync checksum", () => {
    test("does not fire onDesync when all hashes agree", async () => {
      const a = await spawnPeer("alice");
      const b = await spawnPeer("bob");
      const sA = makeSync<string>(a, ["alice", "bob"]);
      const sB = makeSync<string>(b, ["alice", "bob"]);

      let desyncs = 0;
      sA.onDesync(() => desyncs++);

      sA.submitMove("a");
      sB.submitMove("b");
      sA.submitStateHash("H1");
      sB.submitStateHash("H1");

      expect(desyncs).toBe(0);
    });

    test("fires onDesync with per-player hashes when they disagree", async () => {
      const a = await spawnPeer("alice");
      const b = await spawnPeer("bob");
      const sA = makeSync<string>(a, ["alice", "bob"]);
      const sB = makeSync<string>(b, ["alice", "bob"]);

      const events: Array<{ turn: number; hashes: Record<string, string | number> }> = [];
      sA.onDesync((e) => events.push(e));

      sA.submitMove("a");
      sB.submitMove("b");
      sA.submitStateHash("HASH-ALICE");
      sB.submitStateHash("HASH-BOB");

      expect(events.length).toBe(1);
      expect(events[0].turn).toBe(0);
      expect(events[0].hashes).toEqual({ alice: "HASH-ALICE", bob: "HASH-BOB" });
    });

    test("discards stale hashes when new turn starts", async () => {
      const a = await spawnPeer("alice");
      const b = await spawnPeer("bob");
      const sA = makeSync<string>(a, ["alice", "bob"]);
      const sB = makeSync<string>(b, ["alice", "bob"]);

      let desyncs = 0;
      sA.onDesync(() => desyncs++);

      // Turn 0 — only alice submits a hash (bob never does)
      sA.submitMove("a");
      sB.submitMove("b");
      sA.submitStateHash("H0");

      // Turn 1 — both submit hashes agreeing
      sA.submitMove("a2");
      sB.submitMove("b2");
      sA.submitStateHash("H1");
      sB.submitStateHash("H1");

      expect(desyncs).toBe(0);
    });
  });
});
