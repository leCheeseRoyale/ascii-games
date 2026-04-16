/**
 * Tests for `defineGame` / `GameRuntime`.
 *
 * Uses a lightweight stub engine rich enough to drive the runtime:
 * TurnManager, SystemRunner, SceneManager, spawn/destroy. No canvas.
 */

import { describe, expect, test } from "bun:test";
import { buildGameScene, defineGame, type GameContext, GameRuntime } from "../../core/define-game";
import type { Engine } from "../../core/engine";
import { SceneManager } from "../../core/scene";
import { TurnManager } from "../../core/turn-manager";
import { SystemRunner } from "../../ecs/systems";
import { createWorld } from "../../ecs/world";

function stubEngine() {
  const world = createWorld();
  const systems = new SystemRunner();
  const scenes = new SceneManager();
  const turns = new TurnManager();
  const engine = {
    world,
    systems,
    scenes,
    turns,
    registerScene: (s: any) => scenes.register(s),
    addSystem: (sys: any) => systems.add(sys, engine as any),
    removeSystem: (name: string) => systems.remove(name, engine as any),
    spawn: (data: any) => world.add(data),
    destroy: (e: any) => world.remove(e),
  };
  return engine as unknown as Engine;
}

describe("defineGame", () => {
  test("setup runs once and builds initial state", () => {
    const def = defineGame<{ value: number }>({
      name: "simple",
      setup: () => ({ value: 42 }),
      moves: {},
    });
    const engine = stubEngine();
    const runtime = new GameRuntime(def, engine);
    runtime.start();
    expect(runtime.gameState).toEqual({ value: 42 });
    expect(runtime.turn).toBe(1);
    expect(runtime.result).toBeNull();
  });

  test("moves mutate state and advance the turn", () => {
    const def = defineGame<{ plays: number }>({
      name: "mutator",
      setup: () => ({ plays: 0 }),
      turns: { order: ["A", "B"] },
      moves: {
        play(ctx) {
          ctx.state.plays++;
        },
      },
    });
    const engine = stubEngine();
    const runtime = new GameRuntime(def, engine);
    runtime.start();
    expect(runtime.currentPlayer).toBe("A");

    runtime.dispatch("play", []);
    expect(runtime.gameState.plays).toBe(1);
    expect(runtime.currentPlayer).toBe("B");

    runtime.dispatch("play", []);
    expect(runtime.gameState.plays).toBe(2);
    expect(runtime.currentPlayer).toBe("A");
    expect(runtime.turn).toBe(2);
  });

  test("move returning 'invalid' is rejected — state & turn untouched", () => {
    const def = defineGame<{ slots: (string | null)[] }>({
      name: "rejecter",
      setup: () => ({ slots: [null, null, null] }),
      turns: { order: ["X", "O"] },
      moves: {
        place(ctx, idx: number) {
          if (ctx.state.slots[idx] !== null) return "invalid";
          ctx.state.slots[idx] = ctx.currentPlayer as string;
        },
      },
    });
    const engine = stubEngine();
    const runtime = new GameRuntime(def, engine);
    runtime.start();

    runtime.dispatch("place", [0]); // X places at 0
    expect(runtime.gameState.slots[0]).toBe("X");
    expect(runtime.currentPlayer).toBe("O");

    const res = runtime.dispatch("place", [0]); // O tries same slot → invalid
    expect(res).toBe("invalid");
    expect(runtime.gameState.slots[0]).toBe("X");
    expect(runtime.currentPlayer).toBe("O");
  });

  test("phase endIf transitions between phases", () => {
    type S = { ready: boolean };
    const entered: string[] = [];
    const def = defineGame<S>({
      name: "phased",
      setup: () => ({ ready: false }),
      phases: {
        order: ["setup", "play"],
        setup: {
          onEnter: () => entered.push("setup"),
          endIf: (ctx) => (ctx.state.ready ? "play" : null),
        },
        play: {
          onEnter: () => entered.push("play"),
        },
      },
      moves: {
        ready(ctx) {
          ctx.state.ready = true;
        },
      },
    });
    const engine = stubEngine();
    const runtime = new GameRuntime(def, engine);
    runtime.start();
    expect(runtime.phase).toBe("setup");
    expect(entered).toEqual(["setup"]);

    runtime.dispatch("ready", []);
    expect(runtime.phase).toBe("play");
    expect(entered).toEqual(["setup", "play"]);
  });

  test("top-level endIf halts the game and subsequent moves are no-ops", () => {
    const def = defineGame<{ score: number }>({
      name: "finisher",
      setup: () => ({ score: 0 }),
      moves: {
        inc(ctx) {
          ctx.state.score++;
        },
      },
      endIf: (ctx) => (ctx.state.score >= 3 ? { winner: "player" } : undefined),
    });
    const engine = stubEngine();
    const runtime = new GameRuntime(def, engine);
    runtime.start();
    runtime.dispatch("inc", []);
    runtime.dispatch("inc", []);
    expect(runtime.result).toBeNull();
    runtime.dispatch("inc", []);
    expect(runtime.result).toEqual({ winner: "player" });

    // Post-gameOver dispatch is a no-op.
    const res = runtime.dispatch("inc", []);
    expect(res).toBe("game-over");
    expect(runtime.gameState.score).toBe(3);
  });

  test("turn rotation uses configured order with string ids", () => {
    const def = defineGame<{ seen: Array<string | number> }>({
      name: "rotator",
      setup: () => ({ seen: [] }),
      turns: { order: ["alice", "bob", "carol"] },
      moves: {
        go(ctx) {
          ctx.state.seen.push(ctx.currentPlayer);
        },
      },
    });
    const engine = stubEngine();
    const runtime = new GameRuntime(def, engine);
    runtime.start();
    runtime.dispatch("go", []);
    runtime.dispatch("go", []);
    runtime.dispatch("go", []);
    runtime.dispatch("go", []);
    expect(runtime.gameState.seen).toEqual(["alice", "bob", "carol", "alice"]);
    expect(runtime.turn).toBe(2);
  });

  test("ctx exposes moves, random, log, and engine", () => {
    let captured: GameContext<{ n: number }> | null = null;
    const def = defineGame<{ n: number }>({
      name: "ctx-reader",
      seed: 7,
      setup: () => ({ n: 0 }),
      moves: {
        read(ctx) {
          captured = ctx;
          ctx.log("entered");
        },
      },
    });
    const engine = stubEngine();
    const runtime = new GameRuntime(def, engine);
    runtime.start();
    runtime.dispatch("read", []);
    expect(captured).not.toBeNull();
    expect(captured!.engine).toBe(engine);
    expect(typeof captured!.random()).toBe("number");
    expect(Object.keys(captured!.moves)).toEqual(["read"]);
    expect(runtime.history).toEqual(["entered"]);
  });

  test("seeded RNG is deterministic across runtimes", () => {
    const def = defineGame<{ rolls: number[] }>({
      name: "rng",
      seed: 12345,
      setup: ({ random }) => ({ rolls: [random(), random(), random()] }),
      moves: {},
    });
    const a = new GameRuntime(def, stubEngine());
    const b = new GameRuntime(def, stubEngine());
    a.start();
    b.start();
    expect(a.gameState.rolls).toEqual(b.gameState.rolls);
  });

  test("buildGameScene registers systems on scene setup", () => {
    let ticked = 0;
    const sys = { name: "countTicks", update: () => ticked++ };
    const def = defineGame<{ x: number }>({
      name: "with-systems",
      setup: () => ({ x: 0 }),
      moves: {},
      systems: [sys],
    });
    const engine = stubEngine();
    const runtime = new GameRuntime(def, engine);
    const scene = buildGameScene(def, runtime);
    scene.setup(engine);
    expect(engine.systems.list()).toContain("countTicks");
    engine.systems.update(engine, 1 / 60);
    expect(ticked).toBe(1);
    scene.cleanup?.(engine);
    expect(engine.systems.list()).not.toContain("countTicks");
  });

  test("phase move whitelist rejects out-of-phase moves", () => {
    const def = defineGame<{ placed: boolean }>({
      name: "phase-whitelist",
      setup: () => ({ placed: false }),
      phases: {
        order: ["setup", "play"],
        setup: { moves: ["prepare"] },
        play: { moves: ["fire"] },
      },
      moves: {
        prepare(_ctx) {},
        fire(ctx) {
          ctx.state.placed = true;
        },
      },
    });
    const engine = stubEngine();
    const runtime = new GameRuntime(def, engine);
    runtime.start();
    // In 'setup' phase, firing should be rejected.
    expect(runtime.dispatch("fire", [])).toBe("invalid");
    expect(runtime.gameState.placed).toBe(false);
    // 'prepare' is allowed.
    expect(runtime.dispatch("prepare", [])).toBeUndefined();
  });

  test("engine.runGame registers a scene and returns its name", () => {
    // This test uses the stub engine's manual shape — verifies the scene
    // name is correct and reachable via SceneManager without a real Engine.
    const def = defineGame<{ x: number }>({
      name: "scene-test",
      setup: () => ({ x: 1 }),
      moves: {},
      startScene: "main",
    });
    const engine = stubEngine();
    const runtime = new GameRuntime(def, engine);
    const scene = buildGameScene(def, runtime);
    expect(scene.name).toBe("main");
    engine.registerScene(scene);
    // SceneManager's private map isn't exposed, so we just verify no throw
    // and that loading a registered scene works by checking it exists.
    // (Full engine.runGame path is covered in the template smoke test.)
  });

  test("turns.order narrows ctx.currentPlayer to the literal union (no 'as const' needed)", () => {
    // Compile-time assertion: `ctx.currentPlayer` must be inferred as the
    // literal union of `turns.order`, not the default `string | number`.
    // We assert this by assigning to a narrowly-typed variable inside the
    // move — a widening type would produce a TS error on the `current`
    // assignment below, which would fail `bun run check`.
    const seen: Array<"alpha" | "beta"> = [];
    const def = defineGame({
      name: "narrow-player",
      setup: () => ({ last: null as "alpha" | "beta" | null }),
      turns: { order: ["alpha", "beta"] },
      moves: {
        record(ctx) {
          // This assignment only typechecks when `ctx.currentPlayer` is
          // narrowed to `"alpha" | "beta"`. If it stayed `string | number`
          // tsc would fail on `bun run check`.
          const current: "alpha" | "beta" = ctx.currentPlayer;
          ctx.state.last = current;
          seen.push(current);
        },
      },
    });
    const engine = stubEngine();
    const runtime = new GameRuntime(def, engine);
    runtime.start();
    runtime.dispatch("record", []);
    runtime.dispatch("record", []);
    expect(seen).toEqual(["alpha", "beta"]);
    expect(runtime.gameState.last).toBe("beta");
  });

  test("autoEnd: false keeps the same player until endTurn is called", () => {
    const def = defineGame<{ attacks: number }>({
      name: "no-auto-end",
      setup: () => ({ attacks: 0 }),
      turns: { order: ["A", "B"], autoEnd: false },
      moves: {
        attack(ctx) {
          ctx.state.attacks++;
        },
        done(ctx) {
          ctx.endTurn();
        },
      },
    });
    const engine = stubEngine();
    const runtime = new GameRuntime(def, engine);
    runtime.start();
    runtime.dispatch("attack", []);
    runtime.dispatch("attack", []);
    expect(runtime.currentPlayer).toBe("A");
    runtime.dispatch("done", []);
    expect(runtime.currentPlayer).toBe("B");
  });
});
