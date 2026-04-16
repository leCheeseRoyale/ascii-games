/**
 * Tests for createMultiplayerGame — the one-line multiplayer wrapper.
 *
 * Uses a stub Engine (no canvas) that exposes enough surface for
 * GameRuntime + SceneManager + TurnManager + SystemRunner. The wrapper
 * wires MockAdapters onto a single bus for a fully-in-process
 * two-peer session.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  createMultiplayerGame,
  type MultiplayerGameHandle,
} from "../../core/create-multiplayer-game";
import {
  buildGameScene,
  defineGame,
  type GameDefinition,
  GameRuntime,
} from "../../core/define-game";
import type { Engine } from "../../core/engine";
import { SceneManager } from "../../core/scene";
import { TurnManager } from "../../core/turn-manager";
import { SystemRunner } from "../../ecs/systems";
import { createWorld } from "../../ecs/world";

function stubEngine(): Engine {
  const world = createWorld();
  const systems = new SystemRunner();
  const scenes = new SceneManager();
  const turns = new TurnManager();
  // Minimal engine-shaped object — the runtime and wrapper only call into
  // `world`, `systems`, `scenes`, `turns`, `registerScene`, `addSystem`,
  // `removeSystem`, `spawn`, `destroy`, plus a custom `runGame` that the
  // wrapper uses to install the scene + runtime.
  let gameRuntime: GameRuntime<unknown> | null = null;
  const engine: Record<string, unknown> = {
    world,
    systems,
    scenes,
    turns,
    registerScene: (s: unknown) => scenes.register(s as Parameters<typeof scenes.register>[0]),
    addSystem: (sys: unknown) =>
      systems.add(sys as Parameters<typeof systems.add>[0], engine as unknown as Engine),
    removeSystem: (name: string) => systems.remove(name, engine as unknown as Engine),
    spawn: (data: unknown) => world.add(data as Parameters<typeof world.add>[0]),
    destroy: (e: unknown) => world.remove(e as Parameters<typeof world.remove>[0]),
    get game() {
      return gameRuntime;
    },
    runGame<TState>(def: GameDefinition<TState>): string {
      const rt = new GameRuntime<TState>(def, engine as unknown as Engine);
      gameRuntime = rt as unknown as GameRuntime<unknown>;
      const scene = buildGameScene(def, rt);
      scenes.register(scene);
      return scene.name;
    },
    // stop() no-op — no loop to tear down.
    stop() {},
  };
  return engine as unknown as Engine;
}

// A minimal tic-tac-toe-ish game keyed on peer ids so turn rotation maps
// cleanly. Two players take turns incrementing a shared counter; the
// tenth increment wins.
type Counter = { total: number; lastBy: string | null };

function makeCounterGame(): GameDefinition<Counter> {
  return defineGame<Counter>({
    name: "counter",
    players: { min: 2, max: 2, default: 2 },
    seed: 42,
    setup: () => ({ total: 0, lastBy: null }),
    turns: { order: ["player-1", "player-2"] },
    moves: {
      inc(ctx) {
        ctx.state.total += 1;
        ctx.state.lastBy = ctx.currentPlayer as string;
      },
      rigged(ctx) {
        // Use the seeded RNG so both peers mutate state identically.
        ctx.state.total += Math.floor(ctx.random() * 3) + 1;
        ctx.state.lastBy = ctx.currentPlayer as string;
      },
    },
    endIf: (ctx) => (ctx.state.total >= 10 ? { winner: ctx.state.lastBy ?? "nobody" } : undefined),
  });
}

describe("createMultiplayerGame — local transport", () => {
  let cleanup: Array<() => Promise<void> | void>;
  beforeEach(() => {
    cleanup = [];
  });
  afterEach(async () => {
    for (const fn of cleanup) {
      try {
        await fn();
      } catch {
        // ignore teardown errors
      }
    }
  });

  test("a move on peer A propagates to peer B via TurnSync", async () => {
    const handle = await createMultiplayerGame(makeCounterGame(), {
      transport: { kind: "local", players: 2 },
      engineFactory: stubEngine,
    });
    cleanup.push(() => handle.disconnect());

    const peers = handle.allPeers as ReadonlyArray<MultiplayerGameHandle<Counter>>;
    expect(peers).toHaveLength(2);
    const [a, b] = peers;

    // Peer A is active (player-1). Dispatch an increment.
    const res = a.runtime.dispatch("inc", []);
    expect(res).toBeUndefined();

    // Both peers observe the same state after the turn completes.
    expect(a.runtime.gameState.total).toBe(1);
    expect(b.runtime.gameState.total).toBe(1);
    expect(a.runtime.gameState.lastBy).toBe("player-1");
    expect(b.runtime.gameState.lastBy).toBe("player-1");

    // Turn rotated — peer B is now active.
    expect(a.turnSync.activePlayerId).toBe("player-2");
    expect(b.turnSync.activePlayerId).toBe("player-2");
  });

  test("ctx.random() is deterministic across peers via shared seed", async () => {
    const handle = await createMultiplayerGame(makeCounterGame(), {
      transport: { kind: "local", players: 2 },
      engineFactory: stubEngine,
    });
    cleanup.push(() => handle.disconnect());
    const peers = handle.allPeers as ReadonlyArray<MultiplayerGameHandle<Counter>>;
    const [a, b] = peers;

    // Peer A on its turn rolls the RNG; peer B mirrors via TurnSync.
    a.runtime.dispatch("rigged", []);
    expect(b.runtime.gameState.total).toBe(a.runtime.gameState.total);
    // Peer B takes its turn with the next RNG value — should still match
    // because every peer's runtime shares the same seed and has consumed
    // exactly one random() so far.
    b.runtime.dispatch("rigged", []);
    expect(a.runtime.gameState.total).toBe(b.runtime.gameState.total);
  });

  test("onDesync fires when peer B's state is corrupted out-of-band", async () => {
    const desyncs: Array<unknown> = [];
    const handle = await createMultiplayerGame(makeCounterGame(), {
      transport: { kind: "local", players: 2 },
      engineFactory: stubEngine,
      onDesync: (e) => desyncs.push(e),
    });
    cleanup.push(() => handle.disconnect());
    const peers = handle.allPeers as ReadonlyArray<MultiplayerGameHandle<Counter>>;
    const [a, b] = peers;

    // Listener on peer A also records desyncs for belt-and-braces.
    const aDesyncs: Array<unknown> = [];
    a.turnSync.onDesync((e) => aDesyncs.push(e));

    // Corrupt peer B's state BEFORE A's move is applied. When TurnSync
    // completes the turn the hash comparison between peer A and peer B
    // will differ.
    b.runtime.gameState.total = 999;

    a.runtime.dispatch("inc", []);
    // Hashes are broadcast synchronously via MockBus, so desync should
    // already have fired by now.
    expect(aDesyncs.length + desyncs.length).toBeGreaterThan(0);
  });

  test("off-turn player cannot submit moves — returns 'invalid'", async () => {
    const handle = await createMultiplayerGame(makeCounterGame(), {
      transport: { kind: "local", players: 2 },
      engineFactory: stubEngine,
    });
    cleanup.push(() => handle.disconnect());
    const peers = handle.allPeers as ReadonlyArray<MultiplayerGameHandle<Counter>>;
    const [a, b] = peers;

    // It's player-1's turn; peer B (player-2) tries to move first.
    const bRes = b.runtime.dispatch("inc", []);
    expect(bRes).toBe("invalid");
    expect(a.runtime.gameState.total).toBe(0);
    expect(b.runtime.gameState.total).toBe(0);

    // Peer A proceeds normally.
    a.runtime.dispatch("inc", []);
    expect(a.runtime.gameState.total).toBe(1);
  });

  test("disconnect cleanly tears down both peers", async () => {
    const handle = await createMultiplayerGame(makeCounterGame(), {
      transport: { kind: "local", players: 2 },
      engineFactory: stubEngine,
    });
    const peers = handle.allPeers as ReadonlyArray<MultiplayerGameHandle<Counter>>;
    const [a, b] = peers;

    expect(a.adapter.connected).toBe(true);
    expect(b.adapter.connected).toBe(true);

    await a.disconnect();
    await b.disconnect();

    expect(a.adapter.connected).toBe(false);
    expect(b.adapter.connected).toBe(false);

    // Dispatch after disconnect doesn't throw.
    expect(() => a.runtime.dispatch("inc", [])).not.toThrow();
  });

  test("10-turn scripted game stays in lockstep", async () => {
    const handle = await createMultiplayerGame(makeCounterGame(), {
      transport: { kind: "local", players: 2 },
      engineFactory: stubEngine,
    });
    cleanup.push(() => handle.disconnect());
    const peers = handle.allPeers as ReadonlyArray<MultiplayerGameHandle<Counter>>;
    const [a, b] = peers;

    // Alternate moves, one per peer per turn.
    for (let i = 0; i < 10; i++) {
      const active = i % 2 === 0 ? a : b;
      active.runtime.dispatch("inc", []);
    }

    // Both peers see identical state after ten turns. The game's endIf
    // halts at total >= 10, so total clamps there.
    expect(a.runtime.gameState.total).toBe(b.runtime.gameState.total);
    expect(a.runtime.gameState.total).toBeGreaterThanOrEqual(10);
    expect(a.runtime.result).not.toBeNull();
    expect(b.runtime.result).not.toBeNull();
    // Winner recorded on the last-by field should agree across peers.
    expect(a.runtime.gameState.lastBy).toBe(b.runtime.gameState.lastBy);
  });

  test("custom hashState override is used for desync detection", async () => {
    let calls = 0;
    const handle = await createMultiplayerGame(makeCounterGame(), {
      transport: { kind: "local", players: 2 },
      engineFactory: stubEngine,
      hashState: (s) => {
        calls++;
        // Hash only the counter so cosmetic fields don't fail detection.
        return String((s as Counter).total);
      },
    });
    cleanup.push(() => handle.disconnect());
    const peers = handle.allPeers as ReadonlyArray<MultiplayerGameHandle<Counter>>;
    const [a] = peers;
    a.runtime.dispatch("inc", []);
    expect(calls).toBeGreaterThan(0);
  });

  test("onMove fires for every applied move", async () => {
    const moves: Array<{ kind: string; playerId: string }> = [];
    const handle = await createMultiplayerGame(makeCounterGame(), {
      transport: { kind: "local", players: 2 },
      engineFactory: stubEngine,
      onMove: (m) => moves.push({ kind: m.kind, playerId: m.playerId }),
    });
    cleanup.push(() => handle.disconnect());
    const peers = handle.allPeers as ReadonlyArray<MultiplayerGameHandle<Counter>>;
    const [a, b] = peers;
    a.runtime.dispatch("inc", []);
    b.runtime.dispatch("inc", []);
    // Two moves applied across two peers = 4 onMove invocations (each
    // peer's wiring fires onMove once per applied turn).
    expect(moves.length).toBeGreaterThanOrEqual(2);
    expect(moves.some((m) => m.playerId === "player-1")).toBe(true);
    expect(moves.some((m) => m.playerId === "player-2")).toBe(true);
  });
});
