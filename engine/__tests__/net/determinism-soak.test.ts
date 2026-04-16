import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { World } from "miniplex";
import { createSeededRandom } from "../../behaviors/loot";
import { MockAdapter, MockBus } from "../../net/mock-adapter";
import { type TurnCompleteEvent, TurnSync } from "../../net/turn-sync";

// Minimal entity shape for the soak harness. Not related to the @shared Entity
// type — we want full control over components the test mutates so drift is
// obvious if it occurs.
interface SoakEntity {
  kind: "counter" | "marker";
  counter?: number;
  tag?: string;
  flags?: { alive: boolean; visits: number };
  payload?: { seed: number; values: number[] };
}

interface PeerHarness {
  adapter: MockAdapter;
  sync: TurnSync<number>;
  world: World<SoakEntity>;
  events: string[];
  hashes: string[];
}

// Canonical per-peer world dump — sort by miniplex's insertion-stable id, then
// JSON-stringify so a field-order difference would surface as a hash mismatch.
function dumpWorld(world: World<SoakEntity>): string {
  const entries: Array<{ id: number; e: SoakEntity }> = [];
  for (const e of world.entities) {
    const id = world.id(e);
    if (id === undefined) continue;
    entries.push({ id, e });
  }
  entries.sort((a, b) => a.id - b.id);
  // Stringify each entity with keys in a fixed order rather than relying on
  // object-key insertion — JS preserves insertion order for string keys, but
  // we pin the layout explicitly so an accidental field reordering on one
  // peer would still desync instead of producing equal hashes by accident.
  return JSON.stringify(
    entries.map(({ id, e }) => [
      id,
      e.kind,
      e.counter ?? null,
      e.tag ?? null,
      e.flags ? [e.flags.alive, e.flags.visits] : null,
      e.payload ? [e.payload.seed, e.payload.values] : null,
    ]),
  );
}

// Tiny string hash (FNV-1a 32-bit) — good enough to catch any divergence
// between two short JSON payloads, and avoids pulling in a dependency.
function hash32(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// Deterministic per-turn mutation. Both peers call this with the same seed
// for a given turn, so their worlds must end up identical after application.
function applyTurn(
  world: World<SoakEntity>,
  turn: number,
  turnSeed: number,
  localEvents: string[],
): void {
  const rng = createSeededRandom(turnSeed);
  const n = 3 + Math.floor(rng() * 4); // 3..6 spawns per turn

  // Spawn phase
  for (let i = 0; i < n; i++) {
    const kind: SoakEntity["kind"] = rng() < 0.7 ? "counter" : "marker";
    const entity: SoakEntity = {
      kind,
      counter: Math.floor(rng() * 100),
      tag: `t${turn}-${i}`,
      flags: { alive: true, visits: 0 },
      payload: {
        seed: Math.floor(rng() * 1_000_000),
        values: [Math.floor(rng() * 10), Math.floor(rng() * 10), Math.floor(rng() * 10)],
      },
    };
    world.add(entity);
  }

  // Mutate phase — touch a handful of existing entities. Snapshot into an
  // array first so we don't iterate a mutating collection.
  const all = [...world.entities];
  const mutations = Math.floor(rng() * Math.min(5, all.length));
  for (let i = 0; i < mutations; i++) {
    const idx = Math.floor(rng() * all.length);
    const target = all[idx];
    if (!target) continue;
    if (target.counter !== undefined) target.counter += Math.floor(rng() * 10);
    if (target.flags) target.flags.visits += 1;
    if (target.payload) target.payload.values.push(Math.floor(rng() * 100));
  }

  // Destroy phase — remove a few random entities (but never everything).
  const destroys = Math.floor(rng() * Math.min(3, Math.max(0, all.length - 1)));
  for (let i = 0; i < destroys; i++) {
    const idx = Math.floor(rng() * all.length);
    const target = all[idx];
    if (!target) continue;
    // Guard against double-remove if the rng picks the same index twice.
    if (world.id(target) !== undefined) world.remove(target);
  }

  // Event phase — purely local side effect, still driven by the same rng so
  // both peers record the same history.
  const evCount = Math.floor(rng() * 3);
  for (let i = 0; i < evCount; i++) {
    localEvents.push(`turn:${turn}:ev:${Math.floor(rng() * 10000)}`);
  }
}

describe("multiplayer determinism soak", () => {
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

  async function makePeer(id: string): Promise<PeerHarness> {
    const adapter = new MockAdapter({ bus, id });
    await adapter.connect();
    cleanup.push(() => adapter.disconnect());
    const sync = new TurnSync<number>({ adapter, playerIds: ["alice", "bob"] });
    cleanup.push(() => sync.stop());
    return {
      adapter,
      sync,
      world: new World<SoakEntity>(),
      events: [],
      hashes: [],
    };
  }

  async function runMatch(matchSeed: number, turnsPerMatch: number): Promise<void> {
    const alice = await makePeer("alice");
    const bob = await makePeer("bob");

    const onTurn =
      (peer: PeerHarness) =>
      (e: TurnCompleteEvent<number>): void => {
        // Mix match seed, turn number, and both submitted moves so the test
        // exercises per-turn seeded work driven by shared inputs.
        const a = e.moves.alice ?? 0;
        const b = e.moves.bob ?? 0;
        const turnSeed = (matchSeed ^ ((e.turn * 73856093) >>> 0) ^ a ^ (b << 7)) >>> 0;
        applyTurn(peer.world, e.turn, turnSeed, peer.events);
        peer.hashes.push(hash32(dumpWorld(peer.world)));
      };

    alice.sync.onTurnComplete(onTurn(alice));
    bob.sync.onTurnComplete(onTurn(bob));

    for (let turn = 0; turn < turnsPerMatch; turn++) {
      // Moves themselves are also derived from the match seed so both peers
      // submit identical values regardless of how the harness dispatches.
      const moveRng = createSeededRandom((matchSeed ^ (turn * 2654435761)) >>> 0);
      const aliceMove = Math.floor(moveRng() * 1_000_000);
      const bobMove = Math.floor(moveRng() * 1_000_000);
      alice.sync.submitMove(aliceMove);
      bob.sync.submitMove(bobMove);
    }

    // Sanity — both peers advanced the same number of turns.
    expect(alice.hashes.length).toBe(turnsPerMatch);
    expect(bob.hashes.length).toBe(turnsPerMatch);

    // The actual desync check — every per-turn hash must match.
    for (let i = 0; i < turnsPerMatch; i++) {
      expect(bob.hashes[i]).toBe(alice.hashes[i]);
    }
    // And the event streams must match — any ordering divergence in callbacks
    // would show up here even if the world dumps happened to collide.
    expect(bob.events).toEqual(alice.events);
  }

  test("100 turns across 3 matches — no desyncs", async () => {
    const matches = [0xc0ffee, 0xbadf00d, 0x1337beef];
    for (const seed of matches) {
      await runMatch(seed, 100);
    }
  });
});
