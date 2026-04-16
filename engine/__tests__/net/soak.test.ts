/**
 * Multiplayer determinism soak — TODO #24.
 *
 * Two `MockAdapter` peers run the same deterministic mini-game (200-card deck
 * shuffled with xorshift32, one draw per turn) for 100 turns. After every
 * turn both peers call `TurnSync.submitStateHash(hash)`; `onDesync` would
 * fire if their post-turn states disagreed. We run 10 seeds (1..10) plus one
 * seed (999) where peer B's state is deliberately corrupted at turn 50 —
 * that scenario asserts `onDesync` fires, verifying the detection mechanism.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createSeededRandom } from "../../behaviors/loot";
import { MockAdapter, MockBus } from "../../net/mock-adapter";
import { type DesyncEvent, type TurnCompleteEvent, TurnSync } from "../../net/turn-sync";

interface DrawMove {
  readonly kind: "draw";
}

interface Peer {
  adapter: MockAdapter;
  sync: TurnSync<DrawMove>;
  drawnCards: number[];
  deck: number[];
  desyncs: DesyncEvent[];
}

// FNV-1a 32-bit over JSON.stringify — deterministic, dependency-free.
function hash32(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// Fisher-Yates shuffle driven by the seeded RNG. Pure function of `seed` —
// both peers derive identical decks.
function buildDeck(seed: number): number[] {
  const deck = Array.from({ length: 200 }, (_, i) => i);
  const rng = createSeededRandom(seed);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = deck[i] as number;
    const b = deck[j] as number;
    deck[i] = b;
    deck[j] = a;
  }
  return deck;
}

describe("multiplayer determinism soak (TODO #24)", () => {
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

  async function makePeer(id: string, seed: number): Promise<Peer> {
    const adapter = new MockAdapter({ bus, id });
    await adapter.connect();
    cleanup.push(() => adapter.disconnect());
    const sync = new TurnSync<DrawMove>({ adapter, playerIds: ["alice", "bob"] });
    cleanup.push(() => sync.stop());
    return { adapter, sync, drawnCards: [], deck: buildDeck(seed), desyncs: [] };
  }

  // Shared harness — wires up the onTurnComplete handler that draws the top
  // card and submits a state hash. Returns both peers once connected.
  async function runScenario(
    seed: number,
    turns: number,
    corruptBobAtTurn: number | null = null,
  ): Promise<{ alice: Peer; bob: Peer }> {
    const alice = await makePeer("alice", seed);
    const bob = await makePeer("bob", seed);

    for (const peer of [alice, bob]) {
      peer.sync.onDesync((e) => peer.desyncs.push(e));
      peer.sync.onTurnComplete((e: TurnCompleteEvent<DrawMove>) => {
        const top = peer.deck[e.turn];
        if (top !== undefined) peer.drawnCards.push(top);
        // Deliberate corruption on peer B only, exactly once, to force a
        // hash mismatch for this turn's state.
        if (corruptBobAtTurn !== null && peer === bob && e.turn === corruptBobAtTurn) {
          peer.drawnCards[peer.drawnCards.length - 1] = -1;
        }
        const payload = JSON.stringify({ turn: e.turn, drawn: peer.drawnCards });
        peer.sync.submitStateHash(hash32(payload));
      });
    }

    for (let t = 0; t < turns; t++) {
      alice.sync.submitMove({ kind: "draw" });
      bob.sync.submitMove({ kind: "draw" });
    }

    return { alice, bob };
  }

  // 10 clean scenarios with seeds 1..10 — no corruption, expect perfect sync.
  for (let seed = 1; seed <= 10; seed++) {
    test(`seed ${seed}: 100 turns stay in lockstep`, async () => {
      const { alice, bob } = await runScenario(seed, 100);

      // drawnCards identical between peers.
      expect(bob.drawnCards).toEqual(alice.drawnCards);
      expect(alice.drawnCards.length).toBe(100);

      // onDesync never fired on either peer.
      expect(alice.desyncs).toEqual([]);
      expect(bob.desyncs).toEqual([]);

      // 100 turns really did advance.
      expect(alice.sync.currentTurn).toBe(100);
      expect(bob.sync.currentTurn).toBe(100);
    });
  }

  // Detection-mechanism check: deliberately corrupt B at turn 50. Both peers
  // should see `onDesync` fire for turn 50. Without this, a silently broken
  // desync detector would let the "clean" cases pass vacuously.
  test("seed 999: deliberate corruption at turn 50 is detected by onDesync", async () => {
    const { alice, bob } = await runScenario(999, 100, 50);

    // Desync observed by both peers (the emitter fires on everyone once all
    // hashes are in and any pair differs).
    expect(alice.desyncs.length).toBeGreaterThanOrEqual(1);
    expect(bob.desyncs.length).toBeGreaterThanOrEqual(1);

    // The first desync is for turn 50 and reports per-player hashes that do
    // in fact differ between alice and bob.
    const firstAlice = alice.desyncs[0] as DesyncEvent;
    expect(firstAlice.turn).toBe(50);
    expect(firstAlice.hashes.alice).not.toBe(firstAlice.hashes.bob);

    // And the arrays really did diverge at turn 50.
    expect(bob.drawnCards[50]).toBe(-1);
    expect(alice.drawnCards[50]).not.toBe(-1);
  });
});
